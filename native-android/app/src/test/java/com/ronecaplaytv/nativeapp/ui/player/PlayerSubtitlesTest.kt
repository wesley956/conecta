package com.ronecaplaytv.nativeapp.ui.player

import androidx.media3.common.C
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerSubtitlesTest {
    @Test
    fun `unsupported text tracks are not offered`() {
        val options = buildSubtitleOptions(
            listOf(
                descriptor(group = 0, track = 0, supported = false, language = "pt-BR"),
                descriptor(group = 1, track = 0, supported = true, language = "en"),
            ),
        )

        assertEquals(1, options.size)
        assertEquals("1:0", options.single().id)
        assertEquals("en", options.single().language)
    }

    @Test
    fun `label without language is preserved and missing metadata gets safe fallback`() {
        val options = buildSubtitleOptions(
            listOf(
                descriptor(group = 0, track = 0, label = "Comentários", language = null),
                descriptor(group = 1, track = 0, label = null, language = null),
            ),
        )

        assertEquals("Comentários", options[0].displayName)
        assertEquals("Legenda 1", options[1].displayName)
        assertEquals(null, options[1].language)
    }

    @Test
    fun `forced and default flags remain explicit`() {
        val option = buildSubtitleOptions(
            listOf(
                descriptor(
                    group = 2,
                    track = 3,
                    label = "Português",
                    flags = C.SELECTION_FLAG_FORCED or C.SELECTION_FLAG_DEFAULT,
                    selected = true,
                ),
            ),
        ).single()

        assertTrue(option.isForced)
        assertTrue(option.isDefault)
        assertTrue(option.isSelected)
        assertTrue(option.displayName.contains("forçada"))
        assertTrue(option.displayName.contains("padrão"))
    }

    @Test
    fun `identity uses group and track instead of visible label`() {
        val options = buildSubtitleOptions(
            listOf(
                descriptor(group = 4, track = 0, label = "Português"),
                descriptor(group = 5, track = 0, label = "Português"),
            ),
        )

        assertEquals(listOf("4:0", "5:0"), options.map(SubtitleTrackOption::id))
        assertFalse(options[0].displayName == options[1].displayName)
    }

    private fun descriptor(
        group: Int,
        track: Int,
        label: String? = null,
        language: String? = null,
        supported: Boolean = true,
        selected: Boolean = false,
        flags: Int = 0,
    ) = SubtitleTrackDescriptor(
        groupIndex = group,
        trackIndex = track,
        label = label,
        language = language,
        isSupported = supported,
        isSelected = selected,
        selectionFlags = flags,
    )
}
