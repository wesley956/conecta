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
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Button
import androidx.tv.material3.Text

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun NativePlayerScreen(
    isTelevision: Boolean,
    title: String,
    streamUrls: List<String>,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val sources = remember(streamUrls) {
        streamUrls
            .map(String::trim)
            .filter { it.startsWith("https://") || it.startsWith("http://") }
            .distinct()
    }
    var sourceIndex by remember(sources) { mutableIntStateOf(0) }
    var playerMessage by remember(sources) { mutableStateOf<String?>(null) }

    val loadControl = remember(isTelevision) {
        DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                if (isTelevision) 4_000 else 8_000,
                if (isTelevision) 15_000 else 30_000,
                1_000,
                if (isTelevision) 1_500 else 2_500,
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()
    }

    val player = remember(sources, loadControl) {
        ExoPlayer.Builder(context)
            .setLoadControl(loadControl)
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
                if (playbackState == Player.STATE_READY) {
                    playerMessage = null
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                val nextIndex = sourceIndex + 1
                if (nextIndex < sources.size) {
                    sourceIndex = nextIndex
                    playerMessage = "Fonte indisponível. Tentando alternativa ${nextIndex + 1}/${sources.size}..."
                    player.setMediaItem(mediaItemFor(sources[nextIndex]))
                    player.prepare()
                    player.playWhenReady = true
                } else {
                    playerMessage = "Não foi possível reproduzir este conteúdo."
                }
            }
        }

        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
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
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
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
                    .background(Color(0xCC141A2A))
                    .padding(horizontal = 20.dp, vertical = 12.dp),
            )
        }
    }
}

private fun mediaItemFor(url: String): MediaItem {
    val builder = MediaItem.Builder().setUri(url)
    if (url.substringBefore('?').endsWith(".m3u8", ignoreCase = true)) {
        builder.setMimeType(MimeTypes.APPLICATION_M3U8)
    }
    return builder.build()
}
