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
    val cacheSnapshotUrl: String? = null,
    val channelsUrl: String? = null,
    val moviesUrl: String? = null,
    val seriesUrl: String? = null,
    val message: String? = null,
    val isRefreshing: Boolean = false,
) {
    val isActive: Boolean
        get() = status == DeviceAccessStatus.Active
}
