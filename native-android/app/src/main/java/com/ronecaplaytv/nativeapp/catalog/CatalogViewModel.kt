package com.ronecaplaytv.nativeapp.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CatalogViewModel : ViewModel() {
    private val client = CatalogPartClient()
    private val mutableState = MutableStateFlow(NativeCatalogState())

    val state: StateFlow<NativeCatalogState> = mutableState.asStateFlow()

    private var loadedKey: String? = null
    private var availablePlaylists: List<DevicePlaylistConfig> = emptyList()

    fun load(
        channelsUrl: String?,
        moviesUrl: String?,
        seriesUrl: String?,
        playlists: List<DevicePlaylistConfig> = emptyList(),
        force: Boolean = false,
    ) {
        val candidates = playlistCandidates(channelsUrl, moviesUrl, seriesUrl, playlists)
        val key = candidates.joinToString("|") {
            listOf(it.id, it.channelsUrl, it.moviesUrl, it.seriesUrl).joinToString(":")
        }
        availablePlaylists = candidates

        if (!force && loadedKey == key && mutableState.value.loaded) return
        if (mutableState.value.isLoading) return

        viewModelScope.launch {
            mutableState.value = NativeCatalogState(loadingSection = "canais")
            loadFirstAvailable(candidates, key)
        }
    }

    fun failoverActivePlaylist(reason: String) {
        if (mutableState.value.isLoading) return

        val activeId = mutableState.value.activePlaylistId ?: return
        val activeIndex = availablePlaylists.indexOfFirst { it.id == activeId }
        val backupCandidates = availablePlaylists.drop((activeIndex + 1).coerceAtLeast(0))

        if (backupCandidates.isEmpty()) {
            mutableState.update {
                it.copy(
                    error = "A lista ativa falhou e nenhuma lista reserva está disponível.",
                    lastFailureReason = reason,
                )
            }
            return
        }

        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    loadingSection = "ativando lista reserva",
                    error = null,
                    lastFailureReason = reason,
                )
            }

            var lastFailure: Throwable? = null
            for (candidate in backupCandidates) {
                val result = runCatching { loadCompleteCatalog(candidate, "lista reserva: ") }
                result.onSuccess { catalog ->
                    mutableState.value = catalog.toState(
                        candidate = candidate,
                        usingBackup = true,
                        failoverNotice = "Lista principal indisponível. Catálogo substituído pela lista reserva.",
                        lastFailureReason = reason,
                        lastFailoverAtMillis = System.currentTimeMillis(),
                    )
                    return@launch
                }.onFailure { lastFailure = it }
            }

            mutableState.update {
                it.copy(
                    loadingSection = null,
                    error = lastFailure?.message
                        ?: "A lista principal e a lista reserva estão indisponíveis.",
                    lastFailureReason = reason,
                )
            }
        }
    }

    private suspend fun loadFirstAvailable(
        candidates: List<DevicePlaylistConfig>,
        key: String,
    ) {
        runCatching {
            if (candidates.isEmpty()) {
                error("O cache seguro das listas ainda não está disponível.")
            }

            var lastFailure: Throwable? = null
            for ((candidateIndex, candidate) in candidates.withIndex()) {
                val prefix = if (candidateIndex == 0) "" else "lista reserva: "
                val result = runCatching { loadCompleteCatalog(candidate, prefix) }

                result.onSuccess { catalog ->
                    loadedKey = key
                    mutableState.value = catalog.toState(
                        candidate = candidate,
                        usingBackup = candidateIndex > 0 || candidate.role.equals("backup", true),
                        failoverNotice = if (candidateIndex > 0) {
                            "Lista principal indisponível. Catálogo substituído pela lista reserva."
                        } else {
                            null
                        },
                        lastFailureReason = if (candidateIndex > 0) lastFailure?.message else null,
                        lastFailoverAtMillis = if (candidateIndex > 0) System.currentTimeMillis() else null,
                    )
                    return
                }.onFailure { lastFailure = it }
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

    private suspend fun loadCompleteCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
    ): LoadedCatalog {
        mutableState.update { it.copy(loadingSection = "${prefix}canais") }
        val channels = candidate.channelsUrl?.let { client.loadChannels(it) }.orEmpty()

        mutableState.update { it.copy(loadingSection = "${prefix}filmes") }
        val movies = candidate.moviesUrl?.let { client.loadMovies(it) }.orEmpty()

        mutableState.update { it.copy(loadingSection = "${prefix}séries") }
        val series = candidate.seriesUrl?.let { client.loadSeries(it) }.orEmpty()

        if (channels.isEmpty() && movies.isEmpty() && series.isEmpty()) {
            throw CatalogLoadException("A lista retornou um catálogo vazio.")
        }

        return LoadedCatalog(channels, movies, series)
    }

    private fun playlistCandidates(
        channelsUrl: String?,
        moviesUrl: String?,
        seriesUrl: String?,
        playlists: List<DevicePlaylistConfig>,
    ) = buildList {
        playlists
            .filter(DevicePlaylistConfig::hasCatalogParts)
            .sortedBy(DevicePlaylistConfig::priority)
            .forEach(::add)

        if (isEmpty() && (channelsUrl != null || moviesUrl != null || seriesUrl != null)) {
            add(
                DevicePlaylistConfig(
                    id = "selected",
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
    ) {
        fun toState(
            candidate: DevicePlaylistConfig,
            usingBackup: Boolean,
            failoverNotice: String?,
            lastFailureReason: String? = null,
            lastFailoverAtMillis: Long? = null,
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
        )
    }
}
