package com.ronecaplaytv.nativeapp.ui.player

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import androidx.tv.material3.Button
import androidx.tv.material3.Text
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

    val player = remember(sources, loadControl, mediaSourceFactory) {
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
                    prepare()
                    playWhenReady = true
                }
            }
    }

    DisposableEffect(player, sources) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> {
                        if (playerMessage == null) playerMessage = "Carregando transmissão..."
                    }
                    Player.STATE_READY -> {
                        sameSourceRetries = 0
                        playerMessage = null
                    }
                    Player.STATE_ENDED -> {
                        playerMessage = "Reprodução finalizada."
                    }
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
            player.removeListener(listener)
            player.stop()
            player.clearMediaItems()
            player.release()
        }
    }

    BackHandler(onBack = onBack)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
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
            update = { playerView ->
                playerView.player = player
            },
        )

        Text(
            text = title,
            color = Color.White,
            fontSize = if (isTelevision) 22.sp else 17.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .background(Color(0x99000000))
                .padding(horizontal = 18.dp, vertical = 10.dp),
        )

        Button(
            onClick = onBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(if (isTelevision) 32.dp else 16.dp),
        ) {
            Text(
                text = "Voltar",
                fontSize = if (isTelevision) 19.sp else 16.sp,
            )
        }

        playerMessage?.let { message ->
            Text(
                text = message,
                color = Color.White,
                fontSize = if (isTelevision) 20.sp else 15.sp,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .background(Color(0xE6141824))
                    .padding(horizontal = 20.dp, vertical = 12.dp),
            )
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
