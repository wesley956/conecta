package com.ronecaplaytv.nativeapp.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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

enum class MainTab(
    val label: String,
    val symbol: String,
) {
    Home("Home", "⌂"),
    Channels("Canais", "▣"),
    Movies("Filmes", "▶"),
    Series("Séries", "▤"),
    Settings("Config.", "⚙"),
}

@Composable
fun MainNavigationBar(
    selectedTab: MainTab,
    isTelevision: Boolean,
    onSelect: (MainTab) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(RonecaColors.Surface)
            .border(
                width = 1.dp,
                color = RonecaColors.Border,
                shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
            )
            .padding(
                horizontal = if (isTelevision) 28.dp else 8.dp,
                vertical = if (isTelevision) 8.dp else 5.dp,
            ),
        horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 12.dp else 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MainTab.entries.forEach { tab ->
            MainNavigationItem(
                tab = tab,
                selected = tab == selectedTab,
                isTelevision = isTelevision,
                modifier = Modifier.weight(1f),
                onClick = { onSelect(tab) },
            )
        }
    }
}

@Composable
private fun MainNavigationItem(
    tab: MainTab,
    selected: Boolean,
    isTelevision: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val active = selected || focused
    val accent = RonecaColors.Primary

    Box(
        modifier = modifier
            .height(if (isTelevision) 64.dp else 58.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(
                when {
                    selected -> accent.copy(alpha = 0.12f)
                    focused -> RonecaColors.SurfaceRaised
                    else -> Color.Transparent
                },
            )
            .border(
                width = if (focused) 1.dp else 0.dp,
                color = if (focused) accent else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter ||
                        event.key == Key.Enter ||
                        event.key == Key.NumPadEnter)
                ) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = tab.symbol,
                color = if (active) accent else RonecaColors.TextMuted,
                fontSize = if (isTelevision) 22.sp else 19.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = tab.label,
                color = if (active) RonecaColors.TextPrimary else RonecaColors.TextMuted,
                fontSize = if (isTelevision) 12.sp else 10.sp,
                fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
            )
        }
    }
}
