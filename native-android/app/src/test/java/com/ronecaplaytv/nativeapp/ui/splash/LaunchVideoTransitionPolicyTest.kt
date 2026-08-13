package com.ronecaplaytv.nativeapp.ui.splash

import org.junit.Assert.assertEquals
import org.junit.Test

class LaunchVideoTransitionPolicyTest {
    @Test
    fun transitionStartsOnlyWhenPlaybackCrossesSixAndAHalfSeconds() {
        assertEquals(false, LaunchVideoTransitionPolicy.shouldStart(6_499L))
        assertEquals(true, LaunchVideoTransitionPolicy.shouldStart(6_500L))
    }

    @Test
    fun nativeAnimatorUsesOnlyTheRemainingPlaybackTime() {
        assertEquals(
            1_557L,
            LaunchVideoTransitionPolicy.transitionDurationMillis(6_500L, 8_057L),
        )
        assertEquals(
            1_537L,
            LaunchVideoTransitionPolicy.transitionDurationMillis(6_520L, 8_057L),
        )
    }

    @Test
    fun transitionHasNoDurationAfterTheVideoEnds() {
        assertEquals(
            0L,
            LaunchVideoTransitionPolicy.transitionDurationMillis(8_057L, 8_057L),
        )
    }

    @Test
    fun unknownDurationFallsBackToTheOfficialMp4Duration() {
        assertEquals(
            1_557L,
            LaunchVideoTransitionPolicy.transitionDurationMillis(6_500L, -1L),
        )
    }
}
