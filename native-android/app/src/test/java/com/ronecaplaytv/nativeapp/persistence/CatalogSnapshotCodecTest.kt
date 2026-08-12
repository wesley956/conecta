package com.ronecaplaytv.nativeapp.persistence

import com.ronecaplaytv.nativeapp.activation.DeviceAccessStatus
import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig
import com.ronecaplaytv.nativeapp.catalog.NativeCatalogState
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogSnapshotCodecTest {
    @Test
    fun roundTripKeepsMetadataWithoutPersistingProviderUrlsOrCredentials() {
        val sensitiveUrl = "http://provider.example/live?username=customer&password=secret"
        val state = NativeCatalogState(
            channels = listOf(
                NativeChannel("c1", "Canal", "Notícias", sensitiveUrl, sensitiveUrl, listOf(sensitiveUrl)),
            ),
            movies = listOf(
                NativeMovie("m1", "Filme", 2026, "90 min", "Resumo", sensitiveUrl, "Ação", sensitiveUrl, listOf(sensitiveUrl)),
            ),
            series = listOf(
                NativeSeries("s1", "Série", sensitiveUrl, "Drama", "Resumo", emptyList(), "42"),
            ),
            loaded = true,
        )
        val envelope = envelope(state)

        val encoded = CatalogSnapshotCodec.encode(envelope)
        val raw = encoded.toString(Charsets.UTF_8)
        assertFalse(raw.contains("provider.example"))
        assertFalse(raw.contains("customer"))
        assertFalse(raw.contains("secret"))

        val decoded = CatalogSnapshotCodec.decode(encoded)
        assertNotNull(decoded)
        requireNotNull(decoded)
        assertEquals(1, decoded.state.channels.size)
        assertEquals("", decoded.state.channels.single().primaryUrl)
        assertTrue(decoded.state.channels.single().playbackUrls.isEmpty())
        assertNull(decoded.state.movies.single().coverUrl)
        assertNull(decoded.state.series.single().coverUrl)
    }

    @Test
    fun corruptionAndUnknownSchemaAreRejected() {
        val encoded = CatalogSnapshotCodec.encode(envelope(sampleState())).toString(Charsets.UTF_8)
        val corrupted = encoded.replace("Canal", "Canal alterado").toByteArray()
        val unknownSchema = encoded.replace("\"schemaVersion\":1", "\"schemaVersion\":99").toByteArray()

        assertNull(CatalogSnapshotCodec.decode(corrupted))
        assertNull(CatalogSnapshotCodec.decode(unknownSchema))
        assertNull(CatalogSnapshotCodec.decode(encoded.dropLast(12).toByteArray()))
    }

    @Test
    fun identityFingerprintDoesNotExposeDeviceCodeOrMarkedUrls() {
        val secretUrl = "http://provider.example/player_api.php?username=user&password=pass"
        val request = CatalogSnapshotIdentity.request(
            deviceCode = "RPTV-SECRET",
            candidate = DevicePlaylistConfig(
                id = "playlist-1",
                name = "Principal",
                priority = 1,
                role = "primary",
                channelsUrl = secretUrl,
                moviesUrl = secretUrl,
                seriesUrl = secretUrl,
            ),
        )

        assertEquals(64, request.deviceCodeHash.length)
        assertEquals(64, request.configFingerprint.length)
        assertFalse(request.deviceCodeHash.contains("SECRET"))
        assertFalse(request.configFingerprint.contains("provider"))
        assertFalse(request.configFingerprint.contains("pass"))
    }

    @Test
    fun accessPolicyNeverRestoresBlockedOrExpiredSession() {
        assertTrue(CatalogSnapshotAccessPolicy.mayRestore(DeviceAccessStatus.Active))
        assertFalse(CatalogSnapshotAccessPolicy.mayRestore(DeviceAccessStatus.Blocked))
        assertFalse(CatalogSnapshotAccessPolicy.mayRestore(DeviceAccessStatus.Expired))
        assertTrue(CatalogSnapshotAccessPolicy.mustInvalidate(DeviceAccessStatus.Blocked))
        assertTrue(CatalogSnapshotAccessPolicy.mustInvalidate(DeviceAccessStatus.Expired))
        assertFalse(CatalogSnapshotAccessPolicy.mustInvalidate(DeviceAccessStatus.Error))
    }

    private fun envelope(state: NativeCatalogState) = CatalogSnapshotEnvelope(
        schemaVersion = CatalogSnapshotCodec.SCHEMA_VERSION,
        deviceCodeHash = "d".repeat(64),
        playlistId = "playlist-1",
        playlistRole = "primary",
        configFingerprint = "f".repeat(64),
        savedAtMillis = 1_700_000_000_000L,
        appVersion = "2.9.5",
        state = state,
    )

    private fun sampleState() = NativeCatalogState(
        channels = listOf(NativeChannel("c1", "Canal", "Geral", null, "", emptyList())),
        loaded = true,
    )
}
