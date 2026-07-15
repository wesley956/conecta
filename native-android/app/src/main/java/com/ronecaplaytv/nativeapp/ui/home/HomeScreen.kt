package com.ronecaplaytv.nativeapp.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import kotlinx.coroutines.delay

private enum class HomeFocusTarget {
    Channels,
    Movies,
    Series,
}

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
    val firstFocusRequester = remember { FocusRequester() }
    val firstTarget = when {
        channelCount > 0 -> HomeFocusTarget.Channels
        movieCount > 0 -> HomeFocusTarget.Movies
        else -> HomeFocusTarget.Series
    }

    LaunchedEffect(isTelevision, channelCount, movieCount, seriesCount) {
        if (isTelevision && (channelCount + movieCount + seriesCount) > 0) {
            delay(250)
            runCatching { firstFocusRequester.requestFocus() }
        }
    }

    val statusText = when {
        loadingSection != null -> "Sincronizando $loadingSection"
        catalogError != null -> catalogError
        else -> "Biblioteca atualizada e pronta para assistir"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF090612),
                        Color(0xFF110C20),
                        Color(0xFF070911),
                    ),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    horizontal = if (isTelevision) 64.dp else 20.dp,
                    vertical = if (isTelevision) 36.dp else 22.dp,
                ),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "RONECA",
                        color = Color(0xFFB99BFF),
                        fontSize = if (isTelevision) 20.sp else 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Text(
                        text = "PLAY TV",
                        color = Color.White,
                        fontSize = if (isTelevision) 34.sp else 25.sp,
                        fontWeight = FontWeight.Black,
                    )
                }

                Text(
                    text = if (isTelevision) "ANDROID TV" else "ANDROID",
                    color = Color(0xFFD8CCFF),
                    fontSize = if (isTelevision) 15.sp else 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .background(Color(0xFF2A1C54), RoundedCornerShape(50.dp))
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                )
            }

            Spacer(modifier = Modifier.height(if (isTelevision) 34.dp else 24.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        brush = Brush.horizontalGradient(
                            colors = listOf(
                                Color(0xFF34206F),
                                Color(0xFF17112F),
                                Color(0xFF121522),
                            ),
                        ),
                        shape = RoundedCornerShape(28.dp),
                    )
                    .padding(
                        horizontal = if (isTelevision) 38.dp else 24.dp,
                        vertical = if (isTelevision) 30.dp else 24.dp,
                    ),
            ) {
                Text(
                    text = "SUA DIVERSÃO COMEÇA AQUI",
                    color = Color(0xFFC9B5FF),
                    fontSize = if (isTelevision) 16.sp else 12.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Escolha o que assistir",
                    color = Color.White,
                    fontSize = if (isTelevision) 38.sp else 28.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = statusText,
                    color = if (catalogError == null) Color(0xFFBFC7DC) else Color(0xFFFFB4A8),
                    fontSize = if (isTelevision) 18.sp else 14.sp,
                )
            }

            Spacer(modifier = Modifier.height(if (isTelevision) 32.dp else 24.dp))

            Text(
                text = "EXPLORAR",
                color = Color(0xFF9DA6BE),
                fontSize = if (isTelevision) 16.sp else 13.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(14.dp))

            if (isTelevision) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    FocusableActionCard(
                        title = "Canais ao vivo",
                        subtitle = "Programação em tempo real",
                        badge = channelCount.toString(),
                        enabled = channelCount > 0,
                        isTelevision = true,
                        modifier = Modifier.weight(1f),
                        focusRequester = if (firstTarget == HomeFocusTarget.Channels) firstFocusRequester else null,
                        onClick = onOpenChannels,
                    )
                    FocusableActionCard(
                        title = "Filmes",
                        subtitle = "Cinema para todos os momentos",
                        badge = movieCount.toString(),
                        enabled = movieCount > 0,
                        isTelevision = true,
                        modifier = Modifier.weight(1f),
                        focusRequester = if (firstTarget == HomeFocusTarget.Movies) firstFocusRequester else null,
                        onClick = onOpenMovies,
                    )
                    FocusableActionCard(
                        title = "Séries",
                        subtitle = "Temporadas e episódios",
                        badge = seriesCount.toString(),
                        enabled = seriesCount > 0,
                        isTelevision = true,
                        modifier = Modifier.weight(1f),
                        focusRequester = if (firstTarget == HomeFocusTarget.Series) firstFocusRequester else null,
                        onClick = onOpenSeries,
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    FocusableActionCard(
                        title = "Canais ao vivo",
                        subtitle = "Programação em tempo real",
                        badge = channelCount.toString(),
                        enabled = channelCount > 0,
                        isTelevision = false,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = onOpenChannels,
                    )
                    FocusableActionCard(
                        title = "Filmes",
                        subtitle = "Cinema para todos os momentos",
                        badge = movieCount.toString(),
                        enabled = movieCount > 0,
                        isTelevision = false,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = onOpenMovies,
                    )
                    FocusableActionCard(
                        title = "Séries",
                        subtitle = "Temporadas e episódios",
                        badge = seriesCount.toString(),
                        enabled = seriesCount > 0,
                        isTelevision = false,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = onOpenSeries,
                    )
                }
            }
        }
    }
}
