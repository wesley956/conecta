package com.ronecaplaytv.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.tv.material3.MaterialTheme
import com.ronecaplaytv.nativeapp.ui.home.HomeScreen
import com.ronecaplaytv.nativeapp.ui.player.NativePlayerScreen

private enum class NativeDestination {
    Home,
    Player,
}

@Composable
fun RonecaPlayTVApp(isTelevision: Boolean) {
    var destination by remember { mutableStateOf(NativeDestination.Home) }

    MaterialTheme {
        when (destination) {
            NativeDestination.Home -> HomeScreen(
                isTelevision = isTelevision,
                onOpenPlayer = { destination = NativeDestination.Player },
            )

            NativeDestination.Player -> NativePlayerScreen(
                isTelevision = isTelevision,
                onBack = { destination = NativeDestination.Home },
            )
        }
    }
}
