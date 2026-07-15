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
    channelCount: Int,
    movieCount: Int,
    seriesCount: Int,
    loadingSection: String?,
    catalogError: String?,
    onOpenChannels: () -> Unit,
    onOpenMovies: () -> Unit,
    onOpenSeries: () -> Unit,
    onOpenPlayer: () -> Unit,
) {
    val horizontalPadding = if (isTelevision) 72.dp else 24.dp
    val titleSize = if (isTelevision) 44.sp else 30.sp
    val bodySize = if (isTelevision) 22.sp else 17.sp
    val buttonWidth = if (isTelevision) 420.dp else 300.dp

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF080B12))
            .padding(horizontal = horizontalPadding, vertical = 30.dp),
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

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = if (isTelevision) {
                    "Modo TV: controle remoto, listas virtuais e reprodução nativa."
                } else {
                    "Modo celular: toque, rotação e reprodução nativa."
                },
                color = Color(0xFFB8C0D9),
                fontSize = bodySize,
            )

            val statusText = when {
                loadingSection != null -> "Carregando $loadingSection..."
                catalogError != null -> catalogError
                else -> "Catálogo seguro carregado."
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = statusText,
                color = if (catalogError == null) Color(0xFF8FE3B0) else Color(0xFFFFB4A8),
                fontSize = if (isTelevision) 18.sp else 14.sp,
            )

            Spacer(modifier = Modifier.height(if (isTelevision) 28.dp else 22.dp))

            CatalogButton(
                label = "Canais ao vivo ($channelCount)",
                enabled = channelCount > 0,
                isTelevision = isTelevision,
                minimumWidth = buttonWidth,
                onClick = onOpenChannels,
            )
            Spacer(modifier = Modifier.height(10.dp))
            CatalogButton(
                label = "Filmes ($movieCount)",
                enabled = movieCount > 0,
                isTelevision = isTelevision,
                minimumWidth = buttonWidth,
                onClick = onOpenMovies,
            )
            Spacer(modifier = Modifier.height(10.dp))
            CatalogButton(
                label = "Séries ($seriesCount)",
                enabled = seriesCount > 0,
                isTelevision = isTelevision,
                minimumWidth = buttonWidth,
                onClick = onOpenSeries,
            )
            Spacer(modifier = Modifier.height(10.dp))
            CatalogButton(
                label = "Testar player nativo",
                enabled = true,
                isTelevision = isTelevision,
                minimumWidth = buttonWidth,
                onClick = onOpenPlayer,
            )
        }
    }
}

@Composable
private fun CatalogButton(
    label: String,
    enabled: Boolean,
    isTelevision: Boolean,
    minimumWidth: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.widthIn(min = minimumWidth),
    ) {
        Text(
            text = label,
            fontSize = if (isTelevision) 20.sp else 16.sp,
        )
    }
}
