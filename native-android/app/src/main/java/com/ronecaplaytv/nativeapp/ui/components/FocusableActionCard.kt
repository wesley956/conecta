package com.ronecaplaytv.nativeapp.ui.components

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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text

object RonecaColors {
    val Background = Color(0xFF05060A)
    val BackgroundSoft = Color(0xFF090B12)
    val Surface = Color(0xFF131620)
    val SurfaceRaised = Color(0xFF1A1E2A)
    val Primary = Color(0xFF8A6CFF)
    val Cyan = Color(0xFF3BD5FF)
    val Green = Color(0xFF45D99B)
    val Orange = Color(0xFFFF9A62)
    val Pink = Color(0xFFFF6FAE)
    val TextPrimary = Color(0xFFF8F8FC)
    val TextSecondary = Color(0xFFB7BAC8)
    val TextMuted = Color(0xFF74798B)
}

private val CardShape = RoundedCornerShape(24.dp)

@Composable
fun FocusableActionCard(
    title: String,
    subtitle: String,
    enabled: Boolean,
    isTelevision: Boolean,
    modifier: Modifier = Modifier,
    badge: String? = null,
    accentColor: Color = RonecaColors.Primary,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    val focusModifier = if (focusRequester != null) {
        Modifier.focusRequester(focusRequester)
    } else {
        Modifier
    }

    val cardGradient = when {
        !enabled -> listOf(Color(0xFF171920), Color(0xFF101116))
        focused -> listOf(accentColor.copy(alpha = 0.52f), Color(0xFF161925))
        else -> listOf(accentColor.copy(alpha = 0.22f), Color(0xFF12151E))
    }

    Box(
        modifier = modifier
            .then(focusModifier)
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (!enabled || event.type != KeyEventType.KeyUp) {
                    return@onPreviewKeyEvent false
                }

                val shouldActivate = event.key == Key.DirectionCenter ||
                    event.key == Key.Enter ||
                    event.key == Key.Spacebar

                if (shouldActivate) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .graphicsLayer {
                val scale = if (focused && isTelevision) 1.055f else 1f
                scaleX = scale
                scaleY = scale
                shadowElevation = if (focused) 24.dp.toPx() else 4.dp.toPx()
                shape = CardShape
                clip = false
                alpha = if (enabled) 1f else 0.62f
            }
            .clip(CardShape)
            .background(Brush.linearGradient(cardGradient))
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = when {
                    !enabled -> Color(0xFF2A2D37)
                    focused -> Color.White
                    else -> accentColor.copy(alpha = 0.46f)
                },
                shape = CardShape,
            )
            .clickable(
                enabled = enabled,
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable(enabled = enabled),
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    horizontal = if (isTelevision) 26.dp else 20.dp,
                    vertical = if (isTelevision) 24.dp else 18.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    color = if (enabled) RonecaColors.TextPrimary else RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 25.sp else 19.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 2,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = subtitle,
                    color = if (enabled) RonecaColors.TextSecondary else Color(0xFF666A77),
                    fontSize = if (isTelevision) 16.sp else 13.sp,
                    maxLines = 2,
                )
            }

            if (!badge.isNullOrBlank()) {
                Spacer(modifier = Modifier.width(18.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(
                            if (focused) Color.White.copy(alpha = 0.18f)
                            else Color.Black.copy(alpha = 0.25f),
                        )
                        .padding(horizontal = 13.dp, vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = badge,
                        color = if (enabled) Color.White else RonecaColors.TextMuted,
                        fontSize = if (isTelevision) 16.sp else 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
fun CompactActionButton(
    label: String,
    enabled: Boolean,
    isTelevision: Boolean,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    accentColor: Color = RonecaColors.Primary,
    onClick: () -> Unit,
) {
    FocusableActionCard(
        title = label,
        subtitle = if (enabled) "Pressione OK ou toque" else "Indisponível",
        enabled = enabled,
        isTelevision = isTelevision,
        modifier = modifier.fillMaxWidth(),
        badge = if (enabled) "ABRIR" else null,
        accentColor = accentColor,
        focusRequester = focusRequester,
        onClick = onClick,
    )
}
