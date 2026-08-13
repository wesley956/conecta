package com.ronecaplaytv.nativeapp.ui.splash

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LaunchVideoTransitionPolicyTest {
    @Test
    fun videoRemainsOpaqueUntilSixAndAHalfSeconds() {
        assertEquals(1f, LaunchVideoTransitionPolicy.alpha(0L, 8_057L), 0f)
        assertEquals(1f, LaunchVideoTransitionPolicy.alpha(6_500L, 8_057L), 0f)
    }

    @Test
    fun alphaUsesPlayerPositionForSmoothCrossfade() {
        val firstQuarter = LaunchVideoTransitionPolicy.alpha(6_889L, 8_057L)
        val midpoint = LaunchVideoTransitionPolicy.alpha(7_278L, 8_057L)
        val lastQuarter = LaunchVideoTransitionPolicy.alpha(7_668L, 8_057L)

        assertTrue(firstQuarter in 0.80f..0.86f)
        assertTrue(midpoint in 0.49f..0.51f)
        assertTrue(lastQuarter in 0.14f..0.18f)
    }

    @Test
    fun videoIsTransparentAtItsRealEnd() {
        assertEquals(0f, LaunchVideoTransitionPolicy.alpha(8_057L, 8_057L), 0f)
        assertEquals(0f, LaunchVideoTransitionPolicy.alpha(8_500L, 8_057L), 0f)
    }

    @Test
    fun unknownDurationFallsBackToTheOfficialMp4Duration() {
        assertEquals(0f, LaunchVideoTransitionPolicy.alpha(8_057L, -1L), 0f)
    }
}
