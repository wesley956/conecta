package com.ronecaplaytv.nativeapp.ui.player

import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl

/**
 * Política única de buffer dos players de filmes, canais e episódios.
 *
 * TVs usam limites conservadores de tempo e bytes. Isso evita que o decoder
 * ocupe a memória disponível e deixe a interface e o controle remoto lentos.
 */
@UnstableApi
internal fun ronecaLoadControl(
    isTelevision: Boolean,
    isLowRamDevice: Boolean,
    requestedBufferSeconds: Int,
): DefaultLoadControl {
    val safeBufferSeconds = requestedBufferSeconds.coerceIn(2, 8)
    val playbackBufferMs = safeBufferSeconds * 1_000
    val minimumBufferMs = maxOf(
        playbackBufferMs,
        if (isTelevision) 8_000 else 6_000,
    )
    val maximumBufferMs = when {
        isLowRamDevice -> 18_000
        isTelevision -> 30_000
        else -> 25_000
    }
    val startPlaybackMs = maxOf(playbackBufferMs / 2, 2_000)
    val resumeAfterRebufferMs = maxOf(playbackBufferMs, if (isTelevision) 4_500 else 3_000)
    val targetBufferBytes = when {
        isLowRamDevice -> LOW_RAM_TARGET_BUFFER_BYTES
        isTelevision -> TV_TARGET_BUFFER_BYTES
        else -> MOBILE_TARGET_BUFFER_BYTES
    }

    return DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            minimumBufferMs.coerceAtMost(maximumBufferMs),
            maximumBufferMs,
            startPlaybackMs.coerceAtMost(minimumBufferMs),
            resumeAfterRebufferMs.coerceAtMost(minimumBufferMs),
        )
        .setTargetBufferBytes(targetBufferBytes)
        .setPrioritizeTimeOverSizeThresholds(false)
        .build()
}

private const val TV_TARGET_BUFFER_BYTES = 24 * 1024 * 1024
private const val MOBILE_TARGET_BUFFER_BYTES = 32 * 1024 * 1024
private const val LOW_RAM_TARGET_BUFFER_BYTES = 12 * 1024 * 1024
