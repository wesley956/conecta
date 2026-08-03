package com.ronecaplaytv.nativeapp.catalog

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.FilterInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class CatalogPartClient(context: Context) {
    private val directM3uClient = DirectM3uClient()
    private val directXtreamClient = DirectXtreamClient(context.applicationContext)
    private val directM3uMutex = Mutex()

    suspend fun loadChannels(url: String): List<NativeChannel> {
        if (DirectM3uClient.isDirectUrl(url)) {
            return loadDirect(
                url = url,
                xtreamLoader = directXtreamClient::loadChannels,
                m3uSelector = DirectM3uCatalog::channels,
            )
        }
        return withContext(Dispatchers.IO) {
            readPart(url, MAX_CHANNELS_BYTES, CatalogJsonParser::readChannels)
        }
    }

    suspend fun loadMovies(url: String): List<NativeMovie> {
        if (DirectM3uClient.isDirectUrl(url)) {
            return loadDirect(
                url = url,
                xtreamLoader = directXtreamClient::loadMovies,
                m3uSelector = DirectM3uCatalog::movies,
            )
        }
        return withContext(Dispatchers.IO) {
            readPart(url, MAX_MOVIES_BYTES, CatalogJsonParser::readMovies)
        }
    }

    suspend fun loadSeries(url: String): List<NativeSeries> {
        if (DirectM3uClient.isDirectUrl(url)) {
            return loadDirect(
                url = url,
                xtreamLoader = directXtreamClient::loadSeries,
                m3uSelector = DirectM3uCatalog::series,
            )
        }
        return withContext(Dispatchers.IO) {
            readPart(url, MAX_SERIES_BYTES, CatalogJsonParser::readSeries)
        }
    }

    private suspend fun <T> loadDirect(
        url: String,
        xtreamLoader: suspend (String) -> List<T>,
        m3uSelector: (DirectM3uCatalog) -> List<T>,
    ): List<T> {
        val protocolCandidates = directProtocolCandidates(url)
        val xtreamFailures = mutableListOf<String>()

        for (candidate in protocolCandidates) {
            if (!DirectXtreamClient.supports(candidate)) continue

            val result = runCatching { xtreamLoader(candidate) }
            result.getOrNull()?.let { return it }
            val message = result.exceptionOrNull()?.message.orEmpty()
            if (message.isNotBlank()) xtreamFailures += message
            if (isDefinitiveAuthenticationFailure(message)) break
        }

        val m3uFailures = mutableListOf<String>()
        for (candidate in directM3uCandidates(protocolCandidates)) {
            val result = runCatching { m3uSelector(loadM3uOnce(candidate)) }
            result.getOrNull()?.let { return it }
            val message = result.exceptionOrNull()?.message.orEmpty()
            if (message.isNotBlank()) m3uFailures += message
            if (isDefinitiveAuthenticationFailure(message)) break
        }

        val xtreamMessage = compactFailureSummary(xtreamFailures)
        val m3uMessage = compactFailureSummary(m3uFailures)
        throw CatalogLoadException(
            "Não foi possível abrir esta lista diretamente. " +
                "Xtream: $xtreamMessage M3U: $m3uMessage",
        )
    }

    private suspend fun loadM3uOnce(url: String): DirectM3uCatalog =
        directM3uMutex.withLock { directM3uClient.load(url) }

    private fun directProtocolCandidates(markedUrl: String): List<String> {
        val marker = if (DirectM3uClient.isDirectUrl(markedUrl)) {
            DirectM3uClient.DIRECT_MARKER
        } else {
            ""
        }
        val source = markedUrl.substringBefore(DirectM3uClient.DIRECT_MARKER).trim()
        if (source.isBlank()) return listOf(markedUrl)

        val sources = linkedSetOf<String>()
        fun add(candidate: String) {
            if (candidate.startsWith("http://", true) || candidate.startsWith("https://", true)) {
                sources += candidate
            }
        }

        add(source)
        when {
            source.startsWith("https://", true) ->
                add("http://${source.substringAfter("://")}")
            source.startsWith("http://", true) ->
                add("https://${source.substringAfter("://")}")
        }

        return sources.map { "$it$marker" }
    }

    private fun directM3uCandidates(protocolCandidates: List<String>): List<String> {
        val candidates = linkedSetOf<String>()
        for (markedCandidate in protocolCandidates) {
            val marker = if (DirectM3uClient.isDirectUrl(markedCandidate)) {
                DirectM3uClient.DIRECT_MARKER
            } else {
                ""
            }
            val source = markedCandidate.substringBefore(DirectM3uClient.DIRECT_MARKER)
            candidates += "$source$marker"
            candidates += "${withAlternateOutput(source)}$marker"
        }
        return candidates.toList()
    }

    private fun withAlternateOutput(rawUrl: String): String {
        val outputMatch = OUTPUT_PARAMETER.find(rawUrl)
        val current = outputMatch?.groupValues?.getOrNull(2)?.lowercase()
        val replacement = when (current) {
            "m3u8" -> "ts"
            "ts", "mpegts" -> "m3u8"
            else -> "ts"
        }

        if (outputMatch != null) {
            val separator = outputMatch.groupValues[1]
            return rawUrl.replaceRange(
                outputMatch.range,
                "${separator}output=$replacement",
            )
        }

        val separator = if (rawUrl.contains('?')) '&' else '?'
        return "$rawUrl${separator}output=$replacement"
    }

    private fun isDefinitiveAuthenticationFailure(message: String): Boolean =
        message.contains("HTTP 401", ignoreCase = true) ||
            message.contains("não autoriz", ignoreCase = true) ||
            message.contains("unauthorized", ignoreCase = true) ||
            message.contains("credenciais inválidas", ignoreCase = true)

    private fun compactFailureSummary(messages: List<String>): String {
        val distinct = messages
            .map(String::trim)
            .filter(String::isNotEmpty)
            .distinct()
        if (distinct.isEmpty()) return "falha não identificada."
        return distinct.takeLast(2).joinToString(" | ").take(420)
    }

    private fun <T> readPart(
        signedUrl: String,
        maxBytes: Long,
        parser: (InputStream) -> T,
    ): T {
        val url = URL(signedUrl)
        require(url.protocol == "https") { "URL insegura do catálogo bloqueada." }

        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = false
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cache-Control", "no-store")
            setRequestProperty("User-Agent", "RonecaPlayTV-Native")
        }

        return try {
            val status = connection.responseCode
            if (status in 300..399) {
                throw CatalogLoadException("Redirecionamento inesperado do catálogo.")
            }
            if (status !in 200..299) {
                throw CatalogLoadException("Não foi possível carregar o catálogo (HTTP $status).")
            }

            val declaredSize = connection.contentLengthLong
            if (declaredSize > maxBytes) {
                throw CatalogLoadException("Catálogo excede o limite seguro para este aparelho.")
            }

            connection.inputStream.use { input ->
                parser(LimitedInputStream(input, maxBytes))
            }
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        val OUTPUT_PARAMETER = Regex("([?&])output=([^&#]*)", RegexOption.IGNORE_CASE)
        const val CONNECT_TIMEOUT_MS = 12_000
        const val READ_TIMEOUT_MS = 45_000
        const val MAX_CHANNELS_BYTES = 35L * 1024L * 1024L
        const val MAX_MOVIES_BYTES = 35L * 1024L * 1024L
        const val MAX_SERIES_BYTES = 60L * 1024L * 1024L
    }
}

class CatalogLoadException(message: String) : Exception(message)

private class LimitedInputStream(
    input: InputStream,
    private val maximumBytes: Long,
) : FilterInputStream(input) {
    private var totalRead = 0L

    override fun read(): Int {
        val value = super.read()
        if (value >= 0) registerRead(1)
        return value
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        val read = super.read(buffer, offset, length)
        if (read > 0) registerRead(read.toLong())
        return read
    }

    private fun registerRead(count: Long) {
        totalRead += count
        if (totalRead > maximumBytes) {
            throw CatalogLoadException("Download do catálogo excedeu o limite seguro.")
        }
    }
}
