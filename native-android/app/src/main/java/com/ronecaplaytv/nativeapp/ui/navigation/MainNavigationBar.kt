package com.ronecaplaytv.nativeapp.ui.navigation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
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


enum class MainTab(val label: String) {
    Home("Início"),
    Channels("Canais"),
    Movies("Filmes"),
    Series("Séries"),
    Playback("Minha lista"),
    Settings("Configurações"),
}

@Composable
fun MainNavigationRail(
    selectedTab: MainTab,
    isTelevision: Boolean,
    onSelect: (MainTab) -> Unit,
) {
    Column(
        modifier = Modifier
            .width(if (isTelevision) 108.dp else 92.dp)
            .fillMaxHeight()
            .background(Color(0xFF080806))
            .border(width = 1.dp, color = RonecaColors.Divider)
            .padding(vertical = if (isTelevision) 26.dp else 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(if (isTelevision) 54.dp else 46.dp)
                .clip(CircleShape)
                .background(RonecaColors.Primary.copy(alpha = 0.10f))
                .border(1.dp, RonecaColors.Primary.copy(alpha = 0.55f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "RP",
                color = RonecaColors.Primary,
                fontSize = if (isTelevision) 16.sp else 13.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        Spacer(modifier = Modifier.height(if (isTelevision) 34.dp else 24.dp))

        val topTabs = listOf(
            MainTab.Home,
            MainTab.Channels,
            MainTab.Movies,
            MainTab.Series,
            MainTab.Playback,
        )

        Column(
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 10.dp else 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            topTabs.forEach { tab ->
                RailItem(
                    tab = tab,
                    selected = tab == selectedTab,
                    isTelevision = isTelevision,
                    onClick = { onSelect(tab) },
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        Box(
            modifier = Modifier
                .width(if (isTelevision) 64.dp else 54.dp)
                .height(1.dp)
                .background(RonecaColors.Divider),
        )
        Spacer(modifier = Modifier.height(14.dp))

        RailItem(
            tab = MainTab.Settings,
            selected = selectedTab == MainTab.Settings,
            isTelevision = isTelevision,
            onClick = { onSelect(MainTab.Settings) },
        )
    }
}

@Composable
fun MainNavigationBar(
    selectedTab: MainTab,
    isTelevision: Boolean,
    onSelect: (MainTab) -> Unit,
) {
    val tabs = listOf(
        MainTab.Home,
        MainTab.Channels,
        MainTab.Movies,
        MainTab.Series,
        MainTab.Settings,
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF090806))
            .border(width = 1.dp, color = RonecaColors.Divider)
            .padding(horizontal = 6.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEach { tab ->
            BottomItem(
                tab = tab,
                selected = tab == selectedTab,
                modifier = Modifier.weight(1f),
                onClick = { onSelect(tab) },
            )
        }
    }
}

@Composable
private fun RailItem(
    tab: MainTab,
    selected: Boolean,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val active = selected || focused
    val width = if (isTelevision) 78.dp else 66.dp
    val height = if (isTelevision) 66.dp else 56.dp

    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .clip(RoundedCornerShape(14.dp))
            .background(
                when {
                    selected -> RonecaColors.Primary.copy(alpha = 0.12f)
                    focused -> RonecaColors.SurfaceRaised
                    else -> Color.Transparent
                },
            )
            .border(
                width = if (active) 1.dp else 0.dp,
                color = if (active) RonecaColors.Primary.copy(alpha = 0.70f) else Color.Transparent,
                shape = RoundedCornerShape(14.dp),
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
        if (selected) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .width(3.dp)
                    .height(if (isTelevision) 30.dp else 24.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(RonecaColors.Primary),
            )
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            NavigationGlyph(
                tab = tab,
                color = if (active) RonecaColors.Primary else RonecaColors.TextSecondary,
                modifier = Modifier.size(if (isTelevision) 28.dp else 24.dp),
            )
            if (focused) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = tab.label,
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 10.sp else 9.sp,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun BottomItem(
    tab: MainTab,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }

    Column(
        modifier = modifier
            .height(58.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) RonecaColors.Primary.copy(alpha = 0.10f) else Color.Transparent)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        NavigationGlyph(
            tab = tab,
            color = if (selected) RonecaColors.Primary else RonecaColors.TextMuted,
            modifier = Modifier.size(22.dp),
        )
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = tab.label,
            color = if (selected) RonecaColors.TextPrimary else RonecaColors.TextMuted,
            fontSize = 9.sp,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
            maxLines = 1,
        )
    }
}

@Composable
private fun NavigationGlyph(
    tab: MainTab,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val stroke = Stroke(width = size.minDimension * 0.085f)
        val w = size.width
        val h = size.height

        when (tab) {
            MainTab.Home -> {
                val path = Path().apply {
                    moveTo(w * 0.16f, h * 0.48f)
                    lineTo(w * 0.50f, h * 0.17f)
                    lineTo(w * 0.84f, h * 0.48f)
                    lineTo(w * 0.84f, h * 0.84f)
                    lineTo(w * 0.60f, h * 0.84f)
                    lineTo(w * 0.60f, h * 0.60f)
                    lineTo(w * 0.40f, h * 0.60f)
                    lineTo(w * 0.40f, h * 0.84f)
                    lineTo(w * 0.16f, h * 0.84f)
                    close()
                }
                drawPath(path, color = color, style = stroke)
            }
            MainTab.Channels -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.14f, h * 0.24f),
                    size = Size(w * 0.72f, h * 0.58f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(w * 0.08f),
                    style = stroke,
                )
                drawLine(color, Offset(w * 0.37f, h * 0.10f), Offset(w * 0.50f, h * 0.24f), strokeWidth = stroke.width)
                drawLine(color, Offset(w * 0.63f, h * 0.10f), Offset(w * 0.50f, h * 0.24f), strokeWidth = stroke.width)
            }
            MainTab.Movies -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.18f, h * 0.12f),
                    size = Size(w * 0.64f, h * 0.76f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(w * 0.08f),
                    style = stroke,
                )
                listOf(0.28f, 0.50f, 0.72f).forEach { y ->
                    drawCircle(color, radius = w * 0.035f, center = Offset(w * 0.27f, h * y))
                    drawCircle(color, radius = w * 0.035f, center = Offset(w * 0.73f, h * y))
                }
            }
            MainTab.Series -> {
                drawLine(color, Offset(w * 0.20f, h * 0.22f), Offset(w * 0.20f, h * 0.82f), strokeWidth = stroke.width)
                drawLine(color, Offset(w * 0.39f, h * 0.16f), Offset(w * 0.39f, h * 0.78f), strokeWidth = stroke.width)
                drawLine(color, Offset(w * 0.58f, h * 0.20f), Offset(w * 0.58f, h * 0.84f), strokeWidth = stroke.width)
                drawLine(color, Offset(w * 0.77f, h * 0.14f), Offset(w * 0.77f, h * 0.76f), strokeWidth = stroke.width)
                drawLine(color, Offset(w * 0.12f, h * 0.82f), Offset(w * 0.86f, h * 0.82f), strokeWidth = stroke.width)
            }
            MainTab.Playback -> {
                val path = Path().apply {
                    moveTo(w * 0.25f, h * 0.16f)
                    lineTo(w * 0.75f, h * 0.16f)
                    lineTo(w * 0.75f, h * 0.86f)
                    lineTo(w * 0.50f, h * 0.69f)
                    lineTo(w * 0.25f, h * 0.86f)
                    close()
                }
                drawPath(path, color = color, style = stroke)
            }
            MainTab.Settings -> {
                drawCircle(color = color, radius = w * 0.17f, center = Offset(w * 0.50f, h * 0.50f), style = stroke)
                repeat(8) { index ->
                    val angle = Math.toRadians((index * 45.0))
                    val inner = w * 0.29f
                    val outer = w * 0.42f
                    val cx = w * 0.50f
                    val cy = h * 0.50f
                    drawLine(
                        color = color,
                        start = Offset(
                            (cx + kotlin.math.cos(angle).toFloat() * inner),
                            (cy + kotlin.math.sin(angle).toFloat() * inner),
                        ),
                        end = Offset(
                            (cx + kotlin.math.cos(angle).toFloat() * outer),
                            (cy + kotlin.math.sin(angle).toFloat() * outer),
                        ),
                        strokeWidth = stroke.width,
                    )
                }
            }
        }
    }
}
