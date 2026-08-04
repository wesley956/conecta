package com.ronecaplaytv.nativeapp.catalog

import android.content.Context
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Locale

internal data class ProviderStrategy(
    val transport: String,
    val protocol: String,
    val output: String?,
)

internal class ProviderStrategyStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    fun preferred(markedUrl: String, section: String): ProviderStrategy? {
        val key = strategyKey(markedUrl, section) ?: return null
        val encoded = preferences.getString(key, null) ?: return null
        val parts = encoded.split('|')
        if (parts.size < 2) return null
        val transport = parts[0].takeIf { it == "xtream" || it == "m3u" } ?: return null
        val protocol = parts[1].takeIf { it == "http" || it == "https" } ?: return null
        val output = parts.getOrNull(2)?.takeIf(String::isNotBlank)
        return ProviderStrategy(transport, protocol, output)
    }

    fun save(
        markedUrl: String,
        section: String,
        transport: String,
        protocol: String,
        output: String?,
    ) {
        if (transport !in setOf("xtream", "m3u")) return
        if (protocol !in setOf("http", "https")) return
        val key = strategyKey(markedUrl, section) ?: return
        val safeOutput = output.orEmpty()
            .lowercase(Locale.ROOT)
            .replace(Regex("[^a-z0-9]"), "")
            .take(12)
        preferences.edit()
            .putString(key, listOf(transport, protocol, safeOutput).joinToString("|"))
            .apply()
    }

    private fun strategyKey(markedUrl: String, section: String): String? {
        val source = markedUrl.substringBefore(DirectM3uClient.DIRECT_MARKER).trim()
        val parsed = runCatching { URL(source) }.getOrNull() ?: return null
        if (parsed.protocol !in listOf("http", "https")) return null
        val parameters = parsed.query.orEmpty()
            .split('&')
            .mapNotNull { part ->
                val separator = part.indexOf('=')
                if (separator <= 0) return@mapNotNull null
                decode(part.substring(0, separator)).lowercase(Locale.ROOT) to
                    decode(part.substring(separator + 1))
            }
            .toMap()
        val username = parameters["username"]
            ?: parameters["user"]
            ?: parameters["login"]
            ?: "anonymous"
        val parentPath = parsed.path.substringBeforeLast('/', "").trimEnd('/')
        val identity = listOf(
            parsed.host.lowercase(Locale.ROOT),
            effectivePort(parsed).toString(),
            parentPath,
            username,
            section.lowercase(Locale.ROOT),
        ).joinToString("|")
        return "strategy:${sha256(identity)}"
    }

    private fun effectivePort(url: URL): Int = when {
        url.port > 0 -> url.port
        url.protocol == "https" -> 443
        else -> 80
    }

    private fun decode(value: String): String =
        runCatching { URLDecoder.decode(value, StandardCharsets.UTF_8.name()) }
            .getOrDefault(value)

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    private companion object {
        const val PREFERENCES_NAME = "provider_compatibility_strategies_v1"
    }
}
