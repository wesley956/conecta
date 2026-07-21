package com.ronecaplaytv.nativeapp.ui.player

import android.view.KeyEvent as AndroidKeyEvent
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
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
private const val SERIES_CONTROLS_TIMEOUT_MS = 5_000L
private const val SERIES_SEEK_STEP_MS = 10_000L

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
    val rootFocusRequester = remember { FocusRequester() }
    val playPauseFocusRequester = remember { FocusRequester() }
    val drawerFirstItemFocusRequester = remember { FocusRequester() }
    val touchInteraction = remember { MutableInteractionSource() }

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
    var controlsVisible by remember { mutableStateOf(true) }
    var interactionVersion by remember { mutableLongStateOf(0L) }
    var isPlaying by remember { mutableStateOf(false) }
    var positionMs by remember { mutableLongStateOf(initialPositionMs.coerceAtLeast(0L)) }
    var durationMs by remember { mutableLongStateOf(0L) }
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

    fun markInteraction(showControls: Boolean = true) {
        interactionVersion += 1L
        if (showControls) controlsVisible = true
    }

    fun requestPlayPauseFocus() {
        coroutineScope.launch {
            delay(60)
            runCatching { playPauseFocusRequester.requestFocus() }
        }
    }

    fun togglePlayPause() {
        if (player.isPlaying) player.pause() else player.play()
        markInteraction()
        requestPlayPauseFocus()
    }

    fun seekBy(deltaMs: Long) {
        val duration = player.duration
        if (duration <= 0L) return
        player.seekTo((player.currentPosition + deltaMs).coerceIn(0L, duration))
        markInteraction()
        requestPlayPauseFocus()
    }

    fun closeDrawer() {
        episodeDrawerVisible = false
        markInteraction()
        requestPlayPauseFocus()
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

    LaunchedEffect(Unit) {
        delay(80)
        runCatching { rootFocusRequester.requestFocus() }
        requestPlayPauseFocus()
    }

    LaunchedEffect(controlsVisible, isPlaying, episodeDrawerVisible, interactionVersion) {
        if (controlsVisible && isPlaying && !episodeDrawerVisible) {
            delay(SERIES_CONTROLS_TIMEOUT_MS)
            controlsVisible = false
            runCatching { rootFocusRequester.requestFocus() }
        }
    }

    LaunchedEffect(episodeDrawerVisible, currentEntry?.episode?.id) {
        if (episodeDrawerVisible && entries.isNotEmpty()) {
            delay(80)
            runCatching { drawerFirstItemFocusRequester.requestFocus() }
        }
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
            delay(500)
            val entry = entries.getOrNull(currentIndex) ?: continue
            val duration = player.duration
            val position = player.currentPosition
            positionMs = position.coerceAtLeast(0L)
            durationMs = duration.takeIf { it > 0L } ?: 0L
            if (duration > 0L && position > 0L) {
                onProgress(entry.season, entry.episode, position, duration)
            }
        }
    }

    DisposableEffect(player, currentIndex, currentSources, automaticReconnect, hasNextEpisode) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(value: Boolean) {
                isPlaying = value
                if (!value) controlsVisible = true
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> if (playerMessage == null) {
                        playerMessage = "Carregando episódio..."
                    }
                    Player.STATE_READY -> {
                        sameSourceRetries = 0
                        playerMessage = null
                        isPlaying = player.isPlaying
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

    DisposableEffect(player) {
        val registration = NativePlaybackKeyRouter.register { event ->
            val supported = event.keyCode == AndroidKeyEvent.KEYCODE_MEDIA_PLAY_PAUSE ||
                event.keyCode == AndroidKeyEvent.KEYCODE_HEADSETPHOOK ||
                event.keyCode == AndroidKeyEvent.KEYCODE_MEDIA_PLAY ||
                event.keyCode == AndroidKeyEvent.KEYCODE_MEDIA_PAUSE ||
                event.keyCode == AndroidKeyEvent.KEYCODE_MEDIA_FAST_FORWARD ||
                event.keyCode == AndroidKeyEvent.KEYCODE_MEDIA_REWIND

            if (!supported) {
                false
            } else {
                if (event.action == AndroidKeyEvent.ACTION_UP) {
                    when (event.keyCode) {
                        AndroidKeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                        AndroidKeyEvent.KEYCODE_HEADSETPHOOK,
                        -> togglePlayPause()
                        AndroidKeyEvent.KEYCODE_MEDIA_PLAY -> {
                            player.play()
                            markInteraction()
                            requestPlayPauseFocus()
                        }
                        AndroidKeyEvent.KEYCODE_MEDIA_PAUSE -> {
                            player.pause()
                            markInteraction()
                            requestPlayPauseFocus()
                        }
                        AndroidKeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> seekBy(SERIES_SEEK_STEP_MS)
                        AndroidKeyEvent.KEYCODE_MEDIA_REWIND -> seekBy(-SERIES_SEEK_STEP_MS)
                    }
                }
                true
            }
        }
        onDispose { NativePlaybackKeyRouter.unregister(registration) }
    }

    BackHandler {
        if (episodeDrawerVisible) closeDrawer() else onBack()
    }

    val chromeTitle = buildString {
        append(seriesTitle)
        currentEntry?.let { append(" • T${it.season.number} E${it.episode.number}") }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(rootFocusRequester)
            .focusable()
            .onPreviewKeyEvent { event ->
                when {
                    event.type == KeyEventType.KeyUp && event.key == Key.Back -> {
                        if (episodeDrawerVisible) closeDrawer() else onBack()
                        true
                    }
                    episodeDrawerVisible -> false
                    event.type == KeyEventType.KeyUp &&
                        (event.key == Key.DirectionCenter ||
                            event.key == Key.Enter ||
                            event.key == Key.NumPadEnter ||
                            event.key == Key.Spacebar) &&
                        !controlsVisible -> {
                        togglePlayPause()
                        true
                    }
                    event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft && !controlsVisible -> {
                        seekBy(-SERIES_SEEK_STEP_MS)
                        true
                    }
                    event.type == KeyEventType.KeyDown && event.key == Key.DirectionRight && !controlsVisible -> {
                        seekBy(SERIES_SEEK_STEP_MS)
                        true
                    }
                    event.type == KeyEventType.KeyDown &&
                        (event.key == Key.DirectionUp || event.key == Key.DirectionDown) &&
                        !controlsVisible -> {
                        markInteraction()
                        requestPlayPauseFocus()
                        true
                    }
                    else -> false
                }
            },
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    this.player = player
                    keepScreenOn = true
                    useController = false
                    setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    isFocusable = false
                    isFocusableInTouchMode = false
                }
            },
            update = { playerView -> playerView.player = player },
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = touchInteraction,
                    indication = null,
                    onClick = {
                        controlsVisible = !controlsVisible
                        markInteraction(showControls = controlsVisible)
                        if (controlsVisible) requestPlayPauseFocus()
                    },
                ),
        )

        NativePlayerChrome(
            title = chromeTitle,
            eyebrow = "RONECAPLAYTV • SÉRIE",
            live = false,
            isTelevision = isTelevision,
            controlsVisible = controlsVisible,
            drawerVisible = episodeDrawerVisible,
            drawerLabel = "Episódios",
            isPlaying = isPlaying,
            positionMs = positionMs,
            durationMs = durationMs,
            playPauseFocusRequester = playPauseFocusRequester,
            onBack = onBack,
            onOpenDrawer = {
                episodeDrawerVisible = true
                controlsVisible = true
                interactionVersion += 1L
            },
            onSeekBack = { seekBy(-SERIES_SEEK_STEP_MS) },
            onTogglePlayPause = ::togglePlayPause,
            onSeekForward = { seekBy(SERIES_SEEK_STEP_MS) },
        )

        playerMessage?.let { message ->
            Text(
                text = message,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 17.sp else 14.sp,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = if (controlsVisible) 150.dp else 24.dp)
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
                currentSeasonNumber = currentEntry?.season?.number,
                isTelevision = isTelevision,
                firstItemFocusRequester = drawerFirstItemFocusRequester,
                onDismiss = ::closeDrawer,
                onSelect = { season, episode ->
                    val index = entries.indexOfFirst { it.episode.id == episode.id }
                    if (index >= 0) {
                        closeDrawer()
                        selectEntry(index, positionForEpisode(episode), notify = true)
                    }
                },
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
    }
}

