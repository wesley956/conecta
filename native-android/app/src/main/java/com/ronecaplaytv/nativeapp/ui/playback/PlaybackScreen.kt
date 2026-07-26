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
import androidx.compose.foundation.layout.Row
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
import com.ronecaplaytv.nativeapp.ui.components.ronecaFocusScale

private data class PlaybackCardItem(
    val key: String,
    val title: String,
    val imageUrl: String?,
    val progress: Float,
    val badge: String?,
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
    onResumeMovie: (NativeMovie) -> Unit,
    onOpenSeries: (NativeSeries) -> Unit,
    onResumeSeries: (NativeSeries, SavedProgress) -> Unit,
) {
    BackHandler(onBack = onBack)

    val progressByKey = remember(progress) { progress.associateBy(SavedProgress::contentKey) }
    val startedMovieCards = remember(movies, progressByKey) {
        movies.mapNotNull { movie ->
            progressByKey["movie:${movie.id}"]?.let { saved ->
                PlaybackCardItem(
                    key = "started-movie-${movie.id}",
                    title = movie.name,
                    imageUrl = movie.coverUrl,
                    progress = saved.fraction,
                    badge = "CONTINUAR",
                    onClick = { onResumeMovie(movie) },
                )
            }
        }
    }
    val latestProgressBySeriesId = remember(progress) {
        buildMap<String, SavedProgress> {
            progress.forEach { saved ->
                val seriesId = saved.contentKey
                    .takeIf { it.startsWith("episode:") }
                    ?.removePrefix("episode:")
                    ?.substringBefore(':')
                    ?.takeIf(String::isNotBlank)
                    ?: return@forEach
                val current = get(seriesId)
                if (current == null || saved.updatedAt > current.updatedAt) {
                    put(seriesId, saved)
                }
            }
        }
    }
    val startedSeriesCards = remember(series, latestProgressBySeriesId) {
        series.mapNotNull { item ->
            latestProgressBySeriesId[item.id]?.let { saved ->
                PlaybackCardItem(
                    key = "started-series-${item.id}",
                    title = item.name,
                    imageUrl = item.coverUrl,
                    progress = saved.fraction,
                    badge = "ÚLTIMO EPISÓDIO",
                    onClick = { onResumeSeries(item, saved) },
                )
            }
        }
    }
    val favoriteChannels = remember(channels, favoriteChannelIds) {
        channels.filter { it.id in favoriteChannelIds }
    }
    val favoriteMovieCards = remember(movies, favoriteMovieIds, progressByKey) {
        movies.filter { it.id in favoriteMovieIds }.map { movie ->
            PlaybackCardItem(
                key = "favorite-movie-${movie.id}",
                title = movie.name,
                imageUrl = movie.coverUrl,
                progress = progressByKey["movie:${movie.id}"]?.fraction ?: 0f,
                badge = "FAVORITO",
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
                badge = "FAVORITA",
                onClick = { onOpenSeries(item) },
            )
        }
    }
    val empty = favoriteChannels.isEmpty() && favoriteMovieCards.isEmpty() &&
        favoriteSeriesCards.isEmpty() && startedMovieCards.isEmpty() && startedSeriesCards.isEmpty()

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
            bottom = 34.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(24.dp),
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
                text = "Retome conteúdos iniciados ou abra seus favoritos.",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
            )
        }

        if (empty) item { EmptyState(isTelevision = isTelevision) }

        if (startedMovieCards.isNotEmpty() || startedSeriesCards.isNotEmpty()) {
            item {
                ContinueSection(
                    movies = startedMovieCards,
                    series = startedSeriesCards,
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
private fun ContinueSection(
    movies: List<PlaybackCardItem>,
    series: List<PlaybackCardItem>,
    isTelevision: Boolean,
) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.width(26.dp).height(3.dp).background(RonecaColors.RedStrong))
            Text(
                text = "CONTINUAR ASSISTINDO",
                color = RonecaColors.Primary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp,
                modifier = Modifier.padding(start = 9.dp),
            )
        }
        Text(
            text = "Um clique retoma exatamente de onde você parou.",
            color = RonecaColors.TextSecondary,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 4.dp, bottom = 11.dp),
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(movies + series, key = PlaybackCardItem::key) { item ->
                MediaCard(
                    title = item.title,
                    imageUrl = item.imageUrl,
                    progress = item.progress,
                    badge = item.badge,
                    isTelevision = isTelevision,
                    onClick = item.onClick,
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
                    badge = item.badge,
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
        Text(text = "Acesso rápido aos seus canais", color = RonecaColors.TextSecondary, fontSize = 12.sp)
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
    badge: String?,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val width = if (isTelevision) 150.dp else 126.dp

    Column(
        modifier = Modifier
            .width(width)
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .clip(RoundedCornerShape(13.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(13.dp),
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
            badge?.let {
                Text(
                    text = it,
                    color = RonecaColors.TextPrimary,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(6.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xD9100D0B))
                        .border(1.dp, RonecaColors.RedStrong.copy(alpha = 0.75f), RoundedCornerShape(999.dp))
                        .padding(horizontal = 7.dp, vertical = 4.dp),
                )
            }
            if (progress > 0f) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(5.dp)
                        .background(Color(0xB0000000)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress.coerceIn(0f, 1f))
                            .height(5.dp)
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
        if (progress > 0f) {
            Text(
                text = "${(progress.coerceIn(0f, 1f) * 100).toInt()}% assistido",
                color = RonecaColors.Primary,
                fontSize = 9.sp,
                fontWeight = FontWeight.Medium,
            )
        }
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
    Row(
        modifier = Modifier
            .width(if (isTelevision) 190.dp else 160.dp)
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
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
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(34.dp)
                .background(if (focused) RonecaColors.RedStrong else RonecaColors.Primary),
        )
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
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
        Text(text = "▶", color = RonecaColors.Primary, fontSize = 12.sp)
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
