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
    val Background = Color(0xFF07080C)
    val BackgroundSoft = Color(0xFF0D0F15)
    val Surface = Color(0xFF151820)
    val SurfaceRaised = Color(0xFF1B1F29)
    val Primary = Color(0xFF8D74FF)
    val Cyan = Color(0xFF65C7D0)
    val Green = Color(0xFF72C69B)
    val Orange = Color(0xFFDDA06E)
    val Pink = Color(0xFFD786AD)
    val TextPrimary = Color(0xFFF5F5F7)
    val TextSecondary = Color(0xFFB7BBC5)
    val TextMuted = Color(0xFF7D828E)
    val Divider = Color(0xFF282C36)
}

private val CardShape = RoundedCornerShape(16.dp)

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

    val cardColors = when {
        !enabled -> listOf(Color(0xFF14161B), Color(0xFF111318))
        focused -> listOf(Color(0xFF242733), Color(0xFF1A1D25))
        else -> listOf(RonecaColors.SurfaceRaised, RonecaColors.Surface)
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
                    event.key == Key.NumPadEnter ||
                    event.key == Key.Spacebar

                if (shouldActivate) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .graphicsLayer {
                val scale = if (focused && isTelevision) 1.025f else 1f
                scaleX = scale
                scaleY = scale
                shadowElevation = if (focused) 10.dp.toPx() else 1.dp.toPx()
                shape = CardShape
                clip = false
                alpha = if (enabled) 1f else 0.55f
            }
            .clip(CardShape)
            .background(Brush.linearGradient(cardColors))
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    !enabled -> Color(0xFF272A31)
                    focused -> Color.White
                    else -> RonecaColors.Divider
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
                    horizontal = if (isTelevision) 22.dp else 18.dp,
                    vertical = if (isTelevision) 20.dp else 16.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    color = if (enabled) RonecaColors.TextPrimary else RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 23.sp else 18.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = subtitle,
                    color = if (enabled) RonecaColors.TextSecondary else Color(0xFF666A73),
                    fontSize = if (isTelevision) 15.sp else 13.sp,
                    maxLines = 2,
                )
            }

            if (!badge.isNullOrBlank()) {
                Spacer(modifier = Modifier.width(16.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(
                            if (focused) accentColor.copy(alpha = 0.28f)
                            else Color.Black.copy(alpha = 0.22f),
                        )
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = badge,
                        color = if (enabled) Color.White else RonecaColors.TextMuted,
                        fontSize = if (isTelevision) 14.sp else 12.sp,
                        fontWeight = FontWeight.SemiBold,
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
