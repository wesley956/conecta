package com.ronecaplaytv.nativeapp.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentPadding = PaddingValues(
            start = if (isTelevision) 52.dp else 18.dp,
            end = if (isTelevision) 52.dp else 18.dp,
            top = if (isTelevision) 32.dp else 22.dp,
            bottom = 32.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                text = "Configurações",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 30.sp else 24.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Ajuste o player, a interface e a conexão.",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 15.sp else 13.sp,
            )
            Spacer(modifier = Modifier.height(10.dp))
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
private fun SectionTitle(title: String, isTelevision: Boolean) {
    Text(
        text = title,
        color = RonecaColors.Primary,
        fontSize = if (isTelevision) 13.sp else 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.4.sp,
        modifier = Modifier.padding(top = 10.dp, bottom = 2.dp),
    )
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
            .padding(if (isTelevision) 20.dp else 16.dp),
    ) {
        Text(
            text = title,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 17.sp else 15.sp,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = subtitle,
            color = RonecaColors.TextSecondary,
            fontSize = if (isTelevision) 13.sp else 12.sp,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { option ->
                val active = option == selected
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (active) RonecaColors.Primary.copy(alpha = 0.14f) else Color.Transparent)
                        .border(
                            width = 1.dp,
                            color = if (active) RonecaColors.Primary else RonecaColors.Border,
                            shape = RoundedCornerShape(8.dp),
                        )
                        .clickable { onSelect(option) }
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                ) {
                    Text(
                        text = option,
                        color = if (active) RonecaColors.Primary else RonecaColors.TextSecondary,
                        fontSize = if (isTelevision) 13.sp else 12.sp,
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
            .padding(if (isTelevision) 20.dp else 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 17.sp else 15.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = subtitle,
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
            )
        }
        Spacer(modifier = Modifier.height(1.dp))
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (checked) RonecaColors.Primary else RonecaColors.TextMuted)
                .padding(horizontal = 14.dp, vertical = 7.dp),
        ) {
            Text(
                text = if (checked) "ATIVO" else "DESL.",
                color = if (checked) RonecaColors.Background else RonecaColors.BodyText,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
