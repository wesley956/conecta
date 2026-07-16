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
import androidx.compose.foundation.layout.fillMaxHeight
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
    val Background = Color(0xFF050505)
    val BackgroundSoft = Color(0xFF090806)
    val Surface = Color(0xFF11100E)
    val SurfaceRaised = Color(0xFF191713)
    val SurfaceOverlay = Color(0xE611100E)
    val Border = Color(0xFF302A1E)
    val Divider = Color(0xFF211E18)

    val Primary = Color(0xFFE8C768)
    val PrimaryStrong = Color(0xFFFFDB73)
    val PrimarySoft = Color(0x33E8C768)
    val Red = Color(0xFFC62828)
    val RedStrong = Color(0xFFFF3B30)
    val RedSoft = Color(0x33C62828)
    val Purple = Color(0xFFC9AE68)
    val Orange = Color(0xFFE9A44F)
    val Green = Color(0xFF73C98C)
    val Yellow = Color(0xFFE8C768)
    val Error = Color(0xFFFF6868)

    val Cyan = Primary
    val Pink = Red

    val TextPrimary = Color(0xFFF7F4EC)
    val BodyText = Color(0xFFD8D2C5)
    val TextSecondary = Color(0xFFA39D91)
    val TextMuted = Color(0xFF69645B)
}

private val CardShape = RoundedCornerShape(14.dp)

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
            .clip(CardShape)
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    !enabled -> RonecaColors.Border.copy(alpha = 0.42f)
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
                    horizontal = if (isTelevision) 20.dp else 16.dp,
                    vertical = if (isTelevision) 18.dp else 14.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    color = if (enabled) RonecaColors.TextPrimary else RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 19.sp else 16.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                )
                Spacer(modifier = Modifier.height(5.dp))
                Text(
                    text = subtitle,
                    color = if (enabled) RonecaColors.TextSecondary else RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 13.sp else 11.sp,
                    maxLines = 2,
                )
            }

            if (!badge.isNullOrBlank()) {
                Spacer(modifier = Modifier.width(14.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(accentColor.copy(alpha = if (focused) 0.18f else 0.10f))
                        .border(
                            width = 1.dp,
                            color = accentColor.copy(alpha = if (focused) 0.95f else 0.42f),
                            shape = RoundedCornerShape(999.dp),
                        )
                        .padding(horizontal = 11.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = badge,
                        color = if (enabled) accentColor else RonecaColors.TextMuted,
                        fontSize = if (isTelevision) 12.sp else 10.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        // Gold line with a short red cut: the visual link between the app and the red admin panels.
        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 15.dp),
        ) {
            Box(
                modifier = Modifier
                    .width(34.dp)
                    .height(3.dp)
                    .background(if (focused) RonecaColors.PrimaryStrong else RonecaColors.Primary),
            )
            Box(
                modifier = Modifier
                    .width(12.dp)
                    .height(3.dp)
                    .background(RonecaColors.RedStrong),
            )
        }

        if (focused) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .width(3.dp)
                    .fillMaxHeight(0.42f)
                    .background(RonecaColors.RedStrong),
            )
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
