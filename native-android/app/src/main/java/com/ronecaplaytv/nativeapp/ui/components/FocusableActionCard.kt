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
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.navigation.isRonecaActivationKey

object RonecaColors {
    val Background = Color(0xFF080809)
    val BackgroundSoft = Color(0xFF0D0D0F)
    val Surface = Color(0xFF131315)
    val SurfaceRaised = Color(0xFF19191C)
    val SurfaceOverlay = Color(0xED131315)
    val Border = Color(0xFF2B2B30)
    val Divider = Color(0xFF222226)

    val Primary = Color(0xFFE3262E)
    val PrimaryStrong = Color(0xFFFF454C)
    val PrimarySoft = Color(0x33E3262E)
    val Red = Primary
    val RedStrong = PrimaryStrong
    val RedSoft = PrimarySoft
    val Focus = RedStrong
    val Purple = Color(0xFFB95A83)
    val Orange = Color(0xFFD27A3D)
    val Green = Color(0xFF4DBF82)
    val Yellow = Color(0xFFD8A52B)
    val Error = Color(0xFFFF5C64)

    val Cyan = Primary
    val Pink = Red

    val TextPrimary = Color(0xFFF7F7F8)
    val BodyText = Color(0xFFD4D4D8)
    val TextSecondary = Color(0xFF9C9CA5)
    val TextMuted = Color(0xFF81818A)
    val TextDisabled = Color(0xFF5F5F68)
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
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (!enabled) {
                    return@onPreviewKeyEvent false
                }
                if (event.isRonecaActivationKey()) {
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
                    focused -> RonecaColors.Focus
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

        // A assinatura vermelha é a ligação visual direta com os painéis ADM e vendedor.
        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 15.dp),
        ) {
            Box(
                modifier = Modifier
                    .width(34.dp)
                    .height(3.dp)
                    .background(RonecaColors.Primary),
            )
            Box(
                modifier = Modifier
                    .width(12.dp)
                    .height(3.dp)
                    .background(RonecaColors.PrimaryStrong),
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
