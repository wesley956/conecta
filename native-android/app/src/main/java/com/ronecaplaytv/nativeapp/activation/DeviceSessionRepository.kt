package com.ronecaplaytv.nativeapp.activation

import android.content.Context
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.network.DeviceActivationResponse
import com.ronecaplaytv.nativeapp.network.DeviceApi
import com.ronecaplaytv.nativeapp.network.DeviceConfigResponse
import com.ronecaplaytv.nativeapp.security.DeviceIdentityStore
import com.ronecaplaytv.nativeapp.security.SecureCredentialStore

class DeviceSessionRepository(context: Context) {
    private val identityStore = DeviceIdentityStore(context)
    private val credentialStore = SecureCredentialStore(context)
    private val api = DeviceApi(BuildConfig.SUPABASE_FUNCTIONS_URL)

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

    suspend fun reportPlaylistFailure(playlistId: String, error: String) {
        val deviceCode = identityStore.getDeviceCode() ?: return
        val credential = credentialStore.load() ?: return

        api.fetchConfig(
            deviceCode = deviceCode,
            deviceUuid = identityStore.getOrCreateDeviceUuid(),
            deviceCredential = credential,
            playlistHealthId = playlistId,
            playlistHealthStatus = "failure",
            playlistHealthError = error,
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
        val response = api.fetchConfig(
            deviceCode = deviceCode,
            deviceUuid = identityStore.getOrCreateDeviceUuid(),
            deviceCredential = credential,
        )

        if (response.deviceCode != null && response.deviceCode != deviceCode) {
            identityStore.saveDeviceCode(response.deviceCode)
        }

        return response.toSessionState()
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
