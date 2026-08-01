package com.ronecaplaytv.nativeapp.series

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.catalog.DirectXtreamClient
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import com.ronecaplaytv.nativeapp.network.DeviceApi
import com.ronecaplaytv.nativeapp.security.DeviceIdentityStore
import com.ronecaplaytv.nativeapp.security.SecureCredentialStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SeriesEpisodesViewModel(application: Application) : AndroidViewModel(application) {
    private val identityStore = DeviceIdentityStore(application)
    private val credentialStore = SecureCredentialStore(application)
    private val api = DeviceApi(BuildConfig.SUPABASE_FUNCTIONS_URL)

    private val mutableState = MutableStateFlow(SeriesEpisodesState())
    val state: StateFlow<SeriesEpisodesState> = mutableState.asStateFlow()

    fun load(seriesId: String, playlistId: String?, force: Boolean = false) {
        val normalizedId = seriesId.trim()
        if (normalizedId.isEmpty()) return

        val current = mutableState.value
        if (
            !force &&
            current.seriesId == normalizedId &&
            current.playlistId == playlistId &&
            (current.loading || current.seasons.isNotEmpty())
        ) {
            return
        }

        viewModelScope.launch {
            mutableState.value = SeriesEpisodesState(
                seriesId = normalizedId,
                playlistId = playlistId,
                loading = true,
            )

            val result = runCatching { requestEpisodes(normalizedId, playlistId) }

            mutableState.value = result.fold(
                onSuccess = { response ->
                    SeriesEpisodesState(
                        seriesId = normalizedId,
                        playlistId = playlistId,
                        seasons = response.seasons,
                        loading = false,
                        error = response.message?.takeIf { response.seasons.isEmpty() },
                    )
                },
                onFailure = { failure ->
                    SeriesEpisodesState(
                        seriesId = normalizedId,
                        playlistId = playlistId,
                        loading = false,
                        error = failure.message ?: "Falha ao carregar episódios.",
                    )
                },
            )
        }
    }

    suspend fun fetchNow(seriesId: String, playlistId: String?): List<NativeSeason> {
        val normalizedId = seriesId.trim()
        require(normalizedId.isNotEmpty()) { "Série não informada." }
        return requestEpisodes(normalizedId, playlistId).seasons
    }

    fun clear() {
        mutableState.value = SeriesEpisodesState()
    }

    private suspend fun requestEpisodes(
        seriesId: String,
        playlistId: String?,
    ): DirectSeriesEpisodesResponse {
        if (DirectXtreamClient.isDirectSeriesKey(seriesId)) {
            return DirectSeriesEpisodesResponse(
                DirectXtreamClient.loadSeriesEpisodes(
                    context = getApplication<Application>(),
                    seriesKey = seriesId,
                ),
            )
        }

        val deviceCode = identityStore.getDeviceCode()
            ?: error("Código do aparelho não encontrado.")
        val credential = credentialStore.load()
            ?: error("Credencial segura do aparelho não encontrada.")
        val response = api.fetchSeriesEpisodes(
            deviceCode = deviceCode,
            deviceUuid = identityStore.getOrCreateDeviceUuid(),
            deviceCredential = credential,
            seriesId = seriesId,
            playlistId = playlistId,
        )
        if (!response.successful) {
            error(response.message ?: "Não foi possível carregar os episódios.")
        }
        return DirectSeriesEpisodesResponse(
            seasons = response.seasons,
            message = response.message,
        )
    }
}

private data class DirectSeriesEpisodesResponse(
    val seasons: List<NativeSeason>,
    val message: String? = null,
)

data class SeriesEpisodesState(
    val seriesId: String? = null,
    val playlistId: String? = null,
    val seasons: List<NativeSeason> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)
