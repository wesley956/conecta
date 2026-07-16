package com.ronecaplaytv.nativeapp.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay

private data class HomeStat(
    val label: String,
    val value: String,
    val color: Color,
)

@Composable
fun HomeScreen(
    isTelevision: Boolean,
    deviceCode: String?,
    loadingSection: String?,
    catalogError: String?,
    channelCount: Int,
    movieCount: Int,
    seriesCount: Int,
    onOpenChannels: () -> Unit,
    onOpenMovies: () -> Unit,
    onOpenSeries: () -> Unit,
    onOpenPlayback: () -> Unit,
) {
    val firstFocusRequester = remember { FocusRequester() }

    LaunchedEffect(isTelevision, channelCount, movieCount, seriesCount) {
        if (isTelevision) {
            delay(240)
            runCatching { firstFocusRequester.requestFocus() }
        }
    }

    val statusText = when {
        loadingSection != null -> "Sincronizando $loadingSection"
        catalogError != null -> catalogError
        else -> "Conteúdo sincronizado e pronto para assistir"
    }

    val stats = listOf(
        HomeStat("Listas", "1", RonecaColors.Primary),
        HomeStat("Canais", channelCount.toString(), RonecaColors.Primary),
        HomeStat("Filmes", movieCount.toString(), RonecaColors.Purple),
        HomeStat("Séries", seriesCount.toString(), RonecaColors.Orange),
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentPadding = PaddingValues(
            start = if (isTelevision) 52.dp else 18.dp,
            end = if (isTelevision) 52.dp else 18.dp,
            top = if (isTelevision) 30.dp else 22.dp,
            bottom = 30.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(if (isTelevision) 22.dp else 16.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "RonecaPlayTV",
                        color = RonecaColors.TextPrimary,
                        fontSize = if (isTelevision) 28.sp else 22.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = deviceCode ?: "Dispositivo ativo",
                        color = RonecaColors.TextSecondary,
                        fontSize = if (isTelevision) 13.sp else 11.sp,
                    )
                }

                Box(
                    modifier = Modifier
                        .background(RonecaColors.Primary.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                        .border(1.dp, RonecaColors.Primary.copy(alpha = 0.55f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = "ONLINE",
                        color = RonecaColors.Primary,
                        fontSize = if (isTelevision) 12.sp else 10.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        item {
            Column {
                Text(
                    text = "Olá! 👋",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 28.sp else 22.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Escolha o que deseja assistir",
                    color = RonecaColors.TextSecondary,
                    fontSize = if (isTelevision) 15.sp else 13.sp,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = statusText,
                    color = if (catalogError == null) RonecaColors.BodyText else RonecaColors.Error,
                    fontSize = if (isTelevision) 13.sp else 12.sp,
                    maxLines = 2,
                )
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 16.dp else 10.dp),
            ) {
                FocusableActionCard(
                    title = "TV ao Vivo",
                    subtitle = "Canais em tempo real",
                    badge = "▣",
                    enabled = channelCount > 0,
                    isTelevision = isTelevision,
                    accentColor = RonecaColors.Primary,
                    focusRequester = firstFocusRequester,
                    modifier = Modifier
                        .weight(1f)
                        .height(if (isTelevision) 150.dp else 126.dp),
                    onClick = onOpenChannels,
                )
                FocusableActionCard(
                    title = "Filmes",
                    subtitle = "Seu catálogo de cinema",
                    badge = "▶",
                    enabled = movieCount > 0,
                    isTelevision = isTelevision,
                    accentColor = RonecaColors.Purple,
                    modifier = Modifier
                        .weight(1f)
                        .height(if (isTelevision) 150.dp else 126.dp),
                    onClick = onOpenMovies,
                )
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 16.dp else 10.dp),
            ) {
                FocusableActionCard(
                    title = "Séries",
                    subtitle = "Temporadas e episódios",
                    badge = "▤",
                    enabled = seriesCount > 0,
                    isTelevision = isTelevision,
                    accentColor = RonecaColors.Orange,
                    modifier = Modifier
                        .weight(1f)
                        .height(if (isTelevision) 150.dp else 126.dp),
                    onClick = onOpenSeries,
                )
                FocusableActionCard(
                    title = "Playback",
                    subtitle = "Favoritos e em andamento",
                    badge = "●",
                    enabled = true,
                    isTelevision = isTelevision,
                    accentColor = RonecaColors.Green,
                    modifier = Modifier
                        .weight(1f)
                        .height(if (isTelevision) 150.dp else 126.dp),
                    onClick = onOpenPlayback,
                )
            }
        }

        item {
            Text(
                text = "Resumo",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 20.sp else 17.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        item {
            if (isTelevision) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    stats.forEach { stat ->
                        StatCard(
                            stat = stat,
                            modifier = Modifier.weight(1f),
                            isTelevision = true,
                        )
                    }
                }
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(stats) { stat ->
                        StatCard(
                            stat = stat,
                            modifier = Modifier.fillParentMaxWidth(0.42f),
                            isTelevision = false,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(
    stat: HomeStat,
    modifier: Modifier,
    isTelevision: Boolean,
) {
    Column(
        modifier = modifier
            .background(RonecaColors.Surface, RoundedCornerShape(12.dp))
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(12.dp))
            .padding(if (isTelevision) 18.dp else 15.dp),
    ) {
        Text(
            text = stat.value,
            color = stat.color,
            fontSize = if (isTelevision) 24.sp else 21.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = stat.label,
            color = RonecaColors.TextSecondary,
            fontSize = if (isTelevision) 12.sp else 11.sp,
        )
    }
}
