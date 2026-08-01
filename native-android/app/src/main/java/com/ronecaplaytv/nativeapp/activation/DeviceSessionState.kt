package com.ronecaplaytv.nativeapp.activation

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
) {
    val hasCatalogParts: Boolean
        get() = channelsUrl != null || moviesUrl != null || seriesUrl != null
}
