package com.ronecaplaytv.nativeapp.ui.splash

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.R
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

@Composable
fun RonecaLaunchScreen(isTelevision: Boolean) {
    val transition = rememberInfiniteTransition(label = "roneca-launch")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1_050, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "loading-rotation",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.ic_app),
                contentDescription = "Logo RonecaPlayTV",
                modifier = Modifier.size(if (isTelevision) 132.dp else 98.dp),
            )

            Spacer(modifier = Modifier.height(if (isTelevision) 22.dp else 16.dp))

            Text(
                text = "RonecaPlayTV",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 31.sp else 24.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.4.sp,
            )
            Text(
                text = "Sua experiência está sendo preparada",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 14.sp else 12.sp,
            )

            Spacer(modifier = Modifier.height(if (isTelevision) 30.dp else 24.dp))

            Canvas(modifier = Modifier.size(if (isTelevision) 38.dp else 32.dp)) {
                val strokeWidth = size.minDimension * 0.095f
                drawCircle(
                    color = RonecaColors.Border,
                    style = Stroke(width = strokeWidth),
                )
                drawArc(
                    color = RonecaColors.Primary,
                    startAngle = rotation,
                    sweepAngle = 105f,
                    useCenter = false,
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
                )
                drawArc(
                    color = RonecaColors.RedStrong,
                    startAngle = rotation + 116f,
                    sweepAngle = 24f,
                    useCenter = false,
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
                )
            }

            Spacer(modifier = Modifier.height(18.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .width(34.dp)
                        .height(2.dp)
                        .background(RonecaColors.Primary),
                )
                Box(
                    modifier = Modifier
                        .width(11.dp)
                        .height(2.dp)
                        .background(RonecaColors.RedStrong),
                )
            }
        }
    }
}
