package com.ronecaplaytv.nativeapp.activation

import com.ronecaplaytv.nativeapp.network.SourceNetworkPolicy

enum class DeviceAccessStatus {
    Loading,
    Pending,
    Active,
    Blocked,
    Expired,
    Error,
}

data class DeviceSessionState(
    val status: DeviceAccessStatus = DeviceAccessStatus.Loading,
    val deviceCode: String? = null,
    val clientName: String? = null,
    val expiresAt: String? = null,
    val playlistName: String? = null,
    val selectedPlaylistId: String? = null,
    val cacheSnapshotUrl: String? = null,
    val channelsUrl: String? = null,
    val moviesUrl: String? = null,
    val seriesUrl: String? = null,
    val playlists: List<DevicePlaylistConfig> = emptyList(),
    val supportProfile: SupportProfile = SupportProfile.generic(),
    val message: String? = null,
    val isRefreshing: Boolean = false,
) {
    val isActive: Boolean
        get() = status == DeviceAccessStatus.Active
}

data class DevicePlaylistConfig(
    val id: String,
    val name: String,
    val priority: Int,
    val role: String,
    val channelsUrl: String?,
    val moviesUrl: String?,
    val seriesUrl: String?,
    val networkPolicy: SourceNetworkPolicy = SourceNetworkPolicy.strict(),
    val sourceEndpoints: List<DeviceSourceEndpoint> = emptyList(),
    val accessMode: String? = null,
    val cacheReady: Boolean = false,
    val updatedAt: String? = null,
    val cacheVersion: String? = null,
    val cacheUpdatedAt: String? = null,
    val cacheManifestSha256: String? = null,
) {
    val hasCatalogParts: Boolean
        get() = channelsUrl != null || moviesUrl != null || seriesUrl != null

    /**
     * O backend incrementa estes campos somente quando o conteúdo publicado muda.
     * Quando presentes, eles são uma prova mais forte que um TTL local e permitem
     * abrir um snapshot idêntico sem reinterpretar o catálogo novamente.
     */
    val authoritativeContentRevision: String?
        get() = if (!cacheReady) null else {
            cacheManifestSha256
                ?.takeIf(String::isNotBlank)
                ?: cacheVersion?.takeIf(String::isNotBlank)
        }
}


data class DeviceSourceEndpoint(
    val id: String,
    val label: String,
    val type: String,
    val priority: Int,
    val primary: Boolean,
    val channelsUrl: String?,
    val moviesUrl: String?,
    val seriesUrl: String?,
)
