package com.ronecaplaytv.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.MaterialTheme
import com.ronecaplaytv.nativeapp.activation.ActivationViewModel
import com.ronecaplaytv.nativeapp.ui.activation.ActivationScreen
import com.ronecaplaytv.nativeapp.ui.home.HomeScreen
import com.ronecaplaytv.nativeapp.ui.player.NativePlayerScreen

private enum class NativeDestination {
    Home,
    Player,
}

@Composable
fun RonecaPlayTVApp(
    isTelevision: Boolean,
    activationViewModel: ActivationViewModel = viewModel(),
) {
    val sessionState by activationViewModel.state.collectAsStateWithLifecycle()
    var destination by remember { mutableStateOf(NativeDestination.Home) }

    LaunchedEffect(isTelevision) {
        activationViewModel.initialize(isTelevision)
    }

    MaterialTheme {
        if (!sessionState.isActive) {
            ActivationScreen(
                state = sessionState,
                isTelevision = isTelevision,
                onRefresh = activationViewModel::refresh,
                onReset = activationViewModel::resetSecureActivation,
            )
            return@MaterialTheme
        }

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
