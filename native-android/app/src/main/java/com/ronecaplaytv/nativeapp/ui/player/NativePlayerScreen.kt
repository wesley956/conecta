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
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val IPTV_USER_AGENT = "VLC/3.0.20 LibVLC/3.0.20"
private const val SAME_SOURCE_RETRY_LIMIT = 1

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun NativePlayerScreen(
    isTelevision: Boolean,
    title: String,
    streamUrls: List<String>,
    initialPositionMs: Long = 0L,
    relatedChannels: List<NativeChannel> = emptyList(),
    onProgress: (positionMs: Long, durationMs: Long) -> Unit = { _, _ -> },
    onSelectChannel: (NativeChannel) -> Unit = {},
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val sources = remember(streamUrls) {
        streamUrls
            .map(String::trim)
            .filter { it.startsWith("https://") || it.startsWith("http://") }
            .distinct()
    }
    var sourceIndex by remember(sources) { mutableIntStateOf(0) }
    var sameSourceRetries by remember(sources) { mutableIntStateOf(0) }
    var channelDrawerVisible by remember { mutableStateOf(false) }
    var playerMessage by remember(sources) {
        mutableStateOf(
            if (sources.isEmpty()) "Este conteúdo não possui uma fonte de reprodução válida." else null,
        )
    }

    val loadControl = remember(isTelevision) {
        DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                if (isTelevision) 5_000 else 8_000,
                if (isTelevision) 20_000 else 35_000,
                1_000,
                if (isTelevision) 1_500 else 2_500,
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
        val dataSourceFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)
        DefaultMediaSourceFactory(dataSourceFactory)
    }

    val player = remember(sources, loadControl, mediaSourceFactory, initialPositionMs) {
        val renderersFactory = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(true)

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

    LaunchedEffect(player) {
        while (true) {
            delay(2_000)
            val duration = player.duration
            val position = player.currentPosition
            if (duration > 0L && position > 0L) onProgress(position, duration)
        }
    }

    DisposableEffect(player, sources) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> if (playerMessage == null) playerMessage = "Carregando transmissão..."
                    Player.STATE_READY -> {
                        sameSourceRetries = 0
                        playerMessage = null
                    }
                    Player.STATE_ENDED -> playerMessage = "Reprodução finalizada."
                    else -> Unit
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                val currentPosition = sourceIndex + 1
                val diagnostic = error.errorCodeName

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

    BackHandler {
        if (channelDrawerVisible) channelDrawerVisible = false else onBack()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {
                    if (channelDrawerVisible) channelDrawerVisible = false else onBack()
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

        PlayerHeader(
            title = title,
            isTelevision = isTelevision,
            hasChannelDrawer = relatedChannels.isNotEmpty(),
            onBack = onBack,
            onOpenChannels = { channelDrawerVisible = true },
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

        if (channelDrawerVisible) {
            ChannelDrawer(
                channels = relatedChannels,
                isTelevision = isTelevision,
                onDismiss = { channelDrawerVisible = false },
                onSelect = { channel ->
                    channelDrawerVisible = false
                    onSelectChannel(channel)
                },
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
    }
}

@Composable
private fun PlayerHeader(
    title: String,
    isTelevision: Boolean,
    hasChannelDrawer: Boolean,
    onBack: () -> Unit,
    onOpenChannels: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xB3050505))
            .padding(horizontal = if (isTelevision) 26.dp else 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PlayerAction(label = "←", onClick = onBack)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "RONECAPLAYTV",
                    color = RonecaColors.Primary,
                    fontSize = if (isTelevision) 10.sp else 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.8.sp,
                )
                Text(
                    text = title,
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 17.sp else 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
            }
        }
        if (hasChannelDrawer) {
            PlayerAction(label = "☰  Canais", onClick = onOpenChannels)
        }
    }
}

@Composable
private fun PlayerAction(label: String, onClick: () -> Unit) {
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
private fun ChannelDrawer(
    channels: List<NativeChannel>,
    isTelevision: Boolean,
    onDismiss: () -> Unit,
    onSelect: (NativeChannel) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .width(if (isTelevision) 360.dp else 300.dp)
            .fillMaxHeight()
            .background(Color(0xF20A0908))
            .border(1.dp, RonecaColors.Border)
            .padding(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Mais canais",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 20.sp else 17.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Da mesma categoria",
                    color = RonecaColors.TextSecondary,
                    fontSize = 12.sp,
                )
            }
            PlayerAction(label = "×", onClick = onDismiss)
        }
        Spacer(modifier = Modifier.height(14.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            items(channels, key = NativeChannel::id) { channel ->
                var focused by remember { mutableStateOf(false) }
                val interactionSource = remember { MutableInteractionSource() }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
                        .border(
                            width = if (focused) 2.dp else 1.dp,
                            color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                            shape = RoundedCornerShape(10.dp),
                        )
                        .onFocusChanged { focused = it.isFocused }
                        .clickable(
                            interactionSource = interactionSource,
                            indication = null,
                            onClick = { onSelect(channel) },
                        )
                        .focusable()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .width(3.dp)
                            .height(28.dp)
                            .background(if (focused) RonecaColors.RedStrong else RonecaColors.Primary),
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = channel.name,
                            color = RonecaColors.TextPrimary,
                            fontSize = if (isTelevision) 14.sp else 13.sp,
                            maxLines = 1,
                        )
                        Text(
                            text = channel.groupTitle,
                            color = RonecaColors.TextSecondary,
                            fontSize = 10.sp,
                            maxLines = 1,
                        )
                    }
                    Text(text = "▶", color = RonecaColors.Primary, fontSize = 13.sp)
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
