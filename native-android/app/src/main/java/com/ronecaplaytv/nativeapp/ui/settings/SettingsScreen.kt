package com.ronecaplaytv.nativeapp.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.activation.SupportProfile
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.player.PlayerAspectMode
import com.ronecaplaytv.nativeapp.ui.support.SupportDialog
import com.ronecaplaytv.nativeapp.update.AppUpdateState
import java.text.DateFormat
import java.util.Date

data class PlayerSettingsState(
    val decoderMode: String = "Hardware",
    val bufferSeconds: Int = 5,
    val aspectMode: String = PlayerAspectMode.Original.storageValue,
    val language: String = "Português",
    val automaticReconnect: Boolean = true,
    val forceTvMode: Boolean = false,
    val launchSoundEnabled: Boolean = true,
)

data class PlaylistDiagnosticsState(
    val activePlaylistName: String?,
    val usingBackupPlaylist: Boolean,
    val lastFailoverAtMillis: Long?,
    val lastFailureReason: String?,
    val channels: Int,
    val movies: Int,
    val series: Int,
)

@Composable
fun SettingsScreen(
    isTelevision: Boolean,
    state: PlayerSettingsState,
    refreshInProgress: Boolean,
    refreshMessage: String?,
    appUpdateState: AppUpdateState,
    playlistDiagnostics: PlaylistDiagnosticsState,
    supportProfile: SupportProfile,
    onStateChange: (PlayerSettingsState) -> Unit,
    onRefreshContent: () -> Unit,
    onCheckForAppUpdate: () -> Unit,
) {
    var showSupportDialog by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentPadding = PaddingValues(
            start = if (isTelevision) 24.dp else 18.dp,
            end = if (isTelevision) 24.dp else 18.dp,
            top = if (isTelevision) 18.dp else 20.dp,
            bottom = 36.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { SettingsHeader(isTelevision) }
        item {
            RefreshCard(
                isTelevision = isTelevision,
                refreshing = refreshInProgress,
                message = refreshMessage,
                onRefresh = onRefreshContent,
            )
        }
        item { CurrentProfileCard(isTelevision = isTelevision, state = state) }

        item { SectionTitle("SUPORTE", isTelevision) }
        item {
            FocusableActionCard(
                title = supportProfile.displayName,
                subtitle = supportProfile.supportText ?: "Contato responsável por este aparelho.",
                badge = if (supportProfile.primaryContactUri != null) "ABRIR" else "INFO",
                enabled = true,
                isTelevision = isTelevision,
                accentColor = RonecaColors.Green,
                modifier = Modifier.fillMaxWidth().height(if (isTelevision) 98.dp else 88.dp),
                onClick = { showSupportDialog = true },
            )
        }

        item { SectionTitle("DIAGNÓSTICO DAS LISTAS", isTelevision) }
        item {
            PlaylistDiagnosticsCard(
                isTelevision = isTelevision,
                diagnostics = playlistDiagnostics,
            )
        }

        item { SectionTitle("PLAYER", isTelevision) }
        item {
            ChoiceSettingRow(
                title = "Decodificação",
                subtitle = "Hardware prioriza desempenho; Software amplia a compatibilidade.",
                options = listOf("Hardware", "Software"),
                selected = state.decoderMode,
                isTelevision = isTelevision,
                onSelect = { onStateChange(state.copy(decoderMode = it)) },
            )
        }
        item {
            ChoiceSettingRow(
                title = "Buffer inicial",
                subtitle = "Um buffer maior ajuda conexões instáveis, mas aumenta o tempo de início.",
                options = listOf("2s", "5s", "10s"),
                selected = "${state.bufferSeconds}s",
                isTelevision = isTelevision,
                onSelect = { value ->
                    onStateChange(state.copy(bufferSeconds = value.removeSuffix("s").toInt()))
                },
            )
        }
        item {
            ChoiceSettingRow(
                title = "Aspecto da imagem",
                subtitle = "Ajuste como filmes, séries e canais ocupam a tela.",
                options = PlayerAspectMode.settingsOptions,
                selected = state.aspectMode,
                isTelevision = isTelevision,
                onSelect = { onStateChange(state.copy(aspectMode = it)) },
            )
        }

        item { SectionTitle("INTERFACE", isTelevision) }
        item {
            ToggleSettingRow(
                title = "Som de abertura",
                subtitle = "Reproduzir a assinatura sonora de 3 segundos ao abrir o aplicativo.",
                checked = state.launchSoundEnabled,
                isTelevision = isTelevision,
                onToggle = { onStateChange(state.copy(launchSoundEnabled = it)) },
            )
        }
        item {
            ToggleSettingRow(
                title = "Modo TV",
                subtitle = "Usar navegação lateral, foco ampliado e experiência para controle remoto.",
                checked = state.forceTvMode,
                isTelevision = isTelevision,
                onToggle = { onStateChange(state.copy(forceTvMode = it)) },
            )
        }

        item { SectionTitle("REDE", isTelevision) }
        item {
            ToggleSettingRow(
                title = "Reconexão automática",
                subtitle = "Tentar novamente e alternar a fonte quando uma transmissão cair.",
                checked = state.automaticReconnect,
                isTelevision = isTelevision,
                onToggle = { onStateChange(state.copy(automaticReconnect = it)) },
            )
        }

        item { SectionTitle("APLICATIVO", isTelevision) }
        item {
            AppUpdateCard(
                isTelevision = isTelevision,
                state = appUpdateState,
                onCheck = onCheckForAppUpdate,
            )
        }
        item {
            InfoSettingRow(
                title = "Roneca Player TV",
                subtitle = "Versão ${BuildConfig.VERSION_NAME} • Android TV, TV Box, celular e tablet",
                value = "NATIVO",
                isTelevision = isTelevision,
            )
        }
    }

    if (showSupportDialog) {
        SupportDialog(
            profile = supportProfile,
            isTelevision = isTelevision,
            onDismiss = { showSupportDialog = false },
        )
    }
}

