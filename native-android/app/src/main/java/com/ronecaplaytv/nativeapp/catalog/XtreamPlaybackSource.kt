package com.ronecaplaytv.nativeapp.catalog

import com.ronecaplaytv.nativeapp.BuildConfig
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Credenciais Xtream compartilhadas pelo catálogo direto.
 *
 * A lista de reprodução é calculada sob demanda para que cada canal não retenha
 * quatro Strings completas com o mesmo servidor, usuário e senha.
 */
internal class XtreamPlaybackSource(
    val server: String,
    val username: String,
    val password: String,
    val output: String,
) {
    fun apiUrl(
        action: String?,
        extraParameters: Map<String, String> = emptyMap(),
    ): URL {
        val query = buildList {
            add("username=${encode(username)}")
            add("password=${encode(password)}")
            action?.takeIf(String::isNotBlank)?.let { add("action=${encode(it)}") }
            extraParameters.forEach { (key, value) -> add("${encode(key)}=${encode(value)}") }
        }.joinToString("&")
        return URL("$server/player_api.php?$query")
    }

    fun liveStreamUrls(streamId: String): List<String> {
        val primary = if (output.equals("m3u8", ignoreCase = true)) "m3u8" else "ts"
        val alternate = if (primary == "m3u8") "ts" else "m3u8"
        return if (BuildConfig.COMPACT_XTREAM_PLAYBACK_URLS) {
            XtreamLiveUrls(this, streamId, primary, alternate)
        } else {
            listOf(
                streamUrl("live", streamId, primary),
                streamUrl("live", streamId, alternate),
                streamUrl(null, streamId, primary),
                streamUrl(null, streamId, alternate),
            )
        }
    }

    fun streamUrl(kind: String?, streamId: String, extension: String): String {
        val prefix = kind?.let { "/$it" }.orEmpty()
        return "$server$prefix/${encode(username)}/${encode(password)}/" +
            "${encode(streamId)}.${safeExtension(extension)}"
    }

    override fun toString(): String = "XtreamPlaybackSource(<redacted>)"

    private fun safeExtension(value: String): String = value
        .lowercase()
        .replace(Regex("[^a-z0-9]"), "")
        .takeIf(String::isNotBlank)
        ?.take(8)
        ?: "ts"

    private fun encode(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")
}

private class XtreamLiveUrls(
    private val source: XtreamPlaybackSource,
    private val streamId: String,
    private val primary: String,
    private val alternate: String,
) : AbstractList<String>() {
    override val size: Int = 4

    override fun get(index: Int): String = when (index) {
        0 -> source.streamUrl("live", streamId, primary)
        1 -> source.streamUrl("live", streamId, alternate)
        2 -> source.streamUrl(null, streamId, primary)
        3 -> source.streamUrl(null, streamId, alternate)
        else -> throw IndexOutOfBoundsException("index=$index, size=$size")
    }

    override fun toString(): String = "XtreamLiveUrls(<redacted>, size=$size)"
}
