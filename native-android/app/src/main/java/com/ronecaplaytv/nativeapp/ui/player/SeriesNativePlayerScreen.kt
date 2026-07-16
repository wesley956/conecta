package com.ronecaplaytv.nativeapp.ui.player

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val SERIES_IPTV_USER_AGENT = "VLC/3.0.20 LibVLC/3.0.20"
private const val SERIES_SOURCE_RETRY_LIMIT = 1

private data class EpisodeEntry(
    val season: NativeSeason,
    val episode: NativeEpisode,
)

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun SeriesNativePlayerScreen(
    isTelevision: Boolean,
    seriesTitle: String,
    seasons: List<NativeSeason>,
    initialEpisodeId: String,
    initialPositionMs: Long = 0L,
    decoderMode: String = "Hardware",
    bufferSeconds: Int = 5,
    automaticReconnect: Boolean = true,
    positionForEpisode: (NativeEpisode) -> Long = { 0L },
    onEpisodeChanged: (NativeSeason, NativeEpisode) -> Unit = { _, _ -> },
    onProgress: (NativeSeason, NativeEpisode, positionMs: Long, durationMs: Long) -> Unit = { _, _, _, _ -> },
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val entries = remember(seasons) {
        seasons
            .sortedBy(NativeSeason::number)
            .flatMap { season ->
                season.episodes
                    .sortedBy(NativeEpisode::number)
                    .map { episode -> EpisodeEntry(season, episode) }
            }
    }
    val initialIndex = remember(entries, initialEpisodeId) {
        entries.indexOfFirst { it.episode.id == initialEpisodeId }.takeIf { it >= 0 } ?: 0
    }
    var currentIndex by remember(entries) { mutableIntStateOf(initialIndex) }
    var sourceIndex by remember(entries) { mutableIntStateOf(0) }
    var sameSourceRetries by remember(entries) { mutableIntStateOf(0) }
    var pendingSeekMs by remember(entries) { mutableLongStateOf(initialPositionMs.coerceAtLeast(0L)) }
    var episodeDrawerVisible by remember { mutableStateOf(false) }
    var transitionLocked by remember(entries) { mutableStateOf(false) }
    var playerMessage by remember(entries) {
        mutableStateOf(if (entries.isEmpty()) "Esta série não possui episódios disponíveis." else null)
    }

    val currentEntry = entries.getOrNull(currentIndex)
    val currentSources = remember(currentEntry) {
        val entry = currentEntry
        if (entry == null) {
            emptyList()
        } else {
            entry.episode.playbackUrls
                .ifEmpty { listOf(entry.episode.primaryUrl) }
                .map(String::trim)
                .filter { it.startsWith("https://") || it.startsWith("http://") }
                .distinct()
        }
    }
    val hasNextEpisode = currentIndex + 1 < entries.size
    val safeBufferSeconds = bufferSeconds.coerceIn(2, 10)

    val loadControl = remember(isTelevision, safeBufferSeconds) {
        val playbackBufferMs = safeBufferSeconds * 1_000
        val minimumBufferMs = maxOf(playbackBufferMs, if (isTelevision) 5_000 else 8_000)
        val maximumBufferMs = maxOf(minimumBufferMs * 4, if (isTelevision) 20_000 else 35_000)
        DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                minimumBufferMs,
                maximumBufferMs,
                playbackBufferMs,
                playbackBufferMs,
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()
    }

    val mediaSourceFactory = remember(context) {
        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent(SERIES_IPTV_USER_AGENT)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(35_000)
            .setDefaultRequestProperties(
                mapOf(
                    "Accept" to "*/*",
                    "Connection" to "keep-alive",
                ),
            )
        DefaultMediaSourceFactory(DefaultDataSource.Factory(context, httpDataSourceFactory))
    }

    val player = remember(loadControl, mediaSourceFactory, decoderMode) {
        val compatibilityMode = decoderMode.equals("Software", ignoreCase = true)
        val renderersFactory = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(compatibilityMode)

        ExoPlayer.Builder(context, renderersFactory)
            .setLoadControl(loadControl)
            .setMediaSourceFactory(mediaSourceFactory)
            .build()
            .apply {
                repeatMode = Player.REPEAT_MODE_OFF
                setHandleAudioBecomingNoisy(true)
            }
    }

    fun selectEntry(index: Int, resumePositionMs: Long, notify: Boolean) {
        val entry = entries.getOrNull(index) ?: return
        currentIndex = index
        sourceIndex = 0
        sameSourceRetries = 0
        pendingSeekMs = resumePositionMs.coerceAtLeast(0L)
        transitionLocked = false
        playerMessage = "Carregando T${entry.season.number} E${entry.episode.number}..."
        if (notify) onEpisodeChanged(entry.season, entry.episode)
    }

    LaunchedEffect(currentIndex, sourceIndex, currentSources) {
        val source = currentSources.getOrNull(sourceIndex)
        if (source == null) {
            playerMessage = "Este episódio não possui uma fonte válida."
            return@LaunchedEffect
        }
        player.setMediaItem(mediaItemForSeries(source))
        player.prepare()
        if (pendingSeekMs > 0L) {
            player.seekTo(pendingSeekMs)
            pendingSeekMs = 0L
        }
        player.playWhenReady = true
    }

    LaunchedEffect(player, currentIndex) {
        while (true) {
            delay(2_000)
            val entry = entries.getOrNull(currentIndex) ?: continue
            val duration = player.duration
            val position = player.currentPosition
            if (duration > 0L && position > 0L) {
                onProgress(entry.season, entry.episode, position, duration)
            }
        }
    }

    DisposableEffect(player, currentIndex, currentSources, automaticReconnect, hasNextEpisode) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> if (playerMessage == null) {
                        playerMessage = "Carregando episódio..."
                    }
                    Player.STATE_READY -> {
                        sameSourceRetries = 0
                        playerMessage = null
                    }
                    Player.STATE_ENDED -> {
                        if (hasNextEpisode && !transitionLocked) {
                            transitionLocked = true
                            val nextEntry = entries[currentIndex + 1]
                            playerMessage = "Próximo: T${nextEntry.season.number} E${nextEntry.episode.number}"
                            coroutineScope.launch {
                                delay(650)
                                selectEntry(currentIndex + 1, 0L, notify = true)
                            }
                        } else if (!hasNextEpisode) {
                            playerMessage = "Você terminou os episódios disponíveis."
                        }
                    }
                    else -> Unit
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                val diagnostic = error.errorCodeName
                if (!automaticReconnect) {
                    playerMessage = "Episódio interrompido. Reconexão automática desativada."
                    return
                }

                if (sameSourceRetries < SERIES_SOURCE_RETRY_LIMIT) {
                    sameSourceRetries += 1
                    playerMessage = "Reconectando ao episódio..."
                    coroutineScope.launch {
                        delay(1_200)
                        val source = currentSources.getOrNull(sourceIndex) ?: return@launch
                        player.setMediaItem(mediaItemForSeries(source))
                        player.prepare()
                        player.playWhenReady = true
                    }
                    return
                }

                val nextSourceIndex = sourceIndex + 1
                if (nextSourceIndex < currentSources.size) {
                    sourceIndex = nextSourceIndex
                    sameSourceRetries = 0
                    playerMessage = "Tentando fonte ${nextSourceIndex + 1}/${currentSources.size}..."
                } else {
                    playerMessage = "Não foi possível reproduzir este episódio. Erro: $diagnostic"
                }
            }
        }

        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    DisposableEffect(player) {
        onDispose {
            val entry = entries.getOrNull(currentIndex)
            val duration = player.duration
            val position = player.currentPosition
            if (entry != null && duration > 0L && position > 0L) {
                onProgress(entry.season, entry.episode, position, duration)
            }
            player.stop()
            player.clearMediaItems()
            player.release()
        }
    }

    BackHandler {
        if (episodeDrawerVisible) episodeDrawerVisible = false else onBack()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {
                    if (episodeDrawerVisible) episodeDrawerVisible = false else onBack()
                    true
                } else false
            },
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    this.player = player
                    keepScreenOn = true
                    useController = true
                    controllerAutoShow = true
                    setControllerShowTimeoutMs(if (isTelevision) 5_000 else 3_000)
                    setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    isFocusable = true
                    isFocusableInTouchMode = true
                    requestFocus()
                }
            },
            update = { playerView -> playerView.player = player },
        )

        SeriesPlayerHeader(
            seriesTitle = seriesTitle,
            currentEntry = currentEntry,
            isTelevision = isTelevision,
            onBack = onBack,
            onOpenEpisodes = { episodeDrawerVisible = true },
        )

        playerMessage?.let { message ->
            Text(
                text = message,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 17.sp else 14.sp,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(RonecaColors.SurfaceOverlay)
                    .border(1.dp, RonecaColors.Border, RoundedCornerShape(999.dp))
                    .padding(horizontal = 18.dp, vertical = 10.dp),
            )
        }

        if (episodeDrawerVisible) {
            EpisodeDrawer(
                seriesTitle = seriesTitle,
                seasons = seasons,
                currentEpisodeId = currentEntry?.episode?.id,
                isTelevision = isTelevision,
                onDismiss = { episodeDrawerVisible = false },
                onSelect = { season, episode ->
                    val index = entries.indexOfFirst { it.episode.id == episode.id }
                    if (index >= 0) {
                        episodeDrawerVisible = false
                        selectEntry(index, positionForEpisode(episode), notify = true)
                    }
                },
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
    }
}

