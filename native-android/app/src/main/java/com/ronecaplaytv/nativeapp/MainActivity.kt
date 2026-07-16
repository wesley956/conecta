package com.ronecaplaytv.nativeapp

import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.remember
import androidx.core.view.WindowCompat
import com.ronecaplaytv.nativeapp.platform.DeviceFormFactor
import com.ronecaplaytv.nativeapp.ui.RonecaPlayTVApp

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
            RonecaPlayTVApp(isTelevision = isTelevision)
        }
    }
}
