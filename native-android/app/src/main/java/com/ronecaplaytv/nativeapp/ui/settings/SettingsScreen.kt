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
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

data class PlayerSettingsState(
    val decoderMode: String = "Hardware",
    val bufferSeconds: Int = 5,
    val language: String = "Português",
    val automaticReconnect: Boolean = true,
    val forceTvMode: Boolean = false,
)

@Composable
fun SettingsScreen(
    isTelevision: Boolean,
    state: PlayerSettingsState,
    refreshInProgress: Boolean,
    refreshMessage: String?,
    onStateChange: (PlayerSettingsState) -> Unit,
    onRefreshContent: () -> Unit,
) {
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
        item {
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

        item {
            RefreshCard(
                isTelevision = isTelevision,
                refreshing = refreshInProgress,
                message = refreshMessage,
                onRefresh = onRefreshContent,
            )
        }

        item {
            CurrentProfileCard(
                isTelevision = isTelevision,
                state = state,
            )
        }

        item { SectionTitle("PLAYER", isTelevision) }
        item {
            ChoiceSettingRow(
                title = "Decodificação",
                subtitle = "Hardware usa o codec do aparelho; Software prioriza compatibilidade.",
                options = listOf("Hardware", "Software"),
                selected = state.decoderMode,
                isTelevision = isTelevision,
                onSelect = { onStateChange(state.copy(decoderMode = it)) },
            )
        }
        item {
            ChoiceSettingRow(
                title = "Buffer inicial",
                subtitle = "Mais buffer pode ajudar conexões instáveis, mas demora mais para começar.",
                options = listOf("2s", "5s", "10s"),
                selected = "${state.bufferSeconds}s",
                isTelevision = isTelevision,
                onSelect = { value ->
                    onStateChange(state.copy(bufferSeconds = value.removeSuffix("s").toInt()))
                },
            )
        }

        item { SectionTitle("INTERFACE", isTelevision) }
        item {
            ToggleSettingRow(
                title = "Modo TV",
                subtitle = "Usar navegação lateral e foco ampliado neste aparelho.",
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
            InfoSettingRow(
                title = "RonecaPlayTV Native",
                subtitle = "Versão 0.6 • Android TV, TV Box, celular e tablet",
                value = "NATIVO",
                isTelevision = isTelevision,
            )
        }
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
                    focused -> RonecaColors.RedStrong
                    refreshing -> RonecaColors.Primary
                    else -> RonecaColors.Primary.copy(alpha = 0.72f)
                },
                shape = RoundedCornerShape(16.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    !refreshing &&
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onRefresh()
                    true
                } else false
            }
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
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (refreshing) RonecaColors.SurfaceRaised else RonecaColors.Primary)
                .border(
                    1.dp,
                    if (refreshing) RonecaColors.Primary else RonecaColors.RedStrong.copy(alpha = 0.75f),
                    RoundedCornerShape(999.dp),
                )
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Text(
                text = if (refreshing) "AGUARDE" else "↻  ATUALIZAR",
                color = if (refreshing) RonecaColors.Primary else Color(0xFF100E08),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
            )
        }
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
        Text(text = label, color = RonecaColors.TextMuted, fontSize = 9.sp, letterSpacing = 1.sp)
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
                    focused -> RonecaColors.RedStrong
                    active -> RonecaColors.Primary
                    else -> RonecaColors.Border
                },
                shape = RoundedCornerShape(999.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (active || focused) RonecaColors.Primary else RonecaColors.TextSecondary,
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                if (focused) 2.dp else 1.dp,
                if (focused) RonecaColors.RedStrong else RonecaColors.Border,
                RoundedCornerShape(14.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onToggle(!checked)
                    true
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null) { onToggle(!checked) }
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
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (checked) RonecaColors.Primary else RonecaColors.TextMuted)
                .border(
                    width = 2.dp,
                    color = if (checked) RonecaColors.RedStrong else RonecaColors.Border,
                    shape = RoundedCornerShape(999.dp),
                )
                .padding(horizontal = 13.dp, vertical = 7.dp),
        ) {
            Text(
                text = if (checked) "ATIVO" else "DESL.",
                color = if (checked) RonecaColors.Background else RonecaColors.BodyText,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
            )
        }
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
