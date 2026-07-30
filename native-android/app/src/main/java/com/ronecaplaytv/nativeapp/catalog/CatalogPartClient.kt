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
        if (!DirectXtreamClient.supports(url)) {
            return m3uSelector(loadM3uOnce(url))
        }

        val xtreamResult = runCatching { xtreamLoader(url) }
        xtreamResult.getOrNull()?.let { return it }

        return runCatching { m3uSelector(loadM3uOnce(url)) }.getOrElse { m3uFailure ->
            val xtreamMessage = xtreamResult.exceptionOrNull()?.message
                ?: "falha não identificada"
            val m3uMessage = m3uFailure.message ?: "falha não identificada"
            throw CatalogLoadException(
                "API Xtream: $xtreamMessage M3U: $m3uMessage",
            )
        }
    }

    private suspend fun loadM3uOnce(url: String): DirectM3uCatalog =
        directM3uMutex.withLock { directM3uClient.load(url) }

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
