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
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.net.UnknownHostException
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import javax.net.ssl.SSLException

/**
 * Via rápida para mostrar o primeiro conteúdo de uma conta Xtream.
 * Consulta somente autenticação e get_live_streams, sem bloquear a tela
 * aguardando categorias, filmes e séries.
 */
internal class FastXtreamChannelClient(
    context: Context,
    private val reportAttempt: (ProviderAttemptReport) -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val cacheDirectory = File(appContext.cacheDir, CACHE_DIRECTORY).apply { mkdirs() }
    private val authenticationMutex = Mutex()
    private val authenticationCache = mutableMapOf<String, Long>()
    private val platform = detectPlatform(appContext)

    fun supports(markedUrl: String): Boolean = parseCredentials(markedUrl) != null

    suspend fun loadChannels(
        markedUrl: String,
        attemptContext: ProviderAttemptContext,
    ): List<NativeChannel> = withContext(Dispatchers.IO) {
        val credentials = parseCredentials(markedUrl)
            ?: throw CatalogLoadException(
                "[XTREAM_AUTH_INVALID] A origem direta não contém credenciais Xtream válidas.",
            )
        val started = SystemClock.elapsedRealtime()
        val result = runCatching {
            verifyAuthentication(credentials)
            val text = request(
                credentials = credentials,
                action = "get_live_streams",
                maximumBytes = MAX_CHANNEL_RESPONSE_BYTES,
                allowStale = true,
            )
            val array = runCatching { JSONArray(text) }.getOrElse {
                throw CatalogLoadException(
                    "[XTREAM_RESPONSE_INVALID] A API Xtream retornou canais inválidos.",
                )
            }
            array.jsonObjects().mapNotNull { item ->
                val streamId = item.stringValue("stream_id") ?: return@mapNotNull null
                val name = item.stringValue("name") ?: return@mapNotNull null
                val playbackUrls = credentials.liveStreamUrls(streamId)
                NativeChannel(
                    id = "xtream-fast-ch-$streamId",
                    name = name,
                    groupTitle = "Canais",
                    logoUrl = item.stringValue("stream_icon"),
                    primaryUrl = playbackUrls.first(),
                    playbackUrls = playbackUrls,
                )
            }
        }

        val elapsed = (SystemClock.elapsedRealtime() - started).coerceAtLeast(0)
        val channels = result.getOrNull()
        val failure = result.exceptionOrNull()?.message
        val endpoint = credentials.apiUrl("get_live_streams")
        runCatching {
            reportAttempt(
                ProviderAttemptReport(
                    clientEventId = "matrix:${UUID.randomUUID()}",
                    playlistId = attemptContext.playlistId,
                    correlationId = attemptContext.correlationId,
                    phase = "fast",
                    section = "channels",
                    transport = "xtream",
                    strategyKey = "xtream_fast_first_content_${endpoint.protocol}_${endpoint.effectivePort()}",
                    protocol = endpoint.protocol.lowercase(Locale.ROOT),
                    host = endpoint.host.lowercase(Locale.ROOT),
                    port = endpoint.effectivePort(),
                    path = endpoint.path.ifBlank { "/" }.take(180),
                    requestProfile = USER_AGENT,
                    outputFormat = credentials.output.takeIf(String::isNotBlank),
                    result = when {
                        result.isFailure -> "failure"
                        channels.isNullOrEmpty() -> "empty"
                        else -> "success"
                    },
                    durationMs = elapsed,
                    itemCount = channels?.size,
                    errorCode = failure?.let(::classifyError),
                    errorMessage = failure,
                    platform = platform,
                    appVersion = BuildConfig.VERSION_NAME,
                    occurredAt = nowIso(),
                ),
            )
        }
        result.getOrThrow()
    }

    private suspend fun verifyAuthentication(credentials: FastCredentials) =
        authenticationMutex.withLock {
            val key = sha256("${credentials.server}|${credentials.username}|${credentials.password}")
            val now = System.currentTimeMillis()
            if ((authenticationCache[key] ?: 0L) > now) return@withLock

            val text = request(
                credentials = credentials,
                action = null,
                maximumBytes = AUTH_RESPONSE_BYTES,
                allowStale = false,
            )
            val root = runCatching { JSONObject(text) }.getOrElse {
                throw CatalogLoadException(
                    "[XTREAM_AUTH_INCOMPATIBLE] A autenticação Xtream retornou dados inválidos.",
                )
            }
            val userInfo = root.optJSONObject("user_info") ?: root
            val auth = userInfo.stringValue("auth")
            val status = userInfo.stringValue("status")?.lowercase(Locale.ROOT).orEmpty()
            val expiration = userInfo.stringValue("exp_date")?.toLongOrNull()?.takeIf { it > 0L }
            val nowSeconds = now / 1_000L

            if (auth == "0" || status.contains("invalid") || status.contains("banned") ||
                status.contains("disabled")
            ) {
                throw CatalogLoadException(
                    "[XTREAM_AUTH_INVALID] Usuário ou senha Xtream inválidos, bloqueados ou desativados.",
                )
            }
            if (status.contains("expired") || (expiration != null && expiration <= nowSeconds)) {
                throw CatalogLoadException("[XTREAM_AUTH_EXPIRED] A conta Xtream está vencida.")
            }
            if (auth != "1" && !status.contains("active")) {
                throw CatalogLoadException(
                    "[XTREAM_AUTH_INCOMPATIBLE] O servidor não confirmou uma sessão Xtream ativa.",
                )
            }

            authenticationCache[key] = now + AUTH_CACHE_TTL_MS
            authenticationCache.entries.removeIf { it.value <= now }
            while (authenticationCache.size > MAX_AUTH_CACHE_ENTRIES) {
                authenticationCache.keys.firstOrNull()?.let(authenticationCache::remove) ?: break
            }
        }

    private fun request(
        credentials: FastCredentials,
        action: String?,
        maximumBytes: Long,
        allowStale: Boolean,
    ): String {
        val key = sha256(
            "${credentials.server}|${credentials.username}|${credentials.password}|${action ?: "auth"}",
        )
        val cacheFile = File(cacheDirectory, "$key.json")
        val now = System.currentTimeMillis()

        if (
            action != null && cacheFile.isFile && cacheFile.length() in 1..maximumBytes &&
            now - cacheFile.lastModified() <= FRESH_CACHE_TTL_MS
        ) {
            return cacheFile.readText(Charsets.UTF_8)
        }

        val connection = (credentials.apiUrl(action).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = if (action == null) AUTH_READ_TIMEOUT_MS else CATALOG_READ_TIMEOUT_MS
            instanceFollowRedirects = true
            useCaches = false
            setRequestProperty("Accept", "application/json, text/plain, */*")
            setRequestProperty("Connection", "close")
            setRequestProperty("User-Agent", USER_AGENT)
        }

        return try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw CatalogLoadException(
                    when (status) {
                        401, 403 -> "[XTREAM_AUTH_INVALID] O servidor recusou as credenciais Xtream (HTTP $status)."
                        404 -> "[XTREAM_AUTH_ENDPOINT_NOT_FOUND] A API Xtream respondeu HTTP 404."
                        408, 429 -> "[XTREAM_SERVER_BUSY] A API Xtream respondeu HTTP $status."
                        else -> "[XTREAM_HTTP_ERROR] A API Xtream respondeu HTTP $status."
                    },
                )
            }
            if (connection.contentLengthLong > maximumBytes) {
                throw CatalogLoadException(
                    "[XTREAM_RESPONSE_TOO_LARGE] A resposta Xtream excede o limite rápido.",
                )
            }
            val text = connection.inputStream.use { readLimitedUtf8(it, maximumBytes) }
            if (text.isBlank()) {
                throw CatalogLoadException("[XTREAM_RESPONSE_EMPTY] A API Xtream retornou uma resposta vazia.")
            }
            if (text.trimStart().startsWith("<")) {
                throw CatalogLoadException(
                    "[XTREAM_RESPONSE_HTML] A API Xtream devolveu HTML em vez de dados.",
                )
            }
            if (action != null) saveCache(cacheFile, text)
            text
        } catch (error: Exception) {
            val staleAvailable = allowStale && cacheFile.isFile &&
                cacheFile.length() in 1..maximumBytes &&
                now - cacheFile.lastModified() <= STALE_CACHE_TTL_MS
            if (staleAvailable) return cacheFile.readText(Charsets.UTF_8)
            throw mapConnectionError(error)
        } finally {
            connection.disconnect()
        }
    }

    private fun saveCache(cacheFile: File, text: String) {
        runCatching {
            val temporary = File(cacheDirectory, "${cacheFile.name}.tmp")
            temporary.writeText(text, Charsets.UTF_8)
            if (!temporary.renameTo(cacheFile)) {
                cacheFile.writeText(text, Charsets.UTF_8)
                temporary.delete()
            }
        }
    }

    private fun mapConnectionError(error: Exception): CatalogLoadException = when (error) {
        is CatalogLoadException -> error
        is SocketTimeoutException -> CatalogLoadException(
            "[XTREAM_FAST_TIMEOUT] O servidor autenticou, mas não entregou os canais rapidamente.",
        )
        is UnknownHostException -> CatalogLoadException(
            "[XTREAM_DNS_FAILED] O domínio do servidor Xtream não foi encontrado.",
        )
        is SSLException -> CatalogLoadException(
            "[XTREAM_TLS_FAILED] A conexão segura com o servidor Xtream falhou.",
        )
        is SocketException -> CatalogLoadException(
            "[XTREAM_CONNECTION_RESET] O servidor Xtream encerrou a conexão.",
        )
        is IOException -> CatalogLoadException(
            "[XTREAM_CONNECTION_FAILED] Não foi possível conectar ao servidor Xtream.",
        )
        else -> CatalogLoadException(
            "[XTREAM_FAST_FAILED] O servidor não entregou o primeiro conteúdo.",
        )
    }

    private fun readLimitedUtf8(input: InputStream, maximumBytes: Long): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > maximumBytes) {
                throw CatalogLoadException(
                    "[XTREAM_RESPONSE_TOO_LARGE] Download Xtream excedeu o limite rápido.",
                )
            }
            output.write(buffer, 0, read)
        }
        return output.toString(StandardCharsets.UTF_8.name())
    }

    private fun classifyError(message: String): String {
        val normalized = message.lowercase(Locale.ROOT)
        return when {
            normalized.contains("auth_expired") -> "ACCOUNT_EXPIRED"
            normalized.contains("auth_invalid") -> "AUTHENTICATION_FAILED"
            normalized.contains("fast_timeout") || normalized.contains("timeout") -> "TIMEOUT"
            normalized.contains("dns_failed") -> "DNS_FAILED"
            normalized.contains("tls_failed") -> "TLS_FAILED"
            normalized.contains("connection_reset") -> "CONNECTION_RESET"
            normalized.contains("connection_failed") -> "CONNECTION_FAILED"
            normalized.contains("404") -> "HTTP_404"
            normalized.contains("response_empty") -> "EMPTY_RESPONSE"
            normalized.contains("response_invalid") -> "INVALID_RESPONSE"
            else -> "PROVIDER_ATTEMPT_FAILED"
        }
    }

    private fun detectPlatform(context: Context): String {
        val manager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        val mode = manager?.currentModeType
            ?: (context.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK)
        return if (mode == Configuration.UI_MODE_TYPE_TELEVISION) "androidtv" else "android"
    }

    private fun nowIso(): String = ISO_FORMAT.get().format(Date())

    private companion object {
        const val CACHE_DIRECTORY = "fast_xtream_channels_v1"
        const val FRESH_CACHE_TTL_MS = 6L * 60L * 60L * 1_000L
        const val STALE_CACHE_TTL_MS = 7L * 24L * 60L * 60L * 1_000L
        const val AUTH_CACHE_TTL_MS = 5L * 60L * 1_000L
        const val MAX_AUTH_CACHE_ENTRIES = 32
        const val CONNECT_TIMEOUT_MS = 3_500
        const val AUTH_READ_TIMEOUT_MS = 4_500
        const val CATALOG_READ_TIMEOUT_MS = 8_500
        const val AUTH_RESPONSE_BYTES = 1L * 1024L * 1024L
        const val MAX_CHANNEL_RESPONSE_BYTES = 48L * 1024L * 1024L
        const val USER_AGENT = "IPTVSmartersPro"
        val ISO_FORMAT = object : ThreadLocal<SimpleDateFormat>() {
            override fun initialValue() = SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.US,
            ).apply { timeZone = TimeZone.getTimeZone("UTC") }
        }
    }
}

