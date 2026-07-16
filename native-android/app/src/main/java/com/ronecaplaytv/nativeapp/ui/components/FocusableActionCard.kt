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
    val Background = Color(0xFF050B0F)
    val BackgroundSoft = Color(0xFF08131A)
    val Surface = Color(0xFF0D1B24)
    val SurfaceRaised = Color(0xFF122230)
    val Border = Color(0xFF1E3345)
    val Divider = Border

    val Primary = Color(0xFF00E5FF)
    val Purple = Color(0xFF7C3AED)
    val Orange = Color(0xFFFF6B00)
    val Green = Color(0xFF00E676)
    val Yellow = Color(0xFFFFD600)
    val Error = Color(0xFFFF1744)

    val Cyan = Primary
    val Pink = Purple

    val TextPrimary = Color(0xFFFFFFFF)
    val BodyText = Color(0xFFE0ECF4)
    val TextSecondary = Color(0xFF8BA4B8)
    val TextMuted = Color(0xFF3D5A72)
}

private val CardShape = RoundedCornerShape(12.dp)

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
                val scale = if (focused && isTelevision) 1.018f else 1f
                scaleX = scale
                scaleY = scale
                shadowElevation = 0f
                shape = CardShape
                clip = false
                alpha = if (enabled) 1f else 0.46f
            }
            .clip(CardShape)
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    !enabled -> RonecaColors.Border.copy(alpha = 0.45f)
                    focused -> accentColor
                    else -> RonecaColors.Border
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
                    fontSize = if (isTelevision) 22.sp else 17.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = subtitle,
                    color = if (enabled) RonecaColors.TextSecondary else RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 14.sp else 12.sp,
                    maxLines = 2,
                )
            }

            if (!badge.isNullOrBlank()) {
                Spacer(modifier = Modifier.width(16.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(accentColor.copy(alpha = if (focused) 0.22f else 0.12f))
                        .border(
                            width = 1.dp,
                            color = accentColor.copy(alpha = if (focused) 0.85f else 0.45f),
                            shape = RoundedCornerShape(8.dp),
                        )
                        .padding(horizontal = 11.dp, vertical = 7.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = badge,
                        color = if (enabled) accentColor else RonecaColors.TextMuted,
                        fontSize = if (isTelevision) 14.sp else 12.sp,
                        fontWeight = FontWeight.Medium,
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
