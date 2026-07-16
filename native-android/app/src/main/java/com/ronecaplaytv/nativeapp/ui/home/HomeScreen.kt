package com.ronecaplaytv.nativeapp.ui.home

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
import com.ronecaplaytv.nativeapp.ui.components.CompactActionButton
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay

enum class HomePreviewKind {
    Channel,
    Movie,
    Series,
}

data class HomePreviewItem(
    val id: String,
    val title: String,
    val subtitle: String,
    val imageUrl: String?,
    val playbackUrls: List<String>,
    val kind: HomePreviewKind,
)

@Composable
fun HomeScreen(
    isTelevision: Boolean,
    deviceCode: String?,
    expiresAt: String?,
    loadingSection: String?,
    catalogError: String?,
    channels: List<HomePreviewItem>,
    movies: List<HomePreviewItem>,
    series: List<HomePreviewItem>,
    onOpenChannels: () -> Unit,
    onOpenMovies: () -> Unit,
    onOpenSeries: () -> Unit,
    onPlay: (HomePreviewItem) -> Unit,
) {
    val hero = movies.firstOrNull { !it.imageUrl.isNullOrBlank() }
        ?: series.firstOrNull { !it.imageUrl.isNullOrBlank() }
        ?: channels.firstOrNull()
    val primaryFocusRequester = remember { FocusRequester() }

    LaunchedEffect(isTelevision, hero?.id, channels.size, movies.size, series.size) {
        if (isTelevision && (channels.isNotEmpty() || movies.isNotEmpty() || series.isNotEmpty())) {
            delay(260)
            runCatching { primaryFocusRequester.requestFocus() }
        }
    }

    val statusText = when {
        loadingSection != null -> "Sincronizando $loadingSection"
        catalogError != null -> catalogError
        else -> "Biblioteca pronta"
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentPadding = PaddingValues(bottom = if (isTelevision) 52.dp else 28.dp),
    ) {
        item {
            Header(
                isTelevision = isTelevision,
                deviceCode = deviceCode,
                expiresAt = expiresAt,
                modifier = Modifier.padding(
                    start = if (isTelevision) 58.dp else 20.dp,
                    end = if (isTelevision) 58.dp else 20.dp,
                    top = if (isTelevision) 28.dp else 20.dp,
                    bottom = 20.dp,
                ),
            )
        }

        item {
            HeroSection(
                item = hero,
                statusText = statusText,
                hasError = catalogError != null,
                isTelevision = isTelevision,
                primaryFocusRequester = primaryFocusRequester,
                onPrimary = {
                    when (hero?.kind) {
                        HomePreviewKind.Channel -> onOpenChannels()
                        HomePreviewKind.Series -> onOpenSeries()
                        HomePreviewKind.Movie, null -> onOpenMovies()
                    }
                },
                onLive = onOpenChannels,
                modifier = Modifier.padding(horizontal = if (isTelevision) 58.dp else 20.dp),
            )
        }

        item {
            Spacer(modifier = Modifier.height(if (isTelevision) 30.dp else 24.dp))
            MediaRail(
                title = "TV ao vivo",
                subtitle = "Canais disponíveis na sua lista",
                items = channels.take(14),
                isTelevision = isTelevision,
                onSeeAll = onOpenChannels,
                onItemClick = onPlay,
            )
        }

        item {
            MediaRail(
                title = "Filmes",
                subtitle = "Destaques do seu catálogo",
                items = movies.take(16),
                isTelevision = isTelevision,
                onSeeAll = onOpenMovies,
                onItemClick = onPlay,
            )
        }

        item {
            MediaRail(
                title = "Séries",
                subtitle = "Temporadas e episódios",
                items = series.take(16),
                isTelevision = isTelevision,
                onSeeAll = onOpenSeries,
                onItemClick = { item ->
                    if (item.playbackUrls.isNotEmpty()) onPlay(item) else onOpenSeries()
                },
            )
        }
    }
}

@Composable
private fun Header(
    isTelevision: Boolean,
    deviceCode: String?,
    expiresAt: String?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(
                text = "RonecaPlayTV",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 30.sp else 24.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Text(
                text = "Início",
                color = RonecaColors.TextMuted,
                fontSize = if (isTelevision) 15.sp else 13.sp,
            )
        }

        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(RonecaColors.Surface)
                .border(1.dp, RonecaColors.Divider, RoundedCornerShape(999.dp))
                .padding(horizontal = 15.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .width(8.dp)
                    .height(8.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(RonecaColors.Green),
            )
            Text(
                text = deviceCode ?: "Aparelho ativo",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 11.sp,
            )
            if (!expiresAt.isNullOrBlank()) {
                Text(text = "•", color = RonecaColors.TextMuted)
                Text(
                    text = "Acesso válido",
                    color = RonecaColors.TextSecondary,
                    fontSize = if (isTelevision) 13.sp else 11.sp,
                )
            }
        }
    }
}

