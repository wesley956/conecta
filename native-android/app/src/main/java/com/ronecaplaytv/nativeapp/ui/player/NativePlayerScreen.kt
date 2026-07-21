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
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val IPTV_USER_AGENT = "VLC/3.0.20 LibVLC/3.0.20"
private const val SAME_SOURCE_RETRY_LIMIT = 1
private const val PLAYER_CONTROLS_TIMEOUT_MS = 5_000L
private const val PLAYER_SEEK_STEP_MS = 10_000L

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun NativePlayerScreen(
    isTelevision: Boolean,
    title: String,
    streamUrls: List<String>,
    initialPositionMs: Long = 0L,
    relatedChannels: List<NativeChannel> = emptyList(),
    currentChannelId: String? = null,
    decoderMode: String = "Hardware",
    bufferSeconds: Int = 5,
    automaticReconnect: Boolean = true,
    onProgress: (positionMs: Long, durationMs: Long) -> Unit = { _, _ -> },
    onSelectChannel: (NativeChannel) -> Unit = {},
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val rootFocusRequester = remember { FocusRequester() }
    val playPauseFocusRequester = remember { FocusRequester() }
    val drawerFirstItemFocusRequester = remember { FocusRequester() }
    val touchInteraction = remember { MutableInteractionSource() }

    val sources = remember(streamUrls) {
        streamUrls
            .map(String::trim)
            .filter { it.startsWith("https://") || it.startsWith("http://") }
            .distinct()
    }
    val safeBufferSeconds = bufferSeconds.coerceIn(2, 10)
    var sourceIndex by remember(sources) { mutableIntStateOf(0) }
    var sameSourceRetries by remember(sources) { mutableIntStateOf(0) }
    var channelDrawerVisible by remember { mutableStateOf(false) }
    var controlsVisible by remember { mutableStateOf(true) }
    var interactionVersion by remember { mutableLongStateOf(0L) }
    var isPlaying by remember { mutableStateOf(false) }
    var positionMs by remember { mutableLongStateOf(initialPositionMs.coerceAtLeast(0L)) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var playerMessage by remember(sources) {
        mutableStateOf(
            if (sources.isEmpty()) "Este conteúdo não possui uma fonte de reprodução válida." else null,
        )
    }

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
            .setUserAgent(IPTV_USER_AGENT)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(35_000)
            .setDefaultRequestProperties(
                mapOf(
                    "Accept" to "*/*",
                    "Connection" to "keep-alive",
                    "Icy-MetaData" to "1",
                ),
            )
        DefaultMediaSourceFactory(DefaultDataSource.Factory(context, httpDataSourceFactory))
    }

    val player = remember(
        sources,
        loadControl,
        mediaSourceFactory,
        initialPositionMs,
        decoderMode,
    ) {
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
                sources.firstOrNull()?.let { firstSource ->
                    setMediaItem(mediaItemFor(firstSource))
                    if (initialPositionMs > 0L) seekTo(initialPositionMs)
                    prepare()
                    playWhenReady = true
                }
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
        channelDrawerVisible = false
        markInteraction()
        requestPlayPauseFocus()
    }

    LaunchedEffect(Unit) {
        delay(80)
        runCatching { rootFocusRequester.requestFocus() }
        requestPlayPauseFocus()
    }

    LaunchedEffect(controlsVisible, isPlaying, channelDrawerVisible, interactionVersion) {
        if (controlsVisible && isPlaying && !channelDrawerVisible) {
            delay(PLAYER_CONTROLS_TIMEOUT_MS)
            controlsVisible = false
            runCatching { rootFocusRequester.requestFocus() }
        }
    }

    LaunchedEffect(channelDrawerVisible, relatedChannels, currentChannelId) {
        if (channelDrawerVisible && relatedChannels.isNotEmpty()) {
            delay(80)
            runCatching { drawerFirstItemFocusRequester.requestFocus() }
        }
    }

    LaunchedEffect(player) {
        while (true) {
            delay(500)
            val duration = player.duration
            val position = player.currentPosition
            positionMs = position.coerceAtLeast(0L)
            durationMs = duration.takeIf { it > 0L } ?: 0L
            if (duration > 0L && position > 0L) onProgress(position, duration)
        }
    }

    DisposableEffect(player, sources, automaticReconnect) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(value: Boolean) {
                isPlaying = value
                if (!value) controlsVisible = true
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> if (playerMessage == null) {
                        playerMessage = "Carregando transmissão..."
                    }
                    Player.STATE_READY -> {
                        sameSourceRetries = 0
                        playerMessage = null
                        isPlaying = player.isPlaying
                    }
                    Player.STATE_ENDED -> playerMessage = "Reprodução finalizada."
                    else -> Unit
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                val currentPosition = sourceIndex + 1
                val diagnostic = error.errorCodeName

                if (!automaticReconnect) {
                    playerMessage = "Transmissão interrompida. Reconexão automática desativada."
                    return
                }

                if (sameSourceRetries < SAME_SOURCE_RETRY_LIMIT) {
                    sameSourceRetries += 1
                    playerMessage = "Reconectando à fonte $currentPosition/${sources.size}..."
                    coroutineScope.launch {
                        delay(1_200)
                        if (sourceIndex < sources.size) {
                            player.setMediaItem(mediaItemFor(sources[sourceIndex]))
                            player.prepare()
                            player.playWhenReady = true
                        }
                    }
                    return
                }

                val nextIndex = sourceIndex + 1
                if (nextIndex < sources.size) {
                    sourceIndex = nextIndex
                    sameSourceRetries = 0
                    playerMessage = "Fonte $currentPosition falhou ($diagnostic). Tentando ${nextIndex + 1}/${sources.size}..."
                    player.setMediaItem(mediaItemFor(sources[nextIndex]))
                    player.prepare()
                    player.playWhenReady = true
                } else {
                    playerMessage = "Não foi possível reproduzir. Erro: $diagnostic"
                }
            }
        }

        player.addListener(listener)
        onDispose {
            val duration = player.duration
            val position = player.currentPosition
            if (duration > 0L && position > 0L) onProgress(position, duration)
            player.removeListener(listener)
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
                        AndroidKeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> seekBy(PLAYER_SEEK_STEP_MS)
                        AndroidKeyEvent.KEYCODE_MEDIA_REWIND -> seekBy(-PLAYER_SEEK_STEP_MS)
                    }
                }
                true
            }
        }
        onDispose { NativePlaybackKeyRouter.unregister(registration) }
    }

    BackHandler {
        if (channelDrawerVisible) closeDrawer() else onBack()
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
                        if (channelDrawerVisible) closeDrawer() else onBack()
                        true
                    }
                    channelDrawerVisible -> false
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
                        seekBy(-PLAYER_SEEK_STEP_MS)
                        true
                    }
                    event.type == KeyEventType.KeyDown && event.key == Key.DirectionRight && !controlsVisible -> {
                        seekBy(PLAYER_SEEK_STEP_MS)
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
            title = title,
            eyebrow = "RONECAPLAYTV",
            live = currentChannelId != null,
            isTelevision = isTelevision,
            controlsVisible = controlsVisible,
            drawerVisible = channelDrawerVisible,
            drawerLabel = relatedChannels.takeIf { it.isNotEmpty() }?.let { "Canais" },
            isPlaying = isPlaying,
            positionMs = positionMs,
            durationMs = durationMs,
            playPauseFocusRequester = playPauseFocusRequester,
            onBack = onBack,
            onOpenDrawer = if (relatedChannels.isNotEmpty()) {
                {
                    channelDrawerVisible = true
                    controlsVisible = true
                    interactionVersion += 1L
                }
            } else {
                null
            },
            onSeekBack = { seekBy(-PLAYER_SEEK_STEP_MS) },
            onTogglePlayPause = ::togglePlayPause,
            onSeekForward = { seekBy(PLAYER_SEEK_STEP_MS) },
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

        if (channelDrawerVisible) {
            ChannelDrawer(
                channels = relatedChannels,
                currentChannelId = currentChannelId,
                isTelevision = isTelevision,
                firstItemFocusRequester = drawerFirstItemFocusRequester,
                onDismiss = ::closeDrawer,
                onSelect = { channel ->
                    closeDrawer()
                    onSelectChannel(channel)
                },
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
    }
}

@Composable
private fun ChannelDrawer(
    channels: List<NativeChannel>,
    currentChannelId: String?,
    isTelevision: Boolean,
    firstItemFocusRequester: FocusRequester,
    onDismiss: () -> Unit,
    onSelect: (NativeChannel) -> Unit,
    modifier: Modifier = Modifier,
) {
    val orderedChannels = remember(channels, currentChannelId) {
        channels.sortedByDescending { it.id == currentChannelId }
    }

    Column(
        modifier = modifier
            .width(if (isTelevision) 360.dp else 300.dp)
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
                    text = "Canais da categoria",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 19.sp else 17.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "${channels.size} disponíveis • atual primeiro",
                    color = RonecaColors.TextSecondary,
                    fontSize = 11.sp,
                )
            }
            NativePlayerAction(label = "×", contentDescription = "Fechar canais", onClick = onDismiss)
        }
        Spacer(modifier = Modifier.height(13.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(orderedChannels, key = NativeChannel::id) { channel ->
                val active = channel.id == currentChannelId
                var focused by remember(channel.id) { mutableStateOf(false) }
                val interactionSource = remember(channel.id) { MutableInteractionSource() }
                val focusModifier = if (channel == orderedChannels.firstOrNull()) {
                    Modifier.focusRequester(firstItemFocusRequester)
                } else {
                    Modifier
                }
                Row(
                    modifier = focusModifier
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
                        .clickable(
                            interactionSource = interactionSource,
                            indication = null,
                            onClick = { if (!active) onSelect(channel) },
                        )
                        .focusable()
                        .padding(horizontal = 11.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .width(3.dp)
                            .height(28.dp)
                            .background(if (active) RonecaColors.RedStrong else RonecaColors.Primary),
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = channel.name,
                            color = RonecaColors.TextPrimary,
                            fontSize = if (isTelevision) 14.sp else 13.sp,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                            maxLines = 1,
                        )
                        Text(
                            text = if (active) "REPRODUZINDO AGORA" else channel.groupTitle,
                            color = if (active) RonecaColors.RedStrong else RonecaColors.TextSecondary,
                            fontSize = 9.sp,
                            maxLines = 1,
                        )
                    }
                    Text(
                        text = if (active) "NO AR" else "▶",
                        color = if (active) RonecaColors.RedStrong else RonecaColors.Primary,
                        fontSize = if (active) 9.sp else 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

private fun mediaItemFor(url: String): MediaItem {
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
