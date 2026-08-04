package com.ronecaplaytv.nativeapp.catalog

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.SystemClock
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.FilterInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class ProviderAttemptContext(
    val playlistId: String,
    val section: String,
    val correlationId: String,
)

class CatalogPartClient(
    context: Context,
    private val reportAttempt: (ProviderAttemptReport) -> Unit = {},
) {
    private val applicationContext = context.applicationContext
    private val directM3uClient = DirectM3uClient()
    private val directXtreamClient = DirectXtreamClient(applicationContext)
    private val strategyStore = ProviderStrategyStore(applicationContext)
    private val directM3uMutex = Mutex()
    private val platform = detectPlatform(applicationContext)
    private val matrixDeadlines = ConcurrentHashMap<String, Long>()

    suspend fun preflightDirect(
        url: String,
        attemptContext: ProviderAttemptContext,
    ) {
        if (!DirectM3uClient.isDirectUrl(url) || !DirectXtreamClient.supports(url)) return
        val preferred = strategyStore.preferred(url, attemptContext.section)
        val candidates = directProtocolCandidates(url, preferred?.protocol)

        for ((index, candidate) in candidates.withIndex()) {
            ensureBudget(attemptContext)
            if (!DirectXtreamClient.supports(candidate)) continue
            val endpoint = DirectXtreamClient.authenticationEndpoint(candidate) ?: continue
            val result = observedAuthenticationAttempt(
                url = endpoint,
                attemptContext = attemptContext.copy(section = "authentication"),
                phase = if (index == 0) "fast" else "compatibility",
            ) {
                directXtreamClient.verifyAuthentication(candidate)
            }
            if (result.isSuccess) return
            val message = result.exceptionOrNull()?.message.orEmpty()
            if (isDefinitiveAuthenticationFailure(message)) {
                throw CatalogLoadException(cleanAuthenticationMessage(message))
            }
        }

        // player_api.php may be hidden while get.php is still valid. Non-definitive
        // preflight failures are recorded, but M3U and section endpoints remain eligible.
    }

    suspend fun loadChannels(
        url: String,
        attemptContext: ProviderAttemptContext? = null,
    ): List<NativeChannel> {
        if (DirectM3uClient.isDirectUrl(url)) {
            return loadDirect(
                url = url,
                attemptContext = attemptContext,
                xtreamLoader = directXtreamClient::loadChannels,
                m3uSelector = DirectM3uCatalog::channels,
            )
        }
        return loadCachePart(url, attemptContext, MAX_CHANNELS_BYTES, CatalogJsonParser::readChannels)
    }

    suspend fun loadMovies(
        url: String,
        attemptContext: ProviderAttemptContext? = null,
    ): List<NativeMovie> {
        if (DirectM3uClient.isDirectUrl(url)) {
            return loadDirect(
                url = url,
                attemptContext = attemptContext,
                xtreamLoader = directXtreamClient::loadMovies,
                m3uSelector = DirectM3uCatalog::movies,
            )
        }
        return loadCachePart(url, attemptContext, MAX_MOVIES_BYTES, CatalogJsonParser::readMovies)
    }

    suspend fun loadSeries(
        url: String,
        attemptContext: ProviderAttemptContext? = null,
    ): List<NativeSeries> {
        if (DirectM3uClient.isDirectUrl(url)) {
            return loadDirect(
                url = url,
                attemptContext = attemptContext,
                xtreamLoader = directXtreamClient::loadSeries,
                m3uSelector = DirectM3uCatalog::series,
            )
        }
        return loadCachePart(url, attemptContext, MAX_SERIES_BYTES, CatalogJsonParser::readSeries)
    }

    private suspend fun <T> loadDirect(
        url: String,
        attemptContext: ProviderAttemptContext?,
        xtreamLoader: suspend (String) -> List<T>,
        m3uSelector: (DirectM3uCatalog) -> List<T>,
    ): List<T> {
        val section = attemptContext?.section ?: "unknown"
        val preferred = strategyStore.preferred(url, section)
        val protocolCandidates = directProtocolCandidates(url, preferred?.protocol)
        val xtreamFailures = mutableListOf<String>()
        val m3uFailures = mutableListOf<String>()

        suspend fun tryXtream(): List<T>? {
            for ((index, candidate) in protocolCandidates.withIndex()) {
                ensureBudget(attemptContext)
                if (!DirectXtreamClient.supports(candidate)) continue

                val result = observedListAttempt(
                    url = candidate,
                    attemptContext = attemptContext,
                    transport = "xtream",
                    phase = if (index == 0) "fast" else "compatibility",
                    requestProfile = "IPTVSmartersPro",
                ) {
                    xtreamLoader(candidate)
                }
                val items = result.getOrNull()
                if (!items.isNullOrEmpty()) {
                    rememberStrategy(url, section, "xtream", candidate)
                    return items
                }
                if (items != null) {
                    xtreamFailures += "A API Xtream respondeu sem itens nesta seção."
                    continue
                }

                val message = result.exceptionOrNull()?.message.orEmpty()
                if (message.isNotBlank()) xtreamFailures += message
                if (isDefinitiveAuthenticationFailure(message)) {
                    throw CatalogLoadException(cleanAuthenticationMessage(message))
                }
            }
            return null
        }

        suspend fun tryM3u(): List<T>? {
            for ((index, candidate) in directM3uCandidates(protocolCandidates).withIndex()) {
                ensureBudget(attemptContext)
                val result = observedListAttempt(
                    url = candidate,
                    attemptContext = attemptContext,
                    transport = "m3u",
                    phase = if (index == 0) "fast" else "compatibility",
                    requestProfile = "multi_profile",
                ) {
                    m3uSelector(loadM3uOnce(candidate))
                }
                val items = result.getOrNull()
                if (!items.isNullOrEmpty()) {
                    rememberStrategy(url, section, "m3u", candidate)
                    return items
                }
                if (items != null) {
                    m3uFailures += "A M3U respondeu sem itens nesta seção."
                    continue
                }

                val message = result.exceptionOrNull()?.message.orEmpty()
                if (message.isNotBlank()) m3uFailures += message
                if (isDefinitiveAuthenticationFailure(message)) {
                    throw CatalogLoadException(cleanAuthenticationMessage(message))
                }
            }
            return null
        }

        val result = if (preferred?.transport == "m3u") {
            tryM3u() ?: tryXtream()
        } else {
            tryXtream() ?: tryM3u()
        }
        if (result != null) return result

        val xtreamMessage = compactFailureSummary(xtreamFailures)
        val m3uMessage = compactFailureSummary(m3uFailures)
        throw CatalogLoadException(
            "Não foi possível abrir esta lista diretamente. " +
                "Xtream: $xtreamMessage M3U: $m3uMessage",
        )
    }

    private suspend fun <T> loadCachePart(
        url: String,
        attemptContext: ProviderAttemptContext?,
        maximumBytes: Long,
        parser: (InputStream) -> List<T>,
    ): List<T> {
        val result = observedListAttempt(
            url = url,
            attemptContext = attemptContext,
            transport = "cache",
            phase = "fast",
            requestProfile = "RonecaPlayTV-Native",
        ) {
            withContext(Dispatchers.IO) {
                readPart(url, maximumBytes, parser)
            }
        }
        return result.getOrThrow()
    }

    private suspend fun observedAuthenticationAttempt(
        url: String,
        attemptContext: ProviderAttemptContext,
        phase: String,
        loader: suspend () -> XtreamAuthentication,
    ): Result<XtreamAuthentication> {
        val started = SystemClock.elapsedRealtime()
        val result = runCatching { loader() }
        val elapsed = (SystemClock.elapsedRealtime() - started).coerceAtLeast(0)
        runCatching {
            val facts = endpointFacts(url)
            val failureMessage = result.exceptionOrNull()?.message
            reportAttempt(
                ProviderAttemptReport(
                    clientEventId = "matrix:${UUID.randomUUID()}",
                    playlistId = attemptContext.playlistId,
                    correlationId = attemptContext.correlationId,
                    phase = phase,
                    section = "authentication",
                    transport = "xtream",
                    strategyKey = strategyKey(
                        "xtream",
                        facts,
                        "authentication",
                        "IPTVSmartersPro",
                    ),
                    protocol = facts.protocol,
                    host = facts.host,
                    port = facts.port,
                    path = facts.path,
                    requestProfile = "IPTVSmartersPro",
                    outputFormat = facts.output,
                    result = if (result.isSuccess) "success" else "failure",
                    httpStatus = extractHttpStatus(failureMessage),
                    durationMs = elapsed,
                    itemCount = null,
                    errorCode = failureMessage?.let(::classifyError),
                    errorMessage = failureMessage,
                    platform = platform,
                    appVersion = BuildConfig.VERSION_NAME,
                    occurredAt = nowIso(),
                ),
            )
        }
        return result
    }

    private suspend fun <T> observedListAttempt(
        url: String,
        attemptContext: ProviderAttemptContext?,
        transport: String,
        phase: String,
        requestProfile: String,
        loader: suspend () -> List<T>,
    ): Result<List<T>> {
        val started = SystemClock.elapsedRealtime()
        val result = runCatching { loader() }
        val elapsed = (SystemClock.elapsedRealtime() - started).coerceAtLeast(0)

        attemptContext?.let { context ->
            runCatching {
                val facts = endpointFacts(url)
                val items = result.getOrNull()
                val failureMessage = result.exceptionOrNull()?.message
                val status = extractHttpStatus(failureMessage)
                reportAttempt(
                    ProviderAttemptReport(
                        clientEventId = "matrix:${UUID.randomUUID()}",
                        playlistId = context.playlistId,
                        correlationId = context.correlationId,
                        phase = phase,
                        section = context.section,
                        transport = transport,
                        strategyKey = strategyKey(transport, facts, context.section, requestProfile),
                        protocol = facts.protocol,
                        host = facts.host,
                        port = facts.port,
                        path = facts.path,
                        requestProfile = requestProfile,
                        outputFormat = facts.output,
                        result = when {
                            result.isFailure -> "failure"
                            items.isNullOrEmpty() -> "empty"
                            else -> "success"
                        },
                        httpStatus = status,
                        durationMs = elapsed,
                        itemCount = items?.size,
                        errorCode = failureMessage?.let(::classifyError),
                        errorMessage = failureMessage,
                        platform = platform,
                        appVersion = BuildConfig.VERSION_NAME,
                        occurredAt = nowIso(),
                    ),
                )
            }
        }

        return result
    }

    private fun ensureBudget(attemptContext: ProviderAttemptContext?) {
        val correlationId = attemptContext?.correlationId ?: return
        val now = SystemClock.elapsedRealtime()
        val deadline = matrixDeadlines.computeIfAbsent(correlationId) {
            now + MATRIX_BUDGET_MS
        }
        if (now >= deadline) {
            throw CatalogLoadException(
                "[MATRIX_BUDGET_EXCEEDED] O limite global de tentativas desta lista foi atingido.",
            )
        }
        if (matrixDeadlines.size > MAX_MATRIX_BUDGETS) {
            matrixDeadlines.entries.removeIf { it.value < now }
        }
    }

    private fun rememberStrategy(
        originalUrl: String,
        section: String,
        transport: String,
        candidateUrl: String,
    ) {
        val facts = endpointFacts(candidateUrl)
        strategyStore.save(
            markedUrl = originalUrl,
            section = section,
            transport = transport,
            protocol = facts.protocol,
            output = facts.output,
        )
    }

    private suspend fun loadM3uOnce(url: String): DirectM3uCatalog =
        directM3uMutex.withLock { directM3uClient.load(url) }

    private fun directProtocolCandidates(
        markedUrl: String,
        preferredProtocol: String? = null,
    ): List<String> {
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

        val alternate = when {
            source.startsWith("https://", true) ->
                "http://${source.substringAfter("://")}"
            source.startsWith("http://", true) ->
                "https://${source.substringAfter("://")}"
            else -> null
        }
        val ordered = listOfNotNull(source, alternate).sortedBy {
            if (it.startsWith("${preferredProtocol.orEmpty()}://", true)) 0 else 1
        }
        ordered.forEach(::add)
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
        val current = outputMatch?.groupValues?.getOrNull(2)?.lowercase(Locale.ROOT)
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
        message.contains("[XTREAM_AUTH_INVALID]", ignoreCase = true) ||
            message.contains("[XTREAM_AUTH_EXPIRED]", ignoreCase = true) ||
            message.contains("HTTP 401", ignoreCase = true) ||
            message.contains("não autoriz", ignoreCase = true) ||
            message.contains("unauthorized", ignoreCase = true) ||
            message.contains("credenciais inválidas", ignoreCase = true)

    private fun cleanAuthenticationMessage(message: String): String =
        message
            .replace(Regex("\\[XTREAM_[A-Z_]+]"), "")
            .trim()
            .ifBlank { "A autenticação Xtream falhou." }

    private fun compactFailureSummary(messages: List<String>): String {
        val distinct = messages
            .map(::cleanDiagnosticMessage)
            .filter(String::isNotEmpty)
            .distinct()
        if (distinct.isEmpty()) return "falha não identificada."
        return distinct.takeLast(2).joinToString(" | ").take(420)
    }

    private fun cleanDiagnosticMessage(message: String): String =
        message.replace(Regex("\\[(?:XTREAM|MATRIX)_[A-Z_]+]"), "").trim()

    private fun <T> readPart(
        signedUrl: String,
        maxBytes: Long,
        parser: (InputStream) -> List<T>,
    ): List<T> {
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

    private fun endpointFacts(markedUrl: String): EndpointFacts {
        val source = markedUrl.substringBefore(DirectM3uClient.DIRECT_MARKER).trim()
        val parsed = runCatching { URL(source) }.getOrNull()
        if (parsed == null) {
            return EndpointFacts("unknown", "unknown", null, "/", null)
        }
        val output = parsed.query.orEmpty()
            .split('&')
            .mapNotNull { part ->
                val separator = part.indexOf('=')
                if (separator <= 0) return@mapNotNull null
                val key = decode(part.substring(0, separator)).lowercase(Locale.ROOT)
                val value = decode(part.substring(separator + 1))
                key to value
            }
            .firstOrNull { it.first == "output" }
            ?.second
            ?.lowercase(Locale.ROOT)
            ?.replace(Regex("[^a-z0-9]"), "")
            ?.take(20)
        val port = when {
            parsed.port > 0 -> parsed.port
            parsed.protocol.equals("https", true) -> 443
            parsed.protocol.equals("http", true) -> 80
            else -> null
        }
        return EndpointFacts(
            protocol = parsed.protocol.lowercase(Locale.ROOT),
            host = parsed.host.lowercase(Locale.ROOT).ifBlank { "unknown" },
            port = port,
            path = parsed.path.take(180).ifBlank { "/" },
            output = output,
        )
    }

    private fun strategyKey(
        transport: String,
        facts: EndpointFacts,
        section: String,
        requestProfile: String,
    ): String = listOf(
        transport,
        facts.protocol,
        facts.port?.toString() ?: "default",
        facts.output ?: "auto",
        section,
        requestProfile,
    ).joinToString("_")
        .lowercase(Locale.ROOT)
        .replace(Regex("[^a-z0-9:._/-]"), "_")
        .take(180)

    private fun extractHttpStatus(message: String?): Int? =
        message?.let { HTTP_STATUS.find(it)?.groupValues?.getOrNull(1)?.toIntOrNull() }

    private fun classifyError(message: String): String {
        val normalized = message.lowercase(Locale.ROOT)
        return when {
            normalized.contains("[xtream_auth_expired]") -> "ACCOUNT_EXPIRED"
            normalized.contains("[xtream_auth_invalid]") ||
                normalized.contains("401") ||
                normalized.contains("não autoriz") ||
                normalized.contains("unauthorized") -> "AUTHENTICATION_FAILED"
            normalized.contains("[matrix_budget_exceeded]") -> "MATRIX_BUDGET_EXCEEDED"
            normalized.contains("[xtream_auth_endpoint_not_found]") ||
                normalized.contains("404") -> "HTTP_404"
            normalized.contains("403") -> "HTTP_403"
            normalized.contains("[xtream_timeout]") ||
                normalized.contains("timeout") ||
                normalized.contains("tempo limite") ||
                normalized.contains("timed out") -> "TIMEOUT"
            normalized.contains("[xtream_connection_reset]") ||
                normalized.contains("connection reset") ||
                normalized.contains("socketexception") -> "CONNECTION_RESET"
            normalized.contains("[xtream_connection_failed]") ||
                normalized.contains("connect_fail") ||
                normalized.contains("connection refused") ||
                normalized.contains("failed to connect") -> "CONNECTION_FAILED"
            normalized.contains("[xtream_dns_failed]") ||
                normalized.contains("dns_fail") ||
                normalized.contains("unknown host") ||
                normalized.contains("domínio não encontrado") -> "DNS_FAILED"
            normalized.contains("[xtream_tls_failed]") ||
                normalized.contains("tls_fail") ||
                normalized.contains("certificate") ||
                normalized.contains("ssl") -> "TLS_FAILED"
            normalized.contains("vazia") ||
                normalized.contains("sem itens") ||
                normalized.contains("[xtream_response_empty]") -> "EMPTY_RESPONSE"
            normalized.contains("[xtream_response_html]") -> "HTML_RESPONSE"
            normalized.contains("[xtream_response_invalid]") ||
                normalized.contains("[xtream_auth_incompatible]") ||
                normalized.contains("inválid") ||
                normalized.contains("invalid") -> "INVALID_RESPONSE"
            else -> "PROVIDER_ATTEMPT_FAILED"
        }
    }

    private fun detectPlatform(context: Context): String {
        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        val mode = uiModeManager?.currentModeType
            ?: (context.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK)
        return if (mode == Configuration.UI_MODE_TYPE_TELEVISION) "androidtv" else "android"
    }

    private fun decode(value: String): String =
        runCatching { URLDecoder.decode(value, StandardCharsets.UTF_8.name()) }
            .getOrDefault(value)

    private fun nowIso(): String = ISO_FORMAT.get().format(Date())

    private data class EndpointFacts(
        val protocol: String,
        val host: String,
        val port: Int?,
        val path: String,
        val output: String?,
    )

    private companion object {
        val OUTPUT_PARAMETER = Regex("([?&])output=([^&#]*)", RegexOption.IGNORE_CASE)
        val HTTP_STATUS = Regex("HTTP\\s+(\\d{3})", RegexOption.IGNORE_CASE)
        val ISO_FORMAT = object : ThreadLocal<SimpleDateFormat>() {
            override fun initialValue() = SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.US,
            ).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
        }
        const val MATRIX_BUDGET_MS = 75_000L
        const val MAX_MATRIX_BUDGETS = 32
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
