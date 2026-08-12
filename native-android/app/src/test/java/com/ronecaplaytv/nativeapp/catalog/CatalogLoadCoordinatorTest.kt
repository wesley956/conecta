package com.ronecaplaytv.nativeapp.catalog

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogLoadCoordinatorTest {
    @Test
    fun onlyNewestGenerationCanPublish() {
        val coordinator = CatalogLoadCoordinator()
        val firstRefresh = coordinator.begin()
        val configurationChange = coordinator.begin()

        assertFalse(coordinator.isCurrent(firstRefresh))
        assertTrue(coordinator.isCurrent(configurationChange))
    }

    @Test
    fun repeatedRefreshInvalidatesEveryOlderResult() {
        val coordinator = CatalogLoadCoordinator()
        val first = coordinator.begin()
        val second = coordinator.begin()
        val third = coordinator.begin()

        assertFalse(coordinator.isCurrent(first))
        assertFalse(coordinator.isCurrent(second))
        assertTrue(coordinator.isCurrent(third))
    }
}
