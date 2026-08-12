package com.ronecaplaytv.nativeapp.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Test

class CategoryDisplayModeTest {
    @Test
    fun missingOrUnknownPreferenceKeepsPublishedClassicMode() {
        assertEquals(CategoryDisplayMode.Classic, CategoryDisplayMode.fromStorage(null))
        assertEquals(CategoryDisplayMode.Classic, CategoryDisplayMode.fromStorage("future_mode"))
    }

    @Test
    fun storedSidePanelPreferenceIsRestored() {
        assertEquals(
            CategoryDisplayMode.SidePanel,
            CategoryDisplayMode.fromStorage(CategoryDisplayMode.SidePanel.storageValue),
        )
    }

    @Test
    fun visibleLabelsMapToStableStorageValues() {
        assertEquals(CategoryDisplayMode.Classic, CategoryDisplayMode.fromLabel("Clássica"))
        assertEquals(CategoryDisplayMode.SidePanel, CategoryDisplayMode.fromLabel("Painel lateral"))
    }
}
