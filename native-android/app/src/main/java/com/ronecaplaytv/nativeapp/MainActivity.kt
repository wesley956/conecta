package com.ronecaplaytv.nativeapp

import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ronecaplaytv.nativeapp.platform.DeviceFormFactor
import com.ronecaplaytv.nativeapp.ui.RonecaPlayTVApp
import com.ronecaplaytv.nativeapp.ui.player.NativePlaybackKeyRouter
import com.ronecaplaytv.nativeapp.ui.splash.RonecaLaunchScreen
import com.ronecaplaytv.nativeapp.ui.update.AppUpdateOverlay
import com.ronecaplaytv.nativeapp.update.AppUpdateViewModel
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val isTelevisionDevice = DeviceFormFactor.isTelevision(this)
        if (isTelevisionDevice) {
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        }

        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.rgb(5, 5, 5)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        setContent {
            val isTelevision = remember { isTelevisionDevice }
            var showLaunch by rememberSaveable { mutableStateOf(true) }
            val appUpdateViewModel: AppUpdateViewModel = viewModel()
            val appUpdateState by appUpdateViewModel.state.collectAsStateWithLifecycle()

            LaunchedEffect(Unit) {
                delay(4_000)
                showLaunch = false
                appUpdateViewModel.checkForUpdates(userInitiated = false)
            }

            Box(modifier = Modifier.fillMaxSize()) {
                RonecaPlayTVApp(
                    isTelevision = isTelevision,
                    appUpdateState = appUpdateState,
                    onCheckForAppUpdate = {
                        appUpdateViewModel.checkForUpdates(userInitiated = true)
                    },
                )
                AnimatedVisibility(
                    visible = showLaunch,
                    exit = fadeOut(animationSpec = tween(durationMillis = 450)),
                ) {
                    RonecaLaunchScreen(isTelevision = isTelevision)
                }
                if (!showLaunch) {
                    AppUpdateOverlay(
                        state = appUpdateState,
                        isTelevision = isTelevision,
                        onDownload = appUpdateViewModel::downloadUpdate,
                        onInstall = appUpdateViewModel::installUpdate,
                        onRetry = {
                            appUpdateViewModel.checkForUpdates(userInitiated = true)
                        },
                        onDismiss = appUpdateViewModel::dismiss,
                    )
                }
            }
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (NativePlaybackKeyRouter.dispatch(event)) return true
        return super.dispatchKeyEvent(event)
    }
}
