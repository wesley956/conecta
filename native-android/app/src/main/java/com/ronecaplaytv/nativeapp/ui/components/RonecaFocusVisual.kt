package com.ronecaplaytv.nativeapp.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

/**
 * Movimento único de foco do aplicativo. A escala é propositalmente discreta:
 * evidencia o card sem causar saltos na grade nem esconder os vizinhos.
 */
@Composable
fun Modifier.ronecaFocusScale(
    focused: Boolean,
    enabled: Boolean = true,
    focusedScale: Float = 1.035f,
): Modifier {
    val scale by animateFloatAsState(
        targetValue = if (enabled && focused) focusedScale else 1f,
        animationSpec = spring(
            dampingRatio = 0.78f,
            stiffness = 520f,
        ),
        label = "roneca-focus-scale",
    )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
