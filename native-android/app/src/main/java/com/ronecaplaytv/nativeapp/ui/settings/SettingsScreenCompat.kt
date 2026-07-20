package com.ronecaplaytv.nativeapp.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.ronecaplaytv.nativeapp.persistence.PlayerSettingsPreferences
import com.ronecaplaytv.nativeapp.update.AppUpdateState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Compatibility entry point used by the current app navigation.
 * It keeps settings persistent while the navigation layer is progressively modularized.
 */
@Composable
fun SettingsScreen(
    isTelevision: Boolean,
    state: PlayerSettingsState,
    appUpdateState: AppUpdateState,
    onStateChange: (PlayerSettingsState) -> Unit,
    onRefreshContent: () -> Unit,
    onCheckForAppUpdate: () -> Unit,
) {
    val context = LocalContext.current
    val preferences = remember { PlayerSettingsPreferences(context) }
    val scope = rememberCoroutineScope()
    var persistedState by remember { mutableStateOf(preferences.load()) }
    var refreshInProgress by remember { mutableStateOf(false) }
    var refreshMessage by remember { mutableStateOf<String?>(null) }

    SettingsScreen(
        isTelevision = isTelevision,
        state = persistedState,
        refreshInProgress = refreshInProgress,
        refreshMessage = refreshMessage,
        appUpdateState = appUpdateState,
        onStateChange = { updated ->
            persistedState = updated
            preferences.save(updated)
            onStateChange(updated)
        },
        onRefreshContent = {
            if (!refreshInProgress) {
                refreshInProgress = true
                refreshMessage = "Sincronizando catálogo e acesso..."
                onRefreshContent()
                scope.launch {
                    delay(2_200)
                    refreshInProgress = false
                    refreshMessage = "Atualização solicitada. O catálogo será renovado em segundo plano."
                    delay(4_000)
                    refreshMessage = null
                }
            }
        },
        onCheckForAppUpdate = onCheckForAppUpdate,
    )
}