@Composable
private fun SeriesPlayerHeader(
    seriesTitle: String,
    currentEntry: EpisodeEntry?,
    isTelevision: Boolean,
    onBack: () -> Unit,
    onOpenEpisodes: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xC4050505))
            .padding(horizontal = if (isTelevision) 24.dp else 14.dp, vertical = 11.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SeriesPlayerAction(label = "←", onClick = onBack)
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(if (isTelevision) 34.dp else 30.dp)
                    .background(RonecaColors.RedStrong),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "RONECAPLAYTV • SÉRIE",
                    color = RonecaColors.Primary,
                    fontSize = if (isTelevision) 10.sp else 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.4.sp,
                )
                Text(
                    text = buildString {
                        append(seriesTitle)
                        currentEntry?.let { append(" • T${it.season.number} E${it.episode.number}") }
                    },
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 17.sp else 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
            }
        }
        SeriesPlayerAction(label = "☰  Episódios", onClick = onOpenEpisodes)
    }
}

@Composable
private fun SeriesPlayerAction(label: String, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.SurfaceOverlay)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.RedStrong else RonecaColors.Primary.copy(alpha = 0.60f),
                shape = RoundedCornerShape(999.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 13.dp, vertical = 8.dp),
    ) {
        Text(text = label, color = RonecaColors.TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun EpisodeDrawer(
    seriesTitle: String,
    seasons: List<NativeSeason>,
    currentEpisodeId: String?,
    isTelevision: Boolean,
    onDismiss: () -> Unit,
    onSelect: (NativeSeason, NativeEpisode) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .width(if (isTelevision) 390.dp else 330.dp)
            .fillMaxHeight()
            .background(Color(0xF20A0908))
            .border(1.dp, RonecaColors.Border)
            .padding(15.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Temporadas e episódios",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 19.sp else 17.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "$seriesTitle • próximo episódio automático",
                    color = RonecaColors.TextSecondary,
                    fontSize = 11.sp,
                    maxLines = 1,
                )
            }
            SeriesPlayerAction(label = "×", onClick = onDismiss)
        }
        Spacer(modifier = Modifier.height(13.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            seasons.sortedBy(NativeSeason::number).forEach { season ->
                item(key = "season-${season.number}") {
                    Text(
                        text = "TEMPORADA ${season.number}",
                        color = RonecaColors.Primary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
                    )
                }
                items(
                    items = season.episodes.sortedBy(NativeEpisode::number),
                    key = { episode -> "${season.number}-${episode.id}" },
                ) { episode ->
                    EpisodeDrawerRow(
                        season = season,
                        episode = episode,
                        active = episode.id == currentEpisodeId,
                        isTelevision = isTelevision,
                        onClick = { if (episode.id != currentEpisodeId) onSelect(season, episode) },
                    )
                }
            }
        }
    }
}

