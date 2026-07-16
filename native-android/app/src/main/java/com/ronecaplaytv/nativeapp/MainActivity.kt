package com.ronecaplaytv.nativeapp

import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import com.ronecaplaytv.nativeapp.platform.DeviceFormFactor
import com.ronecaplaytv.nativeapp.ui.RonecaPlayTVApp
import com.ronecaplaytv.nativeapp.ui.splash.RonecaLaunchScreen
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

            LaunchedEffect(Unit) {
                delay(1_650)
                showLaunch = false
            }

            Box(modifier = Modifier.fillMaxSize()) {
                RonecaPlayTVApp(isTelevision = isTelevision)
                if (showLaunch) {
                    RonecaLaunchScreen(isTelevision = isTelevision)
                }
            }
        }
    }
}
