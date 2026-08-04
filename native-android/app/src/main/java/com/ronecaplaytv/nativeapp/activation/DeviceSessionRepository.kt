package com.ronecaplaytv.nativeapp.activation

import android.content.Context
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.network.DeviceActivationResponse
import com.ronecaplaytv.nativeapp.network.DeviceApi
import com.ronecaplaytv.nativeapp.network.DeviceConfigDirectApi
import com.ronecaplaytv.nativeapp.network.DeviceConfigResponse
import com.ronecaplaytv.nativeapp.network.PlaylistDiagnosticRunner
import com.ronecaplaytv.nativeapp.security.DeviceIdentityStore
import com.ronecaplaytv.nativeapp.security.SecureCredentialStore
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class DeviceSessionRepository(context: Context) {
    private val identityStore = DeviceIdentityStore(context)
    private val credentialStore = SecureCredentialStore(context)
    private val api = DeviceApi(BuildConfig.SUPABASE_FUNCTIONS_URL)
    private val directConfigApi = DeviceConfigDirectApi(BuildConfig.SUPABASE_FUNCTIONS_URL)
    private val diagnosticRunner = PlaylistDiagnosticRunner()
    private val diagnosticScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val activeDiagnosticTaskIds = ConcurrentHashMap.newKeySet<String>()

    suspend fun bootstrap(isTelevision: Boolean): DeviceSessionState {
        val deviceCode = identityStore.getDeviceCode()
        val credential = credentialStore.load()

        return if (deviceCode != null && credential != null) {
            fetchConfig(deviceCode, credential)
        } else {
            activate(isTelevision)
        }
    }

    suspend fun refresh(isTelevision: Boolean): DeviceSessionState {
        val deviceCode = identityStore.getDeviceCode()
        val credential = credentialStore.load()

        return if (deviceCode != null && credential != null) {
            fetchConfig(deviceCode, credential)
        } else {
            activate(isTelevision)
        }
    }

    suspend fun resetAndActivate(isTelevision: Boolean): DeviceSessionState {
        identityStore.clearDeviceCode()
        credentialStore.clear()
        return activate(isTelevision)
    }

    suspend fun reportPlaylistFailure(
        playlistId: String,
        error: String,
        correlationId: String,
        failoverAttemptId: String,
    ) {
        val deviceCode = identityStore.getDeviceCode() ?: return
        val credential = credentialStore.load() ?: return

        directConfigApi.fetchConfig(
            deviceCode = deviceCode,
            deviceUuid = identityStore.getOrCreateDeviceUuid(),
            deviceCredential = credential,
            playlistHealthId = playlistId,
            playlistHealthStatus = "failure",
            playlistHealthError = error,
            correlationId = correlationId,
            failoverAttemptId = failoverAttemptId,
        )
    }

    suspend fun reportPlaylistSuccess(playlistId: String) {
        val deviceCode = identityStore.getDeviceCode() ?: return
        val credential = credentialStore.load() ?: return

        directConfigApi.fetchConfig(
            deviceCode = deviceCode,
            deviceUuid = identityStore.getOrCreateDeviceUuid(),
            deviceCredential = credential,
            playlistHealthId = playlistId,
            playlistHealthStatus = "success",
        )
    }

    private suspend fun activate(isTelevision: Boolean): DeviceSessionState {
        val deviceUuid = identityStore.getOrCreateDeviceUuid()
        val response = api.activate(
            deviceUuid = deviceUuid,
            deviceType = if (isTelevision) "androidtv" else "android",
            appVersion = BuildConfig.VERSION_NAME,
        )

        response.deviceCode?.let(identityStore::saveDeviceCode)
        response.deviceCredential?.let(credentialStore::save)

        val deviceCode = response.deviceCode ?: identityStore.getDeviceCode()
        val credential = response.deviceCredential ?: credentialStore.load()

        if (response.active && deviceCode != null && credential != null) {
            return fetchConfig(deviceCode, credential)
        }

        if (response.active && credential == null) {
            return DeviceSessionState(
                status = DeviceAccessStatus.Blocked,
                deviceCode = deviceCode,
                clientName = response.clientName,
                expiresAt = response.expiresAt,
                message = "Aparelho ativo, mas sem credencial local. Gere um novo código seguro.",
            )
        }

        return response.toSessionState()
    }

    private suspend fun fetchConfig(
        deviceCode: String,
        credential: String,
    ): DeviceSessionState {
        val response = directConfigApi.fetchConfig(
            deviceCode = deviceCode,
            deviceUuid = identityStore.getOrCreateDeviceUuid(),
            deviceCredential = credential,
        )

        if (response.deviceCode != null && response.deviceCode != deviceCode) {
            identityStore.saveDeviceCode(response.deviceCode)
        }

        scheduleDiagnostic(response, response.deviceCode ?: deviceCode, credential)
        return response.toSessionState()
    }

    private fun scheduleDiagnostic(
        response: DeviceConfigResponse,
        deviceCode: String,
        credential: String,
    ) {
        val task = response.playlistDiagnosticTask ?: return
        if (!activeDiagnosticTaskIds.add(task.id)) return

        diagnosticScope.launch {
            try {
                val submission = diagnosticRunner.run(task)
                directConfigApi.fetchConfig(
                    deviceCode = deviceCode,
                    deviceUuid = identityStore.getOrCreateDeviceUuid(),
                    deviceCredential = credential,
                    playlistDiagnosticSubmission = submission,
                )
            } catch (_: Exception) {
                // Diagnóstico é auxiliar: uma falha nunca bloqueia catálogo, ativação ou reprodução.
            } finally {
                activeDiagnosticTaskIds.remove(task.id)
            }
        }
    }

    private fun DeviceActivationResponse.toSessionState() = DeviceSessionState(
        status = mapStatus(status, active, httpStatus),
        deviceCode = deviceCode,
        clientName = clientName,
        expiresAt = expiresAt,
        message = message,
    )

    private fun DeviceConfigResponse.toSessionState() = DeviceSessionState(
        status = mapStatus(status, active, httpStatus),
        deviceCode = deviceCode,
        clientName = clientName,
        expiresAt = expiresAt,
        playlistName = playlistName,
        selectedPlaylistId = selectedPlaylistId,
        cacheSnapshotUrl = cacheSnapshotUrl,
        channelsUrl = channelsUrl,
        moviesUrl = moviesUrl,
        seriesUrl = seriesUrl,
        playlists = playlists,
        message = message,
    )

    private fun mapStatus(status: String, active: Boolean, httpStatus: Int): DeviceAccessStatus {
        if (active && status.equals("active", ignoreCase = true)) return DeviceAccessStatus.Active
        if (httpStatus >= 500) return DeviceAccessStatus.Error

        return when (status.lowercase()) {
            "active" -> DeviceAccessStatus.Active
            "blocked", "revoked" -> DeviceAccessStatus.Blocked
            "expired" -> DeviceAccessStatus.Expired
            "pending", "inactive" -> DeviceAccessStatus.Pending
            else -> if (httpStatus in 400..499) DeviceAccessStatus.Blocked else DeviceAccessStatus.Pending
        }
    }
}
