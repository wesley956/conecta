package com.ronecaplaytv.nativeapp.ui.series

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

@Composable
fun SeriesDetailScreen(
    series: NativeSeries,
    isTelevision: Boolean,
    onBack: () -> Unit,
    onPlayEpisode: (NativeEpisode, String) -> Unit,
) {
    BackHandler(onBack = onBack)
    var selectedSeasonNumber by remember(series.id) {
        mutableIntStateOf(series.seasons.firstOrNull()?.number ?: 1)
    }
    val selectedSeason = series.seasons.firstOrNull { it.number == selectedSeasonNumber }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentPadding = PaddingValues(
            start = if (isTelevision) 52.dp else 18.dp,
            end = if (isTelevision) 52.dp else 18.dp,
            top = if (isTelevision) 30.dp else 20.dp,
            bottom = 30.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Text(
                text = "← Voltar",
                color = RonecaColors.Primary,
                fontSize = if (isTelevision) 15.sp else 13.sp,
                fontWeight = FontWeight.Medium,
            )
        }

        item {
            if (isTelevision) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(28.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    SeriesCover(
                        series = series,
                        modifier = Modifier.width(210.dp).height(315.dp),
                    )
                    SeriesHeader(
                        series = series,
                        isTelevision = true,
                        modifier = Modifier.weight(1f),
                    )
                }
            } else {
                SeriesCover(
                    series = series,
                    modifier = Modifier.fillMaxWidth().height(400.dp),
                )
                Spacer(modifier = Modifier.height(18.dp))
                SeriesHeader(
                    series = series,
                    isTelevision = false,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        item {
            Text(
                text = "Temporadas",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 20.sp else 17.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(10.dp))
            if (series.seasons.isEmpty()) {
                Text(
                    text = "Os episódios desta série ainda não foram sincronizados.",
                    color = RonecaColors.TextSecondary,
                    fontSize = if (isTelevision) 15.sp else 13.sp,
                )
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(series.seasons, key = { it.number }) { season ->
                        SeasonChip(
                            seasonNumber = season.number,
                            selected = selectedSeasonNumber == season.number,
                            onClick = { selectedSeasonNumber = season.number },
                        )
                    }
                }
            }
        }

        item {
            Text(
                text = if (selectedSeason != null) {
                    "Episódios • Temporada ${selectedSeason.number}"
                } else {
                    "Episódios"
                },
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 20.sp else 17.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        if (selectedSeason != null) {
            items(selectedSeason.episodes, key = NativeEpisode::id) { episode ->
                EpisodeRow(
                    episode = episode,
                    isTelevision = isTelevision,
                    onClick = {
                        onPlayEpisode(
                            episode,
                            "${series.name} • T${selectedSeason.number}E${episode.number}",
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun SeriesCover(series: NativeSeries, modifier: Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (!series.coverUrl.isNullOrBlank()) {
            AsyncImage(
                model = series.coverUrl,
                contentDescription = series.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text(text = "SÉRIE", color = RonecaColors.TextMuted)
        }
    }
}

@Composable
private fun SeriesHeader(
    series: NativeSeries,
    isTelevision: Boolean,
    modifier: Modifier,
) {
    Column(modifier = modifier) {
        Text(
            text = series.category.ifBlank { "Série" }.uppercase(),
            color = RonecaColors.Orange,
            fontSize = if (isTelevision) 13.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.1.sp,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = series.name,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 34.sp else 27.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = "${series.seasons.size} temporada(s) • ${series.seasons.sumOf { it.episodes.size }} episódio(s)",
            color = RonecaColors.TextSecondary,
            fontSize = if (isTelevision) 15.sp else 13.sp,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = series.synopsis?.takeIf(String::isNotBlank)
                ?: "Sinopse não informada para esta série.",
            color = RonecaColors.BodyText,
            fontSize = if (isTelevision) 16.sp else 14.sp,
            lineHeight = if (isTelevision) 24.sp else 21.sp,
        )
    }
}

@Composable
private fun SeasonChip(
    seasonNumber: Int,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) RonecaColors.Primary.copy(alpha = 0.12f) else RonecaColors.Surface)
            .border(
                width = 1.dp,
                color = if (selected) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(8.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
    ) {
        Text(
            text = "Temporada $seasonNumber",
            color = if (selected) RonecaColors.Primary else RonecaColors.TextSecondary,
            fontSize = 12.sp,
        )
    }
}

@Composable
private fun EpisodeRow(
    episode: NativeEpisode,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable()
            .padding(if (isTelevision) 18.dp else 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(if (isTelevision) 46.dp else 40.dp)
                .background(RonecaColors.Primary.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                .border(1.dp, RonecaColors.Primary.copy(alpha = 0.45f), RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = episode.number.toString(),
                color = RonecaColors.Primary,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(modifier = Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = episode.name,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 16.sp else 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = episode.duration ?: "Duração não informada",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
            )
        }
        Text(
            text = "▶",
            color = RonecaColors.Primary,
            fontSize = if (isTelevision) 20.sp else 17.sp,
        )
    }
}