@Composable
private fun EpisodeDrawer(
    seriesTitle: String,
    seasons: List<NativeSeason>,
    currentEpisodeId: String?,
    currentSeasonNumber: Int?,
    isTelevision: Boolean,
    firstItemFocusRequester: FocusRequester,
    onDismiss: () -> Unit,
    onSelect: (NativeSeason, NativeEpisode) -> Unit,
    modifier: Modifier = Modifier,
) {
    val orderedSeasons = remember(seasons, currentSeasonNumber, currentEpisodeId) {
        seasons.sortedWith(
            compareByDescending<NativeSeason> { it.number == currentSeasonNumber }
                .thenBy(NativeSeason::number),
        )
    }

    Column(
        modifier = modifier
            .width(if (isTelevision) 410.dp else 340.dp)
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
                    text = "$seriesTitle • episódio atual primeiro",
                    color = RonecaColors.TextSecondary,
                    fontSize = 11.sp,
                    maxLines = 1,
                )
            }
            NativePlayerAction(label = "×", contentDescription = "Fechar episódios", onClick = onDismiss)
        }
        Spacer(modifier = Modifier.height(13.dp))

        var firstEpisodeRendered = false
        LazyColumn(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            orderedSeasons.forEach { season ->
                val orderedEpisodes = season.episodes.sortedWith(
                    compareByDescending<NativeEpisode> { it.id == currentEpisodeId }
                        .thenBy(NativeEpisode::number),
                )
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
                    items = orderedEpisodes,
                    key = { episode -> "${season.number}-${episode.id}" },
                ) { episode ->
                    val shouldReceiveInitialFocus = !firstEpisodeRendered
                    firstEpisodeRendered = true
                    EpisodeDrawerRow(
                        season = season,
                        episode = episode,
                        active = episode.id == currentEpisodeId,
                        isTelevision = isTelevision,
                        modifier = if (shouldReceiveInitialFocus) {
                            Modifier.focusRequester(firstItemFocusRequester)
                        } else {
                            Modifier
                        },
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
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    var focused by remember(episode.id) { mutableStateOf(false) }
    val interactionSource = remember(episode.id) { MutableInteractionSource() }
    Row(
        modifier = modifier
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
