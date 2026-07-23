package com.ronecaplaytv.nativeapp.ui.player

import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl

/**
 * Fonte única da política de buffer dos players de filmes, canais e episódios.
 *
 * TVs recebem uma reserva maior porque normalmente têm menos memória disponível
 * para o app, decoder mais lento e Wi-Fi menos estável que celulares modernos.
 */
@UnstableApi
internal fun ronecaLoadControl(
    isTelevision: Boolean,
    requestedBufferSeconds: Int,
): DefaultLoadControl {
    val safeBufferSeconds = requestedBufferSeconds.coerceIn(2, 10)
    val playbackBufferMs = safeBufferSeconds * 1_000
    val minimumBufferMs = maxOf(playbackBufferMs * 2, if (isTelevision) 15_000 else 8_000)
    val maximumBufferMs = maxOf(
        minimumBufferMs * 4,
        if (isTelevision) 60_000 else 35_000,
    )
    val startPlaybackMs = if (isTelevision) {
        maxOf(playbackBufferMs, 4_000)
    } else {
        playbackBufferMs
    }
    val resumeAfterRebufferMs = if (isTelevision) {
        maxOf(playbackBufferMs, 7_000)
    } else {
        playbackBufferMs
    }

    return DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            minimumBufferMs,
            maximumBufferMs,
            startPlaybackMs,
            resumeAfterRebufferMs,
        )
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()
}
