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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
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
            delay(260)
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
                        Color(0xFF100824),
                        Color(0xFF090B14),
                        RonecaColors.Background,
                    ),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .then(
                    if (isTelevision) Modifier else Modifier.verticalScroll(rememberScrollState()),
                )
                .padding(
                    horizontal = if (isTelevision) 64.dp else 20.dp,
                    vertical = if (isTelevision) 34.dp else 22.dp,
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
                        color = RonecaColors.Primary,
                        fontSize = if (isTelevision) 19.sp else 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 3.sp,
                    )
                    Text(
                        text = "PLAY TV",
                        color = RonecaColors.TextPrimary,
                        fontSize = if (isTelevision) 34.sp else 25.sp,
                        fontWeight = FontWeight.Black,
                    )
                }

                Text(
                    text = if (isTelevision) "ANDROID TV" else "ANDROID",
                    color = Color(0xFFE1D8FF),
                    fontSize = if (isTelevision) 14.sp else 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .background(Color(0xFF2D2058), RoundedCornerShape(50.dp))
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
                                Color(0xFF40258A),
                                Color(0xFF20163F),
                                Color(0xFF111520),
                            ),
                        ),
                        shape = RoundedCornerShape(30.dp),
                    )
                    .padding(
                        horizontal = if (isTelevision) 38.dp else 24.dp,
                        vertical = if (isTelevision) 30.dp else 24.dp,
                    ),
            ) {
                Text(
                    text = "SUA DIVERSÃO COMEÇA AQUI",
                    color = Color(0xFFD2C3FF),
                    fontSize = if (isTelevision) 15.sp else 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.5.sp,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Escolha o que assistir",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 38.sp else 28.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = statusText,
                    color = if (catalogError == null) RonecaColors.TextSecondary else Color(0xFFFFB4A8),
                    fontSize = if (isTelevision) 17.sp else 14.sp,
                    maxLines = 2,
                )
            }

            Spacer(modifier = Modifier.height(if (isTelevision) 30.dp else 24.dp))

            Text(
                text = "EXPLORAR",
                color = RonecaColors.TextMuted,
                fontSize = if (isTelevision) 15.sp else 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
            )
            Spacer(modifier = Modifier.height(14.dp))

            if (isTelevision) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    FocusableActionCard(
                        title = "Canais ao vivo",
                        subtitle = "Programação em tempo real",
                        badge = channelCount.toString(),
                        enabled = channelCount > 0,
                        isTelevision = true,
                        accentColor = RonecaColors.Primary,
                        modifier = Modifier
                            .weight(1f)
                            .height(184.dp),
                        focusRequester = if (firstTarget == HomeFocusTarget.Channels) firstFocusRequester else null,
                        onClick = onOpenChannels,
                    )
                    FocusableActionCard(
                        title = "Filmes",
                        subtitle = "Cinema para todos os momentos",
                        badge = movieCount.toString(),
                        enabled = movieCount > 0,
                        isTelevision = true,
                        accentColor = RonecaColors.Pink,
                        modifier = Modifier
                            .weight(1f)
                            .height(184.dp),
                        focusRequester = if (firstTarget == HomeFocusTarget.Movies) firstFocusRequester else null,
                        onClick = onOpenMovies,
                    )
                    FocusableActionCard(
                        title = "Séries",
                        subtitle = "Temporadas e episódios",
                        badge = seriesCount.toString(),
                        enabled = seriesCount > 0,
                        isTelevision = true,
                        accentColor = RonecaColors.Cyan,
                        modifier = Modifier
                            .weight(1f)
                            .height(184.dp),
                        focusRequester = if (firstTarget == HomeFocusTarget.Series) firstFocusRequester else null,
                        onClick = onOpenSeries,
                    )
                }

                Spacer(modifier = Modifier.height(22.dp))
                Text(
                    text = "Use as setas para navegar e pressione OK para abrir",
                    color = RonecaColors.TextMuted,
                    fontSize = 14.sp,
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                    FocusableActionCard(
                        title = "Canais ao vivo",
                        subtitle = "Programação em tempo real",
                        badge = channelCount.toString(),
                        enabled = channelCount > 0,
                        isTelevision = false,
                        accentColor = RonecaColors.Primary,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(126.dp),
                        onClick = onOpenChannels,
                    )
                    FocusableActionCard(
                        title = "Filmes",
                        subtitle = "Cinema para todos os momentos",
                        badge = movieCount.toString(),
                        enabled = movieCount > 0,
                        isTelevision = false,
                        accentColor = RonecaColors.Pink,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(126.dp),
                        onClick = onOpenMovies,
                    )
                    FocusableActionCard(
                        title = "Séries",
                        subtitle = "Temporadas e episódios",
                        badge = seriesCount.toString(),
                        enabled = seriesCount > 0,
                        isTelevision = false,
                        accentColor = RonecaColors.Cyan,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(126.dp),
                        onClick = onOpenSeries,
                    )
                    FocusableActionCard(
                        title = "Testar player",
                        subtitle = "Verificar vídeo e controles nativos",
                        badge = "TESTE",
                        enabled = true,
                        isTelevision = false,
                        accentColor = RonecaColors.Green,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(116.dp),
                        onClick = onOpenPlayer,
                    )
                }
            }
        }
    }
}
