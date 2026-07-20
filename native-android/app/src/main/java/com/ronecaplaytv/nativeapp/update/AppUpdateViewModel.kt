package com.ronecaplaytv.nativeapp.update

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ronecaplaytv.nativeapp.BuildConfig
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

class AppUpdateViewModel(application: Application) : AndroidViewModel(application) {
    private val manager = AppUpdateManager(application.applicationContext)
    private val mutableState = MutableStateFlow<AppUpdateState>(AppUpdateState.Idle)
    val state: StateFlow<AppUpdateState> = mutableState.asStateFlow()

    private var activeJob: Job? = null

    fun checkForUpdates(userInitiated: Boolean) {
        if (activeJob?.isActive == true || mutableState.value is AppUpdateState.Downloading) return
        activeJob = viewModelScope.launch {
            mutableState.value = AppUpdateState.Checking(userInitiated)
            runCatching { manager.fetchManifest() }
                .onSuccess { manifest ->
                    mutableState.value = if (manifest.versionCode > BuildConfig.VERSION_CODE) {
                        AppUpdateState.Available(manifest)
                    } else {
                        AppUpdateState.UpToDate(userInitiated)
                    }
                }
                .onFailure { error ->
                    mutableState.value = AppUpdateState.Error(
                        message = error.message ?: "Não foi possível verificar atualizações.",
                        userVisible = userInitiated,
                    )
                }
        }
    }

    fun downloadUpdate(manifest: UpdateManifest) {
        if (activeJob?.isActive == true || mutableState.value is AppUpdateState.Downloading) return
        activeJob = viewModelScope.launch {
            mutableState.value = AppUpdateState.Downloading(manifest, progress = 0f)
            runCatching {
                manager.download(manifest) { progress ->
                    mutableState.update { current ->
                        if (current is AppUpdateState.Downloading) current.copy(progress = progress) else current
                    }
                }
            }.onSuccess { apk ->
                mutableState.value = AppUpdateState.ReadyToInstall(
                    manifest = manifest,
                    apkPath = apk.absolutePath,
                )
            }.onFailure { error ->
                mutableState.value = AppUpdateState.Error(
                    message = error.message ?: "Não foi possível baixar a atualização.",
                    userVisible = true,
                )
            }
        }
    }

    fun installUpdate(state: AppUpdateState.ReadyToInstall) {
        runCatching { manager.requestInstall(File(state.apkPath)) }
            .onSuccess { result ->
                if (result == AppUpdateManager.InstallRequestResult.PermissionRequired) {
                    mutableState.value = state.copy(permissionRequired = true)
                } else {
                    mutableState.value = state.copy(permissionRequired = false)
                }
            }
            .onFailure { error ->
                mutableState.value = AppUpdateState.Error(
                    message = error.message ?: "Não foi possível abrir o instalador do Android.",
                    userVisible = true,
                )
            }
    }

    fun dismiss() {
        val current = mutableState.value
        val mandatory = when (current) {
            is AppUpdateState.Available -> current.manifest.mandatory
            is AppUpdateState.Downloading -> current.manifest.mandatory
            is AppUpdateState.ReadyToInstall -> current.manifest.mandatory
            else -> false
        }
        if (!mandatory && current !is AppUpdateState.Downloading) {
            mutableState.value = AppUpdateState.Idle
        }
    }
}
