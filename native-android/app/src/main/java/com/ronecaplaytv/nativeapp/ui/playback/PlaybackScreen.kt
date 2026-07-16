package com.ronecaplaytv.nativeapp.ui.playback

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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.persistence.SavedProgress
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

private data class PlaybackCardItem(
    val key: String,
    val title: String,
    val imageUrl: String?,
    val progress: Float,
    val onClick: () -> Unit,
)

@Composable
fun PlaybackScreen(
    isTelevision: Boolean,
    channels: List<NativeChannel>,
    movies: List<NativeMovie>,
    series: List<NativeSeries>,
    favoriteChannelIds: Set<String>,
    favoriteMovieIds: Set<String>,
    favoriteSeriesIds: Set<String>,
    progress: List<SavedProgress>,
    onBack: () -> Unit,
    onPlayChannel: (NativeChannel) -> Unit,
    onOpenMovie: (NativeMovie) -> Unit,
    onOpenSeries: (NativeSeries) -> Unit,
) {
    BackHandler(onBack = onBack)

    val progressByKey = remember(progress) { progress.associateBy(SavedProgress::contentKey) }
    val startedSeriesIds = remember(progress) {
        progress.mapNotNull { entry ->
            entry.contentKey
                .takeIf { it.startsWith("episode:") }
                ?.removePrefix("episode:")
                ?.substringBefore(':')
        }.toSet()
    }

    val startedMovieCards = remember(movies, progressByKey) {
        movies.mapNotNull { movie ->
            progressByKey["movie:${movie.id}"]?.let { saved ->
                PlaybackCardItem(
                    key = "started-movie-${movie.id}",
                    title = movie.name,
                    imageUrl = movie.coverUrl,
                    progress = saved.fraction,
                    onClick = { onOpenMovie(movie) },
                )
            }
        }
    }
    val startedSeriesCards = remember(series, startedSeriesIds) {
        series.filter { it.id in startedSeriesIds }.map { item ->
            PlaybackCardItem(
                key = "started-series-${item.id}",
                title = item.name,
                imageUrl = item.coverUrl,
                progress = 0f,
                onClick = { onOpenSeries(item) },
            )
        }
    }
    val favoriteChannels = remember(channels, favoriteChannelIds) { channels.filter { it.id in favoriteChannelIds } }
    val favoriteMovieCards = remember(movies, favoriteMovieIds, progressByKey) {
        movies.filter { it.id in favoriteMovieIds }.map { movie ->
            PlaybackCardItem(
                key = "favorite-movie-${movie.id}",
                title = movie.name,
                imageUrl = movie.coverUrl,
                progress = progressByKey["movie:${movie.id}"]?.fraction ?: 0f,
                onClick = { onOpenMovie(movie) },
            )
        }
    }
    val favoriteSeriesCards = remember(series, favoriteSeriesIds) {
        series.filter { it.id in favoriteSeriesIds }.map { item ->
            PlaybackCardItem(
                key = "favorite-series-${item.id}",
                title = item.name,
                imageUrl = item.coverUrl,
                progress = 0f,
                onClick = { onOpenSeries(item) },
            )
        }
    }
    val empty = favoriteChannels.isEmpty() && favoriteMovieCards.isEmpty() && favoriteSeriesCards.isEmpty() &&
        startedMovieCards.isEmpty() && startedSeriesCards.isEmpty()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {
                    onBack()
                    true
                } else false
            },
        contentPadding = PaddingValues(
            start = if (isTelevision) 24.dp else 18.dp,
            end = if (isTelevision) 24.dp else 18.dp,
            top = if (isTelevision) 18.dp else 20.dp,
            bottom = 30.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        item {
            Text(
                text = "SUA SELEÇÃO",
                color = RonecaColors.Primary,
                fontSize = if (isTelevision) 11.sp else 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.8.sp,
            )
            Text(
                text = "Minha Lista",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 28.sp else 24.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Favoritos e conteúdos em andamento reunidos em um só lugar.",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
            )
        }

        if (empty) item { EmptyState(isTelevision = isTelevision) }

        if (startedMovieCards.isNotEmpty()) {
            item {
                MediaSection(
                    title = "Continuar assistindo",
                    subtitle = "Retome exatamente de onde parou",
                    items = startedMovieCards,
                    isTelevision = isTelevision,
                )
            }
        }

        if (startedSeriesCards.isNotEmpty()) {
            item {
                MediaSection(
                    title = "Séries em andamento",
                    subtitle = "Continue pelos episódios já iniciados",
                    items = startedSeriesCards,
                    isTelevision = isTelevision,
                )
            }
        }

        if (favoriteChannels.isNotEmpty()) {
            item {
                ChannelSection(
                    channels = favoriteChannels,
                    isTelevision = isTelevision,
                    onPlay = onPlayChannel,
                )
            }
        }

        if (favoriteMovieCards.isNotEmpty()) {
            item {
                MediaSection(
                    title = "Filmes favoritos",
                    subtitle = "Sua seleção de filmes",
                    items = favoriteMovieCards,
                    isTelevision = isTelevision,
                )
            }
        }

        if (favoriteSeriesCards.isNotEmpty()) {
            item {
                MediaSection(
                    title = "Séries favoritas",
                    subtitle = "Séries adicionadas à Minha Lista",
                    items = favoriteSeriesCards,
                    isTelevision = isTelevision,
                )
            }
        }
    }
}

