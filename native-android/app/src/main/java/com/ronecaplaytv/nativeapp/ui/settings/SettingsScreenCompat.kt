package com.ronecaplaytv.nativeapp.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.ronecaplaytv.nativeapp.activation.SupportProfile
import com.ronecaplaytv.nativeapp.update.AppUpdateState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Compatibility entry point used by the current app navigation.
 * It keeps only the transient "refreshing" UI state while the navigation layer is progressively
 * modularized.
 *
 * Varredura completa (achado #7): antes este arquivo mantinha sua PRÓPRIA cópia de PlayerSettingsState,
 * carregada uma única vez do disco (`preferences.load()`), separada da que o RonecaPlayTVApp.kt já
 * mantém e já persiste em toda mudança — inclusive as feitas fora desta tela, como o aspecto de
 * imagem trocado durante a reprodução. Isso podia deixar esta tela mostrando um valor desatualizado
 * ao voltar do player. Agora usa diretamente o `state`/`onStateChange` recebidos, sem cópia local
 * nem gravação duplicada em disco.
 */
@Composable
fun SettingsScreen(
    isTelevision: Boolean,
    state: PlayerSettingsState,
    appUpdateState: AppUpdateState,
    playlistDiagnostics: PlaylistDiagnosticsState,
    supportProfile: SupportProfile,
    onStateChange: (PlayerSettingsState) -> Unit,
    onRefreshContent: () -> Unit,
    onCheckForAppUpdate: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var refreshInProgress by remember { mutableStateOf(false) }
    var refreshMessage by remember { mutableStateOf<String?>(null) }

    SettingsScreen(
        isTelevision = isTelevision,
        state = state,
        refreshInProgress = refreshInProgress,
        refreshMessage = refreshMessage,
        appUpdateState = appUpdateState,
        playlistDiagnostics = playlistDiagnostics,
        supportProfile = supportProfile,
        onStateChange = onStateChange,
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
