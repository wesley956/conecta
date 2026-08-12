package com.ronecaplaytv.nativeapp.activation

import java.net.URI

enum class SupportProfileSource {
    Seller,
    System,
    Generic,
}

data class SupportProfile(
    val source: SupportProfileSource = SupportProfileSource.Generic,
    val displayName: String = "Suporte",
    val whatsapp: String? = null,
    val email: String? = null,
    val supportText: String? = "Envie este código ao seu fornecedor.",
    val businessHours: String? = null,
    val contactUrl: String? = null,
    val showInApp: Boolean = true,
) {
    val primaryContactUri: String?
        get() = SupportContactPolicy.primaryUri(this)

    val contactLabel: String?
        get() = when {
            SupportContactPolicy.safeHttpsUri(contactUrl) != null -> "Abrir atendimento"
            SupportContactPolicy.safeWhatsappUri(whatsapp) != null -> "Abrir WhatsApp"
            SupportContactPolicy.safeEmailUri(email) != null -> "Enviar e-mail"
            else -> null
        }

    companion object {
        fun generic() = SupportProfile()
    }
}

/**
 * Política pura e testável para contatos recebidos do backend. O aplicativo
 * nunca aceita esquemas arbitrários nem URLs HTTPS com credenciais embutidas.
 */
object SupportContactPolicy {
    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    fun primaryUri(profile: SupportProfile): String? =
        safeHttpsUri(profile.contactUrl)
            ?: safeWhatsappUri(profile.whatsapp)
            ?: safeEmailUri(profile.email)

    fun safeHttpsUri(value: String?): String? {
        val raw = value?.trim()?.takeIf { it.length in 1..2048 } ?: return null
        val parsed = runCatching { URI(raw) }.getOrNull() ?: return null
        if (!parsed.scheme.equals("https", ignoreCase = true)) return null
        if (parsed.host.isNullOrBlank() || parsed.userInfo != null) return null
        return parsed.normalize().toASCIIString()
    }

    fun safeWhatsappUri(value: String?): String? {
        val raw = value?.trim()?.takeIf { it.length <= 40 } ?: return null
        val normalized = raw.replace(Regex("[^\\d+]"), "")
        if (!Regex("^\\+?\\d{8,15}$").matches(normalized)) return null
        return "https://wa.me/${normalized.filter(Char::isDigit)}"
    }

    fun safeEmailUri(value: String?): String? {
        val normalized = value?.trim()?.lowercase()?.takeIf { it.length <= 254 } ?: return null
        if (!emailPattern.matches(normalized)) return null
        return "mailto:$normalized"
    }
}
