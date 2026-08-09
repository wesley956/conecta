package com.ronecaplaytv.nativeapp.catalog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class XtreamPlaybackSourceTest {
    @Test
    fun compactUrlsPreserveAllPlaybackCandidatesWithoutLeakingCredentials() {
        val source = XtreamPlaybackSource(
            server = "https://provider.example:8443/customer",
            username = "user@name",
            password = "p@ss/word",
            output = "m3u8",
        )

        val urls = source.liveStreamUrls("42")
        assertEquals(4, urls.size)
        assertEquals(
            listOf(
                "https://provider.example:8443/customer/live/user%40name/p%40ss%2Fword/42.m3u8",
                "https://provider.example:8443/customer/live/user%40name/p%40ss%2Fword/42.ts",
                "https://provider.example:8443/customer/user%40name/p%40ss%2Fword/42.m3u8",
                "https://provider.example:8443/customer/user%40name/p%40ss%2Fword/42.ts",
            ),
            urls.toList(),
        )
        assertFalse(source.toString().contains("user@name"))
        assertFalse(source.toString().contains("p@ss/word"))
        assertFalse(urls.toString().contains("p@ss/word"))
    }
}
