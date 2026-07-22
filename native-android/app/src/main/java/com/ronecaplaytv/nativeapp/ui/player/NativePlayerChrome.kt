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
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlin.math.max

/**
 * Visual clássico do player da v2.0.
 *
 * A navegação, o roteamento das teclas e o controle de foco permanecem nos
 * players nativos atuais. Este componente cuida apenas da apresentação:
 * cabeçalho discreto no topo e controles compactos na parte inferior.
 */
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
    Box(modifier = Modifier.fillMaxSize()) {
        if (controlsVisible || drawerVisible) {
            ClassicPlayerHeader(
                title = title,
                eyebrow = eyebrow,
                live = live,
                isTelevision = isTelevision,
                drawerLabel = drawerLabel,
                onBack = onBack,
                onOpenDrawer = onOpenDrawer,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }

        if (controlsVisible && !drawerVisible) {
            ClassicPlaybackControls(
                isTelevision = isTelevision,
                isPlaying = isPlaying,
                positionMs = positionMs,
                durationMs = durationMs,
                playPauseFocusRequester = playPauseFocusRequester,
                onSeekBack = onSeekBack,
                onTogglePlayPause = onTogglePlayPause,
                onSeekForward = onSeekForward,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

@Composable
private fun ClassicPlayerHeader(
    title: String,
    eyebrow: String,
    live: Boolean,
    isTelevision: Boolean,
    drawerLabel: String?,
    onBack: () -> Unit,
    onOpenDrawer: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xC4050505))
            .padding(
                horizontal = if (isTelevision) 24.dp else 14.dp,
                vertical = 11.dp,
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
                    .height(if (isTelevision) 34.dp else 30.dp)
                    .background(RonecaColors.RedStrong),
            )
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = eyebrow,
                        color = RonecaColors.Primary,
                        fontSize = if (isTelevision) 10.sp else 9.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.8.sp,
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

@Composable
private fun ClassicPlaybackControls(
    isTelevision: Boolean,
    isPlaying: Boolean,
    positionMs: Long,
    durationMs: Long,
    playPauseFocusRequester: FocusRequester,
    onSeekBack: () -> Unit,
    onTogglePlayPause: () -> Unit,
    onSeekForward: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hasDuration = durationMs > 0L
    val progress = if (hasDuration) {
        (positionMs.toFloat() / max(durationMs, 1L).toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xC4050505))
            .padding(
                horizontal = if (isTelevision) 28.dp else 16.dp,
                vertical = if (isTelevision) 12.dp else 10.dp,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(if (isTelevision) 5.dp else 4.dp)
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
                .padding(top = if (isTelevision) 10.dp else 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (hasDuration) formatPlayerTime(positionMs) else "AO VIVO",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 12.sp else 10.sp,
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 13.dp else 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NativePlayerAction(
                    label = "↶ 10s",
                    contentDescription = "Voltar dez segundos",
                    enabled = hasDuration,
                    onClick = onSeekBack,
                )
                NativePlayerAction(
                    label = if (isPlaying) "Ⅱ" else "▶",
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
                horizontal = if (emphasized) 18.dp else 13.dp,
                vertical = if (emphasized) 11.dp else 8.dp,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (enabled) RonecaColors.TextPrimary else RonecaColors.TextMuted,
            fontSize = if (emphasized) 17.sp else 12.sp,
            fontWeight = if (emphasized || focused) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
        )
    }
}

private fun formatPlayerTime(milliseconds: Long): String {
    val totalSeconds = milliseconds.coerceAtLeast(0L) / 1_000L
    val hours = totalSeconds / 3_600L
    val minutes = (totalSeconds % 3_600L) / 60L
    val seconds = totalSeconds % 60L
    return if (hours > 0L) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%02d:%02d".format(minutes, seconds)
    }
}
