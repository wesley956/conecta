package com.ronecaplaytv.nativeapp.ui.player

import android.os.SystemClock
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
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val SERIES_IPTV_USER_AGENT = "VLC/3.0.20 LibVLC/3.0.20"
private const val SERIES_SOURCE_RETRY_LIMIT = 1
private const val SERIES_SEEK_STEP_MS = 10_000L
private const val SERIES_STARTUP_TIMEOUT_MS = 20_000L
private const val SERIES_STALL_TIMEOUT_MS = 25_000L
private const val PROGRESS_SAVE_INTERVAL_MS = 10_000L

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
    onTerminalPlaybackFailure: (reason: String, positionMs: Long, durationMs: Long) -> Unit = { _, _, _ -> },
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val drawerFirstItemFocusRequester = remember { FocusRequester() }

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
    var media3Controller by remember { mutableStateOf<RonecaMedia3Controller?>(null) }
    val currentControlsVisible = rememberUpdatedState(controlsVisible)
    val currentEpisodeDrawerVisible = rememberUpdatedState(episodeDrawerVisible)
    var recoveryInProgress by remember(entries) { mutableStateOf(false) }
    var terminalFailureReported by remember(entries) { mutableStateOf(false) }
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

    val loadControl = remember(isTelevision, bufferSeconds) {
        ronecaLoadControl(isTelevision, bufferSeconds)
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

    fun recoverOrFail(diagnostic: String) {
        if (!automaticReconnect) {
            playerMessage = "Episódio interrompido. Reconexão automática desativada."
            return
        }
        if (recoveryInProgress || terminalFailureReported) return

        recoveryInProgress = true
        val resumePositionMs = player.currentPosition.coerceAtLeast(0L)
        if (sameSourceRetries < SERIES_SOURCE_RETRY_LIMIT) {
            sameSourceRetries += 1
            playerMessage = "Reconectando ao episódio..."
            coroutineScope.launch {
                delay(1_200)
                currentSources.getOrNull(sourceIndex)?.let { source ->
                    player.setMediaItem(mediaItemForSeries(source))
                    if (resumePositionMs > 0L) player.seekTo(resumePositionMs)
                    player.prepare()
                    player.playWhenReady = true
                }
                recoveryInProgress = false
            }
            return
        }

        val nextSourceIndex = sourceIndex + 1
        if (nextSourceIndex < currentSources.size) {
            sourceIndex = nextSourceIndex
            sameSourceRetries = 0
            pendingSeekMs = resumePositionMs
            playerMessage = "Tentando fonte ${nextSourceIndex + 1}/${currentSources.size}..."
            recoveryInProgress = false
            return
        }

        recoveryInProgress = false
        terminalFailureReported = true
        playerMessage = "Lista ativa indisponível. Ativando a lista reserva..."
        onTerminalPlaybackFailure(
            diagnostic,
            player.currentPosition.coerceAtLeast(0L),
            player.duration.coerceAtLeast(0L),
        )
    }

    fun showPlayPauseControls() {
        controlsVisible = true
        media3Controller?.showAndFocusPlayPause()
    }

    fun showTimeBarControls() {
        controlsVisible = true
        media3Controller?.showAndFocusTimeBar()
    }

    fun togglePlayPause() {
        if (player.isPlaying) player.pause() else player.play()
        showPlayPauseControls()
    }

    fun seekBy(deltaMs: Long) {
        val duration = player.duration
        if (duration <= 0L || !player.isCurrentMediaItemSeekable) return
        player.seekTo((player.currentPosition + deltaMs).coerceIn(0L, duration))
        showTimeBarControls()
    }

    fun openDrawer() {
        episodeDrawerVisible = true
        controlsVisible = false
        media3Controller?.hideController()
    }

    fun closeDrawer() {
        episodeDrawerVisible = false
        coroutineScope.launch {
            delay(80)
            showPlayPauseControls()
        }
    }

    fun selectEntry(index: Int, resumePositionMs: Long, notify: Boolean) {
        val entry = entries.getOrNull(index) ?: return
        currentIndex = index
        sourceIndex = 0
        sameSourceRetries = 0
        pendingSeekMs = resumePositionMs.coerceAtLeast(0L)
        transitionLocked = false
        recoveryInProgress = false
        terminalFailureReported = false
        playerMessage = "Carregando T${entry.season.number} E${entry.episode.number}..."
        if (notify) onEpisodeChanged(entry.season, entry.episode)
    }

    LaunchedEffect(media3Controller) {
        media3Controller?.showAndFocusPlayPause()
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

    LaunchedEffect(player, currentIndex, sourceIndex, automaticReconnect) {
        var stalledSinceMs: Long? = null
        var lastPositionMs = -1L

        while (true) {
            delay(1_000)
            if (!player.playWhenReady || player.playbackState == Player.STATE_ENDED) {
                stalledSinceMs = null
                lastPositionMs = player.currentPosition
                continue
            }

            val positionMs = player.currentPosition
            val advancing = positionMs > lastPositionMs + 250L
            if (advancing || player.isPlaying) {
                stalledSinceMs = null
                sameSourceRetries = 0
                terminalFailureReported = false
                lastPositionMs = positionMs
                continue
            }

            val now = SystemClock.elapsedRealtime()
            val startedAt = stalledSinceMs ?: now.also { stalledSinceMs = it }
            val timeoutMs = if (positionMs <= 1_000L) {
                SERIES_STARTUP_TIMEOUT_MS
            } else {
                SERIES_STALL_TIMEOUT_MS
            }

            if (now - startedAt >= timeoutMs) {
                stalledSinceMs = now
                recoverOrFail("tempo limite de carregamento do episódio")
            }
            lastPositionMs = positionMs
        }
    }

    LaunchedEffect(player, currentIndex) {
        while (true) {
            delay(PROGRESS_SAVE_INTERVAL_MS)
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
                        recoveryInProgress = false
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
                recoverOrFail(error.errorCodeName)
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

    DisposableEffect(player, media3Controller) {
        val registration = NativePlaybackKeyRouter.register { event ->
            val actionUp = event.action == AndroidKeyEvent.ACTION_UP
            val initialActionDown =
                event.action == AndroidKeyEvent.ACTION_DOWN && event.repeatCount == 0
            val actionDown = event.action == AndroidKeyEvent.ACTION_DOWN

            when (event.keyCode) {
                AndroidKeyEvent.KEYCODE_BACK -> {
                    if (actionUp) {
                        if (currentEpisodeDrawerVisible.value) closeDrawer() else onBack()
                    }
                    true
                }

                AndroidKeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                AndroidKeyEvent.KEYCODE_HEADSETHOOK,
                -> {
                    if (initialActionDown) togglePlayPause()
                    true
                }

                AndroidKeyEvent.KEYCODE_MEDIA_PLAY -> {
                    if (initialActionDown) {
                        player.play()
                        showPlayPauseControls()
                    }
                    true
                }

                AndroidKeyEvent.KEYCODE_MEDIA_PAUSE -> {
                    if (initialActionDown) {
                        player.pause()
                        showPlayPauseControls()
                    }
                    true
                }

                AndroidKeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                    if (initialActionDown) seekBy(SERIES_SEEK_STEP_MS)
                    true
                }

                AndroidKeyEvent.KEYCODE_MEDIA_REWIND -> {
                    if (initialActionDown) seekBy(-SERIES_SEEK_STEP_MS)
                    true
                }

                AndroidKeyEvent.KEYCODE_DPAD_CENTER,
                AndroidKeyEvent.KEYCODE_ENTER,
                AndroidKeyEvent.KEYCODE_NUMPAD_ENTER,
                AndroidKeyEvent.KEYCODE_SPACE,
                -> {
                    if (currentEpisodeDrawerVisible.value || currentControlsVisible.value) {
                        false
                    } else {
                        if (initialActionDown) togglePlayPause()
                        true
                    }
                }

                AndroidKeyEvent.KEYCODE_DPAD_LEFT -> {
                    if (currentEpisodeDrawerVisible.value || currentControlsVisible.value) {
                        false
                    } else {
                        if (actionDown) seekBy(-SERIES_SEEK_STEP_MS)
                        true
                    }
                }

                AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                    if (currentEpisodeDrawerVisible.value || currentControlsVisible.value) {
                        false
                    } else {
                        if (actionDown) seekBy(SERIES_SEEK_STEP_MS)
                        true
                    }
                }

                AndroidKeyEvent.KEYCODE_DPAD_UP,
                AndroidKeyEvent.KEYCODE_DPAD_DOWN,
                -> {
                    if (currentEpisodeDrawerVisible.value || currentControlsVisible.value) {
                        false
                    } else {
                        if (actionDown) showPlayPauseControls()
                        true
                    }
                }

                else -> false
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
            .background(Color.Black),
    ) {
        RonecaMedia3PlayerView(
            player = player,
            title = chromeTitle,
            eyebrow = "RONECAPLAYTV • SÉRIE",
            live = false,
            isTelevision = isTelevision,
            drawerLabel = "Episódios",
            drawerVisible = episodeDrawerVisible,
            onBack = onBack,
            onOpenDrawer = { openDrawer() },
            onControllerVisibilityChanged = { controlsVisible = it },
            onControllerReady = { media3Controller = it },
            modifier = Modifier.fillMaxSize(),
        )

        playerMessage?.let { message ->
            Text(
                text = message,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 17.sp else 14.sp,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = if (controlsVisible) 112.dp else 24.dp)
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
                    focused -> RonecaColors.Focus
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
