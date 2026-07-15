package com.ronecaplaytv.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.remember
import com.ronecaplaytv.nativeapp.platform.DeviceFormFactor
import com.ronecaplaytv.nativeapp.ui.RonecaPlayTVApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            val isTelevision = remember {
                DeviceFormFactor.isTelevision(this@MainActivity)
            }

            RonecaPlayTVApp(isTelevision = isTelevision)
        }
    }
}
