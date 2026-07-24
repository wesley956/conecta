package com.ronecaplaytv.nativeapp.update

data class UpdateManifest(
    val versionCode: Long,
    val versionName: String,
    val apkUrl: String?,
    val sha256: String,
    val mandatory: Boolean,
    val notes: String,
)

sealed interface AppUpdateState {
    data object Idle : AppUpdateState

    data class Checking(
        val userInitiated: Boolean,
    ) : AppUpdateState

    data class UpToDate(
        val userInitiated: Boolean,
    ) : AppUpdateState

    data class Available(
        val manifest: UpdateManifest,
    ) : AppUpdateState

    data class Downloading(
        val manifest: UpdateManifest,
        val progress: Float?,
    ) : AppUpdateState

    data class ReadyToInstall(
        val manifest: UpdateManifest,
        val apkPath: String,
        val permissionRequired: Boolean = false,
    ) : AppUpdateState

    data class Error(
        val message: String,
        val userVisible: Boolean,
    ) : AppUpdateState
}
