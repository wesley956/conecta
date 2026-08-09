package com.ronecaplaytv.nativeapp.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeDiagnosticsTest {
    @Test
    fun rejectsUrlsCredentialsAndSensitiveFieldNames() {
        val safe = sanitizeFields(
            mapOf(
                "heap_used_bytes" to 1234L,
                "decoder" to "c2.android.avc.decoder",
                "playlist_url" to "https://provider.example/get.php?username=a&password=b",
                "message" to "Bearer secret-token",
                "credential" to "device-secret",
            ),
        )

        assertEquals("1234", safe["heap_used_bytes"])
        assertEquals("c2.android.avc.decoder", safe["decoder"])
        assertFalse(safe.containsKey("playlist_url"))
        assertFalse(safe.containsKey("credential"))
        assertFalse(safe.containsKey("message"))
        assertTrue(safe.values.none { it.contains("provider.example") || it.contains("secret") })
    }
}