@Composable
private fun PlaylistDiagnosticsCard(
    isTelevision: Boolean,
    diagnostics: PlaylistDiagnosticsState,
) {
    val role = if (diagnostics.usingBackupPlaylist) "RESERVA" else "PRINCIPAL"
    val activeName = diagnostics.activePlaylistName?.takeIf(String::isNotBlank) ?: "Aguardando catálogo"
    val failoverTime = diagnostics.lastFailoverAtMillis?.let { timestamp ->
        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(timestamp))
    } ?: "Nenhuma troca nesta sessão"
    val reason = diagnostics.lastFailureReason
        ?.takeIf(String::isNotBlank)
        ?.take(180)
        ?: "Nenhuma falha registrada nesta sessão."

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(RonecaColors.BackgroundSoft)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(14.dp))
            .padding(if (isTelevision) 17.dp else 15.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Lista ativa",
                    color = RonecaColors.TextMuted,
                    fontSize = 10.sp,
                    letterSpacing = 1.sp,
                )
                Text(
                    text = activeName,
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 16.sp else 14.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            StatusPill(label = role, active = !diagnostics.usingBackupPlaylist)
        }
        Text(
            text = "Catálogo: ${diagnostics.channels} canais • ${diagnostics.movies} filmes • ${diagnostics.series} séries",
            color = RonecaColors.Primary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = "Última troca: $failoverTime",
            color = RonecaColors.TextSecondary,
            fontSize = 12.sp,
        )
        Text(
            text = "Motivo: $reason",
            color = if (diagnostics.lastFailureReason.isNullOrBlank()) {
                RonecaColors.TextMuted
            } else {
                RonecaColors.TextSecondary
            },
            fontSize = 12.sp,
        )
    }
}

@Composable
private fun AppUpdateCard(
    isTelevision: Boolean,
    state: AppUpdateState,
    onCheck: () -> Unit,
) {
    val checking = state is AppUpdateState.Checking || state is AppUpdateState.Downloading
    val subtitle = when (state) {
        is AppUpdateState.Checking -> "Consultando a versão mais recente..."
        is AppUpdateState.UpToDate -> "Você já está usando a versão mais recente."
        is AppUpdateState.Available -> "Versão ${state.manifest.versionName} disponível para download."
        is AppUpdateState.Downloading -> "Baixando versão ${state.manifest.versionName}..."
        is AppUpdateState.ReadyToInstall -> "Versão ${state.manifest.versionName} pronta para instalar."
        is AppUpdateState.Error -> state.message
        AppUpdateState.Idle -> "Verifique manualmente se há uma nova versão."
    }
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Focus else RonecaColors.Border,
                shape = RoundedCornerShape(14.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .activateOnRemote(enabled = !checking, onActivate = onCheck)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = !checking,
                onClick = onCheck,
            )
            .focusable()
            .padding(if (isTelevision) 17.dp else 15.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Atualizações do aplicativo",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 16.sp else 15.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = subtitle,
                color = if (state is AppUpdateState.Error) RonecaColors.RedStrong else RonecaColors.TextSecondary,
                fontSize = 12.sp,
            )
        }
        StatusPill(
            label = if (checking) "AGUARDE" else "VERIFICAR",
            active = state is AppUpdateState.Available || state is AppUpdateState.ReadyToInstall,
        )
    }
}

@Composable
private fun SettingsHeader(isTelevision: Boolean) {
    Column {
        Text(
            text = "AJUSTES DO APP",
            color = RonecaColors.Primary,
            fontSize = if (isTelevision) 11.sp else 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.7.sp,
        )
        Text(
            text = "Configurações",
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 28.sp else 24.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "Player, interface, rede e sincronização.",
            color = RonecaColors.TextSecondary,
            fontSize = if (isTelevision) 13.sp else 12.sp,
        )
        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
private fun RefreshCard(
    isTelevision: Boolean,
    refreshing: Boolean,
    message: String?,
    onRefresh: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    focused -> RonecaColors.Focus
                    refreshing -> RonecaColors.Primary
                    else -> RonecaColors.Primary.copy(alpha = 0.72f)
                },
                shape = RoundedCornerShape(16.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .activateOnRemote(enabled = !refreshing, onActivate = onRefresh)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = !refreshing,
                onClick = onRefresh,
            )
            .focusable()
            .padding(if (isTelevision) 18.dp else 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (refreshing) "Atualizando conteúdo..." else "Atualizar conteúdo",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 17.sp else 15.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = message ?: "Recarrega acesso, canais, filmes, séries e episódios.",
                color = if (message?.contains("conclu", ignoreCase = true) == true) {
                    Color(0xFF42D982)
                } else {
                    RonecaColors.TextSecondary
                },
                fontSize = if (isTelevision) 13.sp else 12.sp,
            )
        }
        StatusPill(
            label = if (refreshing) "AGUARDE" else "↻  ATUALIZAR",
            active = !refreshing,
        )
    }
}

