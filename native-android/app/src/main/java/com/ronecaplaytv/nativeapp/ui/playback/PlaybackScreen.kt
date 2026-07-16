package com.ronecaplaytv.nativeapp.ui.playback

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

@Composable
fun PlaybackScreen(
    isTelevision: Boolean,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background)
            .padding(
                horizontal = if (isTelevision) 52.dp else 18.dp,
                vertical = if (isTelevision) 32.dp else 22.dp,
            ),
    ) {
        Text(
            text = "Playback",
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 30.sp else 24.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "Favoritos e conteúdos em andamento aparecerão aqui.",
            color = RonecaColors.TextSecondary,
            fontSize = if (isTelevision) 15.sp else 13.sp,
        )

        Spacer(modifier = Modifier.height(24.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(RonecaColors.Surface, RoundedCornerShape(12.dp))
                .border(1.dp, RonecaColors.Border, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(24.dp),
            ) {
                Text(
                    text = "□",
                    color = RonecaColors.Border,
                    fontSize = if (isTelevision) 62.sp else 50.sp,
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Nada aqui ainda",
                    color = RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 19.sp else 16.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "Marque canais como favoritos ou comece um filme e uma série.",
                    color = Color(0xFF577287),
                    fontSize = if (isTelevision) 14.sp else 12.sp,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
