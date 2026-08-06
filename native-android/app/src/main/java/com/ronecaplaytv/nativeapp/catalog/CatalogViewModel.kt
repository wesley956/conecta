package com.ronecaplaytv.nativeapp.catalog

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig
import com.ronecaplaytv.nativeapp.activation.DeviceSessionRepository
import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport
import com.ronecaplaytv.nativeapp.network.SourceNetworkPolicyRegistry
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope

class CatalogViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionRepository = DeviceSessionRepository(application)
    private val attemptReporter: (ProviderAttemptReport) -> Unit = { attempt ->
        viewModelScope.launch {
            runCatching { sessionRepository.reportProviderAttempt(attempt) }
        }
    }
    private val client = CatalogPartClient(application, attemptReporter)
    private val fastXtreamClient = FastXtreamChannelClient(application, attemptReporter)
    private val mutableState = MutableStateFlow(NativeCatalogState())

    val state: StateFlow<NativeCatalogState> = mutableState.asStateFlow()

    private var loadedKey: String? = null
    private var availablePlaylists: List<DevicePlaylistConfig> = emptyList()

    fun load(
        channelsUrl: String?,
        moviesUrl: String?,
        seriesUrl: String?,
        selectedPlaylistId: String? = null,
        playlists: List<DevicePlaylistConfig> = emptyList(),
        force: Boolean = false,
    ) {
        val candidates = playlistCandidates(
            channelsUrl,
            moviesUrl,
            seriesUrl,
            selectedPlaylistId,
            playlists,
        )
        val key = candidates.joinToString("|") {
            listOf(it.id, it.channelsUrl, it.moviesUrl, it.seriesUrl, it.networkPolicy.cacheKey, it.sourceEndpoints.joinToString(",") { source -> listOf(source.id, source.channelsUrl, source.moviesUrl, source.seriesUrl).joinToString("~") }).joinToString(":")
        }
        availablePlaylists = candidates

        if (!force && loadedKey == key && mutableState.value.loaded) return
        if (mutableState.value.isLoading) return

        val previousState = mutableState.value
        viewModelScope.launch {
            mutableState.value = previousState.copy(
                loadingSection = "catálogo",
                error = null,
            )
            loadFirstAvailable(candidates, key, previousState)
        }
    }

    suspend fun failoverActivePlaylist(
        reason: String,
        attemptId: String,
    ): NativeCatalogFailoverResult? {
        if (mutableState.value.isLoading) return null

        val activeId = mutableState.value.activePlaylistId ?: return null
        val activeIndex = availablePlaylists.indexOfFirst { it.id == activeId }
        val backupCandidates = availablePlaylists.drop((activeIndex + 1).coerceAtLeast(0))

        if (backupCandidates.isEmpty()) {
            mutableState.update {
                it.copy(
                    error = "A lista ativa falhou e nenhuma lista reserva está disponível.",
                    lastFailureReason = reason,
                    lastFailoverAttemptId = attemptId,
                    lastFailoverOutcome = "no_backup",
                )
            }
            return null
        }

        mutableState.update {
            it.copy(
                loadingSection = "ativando lista reserva",
                error = null,
                lastFailureReason = reason,
                lastFailoverAttemptId = attemptId,
                lastFailoverOutcome = "switching",
            )
        }

        var lastFailure: Throwable? = null
        for (candidate in backupCandidates) {
            val result = runCatching { loadCompleteCatalog(candidate, "lista reserva: ") }
            val catalog = result.getOrNull()
            if (catalog != null) {
                reportCatalogSuccess(candidate.id)
                val state = catalog.toState(
                    candidate = candidate,
                    usingBackup = true,
                    failoverNotice = "Lista principal indisponível. Conteúdo retomado pela lista reserva.",
                    lastFailureReason = reason,
                    lastFailoverAtMillis = System.currentTimeMillis(),
                    lastFailoverAttemptId = attemptId,
                    lastFailoverOutcome = "switched",
                )
                mutableState.value = state
                if (catalog.progressive) scheduleProgressiveHydration(catalog.progressiveCandidate ?: candidate)
                return NativeCatalogFailoverResult(
                    attemptId = attemptId,
                    reason = reason,
                    fromPlaylistId = activeId,
                    toPlaylistId = candidate.id,
                    state = state,
                )
            }
            lastFailure = result.exceptionOrNull()
            reportCatalogFailure(candidate.id, lastFailure)
        }

        mutableState.update {
            it.copy(
                loadingSection = null,
                error = lastFailure?.message
                    ?: "A lista principal e a lista reserva estão indisponíveis.",
                lastFailureReason = reason,
                lastFailoverAttemptId = attemptId,
                lastFailoverOutcome = "catalog_failed",
            )
        }
        return null
    }

    fun markFailoverContentMissing(attemptId: String) {
        mutableState.update { current ->
            if (current.lastFailoverAttemptId != attemptId) current else current.copy(
                failoverNotice = "A lista reserva foi ativada, mas não possui o mesmo conteúdo.",
                lastFailoverOutcome = "content_missing",
            )
        }
    }

    private suspend fun loadFirstAvailable(
        candidates: List<DevicePlaylistConfig>,
        key: String,
        previousState: NativeCatalogState,
    ) {
        runCatching {
            if (candidates.isEmpty()) {
                error("O cache seguro das listas ainda não está disponível.")
            }

            var lastFailure: Throwable? = null
            for ((candidateIndex, candidate) in candidates.withIndex()) {
                val prefix = if (candidateIndex == 0) "" else "lista reserva: "
                val result = runCatching { loadCompleteCatalog(candidate, prefix) }
                val catalog = result.getOrNull()

                if (catalog != null) {
                    reportCatalogSuccess(candidate.id)
                    loadedKey = key
                    val switchedPlaylist = previousState.activePlaylistId != null &&
                        previousState.activePlaylistId != candidate.id
                    val initialFailover = previousState.activePlaylistId == null && candidateIndex > 0
                    val recordedSwitch = switchedPlaylist || initialFailover
                    mutableState.value = catalog.toState(
                        candidate = candidate,
                        usingBackup = candidateIndex > 0 || candidate.role.equals("backup", true),
                        failoverNotice = if (candidateIndex > 0) {
                            "Lista principal indisponível. Catálogo substituído pela lista reserva."
                        } else {
                            catalog.warning
                        },
                        lastFailureReason = when {
                            candidateIndex > 0 && recordedSwitch -> lastFailure?.message
                            switchedPlaylist -> "Lista principal restabelecida após a atualização."
                            else -> previousState.lastFailureReason
                        },
                        lastFailoverAtMillis = if (recordedSwitch) {
                            System.currentTimeMillis()
                        } else {
                            previousState.lastFailoverAtMillis
                        },
                    )
                    if (catalog.progressive) scheduleProgressiveHydration(catalog.progressiveCandidate ?: candidate)
                    return
                }

                lastFailure = result.exceptionOrNull()
                reportCatalogFailure(candidate.id, lastFailure)
            }
            throw lastFailure ?: IllegalStateException("Nenhuma lista pôde ser carregada.")
        }.onFailure { error ->
            mutableState.update {
                it.copy(
                    loadingSection = null,
                    loaded = false,
                    error = error.message ?: "Não foi possível carregar o catálogo.",
                )
            }
        }
    }

    private suspend fun reportCatalogFailure(
        playlistId: String,
        failure: Throwable?,
    ) {
        val error = failure?.message
            ?.trim()
            ?.take(500)
            ?.takeIf(String::isNotBlank)
            ?: "Falha de catálogo sem detalhes."
        val attemptId = "catalog:${UUID.randomUUID()}"
        runCatching {
            sessionRepository.reportPlaylistFailure(
                playlistId = playlistId,
                error = error,
                correlationId = attemptId,
                failoverAttemptId = attemptId,
            )
        }
    }

    private suspend fun reportCatalogSuccess(playlistId: String) {
        runCatching { sessionRepository.reportPlaylistSuccess(playlistId) }
    }

    /**
     * Para origens Xtream diretas, tenta primeiro apenas os canais com limites
     * curtos e sem consultar categorias. Assim o primeiro conteúdo aparece sem
     * aguardar filmes e séries. Os demais endpoints são hidratados depois.
     */
    private suspend fun loadCompleteCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
    ): LoadedCatalog {
        SourceNetworkPolicyRegistry.activate(candidate.networkPolicy)
        val endpointCandidates = candidate.sourceEndpoints.map { source ->
            candidate.copy(
                channelsUrl = source.channelsUrl,
                moviesUrl = source.moviesUrl,
                seriesUrl = source.seriesUrl,
                sourceEndpoints = emptyList(),
            )
        }.ifEmpty { listOf(candidate) }

        var lastEndpointFailure: Throwable? = null
        for ((sourceIndex, endpointCandidate) in endpointCandidates.withIndex()) {
            val sourcePrefix = if (sourceIndex == 0) prefix else "${prefix}alternativa ${sourceIndex + 1}: "
            val result = runCatching { loadSingleEndpointCatalog(endpointCandidate, sourcePrefix) }
            result.getOrNull()?.let { return it }
            lastEndpointFailure = result.exceptionOrNull()
        }
        throw lastEndpointFailure ?: CatalogLoadException("Nenhuma origem desta lista pôde ser carregada.")
    }

    private suspend fun loadSingleEndpointCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
    ): LoadedCatalog {
        val channelsUrl = candidate.channelsUrl
        if (channelsUrl != null && fastXtreamClient.supports(channelsUrl)) {
            mutableState.update { it.copy(loadingSection = "${prefix}abrindo primeiro conteúdo") }
            val correlationId = "matrix-fast:${UUID.randomUUID()}"
            val result = runCatching {
                fastXtreamClient.loadChannels(
                    channelsUrl,
                    ProviderAttemptContext(candidate.id, "channels", correlationId),
                )
            }
            val channels = result.getOrNull()
            if (!channels.isNullOrEmpty()) {
                return LoadedCatalog(
                    channels = channels,
                    movies = emptyList(),
                    series = emptyList(),
                    warning = "Canais carregados. Filmes e séries continuam em segundo plano.",
                    progressive = true,
                    progressiveCandidate = candidate,
                )
            }

            val message = result.exceptionOrNull()?.message.orEmpty()
            if (isSlowProviderFailure(message)) {
                throw CatalogLoadException(
                    "O servidor aceitou o login, mas não entregou o catálogo rapidamente. " +
                        "A lista reserva será usada quando estiver disponível.",
                )
            }
            if (isDefinitiveAuthenticationFailure(message)) {
                throw CatalogLoadException(cleanAuthenticationMessage(message))
            }
        }

        return loadCompatibilityCatalog(candidate, prefix)
    }

    /**
     * Caminho completo preservado para cache do servidor, M3U e provedores que
     * respondem rapidamente aos endpoints independentes.
     */
    private suspend fun loadCompatibilityCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
    ): LoadedCatalog = supervisorScope {
        mutableState.update { it.copy(loadingSection = "${prefix}consultando API") }
        val matrixCorrelationId = "matrix:${UUID.randomUUID()}"

        val channelsDeferred = async {
            runCatching {
                candidate.channelsUrl?.let {
                    client.loadChannels(
                        it,
                        ProviderAttemptContext(candidate.id, "channels", matrixCorrelationId),
                    )
                }.orEmpty()
            }
        }
        val moviesDeferred = async {
            runCatching {
                candidate.moviesUrl?.let {
                    client.loadMovies(
                        it,
                        ProviderAttemptContext(candidate.id, "movies", matrixCorrelationId),
                    )
                }.orEmpty()
            }
        }
        val seriesDeferred = async {
            runCatching {
                candidate.seriesUrl?.let {
                    client.loadSeries(
                        it,
                        ProviderAttemptContext(candidate.id, "series", matrixCorrelationId),
                    )
                }.orEmpty()
            }
        }

        val channelsResult = channelsDeferred.await()
        val moviesResult = moviesDeferred.await()
        val seriesResult = seriesDeferred.await()
        val channels = channelsResult.getOrDefault(emptyList())
        val movies = moviesResult.getOrDefault(emptyList())
        val series = seriesResult.getOrDefault(emptyList())

        if (channels.isEmpty() && movies.isEmpty() && series.isEmpty()) {
            val failures = listOf(channelsResult, moviesResult, seriesResult)
                .mapNotNull { it.exceptionOrNull()?.message }
                .distinct()
                .joinToString(" ")
            throw CatalogLoadException(
                failures.ifBlank { "A lista retornou um catálogo vazio." },
            )
        }

        val unavailableSections = buildList {
            if (channelsResult.isFailure) add("canais")
            if (moviesResult.isFailure) add("filmes")
            if (seriesResult.isFailure) add("séries")
        }
        LoadedCatalog(
            channels = channels,
            movies = movies,
            series = series,
            warning = unavailableSections.takeIf { it.isNotEmpty() }?.let {
                "Catálogo carregado. Tentaremos atualizar ${it.joinToString(" e ")} novamente."
            },
        )
    }

    private fun scheduleProgressiveHydration(candidate: DevicePlaylistConfig) {
        viewModelScope.launch {
            val correlationId = "matrix-background:${UUID.randomUUID()}"
            val moviesResult = runCatching {
                candidate.moviesUrl?.let {
                    client.loadMovies(
                        it,
                        ProviderAttemptContext(candidate.id, "movies", correlationId),
                    )
                }.orEmpty()
            }
            val movies = moviesResult.getOrDefault(emptyList())
            if (movies.isNotEmpty()) {
                mutableState.update { current ->
                    if (current.activePlaylistId != candidate.id) current
                    else current.copy(movies = movies)
                }
            }

            val seriesResult = runCatching {
                candidate.seriesUrl?.let {
                    client.loadSeries(
                        it,
                        ProviderAttemptContext(candidate.id, "series", correlationId),
                    )
                }.orEmpty()
            }
            val series = seriesResult.getOrDefault(emptyList())
            mutableState.update { current ->
                if (current.activePlaylistId != candidate.id) {
                    current
                } else {
                    val remaining = buildList {
                        if (moviesResult.isFailure || movies.isEmpty()) add("filmes")
                        if (seriesResult.isFailure || series.isEmpty()) add("séries")
                    }
                    val progressiveNotice = when {
                        remaining.isEmpty() -> null
                        else -> "Canais disponíveis. ${remaining.joinToString(" e ").replaceFirstChar(Char::uppercase)} serão atualizados novamente em segundo plano."
                    }
                    current.copy(
                        movies = if (movies.isNotEmpty()) movies else current.movies,
                        series = if (series.isNotEmpty()) series else current.series,
                        failoverNotice = when {
                            current.usingBackupPlaylist -> current.failoverNotice
                            current.failoverNotice?.startsWith("Canais carregados") == true -> progressiveNotice
                            else -> current.failoverNotice ?: progressiveNotice
                        },
                    )
                }
            }
        }
    }

    private fun isSlowProviderFailure(message: String): Boolean =
        message.contains("[XTREAM_FAST_TIMEOUT]", ignoreCase = true) ||
            message.contains("[XTREAM_CONNECTION_RESET]", ignoreCase = true) ||
            message.contains("[XTREAM_CONNECTION_FAILED]", ignoreCase = true)

    private fun isDefinitiveAuthenticationFailure(message: String): Boolean =
        message.contains("[XTREAM_AUTH_INVALID]", ignoreCase = true) ||
            message.contains("[XTREAM_AUTH_EXPIRED]", ignoreCase = true)

    private fun cleanAuthenticationMessage(message: String): String =
        message.replace(Regex("\\[XTREAM_[A-Z_]+]"), "").trim()
            .ifBlank { "A autenticação Xtream falhou." }

    private fun playlistCandidates(
        channelsUrl: String?,
        moviesUrl: String?,
        seriesUrl: String?,
        selectedPlaylistId: String?,
        playlists: List<DevicePlaylistConfig>,
    ) = buildList {
        playlists
            .filter(DevicePlaylistConfig::hasCatalogParts)
            .sortedWith(
                compareBy<DevicePlaylistConfig> {
                    if (it.id == selectedPlaylistId) 0 else 1
                }.thenBy(DevicePlaylistConfig::priority),
            )
            .forEach(::add)

        if (isEmpty() && (channelsUrl != null || moviesUrl != null || seriesUrl != null)) {
            add(
                DevicePlaylistConfig(
                    id = selectedPlaylistId ?: "selected",
                    name = "Lista selecionada",
                    priority = 1,
                    role = "primary",
                    channelsUrl = channelsUrl,
                    moviesUrl = moviesUrl,
                    seriesUrl = seriesUrl,
                ),
            )
        }
    }.distinctBy(DevicePlaylistConfig::id)

    private data class LoadedCatalog(
        val channels: List<NativeChannel>,
        val movies: List<NativeMovie>,
        val series: List<NativeSeries>,
        val warning: String? = null,
        val progressive: Boolean = false,
        val progressiveCandidate: DevicePlaylistConfig? = null,
    ) {
        fun toState(
            candidate: DevicePlaylistConfig,
            usingBackup: Boolean,
            failoverNotice: String?,
            lastFailureReason: String? = null,
            lastFailoverAtMillis: Long? = null,
            lastFailoverAttemptId: String? = null,
            lastFailoverOutcome: String? = null,
        ) = NativeCatalogState(
            channels = channels,
            movies = movies,
            series = series,
            loaded = true,
            activePlaylistId = candidate.id,
            activePlaylistName = candidate.name,
            usingBackupPlaylist = usingBackup,
            failoverNotice = failoverNotice,
            lastFailureReason = lastFailureReason,
            lastFailoverAtMillis = lastFailoverAtMillis,
            lastFailoverAttemptId = lastFailoverAttemptId,
            lastFailoverOutcome = lastFailoverOutcome,
        )
    }
}
