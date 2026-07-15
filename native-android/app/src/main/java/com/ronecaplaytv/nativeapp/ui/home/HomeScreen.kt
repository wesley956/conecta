package com.ronecaplaytv.nativeapp.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text

@Composable
fun HomeScreen(
    isTelevision: Boolean,
    onOpenPlayer: () -> Unit,
) {
    val horizontalPadding = if (isTelevision) 72.dp else 24.dp
    val titleSize = if (isTelevision) 44.sp else 30.sp
    val bodySize = if (isTelevision) 22.sp else 17.sp
    val buttonWidth = if (isTelevision) 360.dp else 260.dp

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF080B12))
            .padding(horizontal = horizontalPadding, vertical = 36.dp),
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxWidth()
                .widthIn(max = 900.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "RonecaPlayTV Native",
                color = Color.White,
                fontSize = titleSize,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(14.dp))

            Text(
                text = if (isTelevision) {
                    "Modo TV detectado: navegação por controle remoto e reprodução nativa."
                } else {
                    "Modo celular detectado: interface preparada para toque e rotação."
                },
                color = Color(0xFFB8C0D9),
                fontSize = bodySize,
            )

            Spacer(modifier = Modifier.height(if (isTelevision) 38.dp else 28.dp))

            Button(
                onClick = onOpenPlayer,
                modifier = Modifier.widthIn(min = buttonWidth),
            ) {
                Text(
                    text = "Testar player nativo",
                    fontSize = if (isTelevision) 21.sp else 17.sp,
                )
            }
        }
    }
}
