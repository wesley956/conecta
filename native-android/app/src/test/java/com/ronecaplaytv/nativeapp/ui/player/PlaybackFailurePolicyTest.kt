package com.ronecaplaytv.nativeapp.ui.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackFailurePolicyTest {
    @Test
    fun retriesOnlyTemporaryFailuresWithProgressiveBackoff() {
        val failure = classifyPlaybackFailure("ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT")

        assertEquals(PlaybackFailureKind.TransientNetwork, failure.kind)
        assertTrue(failure.retryable)
        assertEquals(2_000L, retryDelayMillis(0))
        assertEquals(4_000L, retryDelayMillis(1))
        assertEquals(8_000L, retryDelayMillis(2))
        assertNull(retryDelayMillis(3))
    }

    @Test
    fun neverRetriesPermanentHttpFailures() {
        val denied = classifyPlaybackFailure("ERROR_CODE_IO_BAD_HTTP_STATUS", 403)
        val missing = classifyPlaybackFailure("ERROR_CODE_IO_BAD_HTTP_STATUS", 404)

        assertEquals(PlaybackFailureKind.AccessDenied, denied.kind)
        assertEquals(PlaybackFailureKind.NotFound, missing.kind)
        assertFalse(denied.retryable)
        assertFalse(missing.retryable)
    }

    @Test
    fun classifiesDecoderFormatAndTlsWithoutSensitiveDetails() {
        val decoder = classifyPlaybackFailure("ERROR_CODE_DECODING_FAILED")
        val format = classifyPlaybackFailure("ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED")
        val tls = classifyPlaybackFailure(
            "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED",
            causeClassNames = listOf("javax.net.ssl.SSLHandshakeException"),
        )

        assertEquals(PlaybackFailureKind.Decoder, decoder.kind)
        assertEquals(PlaybackFailureKind.UnsupportedFormat, format.kind)
        assertEquals(PlaybackFailureKind.SecureConnection, tls.kind)
        assertFalse(decoder.retryable)
        assertFalse(format.retryable)
        assertFalse(tls.retryable)
    }

    @Test
    fun runtimeCheckIsNotMisreportedAsDeviceSecurity() {
        val runtime = classifyPlaybackFailure("ERROR_CODE_FAILED_RUNTIME_CHECK")
        val cleartext = classifyPlaybackFailure("ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED")

        assertEquals(PlaybackFailureKind.RuntimeCheck, runtime.kind)
        assertFalse(runtime.retryable)
        assertFalse(runtime.userMessage.contains("segurança", ignoreCase = true))
        assertEquals(PlaybackFailureKind.SecureConnection, cleartext.kind)
    }
}
