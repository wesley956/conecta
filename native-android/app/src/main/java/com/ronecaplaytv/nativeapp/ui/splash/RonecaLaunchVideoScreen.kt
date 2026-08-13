package com.ronecaplaytv.nativeapp.ui.splash

import android.graphics.Color
import android.net.Uri
import android.view.LayoutInflater
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.ronecaplaytv.nativeapp.R
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

@Composable
fun RonecaLaunchVideoScreen(
    playAudio: Boolean,
    onFinished: () -> Unit,
) {
    val context = LocalContext.current
    val currentOnFinished by rememberUpdatedState(onFinished)
    val completed = remember { AtomicBoolean(false) }
    val playerViewReference = remember { AtomicReference<PlayerView?>(null) }
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
            if (!completed.compareAndSet(false, true)) return
            playerViewReference.get()?.let { view ->
                view.animate().cancel()
                view.alpha = 0f
            }
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
            completed.set(true)
            playerViewReference.getAndSet(null)?.let { view ->
                view.animate().cancel()
                view.setLayerType(View.LAYER_TYPE_NONE, null)
            }
            videoPlayer.removeListener(listener)
            videoPlayer.release()
        }
    }

    LaunchedEffect(videoPlayer) {
        while (isActive && !completed.get()) {
            val positionMillis = videoPlayer.currentPosition.coerceAtLeast(0L)
            if (LaunchVideoTransitionPolicy.shouldStart(positionMillis)) {
                val view = playerViewReference.get()
                if (view != null) {
                    val durationMillis = LaunchVideoTransitionPolicy.transitionDurationMillis(
                        positionMillis = positionMillis,
                        reportedDurationMillis = videoPlayer.duration,
                    )
                    if (durationMillis == 0L) {
                        view.alpha = 0f
                    } else {
                        view.animate()
                            .alpha(0f)
                            .setDuration(durationMillis)
                            .setInterpolator(AccelerateDecelerateInterpolator())
                            .start()
                    }
                    break
                }
            }
            delay(LaunchVideoTransitionPolicy.POSITION_POLL_MILLIS)
        }
    }

    AndroidView(
        factory = { viewContext ->
            (LayoutInflater.from(viewContext).inflate(
                R.layout.view_launch_video,
                null,
                false,
            ) as PlayerView).apply {
                alpha = 1f
                setLayerType(View.LAYER_TYPE_HARDWARE, null)
                useController = false
                setShutterBackgroundColor(Color.BLACK)
                keepScreenOn = true
                player = videoPlayer
                playerViewReference.set(this)
            }
        },
        update = { view ->
            videoPlayer.volume = if (playAudio) 1f else 0f
            view.player = videoPlayer
        },
        modifier = Modifier.fillMaxSize(),
    )
}