@Composable
private fun HeroSection(
    item: HomePreviewItem?,
    statusText: String,
    hasError: Boolean,
    isTelevision: Boolean,
    primaryFocusRequester: FocusRequester,
    onPrimary: () -> Unit,
    onLive: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(if (isTelevision) 330.dp else 300.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(RonecaColors.Surface),
    ) {
        if (!item?.imageUrl.isNullOrBlank()) {
            AsyncImage(
                model = item?.imageUrl,
                contentDescription = item?.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            Color(0xF207080C),
                            Color(0xCC07080C),
                            Color(0x3307080C),
                        ),
                    ),
                ),
        )

        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxWidth(if (isTelevision) 0.58f else 0.86f)
                .padding(if (isTelevision) 38.dp else 24.dp),
        ) {
            Text(
                text = item?.subtitle?.uppercase() ?: "RONECA PLAY TV",
                color = RonecaColors.Primary,
                fontSize = if (isTelevision) 13.sp else 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp,
                maxLines = 1,
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = item?.title ?: "Sua programação em um só lugar",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 38.sp else 29.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 2,
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = statusText,
                color = if (hasError) Color(0xFFFFB4A8) else RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 16.sp else 14.sp,
                maxLines = 2,
            )
            Spacer(modifier = Modifier.height(22.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CompactActionButton(
                    label = if (item?.kind == HomePreviewKind.Channel) "Assistir TV" else "Explorar catálogo",
                    enabled = true,
                    isTelevision = isTelevision,
                    modifier = Modifier.width(if (isTelevision) 245.dp else 190.dp),
                    focusRequester = primaryFocusRequester,
                    accentColor = RonecaColors.Primary,
                    onClick = onPrimary,
                )
                if (isTelevision) {
                    CompactActionButton(
                        label = "TV ao vivo",
                        enabled = true,
                        isTelevision = true,
                        modifier = Modifier.width(210.dp),
                        accentColor = RonecaColors.Cyan,
                        onClick = onLive,
                    )
                }
            }
        }
    }
}

@Composable
private fun MediaRail(
    title: String,
    subtitle: String,
    items: List<HomePreviewItem>,
    isTelevision: Boolean,
    onSeeAll: () -> Unit,
    onItemClick: (HomePreviewItem) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = if (isTelevision) 58.dp else 20.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Column {
                Text(
                    text = title,
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 25.sp else 21.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = subtitle,
                    color = RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 14.sp else 12.sp,
                )
            }
            Text(
                text = "Ver todos",
                color = RonecaColors.Primary,
                fontSize = if (isTelevision) 14.sp else 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onSeeAll),
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        if (items.isEmpty()) {
            Text(
                text = "Nenhum conteúdo disponível.",
                color = RonecaColors.TextMuted,
                modifier = Modifier.padding(horizontal = if (isTelevision) 58.dp else 20.dp),
            )
        } else {
            LazyRow(
                contentPadding = PaddingValues(horizontal = if (isTelevision) 58.dp else 20.dp),
                horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 16.dp else 12.dp),
            ) {
                items(items, key = { "${it.kind}-${it.id}" }) { item ->
                    HomeMediaCard(
                        item = item,
                        isTelevision = isTelevision,
                        onClick = { onItemClick(item) },
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(if (isTelevision) 30.dp else 24.dp))
    }
}

@Composable
private fun HomeMediaCard(
    item: HomePreviewItem,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val poster = item.kind != HomePreviewKind.Channel
    val width = if (poster) {
        if (isTelevision) 166.dp else 132.dp
    } else {
        if (isTelevision) 224.dp else 180.dp
    }
    val height = if (poster) {
        if (isTelevision) 238.dp else 192.dp
    } else {
        if (isTelevision) 138.dp else 112.dp
    }

    Column(modifier = Modifier.width(width)) {
        Box(
            modifier = Modifier
                .width(width)
                .height(height)
                .onFocusChanged { focused = it.isFocused }
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyUp && (
                            event.key == Key.DirectionCenter ||
                                event.key == Key.Enter ||
                                event.key == Key.NumPadEnter
                            )
                    ) {
                        onClick()
                        true
                    } else {
                        false
                    }
                }
                .graphicsLayer {
                    val scale = if (focused && isTelevision) 1.035f else 1f
                    scaleX = scale
                    scaleY = scale
                    shadowElevation = if (focused) 10.dp.toPx() else 1.dp.toPx()
                }
                .clip(RoundedCornerShape(14.dp))
                .background(RonecaColors.Surface)
                .border(
                    width = if (focused) 2.dp else 1.dp,
                    color = if (focused) Color.White else RonecaColors.Divider,
                    shape = RoundedCornerShape(14.dp),
                )
                .clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = onClick,
                )
                .focusable(),
        ) {
            if (!item.imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = item.imageUrl,
                    contentDescription = item.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.linearGradient(
                                listOf(RonecaColors.SurfaceRaised, RonecaColors.BackgroundSoft),
                            ),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = when (item.kind) {
                            HomePreviewKind.Channel -> "TV"
                            HomePreviewKind.Movie -> "FILME"
                            HomePreviewKind.Series -> "SÉRIE"
                        },
                        color = RonecaColors.TextMuted,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = item.title,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 15.sp else 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
        Text(
            text = item.subtitle,
            color = RonecaColors.TextMuted,
            fontSize = if (isTelevision) 12.sp else 11.sp,
            maxLines = 1,
        )
    }
}
