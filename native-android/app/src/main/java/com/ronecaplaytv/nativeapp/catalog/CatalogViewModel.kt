package com.ronecaplaytv.nativeapp.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
        force: Boolean = false,
    ) {
        val key = listOf(channelsUrl, moviesUrl, seriesUrl).joinToString("|")
        if (!force && loadedKey == key && mutableState.value.loaded) return
        if (mutableState.value.isLoading) return

        viewModelScope.launch {
            mutableState.value = NativeCatalogState(loadingSection = "canais")

            runCatching {
                val channels = channelsUrl?.let { client.loadChannels(it) }.orEmpty()
                mutableState.update {
                    it.copy(
                        channels = channels,
                        loadingSection = "filmes",
                    )
                }

                val movies = moviesUrl?.let { client.loadMovies(it) }.orEmpty()
                mutableState.update {
                    it.copy(
                        movies = movies,
                        loadingSection = "séries",
                    )
                }

                val series = seriesUrl?.let { client.loadSeries(it) }.orEmpty()
                loadedKey = key
                mutableState.update {
                    it.copy(
                        series = series,
                        loadingSection = null,
                        loaded = true,
                        error = if (channelsUrl == null && moviesUrl == null && seriesUrl == null) {
                            "O cache seguro da lista ainda não está disponível."
                        } else {
                            null
                        },
                    )
                }
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
