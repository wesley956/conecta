package com.cruzlabs.ronecaplaytv.player

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import java.io.Closeable

@OptIn(UnstableApi::class)
class NativePlayerEngine(context: Context) : Closeable {
    private val loadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            5_000,
            20_000,
            1_000,
            2_000,
        )
        .setBackBuffer(0, false)
        .build()

    private val httpDataSourceFactory = DefaultHttpDataSource.Factory()
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(12_000)
        .setReadTimeoutMs(15_000)
        .setUserAgent("RonecaPlayTV-Native/0.1 ExoPlayer")

    val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext)
        .setLoadControl(loadControl)
        .setMediaSourceFactory(DefaultMediaSourceFactory(httpDataSourceFactory))
        .build()

    fun play(url: String) {
        val normalizedUrl = url.trim()
        require(normalizedUrl.isNotEmpty()) { "A URL do conteúdo não pode estar vazia." }

        val mediaItemBuilder = MediaItem.Builder().setUri(normalizedUrl)

        inferMimeType(normalizedUrl)?.let(mediaItemBuilder::setMimeType)

        player.setMediaItem(mediaItemBuilder.build())
        player.prepare()
        player.playWhenReady = true
    }

    fun stop() {
        player.stop()
        player.clearMediaItems()
    }

    override fun close() {
        stop()
        player.release()
    }

    private fun inferMimeType(url: String): String? {
        val normalized = url.substringBefore('?').lowercase()
        return when {
            normalized.endsWith(".m3u8") -> MimeTypes.APPLICATION_M3U8
            normalized.endsWith(".mpd") -> MimeTypes.APPLICATION_MPD
            normalized.endsWith(".ts") -> MimeTypes.VIDEO_MP2T
            else -> null
        }
    }
}
