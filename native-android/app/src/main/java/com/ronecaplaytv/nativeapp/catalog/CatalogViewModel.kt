package com.ronecaplaytv.nativeapp.catalog

import android.app.Application
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.activation.DeviceAccessStatus
import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig
import com.ronecaplaytv.nativeapp.activation.DeviceSessionRepository
import com.ronecaplaytv.nativeapp.diagnostics.NativeDiagnostics
import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport
import com.ronecaplaytv.nativeapp.network.SourceNetworkPolicyRegistry
import com.ronecaplaytv.nativeapp.persistence.CatalogSnapshotIdentity
import com.ronecaplaytv.nativeapp.persistence.CatalogSnapshotRead
import com.ronecaplaytv.nativeapp.persistence.CatalogSnapshotAccessPolicy
import com.ronecaplaytv.nativeapp.persistence.CatalogSnapshotStore
import com.ronecaplaytv.nativeapp.platform.DeviceFormFactor
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.Job
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
    private val snapshotStore = CatalogSnapshotStore(application)
    private val loadCoordinator = CatalogLoadCoordinator()
    private val lowRamDevice = DeviceFormFactor.isLowRam(application)
    private val mutableState = MutableStateFlow(NativeCatalogState())

    val state: StateFlow<NativeCatalogState> = mutableState.asStateFlow()

    private var loadedKey: String? = null
    private var availablePlaylists: List<DevicePlaylistConfig> = emptyList()
    private var activeLoadJob: Job? = null
    private var progressiveHydrationJob: Job? = null
    private var pendingHydration: PendingHydration? = null
    private var activeDeviceCode: String? = null
    private var loadedDeviceCodeHash: String? = null
    private var televisionPlaybackActive = false

    fun setTelevisionPlaybackActive(active: Boolean) {
        if (televisionPlaybackActive == active) return
        televisionPlaybackActive = active
        if (!BuildConfig.SUSPEND_HYDRATION_DURING_TV_PLAYBACK) return
        if (active) {
            progressiveHydrationJob?.cancel()
            progressiveHydrationJob = null
        } else {
            pendingHydration?.let { pending ->
                scheduleProgressiveHydration(
                    candidate = pending.candidate,
                    generation = pending.generation,
                    deviceCode = pending.deviceCode,
                )
            }
        }
    }

    fun load(
        accessStatus: DeviceAccessStatus,
        deviceCode: String?,
        channelsUrl: String?,
        moviesUrl: String?,
        seriesUrl: String?,
        selectedPlaylistId: String? = null,
        playlists: List<DevicePlaylistConfig> = emptyList(),
        force: Boolean = false,
    ) {
        if (!CatalogSnapshotAccessPolicy.mayRestore(accessStatus)) return
        val candidates = playlistCandidates(
            channelsUrl,
            moviesUrl,
            seriesUrl,
            selectedPlaylistId,
            playlists,
        )
        val deviceCodeHash = deviceCode?.trim()?.takeIf(String::isNotEmpty)?.let(CatalogSnapshotIdentity::sha256)
        val key = "${deviceCodeHash.orEmpty()}|" + candidates.joinToString("|") {
            listOf(
                it.id,
                it.channelsUrl,
                it.moviesUrl,
                it.seriesUrl,
                it.networkPolicy.cacheKey,
                it.accessMode,
                it.cacheReady,
                it.updatedAt,
                it.cacheVersion,
                it.cacheManifestSha256,
                it.sourceEndpoints.joinToString(",") { source ->
                    listOf(source.id, source.channelsUrl, source.moviesUrl, source.seriesUrl).joinToString("~")
                },
            ).joinToString(":")
        }
        availablePlaylists = candidates
        activeDeviceCode = deviceCode?.trim()?.takeIf(String::isNotEmpty)

        if (loadedDeviceCodeHash != null && loadedDeviceCodeHash != deviceCodeHash) {
            loadedKey = null
            mutableState.value = NativeCatalogState()
        }

        if (!force && loadedKey == key && mutableState.value.loaded) return
        val generation = loadCoordinator.begin()
        activeLoadJob?.cancel()
        progressiveHydrationJob?.cancel()
        progressiveHydrationJob = null
        pendingHydration = null
        val previousState = mutableState.value
        activeLoadJob = viewModelScope.launch {
            val loadStartedNanos = SystemClock.elapsedRealtimeNanos()
            val restored = restoreSnapshot(
                deviceCode = deviceCode,
                candidates = candidates,
                generation = generation,
            )
            if (restored != null) loadedDeviceCodeHash = deviceCodeHash
            currentCoroutineContext().ensureActive()
            if (!loadCoordinator.isCurrent(generation)) return@launch

            val visibleState = restored ?: previousState
            updateForGeneration(generation) {
                val content = restored ?: previousState.copy()
                content.copy(
                    loadingSection = if (content.loaded) null else "catálogo",
                    error = null,
                    loadGeneration = generation,
                )
            }
            when (CatalogStartupPolicy.refreshMode(restored, force)) {
                CatalogStartupRefreshMode.Skip -> {
                    loadedKey = key
                    NativeDiagnostics.record(
                        "catalog.snapshot_startup_ready",
                        mapOf(
                            "channels" to visibleState.channels.size,
                            "movies" to visibleState.movies.size,
                            "series" to visibleState.series.size,
                            "generation" to generation,
                        ),
                    )
                    return@launch
                }
                CatalogStartupRefreshMode.Deferred -> {
                    loadedKey = key
                    delay(CatalogStartupPolicy.DEFERRED_REFRESH_MILLIS)
                    currentCoroutineContext().ensureActive()
                    if (!loadCoordinator.isCurrent(generation)) return@launch
                    updateForGeneration(generation) {
                        it.copy(loadingSection = "atualizando em segundo plano")
                    }
                }
                CatalogStartupRefreshMode.Immediate -> Unit
            }
            loadFirstAvailable(
                candidates = candidates,
                key = key,
                previousState = visibleState,
                generation = generation,
                deviceCode = deviceCode,
                loadStartedNanos = loadStartedNanos,
            )
        }
    }

    suspend fun failoverActivePlaylist(
        reason: String,
        attemptId: String,
    ): NativeCatalogFailoverResult? {
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

        val generation = loadCoordinator.begin()
        activeLoadJob?.cancel()
        progressiveHydrationJob?.cancel()
        progressiveHydrationJob = null
        pendingHydration = null

        updateForGeneration(generation) {
            it.copy(
                loadingSection = "ativando lista reserva",
                error = null,
                lastFailureReason = reason,
                lastFailoverAttemptId = attemptId,
                lastFailoverOutcome = "switching",
                loadGeneration = generation,
            )
        }

        var lastFailure: Throwable? = null
        for (candidate in backupCandidates) {
            currentCoroutineContext().ensureActive()
            if (!loadCoordinator.isCurrent(generation)) return null
            val result = runCatching { loadCompleteCatalog(candidate, "lista reserva: ", generation) }
            val catalog = result.getOrNull()
            if (catalog != null) {
                val state = catalog.toState(
                    candidate = candidate,
                    usingBackup = true,
                    failoverNotice = "Lista principal indisponível. Conteúdo retomado pela lista reserva.",
                    lastFailureReason = reason,
                    lastFailoverAtMillis = System.currentTimeMillis(),
                    lastFailoverAttemptId = attemptId,
                    lastFailoverOutcome = "switched",
                    loadGeneration = generation,
                    previousState = mutableState.value,
                )
                if (!publishForGeneration(generation, state)) return null
                reportCatalogSuccess(candidate.id)
                currentCoroutineContext().ensureActive()
                if (!loadCoordinator.isCurrent(generation)) return null
                if (catalog.snapshotReady) {
                    persistSnapshot(candidate, state, activeDeviceCode, generation)
                }
                if (catalog.progressive) {
                    scheduleProgressiveHydration(
                        candidate = catalog.progressiveCandidate ?: candidate,
                        generation = generation,
                        deviceCode = activeDeviceCode,
                    )
                }
                return NativeCatalogFailoverResult(
                    attemptId = attemptId,
                    reason = reason,
                    fromPlaylistId = activeId,
                    toPlaylistId = candidate.id,
                    state = state,
                )
            }
            currentCoroutineContext().ensureActive()
            if (!loadCoordinator.isCurrent(generation)) return null
            lastFailure = result.exceptionOrNull()
            reportCatalogFailure(candidate.id, lastFailure)
        }

        updateForGeneration(generation) {
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
        generation: Long,
        deviceCode: String?,
        loadStartedNanos: Long,
    ) {
        runCatching {
            if (candidates.isEmpty()) {
                error("O cache seguro das listas ainda não está disponível.")
            }

            var lastFailure: Throwable? = null
            for ((candidateIndex, candidate) in candidates.withIndex()) {
                currentCoroutineContext().ensureActive()
                if (!loadCoordinator.isCurrent(generation)) return
                val prefix = if (candidateIndex == 0) "" else "lista reserva: "
                val result = runCatching { loadCompleteCatalog(candidate, prefix, generation) }
                val catalog = result.getOrNull()

                if (catalog != null) {
                    if (!loadCoordinator.isCurrent(generation)) return
                    loadedKey = key
                    val switchedPlaylist = previousState.activePlaylistId != null &&
                        previousState.activePlaylistId != candidate.id
                    val initialFailover = previousState.activePlaylistId == null && candidateIndex > 0
                    val recordedSwitch = switchedPlaylist || initialFailover
                    val published = catalog.toState(
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
                        loadGeneration = generation,
                        snapshotMetrics = previousState,
                        previousState = previousState,
                    )
                    if (!publishForGeneration(generation, published)) return
                    loadedDeviceCodeHash = deviceCode?.let(CatalogSnapshotIdentity::sha256)
                    reportCatalogSuccess(candidate.id)
                    currentCoroutineContext().ensureActive()
                    if (!loadCoordinator.isCurrent(generation)) return
                    NativeDiagnostics.record(
                        "catalog.network_ready",
                        mapOf(
                            "elapsed_ms" to (SystemClock.elapsedRealtimeNanos() - loadStartedNanos) / 1_000_000L,
                            "channels" to published.channels.size,
                            "movies" to published.movies.size,
                            "series" to published.series.size,
                            "generation" to generation,
                            "low_ram" to lowRamDevice,
                        ),
                    )
                    if (catalog.snapshotReady) persistSnapshot(candidate, published, deviceCode, generation)
                    if (catalog.progressive) {
                        scheduleProgressiveHydration(
                            candidate = catalog.progressiveCandidate ?: candidate,
                            generation = generation,
                            deviceCode = deviceCode,
                        )
                    }
                    return
                }

                currentCoroutineContext().ensureActive()
                if (!loadCoordinator.isCurrent(generation)) return
                lastFailure = result.exceptionOrNull()
                reportCatalogFailure(candidate.id, lastFailure)
            }
            throw lastFailure ?: IllegalStateException("Nenhuma lista pôde ser carregada.")
        }.onFailure { error ->
            updateForGeneration(generation) {
                it.copy(
                    loadingSection = null,
                    loaded = it.loaded,
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
        generation: Long,
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
            currentCoroutineContext().ensureActive()
            if (!loadCoordinator.isCurrent(generation)) throw StaleCatalogLoadException()
            val sourcePrefix = if (sourceIndex == 0) prefix else "${prefix}alternativa ${sourceIndex + 1}: "
            val result = runCatching { loadSingleEndpointCatalog(endpointCandidate, sourcePrefix, generation) }
            result.getOrNull()?.let { return it }
            lastEndpointFailure = result.exceptionOrNull()
        }
        throw lastEndpointFailure ?: CatalogLoadException("Nenhuma origem desta lista pôde ser carregada.")
    }

    private suspend fun loadSingleEndpointCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
        generation: Long,
    ): LoadedCatalog {
        val channelsUrl = candidate.channelsUrl
        if (channelsUrl != null && fastXtreamClient.supports(channelsUrl)) {
            updateForGeneration(generation) { it.copy(loadingSection = "${prefix}abrindo primeiro conteúdo") }
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

        return loadCompatibilityCatalog(candidate, prefix, generation)
    }

    /**
     * Caminho completo preservado para cache do servidor, M3U e provedores que
     * respondem rapidamente aos endpoints independentes.
     */
    private suspend fun loadCompatibilityCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
        generation: Long,
    ): LoadedCatalog = supervisorScope {
        updateForGeneration(generation) { it.copy(loadingSection = "${prefix}consultando API") }
        val matrixCorrelationId = "matrix:${UUID.randomUUID()}"
        val loadChannelsPart: suspend () -> Result<List<NativeChannel>> = {
            runCatching {
                candidate.channelsUrl?.let {
                    client.loadChannels(
                        it,
                        ProviderAttemptContext(candidate.id, "channels", matrixCorrelationId),
                    )
                }.orEmpty()
            }
        }
        val loadMoviesPart: suspend () -> Result<List<NativeMovie>> = {
            runCatching {
                candidate.moviesUrl?.let {
                    client.loadMovies(
                        it,
                        ProviderAttemptContext(candidate.id, "movies", matrixCorrelationId),
                    )
                }.orEmpty()
            }
        }
        val loadSeriesPart: suspend () -> Result<List<NativeSeries>> = {
            runCatching {
                candidate.seriesUrl?.let {
                    client.loadSeries(
                        it,
                        ProviderAttemptContext(candidate.id, "series", matrixCorrelationId),
                    )
                }.orEmpty()
            }
        }
        val (channelsResult, moviesResult, seriesResult) = if (lowRamDevice) {
            Triple(loadChannelsPart(), loadMoviesPart(), loadSeriesPart())
        } else {
            val channelsDeferred = async { loadChannelsPart() }
            val moviesDeferred = async { loadMoviesPart() }
            val seriesDeferred = async { loadSeriesPart() }
            Triple(channelsDeferred.await(), moviesDeferred.await(), seriesDeferred.await())
        }
        currentCoroutineContext().ensureActive()
        if (!loadCoordinator.isCurrent(generation)) throw StaleCatalogLoadException()
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
            snapshotReady = unavailableSections.isEmpty(),
        )
    }

    private fun scheduleProgressiveHydration(
        candidate: DevicePlaylistConfig,
        generation: Long,
        deviceCode: String?,
    ) {
        pendingHydration = PendingHydration(candidate, generation, deviceCode)
        if (!loadCoordinator.isCurrent(generation)) return
        if (
            BuildConfig.SUSPEND_HYDRATION_DURING_TV_PLAYBACK &&
            televisionPlaybackActive
        ) return
        progressiveHydrationJob?.cancel()
        progressiveHydrationJob = viewModelScope.launch {
            if (!loadCoordinator.isCurrent(generation)) return@launch
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
                updateForGeneration(generation) { current ->
                    if (current.activePlaylistId != candidate.id) current
                    else current.copy(movies = movies)
                }
            }

            currentCoroutineContext().ensureActive()
            if (!loadCoordinator.isCurrent(generation)) return@launch
            val seriesResult = runCatching {
                candidate.seriesUrl?.let {
                    client.loadSeries(
                        it,
                        ProviderAttemptContext(candidate.id, "series", correlationId),
                    )
                }.orEmpty()
            }
            val series = seriesResult.getOrDefault(emptyList())
            currentCoroutineContext().ensureActive()
            if (!loadCoordinator.isCurrent(generation)) return@launch
            updateForGeneration(generation) { current ->
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
            if (
                loadCoordinator.isCurrent(generation) &&
                mutableState.value.activePlaylistId == candidate.id
            ) {
                if (moviesResult.isSuccess && seriesResult.isSuccess) {
                    persistSnapshot(candidate, mutableState.value, deviceCode, generation)
                }
                pendingHydration = null
                NativeDiagnostics.record(
                    "catalog.hydration_ready",
                    mapOf(
                        "channels" to mutableState.value.channels.size,
                        "movies" to mutableState.value.movies.size,
                        "series" to mutableState.value.series.size,
                        "generation" to generation,
                        "low_ram" to lowRamDevice,
                    ),
                )
            }
        }
    }

    private suspend fun restoreSnapshot(
        deviceCode: String?,
        candidates: List<DevicePlaylistConfig>,
        generation: Long,
    ): NativeCatalogState? {
        val normalizedCode = deviceCode?.trim()?.takeIf(String::isNotEmpty) ?: return null
        for ((candidateIndex, candidate) in candidates.withIndex()) {
            currentCoroutineContext().ensureActive()
            if (!loadCoordinator.isCurrent(generation)) return null
            val request = CatalogSnapshotIdentity.request(normalizedCode, candidate)
            val restored = snapshotStore.read(request) ?: continue
            restoreDirectSeriesSources(candidate)
            val state = restored.toState(
                candidate = candidate,
                usingBackup = candidateIndex > 0 || candidate.role.equals("backup", true),
                generation = generation,
            )
            NativeDiagnostics.record(
                "catalog.snapshot_restored",
                mapOf(
                    "read_ms" to restored.readMillis,
                    "size_bytes" to restored.sizeBytes,
                    "age_ms" to restored.ageMillis,
                    "stale" to restored.stale,
                    "channels" to state.channels.size,
                    "movies" to state.movies.size,
                    "series" to state.series.size,
                    "generation" to generation,
                ),
            )
            NativeDiagnostics.recordMemory(getApplication(), "catalog.snapshot_restored_memory")
            return state
        }
        return null
    }

    private fun restoreDirectSeriesSources(candidate: DevicePlaylistConfig) {
        buildList {
            candidate.channelsUrl?.let(::add)
            candidate.moviesUrl?.let(::add)
            candidate.seriesUrl?.let(::add)
            candidate.sourceEndpoints.forEach { source ->
                source.channelsUrl?.let(::add)
                source.moviesUrl?.let(::add)
                source.seriesUrl?.let(::add)
            }
        }.distinct().forEach { DirectXtreamClient.restoreSeriesSource(it) }
    }

    private suspend fun persistSnapshot(
        candidate: DevicePlaylistConfig,
        state: NativeCatalogState,
        deviceCode: String?,
        generation: Long,
    ) {
        val normalizedCode = deviceCode?.trim()?.takeIf(String::isNotEmpty) ?: return
        if (!loadCoordinator.isCurrent(generation) || !state.loaded) return
        val request = CatalogSnapshotIdentity.request(normalizedCode, candidate)
        val sizeBytes = snapshotStore.write(request, state, BuildConfig.VERSION_NAME) ?: run {
            NativeDiagnostics.record(
                "catalog.snapshot_save_failed",
                mapOf(
                    "channels" to state.channels.size,
                    "movies" to state.movies.size,
                    "series" to state.series.size,
                    "generation" to generation,
                ),
            )
            return
        }
        if (!loadCoordinator.isCurrent(generation)) return
        NativeDiagnostics.record(
            "catalog.snapshot_saved",
            mapOf(
                "size_bytes" to sizeBytes,
                "channels" to state.channels.size,
                "movies" to state.movies.size,
                "series" to state.series.size,
                "generation" to generation,
            ),
        )
    }

    private fun CatalogSnapshotRead.toState(
        candidate: DevicePlaylistConfig,
        usingBackup: Boolean,
        generation: Long,
    ): NativeCatalogState = envelope.state.copy(
        loadingSection = null,
        error = null,
        activePlaylistId = candidate.id,
        activePlaylistName = candidate.name,
        usingBackupPlaylist = usingBackup,
        failoverNotice = if (stale) {
            "Último catálogo disponível. Atualizando em segundo plano."
        } else {
            "Catálogo restaurado. Verificando atualizações."
        },
        restoredFromSnapshot = true,
        snapshotSavedAtMillis = envelope.savedAtMillis,
        snapshotAgeMillis = ageMillis,
        snapshotReadMillis = readMillis,
        snapshotSizeBytes = sizeBytes,
        snapshotStale = stale,
        loadGeneration = generation,
    )

    private fun updateForGeneration(
        generation: Long,
        transform: (NativeCatalogState) -> NativeCatalogState,
    ) {
        mutableState.update { current ->
            if (loadCoordinator.isCurrent(generation)) transform(current) else current
        }
    }

    private fun publishForGeneration(generation: Long, state: NativeCatalogState): Boolean {
        if (!loadCoordinator.isCurrent(generation)) return false
        mutableState.value = state
        return true
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
        val snapshotReady: Boolean = false,
    ) {
        fun toState(
            candidate: DevicePlaylistConfig,
            usingBackup: Boolean,
            failoverNotice: String?,
            lastFailureReason: String? = null,
            lastFailoverAtMillis: Long? = null,
            lastFailoverAttemptId: String? = null,
            lastFailoverOutcome: String? = null,
            loadGeneration: Long,
            snapshotMetrics: NativeCatalogState? = null,
            previousState: NativeCatalogState? = null,
        ): NativeCatalogState {
            val visible = CatalogStartupPolicy.visibleParts(
                previous = previousState,
                candidateId = candidate.id,
                progressive = progressive,
                channels = channels,
                movies = movies,
                series = series,
            )
            return NativeCatalogState(
            channels = visible.channels,
            movies = visible.movies,
            series = visible.series,
            loaded = true,
            activePlaylistId = candidate.id,
            activePlaylistName = candidate.name,
            usingBackupPlaylist = usingBackup,
            failoverNotice = failoverNotice,
            lastFailureReason = lastFailureReason,
            lastFailoverAtMillis = lastFailoverAtMillis,
            lastFailoverAttemptId = lastFailoverAttemptId,
            lastFailoverOutcome = lastFailoverOutcome,
            restoredFromSnapshot = false,
            snapshotSavedAtMillis = snapshotMetrics?.snapshotSavedAtMillis,
            snapshotAgeMillis = snapshotMetrics?.snapshotAgeMillis,
            snapshotReadMillis = snapshotMetrics?.snapshotReadMillis,
            snapshotSizeBytes = snapshotMetrics?.snapshotSizeBytes,
            snapshotStale = false,
            loadGeneration = loadGeneration,
        )
        }
    }

    private data class PendingHydration(
        val candidate: DevicePlaylistConfig,
        val generation: Long,
        val deviceCode: String?,
    )

    private class StaleCatalogLoadException : IllegalStateException("Carga de catálogo substituída.")
}