@Composable
private fun EpisodeDrawerRow(
    season: NativeSeason,
    episode: NativeEpisode,
    active: Boolean,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(
                when {
                    focused -> RonecaColors.SurfaceRaised
                    active -> RonecaColors.Primary.copy(alpha = 0.12f)
                    else -> RonecaColors.Surface
                },
            )
            .border(
                width = if (focused || active) 2.dp else 1.dp,
                color = when {
                    focused -> RonecaColors.RedStrong
                    active -> RonecaColors.Primary
                    else -> RonecaColors.Border
                },
                shape = RoundedCornerShape(10.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 11.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(30.dp)
                .background(if (active) RonecaColors.RedStrong else RonecaColors.Primary),
        )
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "T${season.number} E${episode.number} • ${episode.name}",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 14.sp else 13.sp,
                fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
            )
            Text(
                text = if (active) "REPRODUZINDO AGORA" else episode.duration.orEmpty().ifBlank { "Selecionar episódio" },
                color = if (active) RonecaColors.RedStrong else RonecaColors.TextSecondary,
                fontSize = 9.sp,
                maxLines = 1,
            )
        }
        Text(
            text = if (active) "AGORA" else "▶",
            color = if (active) RonecaColors.RedStrong else RonecaColors.Primary,
            fontSize = if (active) 9.sp else 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

private fun mediaItemForSeries(url: String): MediaItem {
    val normalizedPath = url.substringBefore('?').substringBefore('#').lowercase()
    val mimeType = when {
        normalizedPath.endsWith(".m3u8") -> MimeTypes.APPLICATION_M3U8
        normalizedPath.endsWith(".ts") -> MimeTypes.VIDEO_MP2T
        normalizedPath.endsWith(".mkv") -> MimeTypes.VIDEO_MATROSKA
        normalizedPath.endsWith(".mp4") || normalizedPath.endsWith(".m4v") -> MimeTypes.VIDEO_MP4
        else -> null
    }

    return MediaItem.Builder()
        .setUri(url)
        .apply { mimeType?.let(::setMimeType) }
        .build()
}
