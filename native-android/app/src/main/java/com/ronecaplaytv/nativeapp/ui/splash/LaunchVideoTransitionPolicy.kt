package com.ronecaplaytv.nativeapp.ui.splash

internal object LaunchVideoTransitionPolicy {
    const val CROSSFADE_START_MILLIS = 6_500L
    const val EXPECTED_VIDEO_DURATION_MILLIS = 8_057L
    const val POSITION_POLL_MILLIS = 40L

    fun shouldStart(positionMillis: Long): Boolean =
        positionMillis >= CROSSFADE_START_MILLIS

    fun transitionDurationMillis(
        positionMillis: Long,
        reportedDurationMillis: Long,
    ): Long {
        val endMillis = reportedDurationMillis
            .takeIf { it > CROSSFADE_START_MILLIS }
            ?: EXPECTED_VIDEO_DURATION_MILLIS
        val effectiveStart = positionMillis.coerceAtLeast(CROSSFADE_START_MILLIS)
        return (endMillis - effectiveStart).coerceAtLeast(0L)
    }
}
