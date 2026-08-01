package com.ronecaplaytv.nativeapp.activation

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class ActivationViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = DeviceSessionRepository(application)
    private val mutableState = MutableStateFlow(DeviceSessionState())

    val state: StateFlow<DeviceSessionState> = mutableState.asStateFlow()

    private var initialized = false
    private var isTelevision = false

    fun initialize(isTelevision: Boolean) {
        if (initialized) return
        initialized = true
        this.isTelevision = isTelevision
        load { repository.bootstrap(isTelevision) }
    }

    fun refresh() {
        load { repository.refresh(isTelevision) }
    }

    fun resetSecureActivation() {
        load { repository.resetAndActivate(isTelevision) }
    }

    fun reportPlaylistFailure(
        playlistId: String?,
        error: String,
        correlationId: String,
        failoverAttemptId: String,
    ) {
        val normalizedId = playlistId?.trim().orEmpty()
        if (normalizedId.isEmpty()) return

        viewModelScope.launch {
            runCatching {
                repository.reportPlaylistFailure(
                    playlistId = normalizedId,
                    error = error,
                    correlationId = correlationId,
                    failoverAttemptId = failoverAttemptId,
                )
            }
        }
    }

    fun reportPlaylistSuccess(playlistId: String?) {
        val normalizedId = playlistId?.trim().orEmpty()
        if (normalizedId.isEmpty()) return

        viewModelScope.launch {
            runCatching { repository.reportPlaylistSuccess(normalizedId) }
        }
    }

    private fun load(block: suspend () -> DeviceSessionState) {
        if (mutableState.value.isRefreshing) return

        viewModelScope.launch {
            mutableState.update { current ->
                current.copy(
                    status = if (current.deviceCode == null) DeviceAccessStatus.Loading else current.status,
                    isRefreshing = true,
                    message = if (current.deviceCode == null) "Conectando ao painel..." else current.message,
                )
            }

            mutableState.value = runCatching { block() }
                .getOrElse { error ->
                    DeviceSessionState(
                        status = DeviceAccessStatus.Error,
                        deviceCode = mutableState.value.deviceCode,
                        message = error.message ?: "Não foi possível conectar ao painel.",
                    )
                }
                .copy(isRefreshing = false)
        }
    }
}
