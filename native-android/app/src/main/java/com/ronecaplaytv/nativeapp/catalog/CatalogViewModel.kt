package com.ronecaplaytv.nativeapp.catalog

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig
import com.ronecaplaytv.nativeapp.activation.DeviceSessionRepository
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CatalogViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionRepository = DeviceSessionRepository(application)
    private val sessionEngine = ProviderCatalogSessionEngine(application) { attempt ->
        viewModelScope.launch {
            runCatching { sessionRepository.reportProviderAttempt(attempt) }
        }
    }
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
            listOf(it.id, it.channelsUrl, it.moviesUrl, it.seriesUrl).joinToString(":")
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
     * One compatibility session owns authentication, transport selection,
     * catalog loading and fallback. Direct M3U content is downloaded once and
     * split locally instead of running three competing matrices.
     */
    private suspend fun loadCompleteCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
    ): LoadedCatalog {
        val matrixCorrelationId = "matrix:${UUID.randomUUID()}"
        val catalog = sessionEngine.load(
            candidate = candidate,
            correlationId = matrixCorrelationId,
            onStage = { stage ->
                mutableState.update { it.copy(loadingSection = "$prefix$stage") }
            },
        )
        return LoadedCatalog(
            channels = catalog.channels,
            movies = catalog.movies,
            series = catalog.series,
            warning = catalog.warning,
        )
    }

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
