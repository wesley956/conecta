package com.cruzlabs.ronecaplaytv

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.cruzlabs.ronecaplaytv.platform.DeviceFormFactor
import com.cruzlabs.ronecaplaytv.platform.deviceFormFactor
import com.cruzlabs.ronecaplaytv.ui.mobile.MobileRoot

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (deviceFormFactor() == DeviceFormFactor.TV) {
            startActivity(Intent(this, TvActivity::class.java))
            finish()
            return
        }

        setContent {
            MobileRoot()
        }
    }
}
