package com.ronecaplaytv.nativeapp.activation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SupportContactPolicyTest {
    @Test
    fun `validated contact url has priority`() {
        val profile = SupportProfile(
            source = SupportProfileSource.Seller,
            contactUrl = "https://example.com/ajuda",
            whatsapp = "+55 (11) 99999-9999",
            email = "help@example.com",
        )

        assertEquals("https://example.com/ajuda", SupportContactPolicy.primaryUri(profile))
    }

    @Test
    fun `whatsapp is normalized to safe wa me url`() {
        assertEquals(
            "https://wa.me/5511999999999",
            SupportContactPolicy.safeWhatsappUri("+55 (11) 99999-9999"),
        )
    }

    @Test
    fun `unsafe or credentialed urls are rejected`() {
        assertNull(SupportContactPolicy.safeHttpsUri("javascript:alert(1)"))
        assertNull(SupportContactPolicy.safeHttpsUri("http://example.com"))
        assertNull(SupportContactPolicy.safeHttpsUri("https://user:pass@example.com/help"))
    }

    @Test
    fun `email fallback only accepts a valid address`() {
        assertEquals("mailto:help@example.com", SupportContactPolicy.safeEmailUri("HELP@example.com"))
        assertNull(SupportContactPolicy.safeEmailUri("not-an-email"))
    }

    @Test
    fun `generic profile remains informative without inventing a contact`() {
        val profile = SupportProfile.generic()

        assertEquals(SupportProfileSource.Generic, profile.source)
        assertNull(profile.primaryContactUri)
        assertEquals("Envie este código ao seu fornecedor.", profile.supportText)
    }
}