private data class FastCredentials(
    val server: String,
    val username: String,
    val password: String,
    val output: String,
) {
    fun apiUrl(action: String?): URL {
        val query = buildList {
            add("username=${urlEncode(username)}")
            add("password=${urlEncode(password)}")
            action?.let { add("action=${urlEncode(it)}") }
        }.joinToString("&")
        return URL("$server/player_api.php?$query")
    }

    fun liveStreamUrls(streamId: String): List<String> {
        val primary = if (output.equals("m3u8", true)) "m3u8" else "ts"
        val alternate = if (primary == "m3u8") "ts" else "m3u8"
        return listOf(
            streamUrl("live", streamId, primary),
            streamUrl("live", streamId, alternate),
            streamUrl(null, streamId, primary),
            streamUrl(null, streamId, alternate),
        ).distinct()
    }

    private fun streamUrl(kind: String?, streamId: String, extension: String): String {
        val prefix = kind?.let { "/$it" }.orEmpty()
        return "$server$prefix/${urlEncode(username)}/${urlEncode(password)}/" +
            "${urlEncode(streamId)}.$extension"
    }
}

private fun parseCredentials(markedUrl: String): FastCredentials? {
    val source = markedUrl.substringBefore(DirectM3uClient.DIRECT_MARKER).trim()
    val url = runCatching { URL(source) }.getOrNull() ?: return null
    if (url.protocol != "http" && url.protocol != "https") return null
    val parameters = url.query.orEmpty().split('&').mapNotNull { part ->
        val separator = part.indexOf('=')
        if (separator <= 0) return@mapNotNull null
        urlDecode(part.substring(0, separator)).lowercase(Locale.ROOT) to
            urlDecode(part.substring(separator + 1))
    }.toMap()
    val username = parameters["username"]?.takeIf(String::isNotBlank) ?: return null
    val password = parameters["password"]?.takeIf(String::isNotBlank) ?: return null
    val output = parameters["output"].orEmpty()
    val parentPath = url.path.substringBeforeLast('/', "")
    val server = buildString {
        append(url.protocol)
        append("://")
        append(url.authority)
        if (parentPath.isNotBlank()) append(parentPath)
    }.trimEnd('/')
    return FastCredentials(server, username, password, output)
}

private fun URL.effectivePort(): Int = when {
    port > 0 -> port
    protocol.equals("https", true) -> 443
    else -> 80
}

private fun JSONObject.stringValue(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().takeIf(String::isNotEmpty)
}

private fun JSONArray.jsonObjects(): List<JSONObject> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let(::add)
}

private fun urlDecode(value: String): String =
    runCatching { URLDecoder.decode(value, StandardCharsets.UTF_8.name()) }.getOrDefault(value)

private fun urlEncode(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

private fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
