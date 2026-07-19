package com.ronecaplaytv.nativeapp.ui.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.matchParentSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.ronecaplaytv.nativeapp.R
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun RonecaLaunchScreen(isTelevision: Boolean) {
    val emblemAlpha = remember { Animatable(0f) }
    val emblemScale = remember { Animatable(0.76f) }
    val wordmarkAlpha = remember { Animatable(0f) }
    val wordmarkOffset = remember { Animatable(18f) }
    val progress = remember { Animatable(0f) }

    val pulseTransition = rememberInfiniteTransition(label = "roneca-splash-pulse")
    val goldGlow by pulseTransition.animateFloat(
        initialValue = 0.34f,
        targetValue = 0.72f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 820),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "gold-glow",
    )
    val playPulse by pulseTransition.animateFloat(
        initialValue = 0.08f,
        targetValue = 0.30f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 620),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "play-pulse",
    )

    LaunchedEffect(Unit) {
        coroutineScope {
            launch {
                emblemAlpha.animateTo(
                    targetValue = 1f,
                    animationSpec = tween(durationMillis = 520),
                )
            }
            launch {
                emblemScale.animateTo(
                    targetValue = 1f,
                    animationSpec = tween(
                        durationMillis = 880,
                        easing = FastOutSlowInEasing,
                    ),
                )
            }
            launch {
                delay(340)
                progress.animateTo(
                    targetValue = 1f,
                    animationSpec = tween(durationMillis = 1_520),
                )
            }
        }

        coroutineScope {
            launch {
                wordmarkAlpha.animateTo(
                    targetValue = 1f,
                    animationSpec = tween(durationMillis = 470),
                )
            }
            launch {
                wordmarkOffset.animateTo(
                    targetValue = 0f,
                    animationSpec = tween(
                        durationMillis = 560,
                        easing = FastOutSlowInEasing,
                    ),
                )
            }
        }
    }

    val emblemSize = if (isTelevision) 352.dp else 238.dp
    val wordmarkWidth = if (isTelevision) 430.dp else 292.dp
    val progressWidth = if (isTelevision) 172.dp else 118.dp

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(emblemSize)
                    .graphicsLayer {
                        alpha = emblemAlpha.value
                        scaleX = emblemScale.value
                        scaleY = emblemScale.value
                    },
                contentAlignment = Alignment.Center,
            ) {
                Canvas(modifier = Modifier.matchParentSize()) {
                    drawCircle(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                RonecaColors.Primary.copy(alpha = goldGlow * 0.26f),
                                RonecaColors.Primary.copy(alpha = goldGlow * 0.08f),
                                Color.Transparent,
                            ),
                            center = Offset(size.width * 0.51f, size.height * 0.53f),
                            radius = size.minDimension * 0.48f,
                        ),
                    )
                }

                Image(
                    painter = painterResource(R.drawable.roneca_player_tv_emblem),
                    contentDescription = "Símbolo ronecaPlayerTV",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )

                Canvas(modifier = Modifier.matchParentSize()) {
                    val centerX = size.width * 0.515f
                    val centerY = size.height * 0.565f
                    val halfHeight = size.height * 0.061f
                    val left = centerX - size.width * 0.053f
                    val right = centerX + size.width * 0.058f
                    val pulsePath = Path().apply {
                        moveTo(left, centerY - halfHeight)
                        lineTo(right, centerY)
                        lineTo(left, centerY + halfHeight)
                        close()
                    }
                    drawPath(
                        path = pulsePath,
                        color = RonecaColors.RedStrong.copy(alpha = playPulse),
                    )
                }
            }

            Spacer(modifier = Modifier.height(if (isTelevision) 12.dp else 8.dp))

            Image(
                painter = painterResource(R.drawable.roneca_player_tv_wordmark),
                contentDescription = "ronecaPlayerTV",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .width(wordmarkWidth)
                    .aspectRatio(704f / 150f)
                    .graphicsLayer {
                        alpha = wordmarkAlpha.value
                        translationY = wordmarkOffset.value
                    },
            )

            Spacer(modifier = Modifier.height(if (isTelevision) 24.dp else 18.dp))

            Canvas(
                modifier = Modifier
                    .width(progressWidth)
                    .height(3.dp)
                    .clip(RoundedCornerShape(999.dp)),
            ) {
                drawRoundRect(
                    color = RonecaColors.Border,
                    size = size,
                    cornerRadius = CornerRadius(size.height, size.height),
                )
                if (progress.value > 0f) {
                    drawRoundRect(
                        brush = Brush.horizontalGradient(
                            listOf(
                                RonecaColors.PrimaryStrong,
                                RonecaColors.Primary,
                                RonecaColors.RedStrong,
                            ),
                        ),
                        size = Size(size.width * progress.value, size.height),
                        cornerRadius = CornerRadius(size.height, size.height),
                    )
                }
            }
        }
    }
}
