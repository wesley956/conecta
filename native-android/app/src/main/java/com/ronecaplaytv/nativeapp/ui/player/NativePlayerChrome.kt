package com.ronecaplaytv.nativeapp.ui.player

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
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlin.math.max

@Composable
internal fun NativePlayerChrome(
    title: String,
    eyebrow: String,
    live: Boolean,
    isTelevision: Boolean,
    controlsVisible: Boolean,
    drawerVisible: Boolean,
    drawerLabel: String?,
    isPlaying: Boolean,
    positionMs: Long,
    durationMs: Long,
    playPauseFocusRequester: FocusRequester,
    onBack: () -> Unit,
    onOpenDrawer: (() -> Unit)?,
    onSeekBack: () -> Unit,
    onTogglePlayPause: () -> Unit,
    onSeekForward: () -> Unit,
) {
    if (controlsVisible || drawerVisible) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xD9050505))
                .padding(
                    horizontal = if (isTelevision) 24.dp else 14.dp,
                    vertical = if (isTelevision) 12.dp else 10.dp,
                ),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                NativePlayerAction(
                    label = "←",
                    contentDescription = "Voltar",
                    onClick = onBack,
                )
                Box(
                    modifier = Modifier
                        .width(3.dp)
                        .height(if (isTelevision) 36.dp else 31.dp)
                        .background(RonecaColors.RedStrong),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = eyebrow,
                            color = RonecaColors.Primary,
                            fontSize = if (isTelevision) 10.sp else 9.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.5.sp,
                        )
                        if (live) {
                            Spacer(modifier = Modifier.width(9.dp))
                            Text(
                                text = "● AO VIVO",
                                color = RonecaColors.RedStrong,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Text(
                        text = title,
                        color = RonecaColors.TextPrimary,
                        fontSize = if (isTelevision) 17.sp else 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                }
            }

            if (!drawerLabel.isNullOrBlank() && onOpenDrawer != null) {
                NativePlayerAction(
                    label = "☰  $drawerLabel",
                    contentDescription = "Abrir $drawerLabel",
                    onClick = onOpenDrawer,
                )
            }
        }
    }

    if (controlsVisible && !drawerVisible) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xD9050505))
                .padding(
                    horizontal = if (isTelevision) 28.dp else 16.dp,
                    vertical = if (isTelevision) 16.dp else 12.dp,
                ),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val hasDuration = durationMs > 0L
            val progress = if (hasDuration) {
                (positionMs.toFloat() / max(durationMs, 1L).toFloat()).coerceIn(0f, 1f)
            } else {
                0f
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(if (isTelevision) 6.dp else 4.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(RonecaColors.Border),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress)
                        .fillMaxHeight()
                        .background(RonecaColors.Primary),
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = if (isTelevision) 13.dp else 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (hasDuration) formatPlayerTime(positionMs) else "AO VIVO",
                    color = RonecaColors.TextSecondary,
                    fontSize = if (isTelevision) 12.sp else 10.sp,
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 14.dp else 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    NativePlayerAction(
                        label = "↶ 10s",
                        contentDescription = "Voltar dez segundos",
                        enabled = hasDuration,
                        onClick = onSeekBack,
                    )
                    NativePlayerAction(
                        label = if (isPlaying) "Ⅱ  Pausar" else "▶  Reproduzir",
                        contentDescription = if (isPlaying) "Pausar" else "Reproduzir",
                        modifier = Modifier.focusRequester(playPauseFocusRequester),
                        emphasized = true,
                        onClick = onTogglePlayPause,
                    )
                    NativePlayerAction(
                        label = "10s ↷",
                        contentDescription = "Avançar dez segundos",
                        enabled = hasDuration,
                        onClick = onSeekForward,
                    )
                }

                Text(
                    text = if (hasDuration) formatPlayerTime(durationMs) else "",
                    color = RonecaColors.TextSecondary,
                    fontSize = if (isTelevision) 12.sp else 10.sp,
                )
            }

            if (isTelevision) {
                Text(
                    text = "OK pausa ou reproduz • ←/→ avança 10s • botão Play/Pause funciona em qualquer foco",
                    color = RonecaColors.TextMuted,
                    fontSize = 10.sp,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }
    }
}

@Composable
internal fun NativePlayerAction(
    label: String,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    emphasized: Boolean = false,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    !enabled -> RonecaColors.Surface.copy(alpha = 0.50f)
                    focused -> RonecaColors.SurfaceRaised
                    emphasized -> RonecaColors.Primary.copy(alpha = 0.14f)
                    else -> RonecaColors.SurfaceOverlay
                },
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    !enabled -> RonecaColors.Border.copy(alpha = 0.45f)
                    focused -> RonecaColors.RedStrong
                    emphasized -> RonecaColors.Primary
                    else -> RonecaColors.Primary.copy(alpha = 0.55f)
                },
                shape = RoundedCornerShape(999.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (!enabled || event.type != KeyEventType.KeyUp) {
                    return@onPreviewKeyEvent false
                }
                val activates = event.key == Key.DirectionCenter ||
                    event.key == Key.Enter ||
                    event.key == Key.NumPadEnter ||
                    event.key == Key.Spacebar
                if (activates) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .clickable(
                enabled = enabled,
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable(enabled = enabled)
            .padding(
                horizontal = if (emphasized) 17.dp else 13.dp,
                vertical = if (emphasized) 10.dp else 8.dp,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (enabled) RonecaColors.TextPrimary else RonecaColors.TextMuted,
            fontSize = if (emphasized) 13.sp else 12.sp,
            fontWeight = if (emphasized || focused) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
        )
    }
}

private fun formatPlayerTime(milliseconds: Long): String {
    val totalSeconds = (milliseconds.coerceAtLeast(0L) / 1_000L)
    val hours = totalSeconds / 3_600L
    val minutes = (totalSeconds % 3_600L) / 60L
    val seconds = totalSeconds % 60L
    return if (hours > 0L) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%02d:%02d".format(minutes, seconds)
    }
}
