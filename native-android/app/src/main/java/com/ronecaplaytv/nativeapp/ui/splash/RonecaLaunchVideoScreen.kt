package com.ronecaplaytv.nativeapp.ui.splash

import android.graphics.Color
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.ronecaplaytv.nativeapp.R

@Composable
fun RonecaLaunchVideoScreen(
    playAudio: Boolean,
    onFinished: () -> Unit,
) {
    val context = LocalContext.current
    val currentOnFinished by rememberUpdatedState(onFinished)
    var completed by remember { mutableStateOf(false) }
    val videoPlayer = remember(context) {
        ExoPlayer.Builder(context.applicationContext).build().apply {
            repeatMode = Player.REPEAT_MODE_OFF
            playWhenReady = true
            volume = if (playAudio) 1f else 0f
            setMediaItem(
                MediaItem.fromUri(
                    Uri.parse("android.resource://${context.packageName}/${R.raw.roneca_launch_video}"),
                ),
            )
        }
    }

    DisposableEffect(videoPlayer) {
        fun complete() {
            if (completed) return
            completed = true
            currentOnFinished()
        }

        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) complete()
            }

            override fun onPlayerError(error: PlaybackException) {
                complete()
            }
        }
        videoPlayer.addListener(listener)
        videoPlayer.prepare()

        onDispose {
            videoPlayer.removeListener(listener)
            videoPlayer.release()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ComposeColor.Black),
    ) {
        AndroidView(
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setShutterBackgroundColor(Color.BLACK)
                    keepScreenOn = true
                    player = videoPlayer
                }
            },
            update = { view ->
                videoPlayer.volume = if (playAudio) 1f else 0f
                view.player = videoPlayer
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
