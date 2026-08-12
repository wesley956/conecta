package com.ronecaplaytv.nativeapp.ui.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TvNavigationPolicyTest {
    @Test
    fun focusStaysOnSameIdentityAcrossCatalogRefresh() {
        assertEquals("b", deterministicFocusId("b", listOf("a", "b", "c")))
    }

    @Test
    fun removedFocusFallsBackDeterministically() {
        assertEquals("a", deterministicFocusId("removed", listOf("a", "b")))
        assertNull(deterministicFocusId("removed", emptyList()))
    }

    @Test
    fun selectorKeepsAllAndExcludesOnlyFixedSpecialFilters() {
        val categories = listOf("Todos", "Minha Lista", "Continuar") +
            (1..120).map { "Categoria $it" }
        val browsable = tvBrowsableCategories(categories, setOf("Minha Lista", "Continuar"))

        assertEquals(121, browsable.size)
        assertEquals("Todos", browsable.first())
        assertEquals("Categoria 120", browsable.last())
    }
}
