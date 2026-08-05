package com.ronecaplaytv.nativeapp.catalog

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.SystemClock
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig
import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withTimeout

internal data class ProviderSessionCatalog(
    val channels: List<NativeChannel>,
    val movies: List<NativeMovie>,
    val series: List<NativeSeries>,
    val warning: String? = null,
)

/**
 * Executes one bounded compatibility session per playlist.
 *
 * A direct provider is no longer opened independently by channels, movies and
 * series. Authentication, transport choice, retries and M3U fallback belong to
 * one session, preventing duplicate downloads and attempts that compete for the
 * provider connection limit.
 */
internal class ProviderCatalogSessionEngine(
    context: Context,
    private val reportAttempt: (ProviderAttemptReport) -> Unit = {},
) {
    private val applicationContext = context.applicationContext
    private val cacheClient = CatalogPartClient(applicationContext, reportAttempt)
    private val xtreamClient = DirectXtreamClient(applicationContext)
    private val m3uClient = DirectM3uClient()
    private val platform = detectPlatform(applicationContext)

    suspend fun load(
        candidate: DevicePlaylistConfig,
        correlationId: String,
        onStage: (String) -> Unit = {},
    ): ProviderSessionCatalog = withTimeout(SESSION_BUDGET_MS) {
        val sources = listOfNotNull(
            candidate.channelsUrl,
            candidate.moviesUrl,
            candidate.seriesUrl,
        )
        val directSources = sources.filter(DirectM3uClient::isDirectUrl)
        val oneDirectOrigin = directSources.isNotEmpty() &&
            directSources.size == sources.size &&
            directSources.map(::sourceWithoutMarker).distinct().size == 1

        if (oneDirectOrigin) {
            loadDirect(
                source = directSources.first(),
                playlistId = candidate.id,
                correlationId = correlationId,
                onStage = onStage,
            )
        } else {
            loadCachedParts(candidate, correlationId, onStage)
        }
    }

    private suspend fun loadDirect(
        source: String,
        playlistId: String,
        correlationId: String,
        onStage: (String) -> Unit,
    ): ProviderSessionCatalog {
        val failures = mutableListOf<String>()
        var authentication: XtreamAuthentication? = null

        if (DirectXtreamClient.supports(source)) {
            onStage("autenticando servidor")
            val authResult = observed(
                source = DirectXtreamClient.authenticationEndpoint(source) ?: source,
                playlistId = playlistId,
                correlationId = correlationId,
                section = "authentication",
                transport = "xtream",
                phase = "fast",
                requestProfile = "RonecaSession",
            ) {
                xtreamClient.verifyAuthentication(source)
            }
            authentication = authResult.getOrNull()
            authResult.exceptionOrNull()?.message?.let(failures::add)
            val authFailure = authResult.exceptionOrNull()?.message.orEmpty()
            if (isDefinitiveAuthenticationFailure(authFailure)) {
                throw CatalogLoadException(cleanMessage(authFailure))
            }
        }

        if (authentication != null) {
            onStage("carregando catálogo Xtream")
            val channelsResult = observedList(
                source = source,
                playlistId = playlistId,
                correlationId = correlationId,
                section = "channels",
                transport = "xtream",
                phase = "fast",
                requestProfile = "RonecaSession",
            ) {
                xtreamClient.loadChannels(source)
            }
            channelsResult.exceptionOrNull()?.message?.let(failures::add)

            if (!isProviderWideFailure(channelsResult.exceptionOrNull()?.message.orEmpty())) {
                val (moviesResult, seriesResult) = loadRemainingXtreamSections(
                    source = source,
                    playlistId = playlistId,
                    correlationId = correlationId,
                    maximumConnections = authentication.maxConnections,
                )
                moviesResult.exceptionOrNull()?.message?.let(failures::add)
                seriesResult.exceptionOrNull()?.message?.let(failures::add)

                val channels = channelsResult.getOrDefault(emptyList())
                val movies = moviesResult.getOrDefault(emptyList())
                val series = seriesResult.getOrDefault(emptyList())
                if (channels.isNotEmpty() || movies.isNotEmpty() || series.isNotEmpty()) {
                    val unavailable = buildList {
                        if (channelsResult.isFailure) add("canais")
                        if (moviesResult.isFailure) add("filmes")
                        if (seriesResult.isFailure) add("séries")
                    }
                    return ProviderSessionCatalog(
                        channels = channels,
                        movies = movies,
                        series = series,
                        warning = unavailable.takeIf(List<String>::isNotEmpty)?.let {
                            "Catálogo Xtream carregado parcialmente. ${it.joinToString(" e ")} serão atualizados depois."
                        },
                    )
                }
            }
        }

        onStage("baixando lista M3U uma única vez")
        val m3uResult = observed(
            source = source,
            playlistId = playlistId,
            correlationId = correlationId,
            section = "catalog",
            transport = "m3u",
            phase = if (authentication == null) "fast" else "compatibility",
            requestProfile = "RonecaSession",
            itemCount = { catalog ->
                catalog.channels.size + catalog.movies.size + catalog.series.size
            },
        ) {
            m3uClient.load(source)
        }
        val m3u = m3uResult.getOrNull()
        if (m3u != null) {
            return ProviderSessionCatalog(
                channels = m3u.channels,
                movies = m3u.movies,
                series = m3u.series,
                warning = if (authentication != null) {
                    "A API do provedor não respondeu a tempo; catálogo recuperado pela M3U."
                } else {
                    null
                },
            )
        }
        m3uResult.exceptionOrNull()?.message?.let(failures::add)

        throw CatalogLoadException(
            failures
                .map(::cleanMessage)
                .filter(String::isNotBlank)
                .distinct()
                .takeLast(3)
                .joinToString(" | ")
                .take(500)
                .ifBlank { "O servidor não entregou um catálogo utilizável." },
        )
    }

    private suspend fun loadRemainingXtreamSections(
        source: String,
        playlistId: String,
        correlationId: String,
        maximumConnections: Int?,
    ): Pair<Result<List<NativeMovie>>, Result<List<NativeSeries>>> {
        suspend fun movies() = observedList(
            source = source,
            playlistId = playlistId,
            correlationId = correlationId,
            section = "movies",
            transport = "xtream",
            phase = "fast",
            requestProfile = "RonecaSession",
        ) {
            xtreamClient.loadMovies(source)
        }
        suspend fun series() = observedList(
            source = source,
            playlistId = playlistId,
            correlationId = correlationId,
            section = "series",
            transport = "xtream",
            phase = "fast",
            requestProfile = "RonecaSession",
        ) {
            xtreamClient.loadSeries(source)
        }

        return if ((maximumConnections ?: 1) >= 2) {
            coroutineScope {
                val moviesDeferred = async { movies() }
                val seriesDeferred = async { series() }
                moviesDeferred.await() to seriesDeferred.await()
            }
        } else {
            movies() to series()
        }
    }

    private suspend fun loadCachedParts(
        candidate: DevicePlaylistConfig,
        correlationId: String,
        onStage: (String) -> Unit,
    ): ProviderSessionCatalog = supervisorScope {
        onStage("carregando cache seguro")
        val channelsDeferred = async {
            runCatching {
                candidate.channelsUrl?.let {
                    cacheClient.loadChannels(
                        it,
                        ProviderAttemptContext(candidate.id, "channels", correlationId),
                    )
                }.orEmpty()
            }
        }
        val moviesDeferred = async {
            runCatching {
                candidate.moviesUrl?.let {
                    cacheClient.loadMovies(
                        it,
                        ProviderAttemptContext(candidate.id, "movies", correlationId),
                    )
                }.orEmpty()
            }
        }
        val seriesDeferred = async {
            runCatching {
                candidate.seriesUrl?.let {
                    cacheClient.loadSeries(
                        it,
                        ProviderAttemptContext(candidate.id, "series", correlationId),
                    )
                }.orEmpty()
            }
        }

        val channelsResult = channelsDeferred.await()
        val moviesResult = moviesDeferred.await()
        val seriesResult = seriesDeferred.await()
        val channels = channelsResult.getOrDefault(emptyList())
        val movies = moviesResult.getOrDefault(emptyList())
        val series = seriesResult.getOrDefault(emptyList())

        if (channels.isEmpty() && movies.isEmpty() && series.isEmpty()) {
            val message = listOf(channelsResult, moviesResult, seriesResult)
                .mapNotNull { it.exceptionOrNull()?.message }
                .distinct()
                .joinToString(" ")
                .ifBlank { "O cache retornou um catálogo vazio." }
            throw CatalogLoadException(message)
        }

        val unavailable = buildList {
            if (channelsResult.isFailure) add("canais")
            if (moviesResult.isFailure) add("filmes")
            if (seriesResult.isFailure) add("séries")
        }
        ProviderSessionCatalog(
            channels = channels,
            movies = movies,
            series = series,
            warning = unavailable.takeIf(List<String>::isNotEmpty)?.let {
                "Catálogo carregado. Tentaremos atualizar ${it.joinToString(" e ")} novamente."
            },
        )
    }

    private suspend fun <T> observed(
        source: String,
        playlistId: String,
        correlationId: String,
        section: String,
        transport: String,
        phase: String,
        requestProfile: String,
        itemCount: (T) -> Int? = { null },
        loader: suspend () -> T,
    ): Result<T> {
        val started = SystemClock.elapsedRealtime()
        val result = runCatching { loader() }
        val duration = (SystemClock.elapsedRealtime() - started).coerceAtLeast(0)
        runCatching {
            val facts = endpointFacts(source, transport, section)
            val value = result.getOrNull()
            val message = result.exceptionOrNull()?.message
            reportAttempt(
                ProviderAttemptReport(
                    clientEventId = "matrix:${UUID.randomUUID()}",
                    playlistId = playlistId,
                    correlationId = correlationId,
                    phase = phase,
                    section = section,
                    transport = transport,
                    strategyKey = listOf(
                        "session",
                        transport,
                        facts.protocol,
                        facts.port ?: "default",
                        facts.output ?: "auto",
                        section,
                    ).joinToString("_").lowercase(Locale.ROOT),
                    protocol = facts.protocol,
                    host = facts.host,
                    port = facts.port,
                    path = facts.path,
                    requestProfile = requestProfile,
                    outputFormat = facts.output,
                    result = when {
                        result.isFailure -> "failure"
                        value is Collection<*> && value.isEmpty() -> "empty"
                        else -> "success"
                    },
                    httpStatus = extractHttpStatus(message),
                    durationMs = duration,
                    itemCount = value?.let(itemCount),
                    errorCode = message?.let(::classifyError),
                    errorMessage = message,
                    platform = platform,
                    appVersion = BuildConfig.VERSION_NAME,
                    occurredAt = nowIso(),
                ),
            )
        }
        return result
    }

    private suspend fun <T> observedList(
        source: String,
        playlistId: String,
        correlationId: String,
        section: String,
        transport: String,
        phase: String,
        requestProfile: String,
        loader: suspend () -> List<T>,
    ): Result<List<T>> = observed(
        source = source,
        playlistId = playlistId,
        correlationId = correlationId,
        section = section,
        transport = transport,
        phase = phase,
        requestProfile = requestProfile,
        itemCount = List<T>::size,
        loader = loader,
    )

    private fun endpointFacts(source: String, transport: String, section: String): EndpointFacts {
        val raw = sourceWithoutMarker(source)
        val parsed = runCatching { URL(raw) }.getOrNull()
            ?: return EndpointFacts("unknown", "unknown", null, "/", null)
        val query = parsed.query.orEmpty().split('&').mapNotNull { part ->
            val separator = part.indexOf('=')
            if (separator <= 0) null else part.substring(0, separator).lowercase(Locale.ROOT) to
                part.substring(separator + 1)
        }.toMap()
        val port = when {
            parsed.port > 0 -> parsed.port
            parsed.protocol.equals("https", true) -> 443
            parsed.protocol.equals("http", true) -> 80
            else -> null
        }
        val path = when {
            transport == "xtream" && section == "authentication" -> "/player_api.php"
            transport == "xtream" -> "/player_api.php"
            else -> parsed.path.take(180).ifBlank { "/" }
        }
        return EndpointFacts(
            protocol = parsed.protocol.lowercase(Locale.ROOT),
            host = parsed.host.lowercase(Locale.ROOT).ifBlank { "unknown" },
            port = port,
            path = path,
            output = query["output"]
                ?.lowercase(Locale.ROOT)
                ?.replace(Regex("[^a-z0-9]"), "")
                ?.take(20),
        )
    }

    private fun isDefinitiveAuthenticationFailure(message: String): Boolean {
        val value = message.lowercase(Locale.ROOT)
        return value.contains("[xtream_auth_invalid]") ||
            value.contains("[xtream_auth_expired]") ||
            value.contains("não autoriz") ||
            value.contains("unauthorized") ||
            value.contains("credenciais inválidas")
    }

    private fun isProviderWideFailure(message: String): Boolean {
        val value = message.lowercase(Locale.ROOT)
        return value.contains("timeout") ||
            value.contains("tempo limite") ||
            value.contains("connection reset") ||
            value.contains("socketexception") ||
            value.contains("dns") ||
            value.contains("unknown host") ||
            value.contains("tls") ||
            value.contains("ssl") ||
            value.contains("certificate") ||
            value.contains("failed to connect")
    }

    private fun classifyError(message: String): String {
        val value = message.lowercase(Locale.ROOT)
        return when {
            value.contains("auth_expired") -> "ACCOUNT_EXPIRED"
            value.contains("auth_invalid") || value.contains("401") -> "AUTHENTICATION_FAILED"
            value.contains("timeout") || value.contains("tempo limite") -> "TIMEOUT"
            value.contains("connection reset") || value.contains("socketexception") -> "CONNECTION_RESET"
            value.contains("unknown host") || value.contains("dns") -> "DNS_FAILED"
            value.contains("tls") || value.contains("ssl") || value.contains("certificate") -> "TLS_FAILED"
            value.contains("404") -> "HTTP_404"
            value.contains("403") -> "HTTP_403"
            value.contains("vazia") || value.contains("sem itens") -> "EMPTY_RESPONSE"
            value.contains("html") -> "HTML_RESPONSE"
            value.contains("inválid") || value.contains("invalid") -> "INVALID_RESPONSE"
            else -> "PROVIDER_ATTEMPT_FAILED"
        }
    }

    private fun cleanMessage(message: String): String = message
        .replace(Regex("\\[(?:XTREAM|MATRIX)_[A-Z_]+]"), "")
        .trim()

    private fun extractHttpStatus(message: String?): Int? =
        message?.let { Regex("HTTP\\s+(\\d{3})", RegexOption.IGNORE_CASE).find(it) }
            ?.groupValues
            ?.getOrNull(1)
            ?.toIntOrNull()

    private fun sourceWithoutMarker(source: String): String =
        source.substringBefore(DirectM3uClient.DIRECT_MARKER).trim()

    private fun detectPlatform(context: Context): String {
        val manager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        val mode = manager?.currentModeType
            ?: (context.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK)
        return if (mode == Configuration.UI_MODE_TYPE_TELEVISION) "androidtv" else "android"
    }

    private fun nowIso(): String = ISO_FORMAT.get().format(Date())

    private data class EndpointFacts(
        val protocol: String,
        val host: String,
        val port: Int?,
        val path: String,
        val output: String?,
    )

    private companion object {
        const val SESSION_BUDGET_MS = 75_000L
        val ISO_FORMAT = object : ThreadLocal<SimpleDateFormat>() {
            override fun initialValue() = SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.US,
            ).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
        }
    }
}
