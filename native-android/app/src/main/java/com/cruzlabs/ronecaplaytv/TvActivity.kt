package com.cruzlabs.ronecaplaytv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.cruzlabs.ronecaplaytv.ui.tv.TvRoot

class TvActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            TvRoot()
        }
    }
}
