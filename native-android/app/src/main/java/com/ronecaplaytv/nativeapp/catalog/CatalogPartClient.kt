package com.ronecaplaytv.nativeapp.catalog

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.FilterInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class CatalogPartClient {
    suspend fun loadChannels(url: String): List<NativeChannel> = withContext(Dispatchers.IO) {
        readPart(url, MAX_CHANNELS_BYTES, CatalogJsonParser::readChannels)
    }

    suspend fun loadMovies(url: String): List<NativeMovie> = withContext(Dispatchers.IO) {
        readPart(url, MAX_MOVIES_BYTES, CatalogJsonParser::readMovies)
    }

    suspend fun loadSeries(url: String): List<NativeSeries> = withContext(Dispatchers.IO) {
        readPart(url, MAX_SERIES_BYTES, CatalogJsonParser::readSeries)
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