@Composable
private fun MediaSection(
    title: String,
    subtitle: String,
    items: List<PlaybackCardItem>,
    isTelevision: Boolean,
) {
    Column {
        Text(
            text = title,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 20.sp else 18.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(text = subtitle, color = RonecaColors.TextSecondary, fontSize = 12.sp)
        Spacer(modifier = Modifier.height(11.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(items, key = PlaybackCardItem::key) { item ->
                MediaCard(
                    title = item.title,
                    imageUrl = item.imageUrl,
                    progress = item.progress,
                    isTelevision = isTelevision,
                    onClick = item.onClick,
                )
            }
        }
    }
}

@Composable
private fun ChannelSection(
    channels: List<NativeChannel>,
    isTelevision: Boolean,
    onPlay: (NativeChannel) -> Unit,
) {
    Column {
        Text(
            text = "Canais favoritos",
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 20.sp else 18.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(11.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(channels, key = NativeChannel::id) { channel ->
                CompactChannelCard(
                    channel = channel,
                    isTelevision = isTelevision,
                    onClick = { onPlay(channel) },
                )
            }
        }
    }
}

@Composable
private fun MediaCard(
    title: String,
    imageUrl: String?,
    progress: Float,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val width = if (isTelevision) 145.dp else 125.dp

    Column(
        modifier = Modifier
            .width(width)
            .clip(RoundedCornerShape(12.dp))
            .background(RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(7.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(9.dp))
                .background(RonecaColors.BackgroundSoft),
        ) {
            if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }
            if (progress > 0f) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(4.dp)
                        .background(Color(0x99000000)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress.coerceIn(0f, 1f))
                            .height(4.dp)
                            .background(RonecaColors.RedStrong),
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(7.dp))
        Text(
            text = title,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 11.sp else 10.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
        )
    }
}

@Composable
private fun CompactChannelCard(
    channel: NativeChannel,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    Column(
        modifier = Modifier
            .width(if (isTelevision) 180.dp else 155.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(12.dp),
    ) {
        Text(
            text = channel.name,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 14.sp else 13.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
        )
        Text(
            text = channel.groupTitle,
            color = RonecaColors.TextSecondary,
            fontSize = 10.sp,
            maxLines = 1,
        )
    }
}

@Composable
private fun EmptyState(isTelevision: Boolean) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (isTelevision) 220.dp else 190.dp)
            .background(RonecaColors.Surface, RoundedCornerShape(14.dp))
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = "♡", color = RonecaColors.Border, fontSize = if (isTelevision) 54.sp else 46.sp)
            Text(
                text = "Nada aqui ainda",
                color = RonecaColors.TextMuted,
                fontSize = if (isTelevision) 18.sp else 16.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = "Favorite um conteúdo ou comece a assistir.",
                color = RonecaColors.TextMuted,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
