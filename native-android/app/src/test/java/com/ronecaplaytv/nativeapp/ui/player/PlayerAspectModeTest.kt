package com.ronecaplaytv.nativeapp.ui.player

import org.junit.Assert.assertEquals
import org.junit.Test

class PlayerAspectModeTest {
    @Test
    fun persistsLegacyValuesAndCyclesThroughEveryMode() {
        assertEquals(PlayerAspectMode.Original, PlayerAspectMode.fromStorage(null))
        assertEquals(PlayerAspectMode.Fill, PlayerAspectMode.fromStorage("Preencher"))
        assertEquals(PlayerAspectMode.Stretch, PlayerAspectMode.fromStorage("stretch"))

        var current = PlayerAspectMode.Original
        val visited = buildSet {
            repeat(PlayerAspectMode.entries.size) {
                add(current)
                current = current.next()
            }
        }

        assertEquals(PlayerAspectMode.entries.toSet(), visited)
        assertEquals(PlayerAspectMode.Original, current)
    }
}
