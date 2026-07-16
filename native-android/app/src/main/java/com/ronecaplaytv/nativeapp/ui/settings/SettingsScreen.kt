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
            bottom = 32.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
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
            Spacer(modifier = Modifier.height(10.dp))
        }

        item {
            RefreshCard(
                isTelevision = isTelevision,
                onRefresh = onRefreshContent,
            )
        }

        item { SectionTitle("PLAYER", isTelevision) }
        item {
            ChoiceSettingRow(
                title = "Decodificação",
                subtitle = "Prioridade do decodificador de vídeo",
                options = listOf("Hardware", "Software"),
                selected = state.decoderMode,
                isTelevision = isTelevision,
                onSelect = { onStateChange(state.copy(decoderMode = it)) },
            )
        }
        item {
            ChoiceSettingRow(
                title = "Buffer",
                subtitle = "Tempo inicial antes da reprodução",
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
                title = "Idioma",
                subtitle = "Idioma da interface",
                options = listOf("Português", "English"),
                selected = state.language,
                isTelevision = isTelevision,
                onSelect = { onStateChange(state.copy(language = it)) },
            )
        }

        item { SectionTitle("INTERFACE", isTelevision) }
        item {
            ToggleSettingRow(
                title = "Modo TV",
                subtitle = "Forçar interface para controle remoto",
                checked = state.forceTvMode,
                isTelevision = isTelevision,
                onToggle = { onStateChange(state.copy(forceTvMode = it)) },
            )
        }

        item { SectionTitle("REDE", isTelevision) }
        item {
            ToggleSettingRow(
                title = "Reconexão automática",
                subtitle = "Tentar novamente quando um stream cair",
                checked = state.automaticReconnect,
                isTelevision = isTelevision,
                onToggle = { onStateChange(state.copy(automaticReconnect = it)) },
            )
        }
    }
}

@Composable
private fun RefreshCard(isTelevision: Boolean, onRefresh: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.RedStrong else RonecaColors.Primary,
                shape = RoundedCornerShape(14.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onRefresh()
                    true
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onRefresh)
            .focusable()
            .padding(if (isTelevision) 18.dp else 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Atualizar conteúdo",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 17.sp else 15.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Recarrega acesso, canais, filmes, séries e episódios.",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
            )
        }
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(RonecaColors.Primary)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Text(
                text = "↻  ATUALIZAR",
                color = Color(0xFF100E08),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun SectionTitle(title: String, isTelevision: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.height(3.dp).weight(0.07f).background(RonecaColors.RedStrong))
        Spacer(modifier = Modifier.height(1.dp))
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
            .clip(RoundedCornerShape(12.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(12.dp))
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
                val active = option == selected
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (active) RonecaColors.Primary.copy(alpha = 0.14f) else Color.Transparent)
                        .border(
                            width = 1.dp,
                            color = if (active) RonecaColors.Primary else RonecaColors.Border,
                            shape = RoundedCornerShape(999.dp),
                        )
                        .clickable { onSelect(option) }
                        .padding(horizontal = 13.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = option,
                        color = if (active) RonecaColors.Primary else RonecaColors.TextSecondary,
                        fontSize = 12.sp,
                        fontWeight = if (active) FontWeight.Medium else FontWeight.Normal,
                    )
                }
            }
        }
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(12.dp))
            .clickable { onToggle(!checked) }
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
