package com.ronecaplaytv.nativeapp.activation

import android.content.Context
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.network.DeviceActivationResponse
import com.ronecaplaytv.nativeapp.network.DeviceApi
import com.ronecaplaytv.nativeapp.network.DeviceConfigDirectApi
import com.ronecaplaytv.nativeapp.network.DeviceConfigResponse
import com.ronecaplaytv.nativeapp.network.ProviderAttemptApi
import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport
import com.ronecaplaytv.nativeapp.persistence.CatalogSnapshotAccessPolicy
import com.ronecaplaytv.nativeapp.persistence.CatalogSnapshotStore
import com.ronecaplaytv.nativeapp.security.DeviceIdentityStore
import com.ronecaplaytv.nativeapp.security.SecureCredentialStore

class DeviceSessionRepository(context: Context) {
    private val identityStore = DeviceIdentityStore(context)
    private val credentialStore = SecureCredentialStore(context)
    private val api = DeviceApi(BuildConfig.SUPABASE_FUNCTIONS_URL)
    private val directConfigApi = DeviceConfigDirectApi(BuildConfig.SUPABASE_FUNCTIONS_URL)
    private val providerAttemptApi = ProviderAttemptApi(BuildConfig.SUPABASE_FUNCTIONS_URL)
    private val catalogSnapshotStore = CatalogSnapshotStore(context)

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
        catalogSnapshotStore.clearAll()
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

    suspend fun reportProviderAttempt(attempt: ProviderAttemptReport) {
        val deviceCode = identityStore.getDeviceCode() ?: return
        val credential = credentialStore.load() ?: return

        providerAttemptApi.report(
            deviceCode = deviceCode,
            deviceUuid = identityStore.getOrCreateDeviceUuid(),
            deviceCredential = credential,
            attempt = attempt,
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
            catalogSnapshotStore.clearAll()
            return DeviceSessionState(
                status = DeviceAccessStatus.Blocked,
                deviceCode = deviceCode,
                clientName = response.clientName,
                expiresAt = response.expiresAt,
                supportProfile = response.supportProfile,
                message = "Aparelho ativo, mas sem credencial local. Gere um novo código seguro.",
            )
        }

        return response.toSessionState().also { state ->
            if (CatalogSnapshotAccessPolicy.mustInvalidate(state.status)) {
                catalogSnapshotStore.clearAll()
            }
        }
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

        return response.toSessionState().also { state ->
            if (CatalogSnapshotAccessPolicy.mustInvalidate(state.status)) {
                catalogSnapshotStore.clearAll()
            }
        }
    }

    private fun DeviceActivationResponse.toSessionState() = DeviceSessionState(
        status = mapStatus(status, active, httpStatus),
        deviceCode = deviceCode,
        clientName = clientName,
        expiresAt = expiresAt,
        supportProfile = supportProfile,
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
        supportProfile = supportProfile,
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