@Composable
private fun CurrentProfileCard(isTelevision: Boolean, state: PlayerSettingsState) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(RonecaColors.BackgroundSoft)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(14.dp))
            .padding(if (isTelevision) 16.dp else 14.dp),
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        ProfileMetric("DECODER", state.decoderMode.uppercase(), Modifier.weight(1f))
        ProfileMetric("BUFFER", "${state.bufferSeconds}s", Modifier.weight(1f))
        ProfileMetric("RECONEXÃO", if (state.automaticReconnect) "ATIVA" else "DESL.", Modifier.weight(1f))
    }
}

@Composable
private fun ProfileMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(text = label, color = RonecaColors.TextMuted, fontSize = 11.sp, letterSpacing = 1.sp)
        Text(text = value, color = RonecaColors.Primary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SectionTitle(title: String, isTelevision: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.width(24.dp).height(3.dp).background(RonecaColors.RedStrong))
        Text(
            text = title,
            color = RonecaColors.Primary,
            fontSize = if (isTelevision) 12.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.4.sp,
            modifier = Modifier.padding(start = 10.dp, top = 8.dp, bottom = 2.dp),
        )
    }
}

@Composable
private fun ChoiceSettingRow(
    title: String,
    subtitle: String,
    options: List<String>,
    selected: String,
    isTelevision: Boolean,
    onSelect: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(14.dp))
            .padding(if (isTelevision) 17.dp else 15.dp),
    ) {
        Text(
            text = title,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 16.sp else 15.sp,
            fontWeight = FontWeight.Medium,
        )
        Text(text = subtitle, color = RonecaColors.TextSecondary, fontSize = 12.sp)
        Spacer(modifier = Modifier.height(11.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { option ->
                SettingChip(
                    label = option,
                    active = option == selected,
                    onClick = { onSelect(option) },
                )
            }
        }
    }
}

@Composable
private fun SettingChip(label: String, active: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    focused -> RonecaColors.SurfaceRaised
                    active -> RonecaColors.Primary.copy(alpha = 0.14f)
                    else -> Color.Transparent
                },
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    focused -> RonecaColors.Focus
                    active -> RonecaColors.Primary
                    else -> RonecaColors.Border
                },
                shape = RoundedCornerShape(999.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .activateOnRemote(onActivate = onClick)
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = when {
                focused -> RonecaColors.TextPrimary
                active -> RonecaColors.Primary
                else -> RonecaColors.TextSecondary
            },
            fontSize = 12.sp,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
        )
    }
}

@Composable
private fun ToggleSettingRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    isTelevision: Boolean,
    onToggle: (Boolean) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val toggle = { onToggle(!checked) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Focus else RonecaColors.Border,
                shape = RoundedCornerShape(14.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .activateOnRemote(onActivate = toggle)
            .clickable(interactionSource = interactionSource, indication = null, onClick = toggle)
            .focusable()
            .padding(if (isTelevision) 17.dp else 15.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 16.sp else 15.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(text = subtitle, color = RonecaColors.TextSecondary, fontSize = 12.sp)
        }
        StatusPill(label = if (checked) "ATIVO" else "DESL.", active = checked)
    }
}

@Composable
private fun StatusPill(label: String, active: Boolean) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) RonecaColors.Primary else RonecaColors.SurfaceRaised)
            .border(
                width = 1.dp,
                color = if (active) RonecaColors.RedStrong.copy(alpha = 0.75f) else RonecaColors.Border,
                shape = RoundedCornerShape(999.dp),
            )
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (active) RonecaColors.TextPrimary else RonecaColors.TextSecondary,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun InfoSettingRow(
    title: String,
    subtitle: String,
    value: String,
    isTelevision: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(14.dp))
            .padding(if (isTelevision) 17.dp else 15.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = RonecaColors.TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            Text(text = subtitle, color = RonecaColors.TextSecondary, fontSize = 12.sp)
        }
        Text(text = value, color = RonecaColors.Primary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

private fun Modifier.activateOnRemote(
    enabled: Boolean = true,
    onActivate: () -> Unit,
): Modifier = onPreviewKeyEvent { event ->
    if (
        enabled &&
        event.type == KeyEventType.KeyDown &&
        (event.key == Key.DirectionCenter || event.key == Key.Enter)
    ) {
        onActivate()
        true
    } else {
        false
    }
}
