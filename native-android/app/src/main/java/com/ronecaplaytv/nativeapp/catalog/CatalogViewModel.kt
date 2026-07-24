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

    fun load(
        channelsUrl: String?,
        moviesUrl: String?,
        seriesUrl: String?,
        playlists: List<DevicePlaylistConfig> = emptyList(),
        force: Boolean = false,
    ) {
        val candidates = buildList {
            playlists.filter(DevicePlaylistConfig::hasCatalogParts).forEach(::add)
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
        }.distinctBy(DevicePlaylistConfig::id).sortedBy(DevicePlaylistConfig::priority)
        val key = candidates.joinToString("|") {
            listOf(it.id, it.channelsUrl, it.moviesUrl, it.seriesUrl).joinToString(":")
        }
        if (!force && loadedKey == key && mutableState.value.loaded) return
        if (mutableState.value.isLoading) return

        viewModelScope.launch {
            mutableState.value = NativeCatalogState(loadingSection = "canais")

            runCatching {
                if (candidates.isEmpty()) {
                    error("O cache seguro das listas ainda não está disponível.")
                }

                var lastFailure: Throwable? = null
                for ((candidateIndex, candidate) in candidates.withIndex()) {
                    val prefix = if (candidateIndex == 0) "" else "lista reserva: "
                    val result = runCatching {
                        mutableState.update { it.copy(loadingSection = "${prefix}canais") }
                        val channels = candidate.channelsUrl
                            ?.let { client.loadChannels(it) }
                            .orEmpty()

                        mutableState.update {
                            it.copy(channels = channels, loadingSection = "${prefix}filmes")
                        }
                        val movies = candidate.moviesUrl
                            ?.let { client.loadMovies(it) }
                            .orEmpty()

                        mutableState.update {
                            it.copy(movies = movies, loadingSection = "${prefix}séries")
                        }
                        val series = candidate.seriesUrl
                            ?.let { client.loadSeries(it) }
                            .orEmpty()

                        Triple(channels, movies, series)
                    }

                    result.onSuccess { (channels, movies, series) ->
                        loadedKey = key
                        mutableState.value = NativeCatalogState(
                            channels = channels,
                            movies = movies,
                            series = series,
                            loaded = true,
                            activePlaylistId = candidate.id,
                            activePlaylistName = candidate.name,
                            usingBackupPlaylist = candidateIndex > 0,
                        )
                        return@launch
                    }.onFailure { error ->
                        lastFailure = error
                    }
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
    }
}
