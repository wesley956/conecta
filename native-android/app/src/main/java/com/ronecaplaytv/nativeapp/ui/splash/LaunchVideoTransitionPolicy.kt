package com.ronecaplaytv.nativeapp.ui.splash

internal object LaunchVideoTransitionPolicy {
    const val CROSSFADE_START_MILLIS = 6_500L
    const val EXPECTED_VIDEO_DURATION_MILLIS = 8_057L

    fun alpha(
        positionMillis: Long,
        reportedDurationMillis: Long,
    ): Float {
        val endMillis = reportedDurationMillis
            .takeIf { it > CROSSFADE_START_MILLIS }
            ?: EXPECTED_VIDEO_DURATION_MILLIS
        if (positionMillis <= CROSSFADE_START_MILLIS) return 1f
        if (positionMillis >= endMillis) return 0f

        val linearProgress = (
            (positionMillis - CROSSFADE_START_MILLIS).toFloat() /
                (endMillis - CROSSFADE_START_MILLIS).toFloat()
            ).coerceIn(0f, 1f)
        val smoothProgress = linearProgress * linearProgress * (3f - 2f * linearProgress)
        return (1f - smoothProgress).coerceIn(0f, 1f)
    }
}
