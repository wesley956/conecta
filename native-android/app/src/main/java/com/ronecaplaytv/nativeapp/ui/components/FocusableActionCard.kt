package com.ronecaplaytv.nativeapp.ui.components

import android.view.KeyEvent as AndroidKeyEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.nativeKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text

private val CardShape = RoundedCornerShape(20.dp)

@Composable
fun FocusableActionCard(
    title: String,
    subtitle: String,
    enabled: Boolean,
    isTelevision: Boolean,
    modifier: Modifier = Modifier,
    badge: String? = null,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val background = when {
        !enabled -> Color(0xFF171A24)
        focused -> Color(0xFF2C205D)
        else -> Color(0xFF171B2A)
    }
    val borderColor = when {
        !enabled -> Color(0xFF2A2E3D)
        focused -> Color(0xFF9B7CFF)
        else -> Color(0xFF30364A)
    }

    val focusModifier = if (focusRequester != null) {
        Modifier.focusRequester(focusRequester)
    } else {
        Modifier
    }

    Row(
        modifier = modifier
            .then(focusModifier)
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (!enabled || event.type != KeyEventType.KeyUp) {
                    return@onPreviewKeyEvent false
                }

                val shouldActivate = when (event.nativeKeyEvent.keyCode) {
                    AndroidKeyEvent.KEYCODE_DPAD_CENTER,
                    AndroidKeyEvent.KEYCODE_ENTER,
                    AndroidKeyEvent.KEYCODE_NUMPAD_ENTER,
                    AndroidKeyEvent.KEYCODE_BUTTON_A,
                    AndroidKeyEvent.KEYCODE_SPACE -> true
                    else -> false
                }

                if (shouldActivate) {
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
            .graphicsLayer {
                val scale = if (focused && isTelevision) 1.035f else 1f
                scaleX = scale
                scaleY = scale
            }
            .background(background, CardShape)
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = borderColor,
                shape = CardShape,
            )
            .padding(
                horizontal = if (isTelevision) 24.dp else 18.dp,
                vertical = if (isTelevision) 22.dp else 17.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = if (enabled) Color.White else Color(0xFF777C8F),
                fontSize = if (isTelevision) 24.sp else 18.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = subtitle,
                color = if (enabled) Color(0xFFB8C0D9) else Color(0xFF666B7B),
                fontSize = if (isTelevision) 16.sp else 13.sp,
            )
        }

        if (!badge.isNullOrBlank()) {
            Spacer(modifier = Modifier.width(18.dp))
            Text(
                text = badge,
                color = if (enabled) Color(0xFFD9CCFF) else Color(0xFF777C8F),
                fontSize = if (isTelevision) 26.sp else 20.sp,
                fontWeight = FontWeight.ExtraBold,
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
    onClick: () -> Unit,
) {
    FocusableActionCard(
        title = label,
        subtitle = if (enabled) "Pressione OK para selecionar" else "Indisponível",
        enabled = enabled,
        isTelevision = isTelevision,
        modifier = modifier.fillMaxWidth(),
        focusRequester = focusRequester,
        onClick = onClick,
    )
}
