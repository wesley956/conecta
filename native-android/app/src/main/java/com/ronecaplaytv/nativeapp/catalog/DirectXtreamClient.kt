package com.ronecaplaytv.nativeapp.catalog

import android.content.Context
import com.ronecaplaytv.nativeapp.network.SourceNetworkPolicyRegistry
import com.ronecaplaytv.nativeapp.network.SourceNetworkScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import okhttp3.Request
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
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.SSLException

internal data class XtreamAuthentication(
    val expiresAtEpochSeconds: Long?,
    val activeConnections: Int?,
    val maxConnections: Int?,
)

/**
 * Loads direct playlists through the native Xtream API.
 *
 * Direct URLs arrive marked by device-config-direct. Credentials never leave the
 * device after that response: the app talks straight to the provider and stores
 * API responses only in its private cache directory.
 */
internal class DirectXtreamClient(context: Context) {
    private val cacheDirectory = File(context.cacheDir, CACHE_DIRECTORY).apply { mkdirs() }
    private val authenticationMutex = Mutex()
    private val authenticationCache = mutableMapOf<String, CachedAuthentication>()

    suspend fun verifyAuthentication(markedUrl: String): XtreamAuthentication =
        withContext(Dispatchers.IO) {
            val credentials = credentialsFrom(markedUrl)
                ?: throw CatalogLoadException(
                    "[XTREAM_AUTH_INVALID] A origem direta não contém credenciais Xtream válidas.",
                )
            verifyAuthentication(credentials)
        }

    suspend fun loadChannels(markedUrl: String): List<NativeChannel> = withContext(Dispatchers.IO) {
        val credentials = credentialsFrom(markedUrl)
            ?: throw CatalogLoadException(
                "[XTREAM_AUTH_INVALID] A origem direta não contém credenciais Xtream válidas.",
            )
        verifyAuthentication(credentials)
        val categories = runCatching {
            loadCategories(credentials, "get_live_categories")
        }.getOrDefault(emptyMap())
        requestArray(credentials, "get_live_streams").objects().mapNotNull { item ->
            val streamId = item.optStringValue("stream_id") ?: return@mapNotNull null
            val name = item.optStringValue("name") ?: return@mapNotNull null
            val playbackUrls = credentials.liveStreamUrls(streamId)
            NativeChannel(
                id = "xtream-ch-$streamId",
                name = name,
                groupTitle = categories[item.optStringValue("category_id")] ?: "Canais",
                logoUrl = item.optStringValue("stream_icon"),
                primaryUrl = playbackUrls.first(),
                playbackUrls = playbackUrls,
            )
        }
    }

    suspend fun loadMovies(markedUrl: String): List<NativeMovie> = withContext(Dispatchers.IO) {
        val credentials = credentialsFrom(markedUrl)
            ?: throw CatalogLoadException(
                "[XTREAM_AUTH_INVALID] A origem direta não contém credenciais Xtream válidas.",
            )
        verifyAuthentication(credentials)
        val categories = runCatching {
            loadCategories(credentials, "get_vod_categories")
        }.getOrDefault(emptyMap())
        requestArray(credentials, "get_vod_streams").objects().mapNotNull { item ->
            val streamId = item.optStringValue("stream_id") ?: return@mapNotNull null
            val name = item.optStringValue("name") ?: return@mapNotNull null
            val extension = safeExtension(item.optStringValue("container_extension"), "mp4")
            val streamUrl = credentials.streamUrl("movie", streamId, extension)
            NativeMovie(
                id = "xtream-mv-$streamId",
                name = name,
                year = item.optIntValue("year") ?: yearFrom(item.optStringValue("releaseDate")),
                duration = item.optStringValue("duration"),
                synopsis = item.optStringValue("plot"),
                coverUrl = item.optStringValue("stream_icon"),
                category = categories[item.optStringValue("category_id")] ?: "Filmes",
                primaryUrl = streamUrl,
                playbackUrls = listOf(streamUrl),
            )
        }
    }

    suspend fun loadSeries(markedUrl: String): List<NativeSeries> = withContext(Dispatchers.IO) {
        val credentials = credentialsFrom(markedUrl)
            ?: throw CatalogLoadException(
                "[XTREAM_AUTH_INVALID] A origem direta não contém credenciais Xtream válidas.",
            )
        verifyAuthentication(credentials)
        val categories = runCatching {
            loadCategories(credentials, "get_series_categories")
        }.getOrDefault(emptyMap())
        requestArray(credentials, "get_series").objects().mapNotNull { item ->
            val seriesId = item.optStringValue("series_id") ?: return@mapNotNull null
            val name = item.optStringValue("name") ?: return@mapNotNull null
            val detailKey = registerSeries(credentials, seriesId)
            NativeSeries(
                id = "xtream-sr-$seriesId",
                name = name,
                coverUrl = item.optStringValue("cover"),
                category = categories[item.optStringValue("category_id")] ?: "Séries",
                synopsis = item.optStringValue("plot"),
                seasons = emptyList(),
                xtreamSeriesId = detailKey,
            )
        }
    }

    private suspend fun verifyAuthentication(
        credentials: XtreamCredentials,
    ): XtreamAuthentication = authenticationMutex.withLock {
        val cacheKey = sha256(
            "${credentials.server}|${credentials.username}|${credentials.password}",
        )
        val now = System.currentTimeMillis()
        authenticationCache[cacheKey]
            ?.takeIf { it.validUntilMillis > now }
            ?.let { cached ->
                cached.errorMessage?.let { throw CatalogLoadException(it) }
                return@withLock requireNotNull(cached.authentication)
            }

        val result = runCatching { requestAuthentication(credentials) }
        val message = result.exceptionOrNull()?.message
        val ttl = when {
            result.isSuccess -> AUTH_SUCCESS_TTL_MS
            message?.let(::isDefinitiveAuthenticationMessage) == true -> AUTH_FAILURE_TTL_MS
            else -> AUTH_TRANSIENT_TTL_MS
        }
        authenticationCache[cacheKey] = CachedAuthentication(
            authentication = result.getOrNull(),
            errorMessage = message,
            validUntilMillis = now + ttl,
        )
        if (authenticationCache.size > MAX_AUTH_CACHE_ENTRIES) {
            val expiredKeys = authenticationCache
                .filterValues { it.validUntilMillis <= now }
                .keys
            expiredKeys.forEach(authenticationCache::remove)
            while (authenticationCache.size > MAX_AUTH_CACHE_ENTRIES) {
                authenticationCache.keys.firstOrNull()?.let(authenticationCache::remove) ?: break
            }
        }
        result.getOrThrow()
    }

    private fun requestAuthentication(credentials: XtreamCredentials): XtreamAuthentication {
        val text = requestText(
            credentials = credentials,
            action = null,
            extraParameters = emptyMap(),
            maximumBytes = AUTH_RESPONSE_BYTES,
            useDiskCache = false,
        )
        val root = runCatching { JSONObject(text) }.getOrElse {
            throw CatalogLoadException(
                "[XTREAM_AUTH_INCOMPATIBLE] A autenticação Xtream retornou uma resposta inválida.",
            )
        }
        val userInfo = root.optJSONObject("user_info") ?: root
        val auth = userInfo.optStringValue("auth")
        val status = userInfo.optStringValue("status")
            ?.lowercase(Locale.ROOT)
            .orEmpty()
        val expiration = userInfo.optStringValue("exp_date")?.toLongOrNull()
            ?.takeIf { it > 0L }
        val nowSeconds = System.currentTimeMillis() / 1_000L

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
            val message = userInfo.optStringValue("message")
                ?: root.optStringValue("message")
            throw CatalogLoadException(
                "[XTREAM_AUTH_INCOMPATIBLE] " +
                    (message?.take(180)
                        ?: "O servidor não confirmou uma sessão Xtream ativa."),
            )
        }

        return XtreamAuthentication(
            expiresAtEpochSeconds = expiration,
            activeConnections = userInfo.optStringValue("active_cons")?.toIntOrNull(),
            maxConnections = userInfo.optStringValue("max_connections")?.toIntOrNull(),
        )
    }

    private fun loadCategories(credentials: XtreamCredentials, action: String): Map<String, String> =
        requestArray(credentials, action).objects().mapNotNull { item ->
            val id = item.optStringValue("category_id") ?: return@mapNotNull null
            val name = item.optStringValue("category_name") ?: return@mapNotNull null
            id to name
        }.toMap()

    private fun loadSeriesEpisodes(request: DirectSeriesRequest): List<NativeSeason> {
        verifyAuthenticationBlocking(request.credentials)
        val response = requestObject(
            credentials = request.credentials,
            action = "get_series_info",
            extraParameters = mapOf("series_id" to request.seriesId),
        )
        val episodes = response.optJSONObject("episodes") ?: return emptyList()
        return buildList {
            val seasonKeys = episodes.keys().asSequence()
                .sortedWith(compareBy<String> { it.toIntOrNull() ?: Int.MAX_VALUE }.thenBy { it })
                .toList()
            for (seasonKey in seasonKeys) {
                val values = episodes.optJSONArray(seasonKey) ?: continue
                val parsedEpisodes = buildList {
                    for (index in 0 until values.length()) {
                        val item = values.optJSONObject(index) ?: continue
                        val episodeId = item.optStringValue("id") ?: continue
                        val extension = safeExtension(
                            item.optStringValue("container_extension"),
                            "mp4",
                        )
                        val streamUrl = request.credentials.streamUrl(
                            kind = "series",
                            streamId = episodeId,
                            extension = extension,
                        )
                        val info = item.optJSONObject("info")
                        add(
                            NativeEpisode(
                                id = "xtream-ep-$episodeId",
                                number = item.optIntValue("episode_num") ?: index + 1,
                                name = item.optStringValue("title")
                                    ?: "Episódio ${index + 1}",
                                duration = info?.optStringValue("duration"),
                                primaryUrl = streamUrl,
                                playbackUrls = listOf(streamUrl),
                            ),
                        )
                    }
                }.sortedBy(NativeEpisode::number)
                if (parsedEpisodes.isNotEmpty()) {
                    add(
                        NativeSeason(
                            number = seasonKey.toIntOrNull()?.coerceAtLeast(1) ?: size + 1,
                            episodes = parsedEpisodes,
                        ),
                    )
                }
            }
        }
    }

    private fun verifyAuthenticationBlocking(credentials: XtreamCredentials) {
        requestAuthentication(credentials)
    }

    private fun requestArray(
        credentials: XtreamCredentials,
        action: String,
    ): JSONArray {
        val text = requestText(credentials, action, emptyMap())
        return runCatching { JSONArray(text) }.getOrElse {
            val message = runCatching { JSONObject(text).optStringValue("message") }.getOrNull()
            throw CatalogLoadException(
                message?.take(180)
                    ?: "[XTREAM_RESPONSE_INVALID] A API Xtream retornou dados inválidos em $action.",
            )
        }
    }

    private fun requestObject(
        credentials: XtreamCredentials,
        action: String,
        extraParameters: Map<String, String>,
    ): JSONObject {
        val text = requestText(credentials, action, extraParameters)
        return runCatching { JSONObject(text) }.getOrElse {
            throw CatalogLoadException(
                "[XTREAM_RESPONSE_INVALID] A API Xtream retornou dados inválidos em $action.",
            )
        }
    }

    private fun requestText(
        credentials: XtreamCredentials,
        action: String?,
        extraParameters: Map<String, String>,
        maximumBytes: Long = MAX_RESPONSE_BYTES,
        useDiskCache: Boolean = true,
    ): String {
        val cacheKey = sha256(
            listOf(
                credentials.server,
                credentials.username,
                credentials.password,
                action ?: "authenticate",
                extraParameters.toSortedMap().entries.joinToString("&"),
            ).joinToString("|"),
        )
        val cacheFile = File(cacheDirectory, "$cacheKey.json")
        val now = System.currentTimeMillis()
        if (
            useDiskCache &&
            cacheFile.isFile &&
            cacheFile.length() in 1..maximumBytes &&
            now - cacheFile.lastModified() <= CACHE_TTL_MS
        ) {
            return cacheFile.readText(Charsets.UTF_8)
        }

        val endpoint = credentials.apiUrl(action, extraParameters)
        val request = Request.Builder().url(endpoint).get()
            .header("Accept", "application/json, text/plain, */*")
            .header("Connection", "keep-alive")
            .header("User-Agent", USER_AGENT)
            .build()
        val client = SourceNetworkPolicyRegistry.clientFor(endpoint.toString(), SourceNetworkScope.Catalog)

        return try {
            client.newCall(request).execute().use { response ->
                val status = response.code
                if (status !in 200..299) {
                    val message = when (status) {
                        401, 403 -> "[XTREAM_AUTH_INVALID] O servidor recusou as credenciais Xtream (HTTP $status)."
                        404 -> "[XTREAM_AUTH_ENDPOINT_NOT_FOUND] A API Xtream respondeu HTTP 404."
                        408, 429 -> "[XTREAM_SERVER_BUSY] A API Xtream respondeu HTTP $status."
                        else -> "[XTREAM_HTTP_ERROR] A API Xtream respondeu HTTP $status" + action?.let { " em $it." }.orEmpty()
                    }
                    throw CatalogLoadException(message)
                }
                val body = response.body
                if (body.contentLength() > maximumBytes) throw CatalogLoadException("[XTREAM_RESPONSE_TOO_LARGE] A resposta Xtream excede o limite seguro.")
                val text = body.byteStream().use { readLimitedUtf8(it, maximumBytes) }
                if (text.isBlank()) throw CatalogLoadException("[XTREAM_RESPONSE_EMPTY] A API Xtream retornou uma resposta vazia" + action?.let { " em $it." }.orEmpty())
                if (text.trimStart().startsWith("<")) throw CatalogLoadException("[XTREAM_RESPONSE_HTML] A API Xtream devolveu uma página HTML em vez de dados.")
                if (useDiskCache) runCatching {
                    val temporary = File(cacheDirectory, "$cacheKey.tmp")
                    temporary.writeText(text, Charsets.UTF_8)
                    if (!temporary.renameTo(cacheFile)) { cacheFile.writeText(text, Charsets.UTF_8); temporary.delete() }
                }
                text
            }
        } catch (error: CatalogLoadException) { throw error
        } catch (error: SocketTimeoutException) { throw CatalogLoadException("[XTREAM_TIMEOUT] O servidor Xtream excedeu o tempo limite.")
        } catch (error: UnknownHostException) { throw CatalogLoadException("[XTREAM_DNS_FAILED] O domínio do servidor Xtream não foi encontrado.")
        } catch (error: SSLException) { throw CatalogLoadException("[XTREAM_TLS_FAILED] A conexão segura com o servidor Xtream falhou.")
        } catch (error: SocketException) { throw CatalogLoadException("[XTREAM_CONNECTION_RESET] O servidor Xtream encerrou a conexão.")
        } catch (error: IOException) {
            val tls = generateSequence(error as Throwable?) { it.cause }.any { it is SSLException }
            throw CatalogLoadException(if (tls) "[XTREAM_TLS_FAILED] A conexão segura com o servidor Xtream falhou." else "[XTREAM_CONNECTION_FAILED] Não foi possível conectar ao servidor Xtream.")
        }
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
                    "[XTREAM_RESPONSE_TOO_LARGE] Download da API Xtream excedeu o limite seguro.",
                )
            }
            output.write(buffer, 0, read)
        }
        return output.toString(StandardCharsets.UTF_8.name())
    }

    companion object {
        const val SERIES_KEY_PREFIX = "direct-xtream:"
        private const val CACHE_DIRECTORY = "xtream_catalog_v2"
        private const val CACHE_TTL_MS = 6L * 60L * 60L * 1_000L
        private const val AUTH_SUCCESS_TTL_MS = 5L * 60L * 1_000L
        private const val AUTH_FAILURE_TTL_MS = 30L * 1_000L
        private const val AUTH_TRANSIENT_TTL_MS = 10L * 1_000L
        private const val MAX_AUTH_CACHE_ENTRIES = 32
        private const val CONNECT_TIMEOUT_MS = 8_000
        private const val READ_TIMEOUT_MS = 18_000
        private const val MAX_RESPONSE_BYTES = 64L * 1024L * 1024L
        private const val AUTH_RESPONSE_BYTES = 1L * 1024L * 1024L
        private const val USER_AGENT = "IPTVSmartersPro"
        private val directSeries = ConcurrentHashMap<String, DirectSeriesRequest>()

        fun supports(markedUrl: String): Boolean = credentialsFrom(markedUrl) != null

        fun authenticationEndpoint(markedUrl: String): String? {
            val marker = if (DirectM3uClient.isDirectUrl(markedUrl)) {
                DirectM3uClient.DIRECT_MARKER
            } else {
                ""
            }
            val credentials = credentialsFrom(markedUrl) ?: return null
            return credentials.apiUrl(null, emptyMap()).toString() + marker
        }

        fun isDirectSeriesKey(value: String): Boolean = value.startsWith(SERIES_KEY_PREFIX)

        suspend fun loadSeriesEpisodes(
            context: Context,
            seriesKey: String,
        ): List<NativeSeason> = withContext(Dispatchers.IO) {
            val request = directSeries[seriesKey]
                ?: throw CatalogLoadException(
                    "Atualize o catálogo antes de abrir os episódios desta série.",
                )
            DirectXtreamClient(context.applicationContext).loadSeriesEpisodes(request)
        }

        private fun registerSeries(
            credentials: XtreamCredentials,
            seriesId: String,
        ): String {
            val key = SERIES_KEY_PREFIX + sha256(
                "${credentials.server}|${credentials.username}|$seriesId",
            )
            directSeries[key] = DirectSeriesRequest(credentials, seriesId)
            return key
        }

        private fun credentialsFrom(markedUrl: String): XtreamCredentials? {
            val source = markedUrl.substringBefore(DirectM3uClient.DIRECT_MARKER).trim()
            val url = runCatching { URL(source) }.getOrNull() ?: return null
            if (url.protocol != "http" && url.protocol != "https") return null
            val parameters = url.query.orEmpty()
                .split('&')
                .mapNotNull { part ->
                    val separator = part.indexOf('=')
                    if (separator <= 0) return@mapNotNull null
                    decode(part.substring(0, separator)).lowercase(Locale.ROOT) to
                        decode(part.substring(separator + 1))
                }
                .toMap()
            val username = parameters["username"]?.takeIf(String::isNotBlank) ?: return null
            val password = parameters["password"]?.takeIf(String::isNotBlank) ?: return null
            val output = parameters["output"].orEmpty()
            val parentPath = url.path.substringBeforeLast('/', "")
            val server = buildString {
                append(url.protocol)
                append("://")
                append(url.authority)
                if (parentPath.isNotBlank()) {
                    append(parentPath)
                }
            }.trimEnd('/')
            return XtreamCredentials(server, username, password, output)
        }

        private fun isDefinitiveAuthenticationMessage(message: String): Boolean =
            message.contains("[XTREAM_AUTH_INVALID]") ||
                message.contains("[XTREAM_AUTH_EXPIRED]")

        private fun safeExtension(value: String?, fallback: String): String =
            value.orEmpty()
                .lowercase(Locale.ROOT)
                .replace(Regex("[^a-z0-9]"), "")
                .takeIf(String::isNotBlank)
                ?.take(8)
                ?: fallback

        private fun yearFrom(value: String?): Int? =
            value?.let { Regex("\\b(19\\d{2}|20\\d{2})\\b").find(it)?.value?.toIntOrNull() }

        private fun decode(value: String): String =
            runCatching { URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8.name()) }
                .getOrDefault(value)

        private fun encode(value: String): String =
            URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

        private fun sha256(value: String): String =
            MessageDigest.getInstance("SHA-256")
                .digest(value.toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }

    private data class XtreamCredentials(
        val server: String,
        val username: String,
        val password: String,
        val output: String,
    ) {
        fun apiUrl(action: String?, extraParameters: Map<String, String>): URL {
            val query = buildList {
                add("username=${encode(username)}")
                add("password=${encode(password)}")
                action?.takeIf(String::isNotBlank)?.let { add("action=${encode(it)}") }
                extraParameters.forEach { (key, value) ->
                    add("${encode(key)}=${encode(value)}")
                }
            }.joinToString("&")
            return URL("$server/player_api.php?$query")
        }

        fun liveStreamUrls(streamId: String): List<String> {
            val primaryExtension = if (output.equals("m3u8", ignoreCase = true)) {
                "m3u8"
            } else {
                "ts"
            }
            val alternateExtension = if (primaryExtension == "m3u8") "ts" else "m3u8"
            return listOf(
                streamUrl("live", streamId, primaryExtension),
                streamUrl("live", streamId, alternateExtension),
                streamUrl(null, streamId, primaryExtension),
                streamUrl(null, streamId, alternateExtension),
            ).distinct()
        }

        fun streamUrl(kind: String?, streamId: String, extension: String): String {
            val prefix = kind?.let { "/$it" }.orEmpty()
            return "$server$prefix/${encode(username)}/${encode(password)}/" +
                "${encode(streamId)}.${safeExtension(extension, "ts")}"
        }
    }

    private data class DirectSeriesRequest(
        val credentials: XtreamCredentials,
        val seriesId: String,
    )

    private data class CachedAuthentication(
        val authentication: XtreamAuthentication?,
        val errorMessage: String?,
        val validUntilMillis: Long,
    )
}

private fun JSONObject.optStringValue(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().takeIf(String::isNotEmpty)
}

private fun JSONObject.optIntValue(key: String): Int? =
    optStringValue(key)?.toIntOrNull()?.takeIf { it >= 0 }

private fun JSONArray.objects(): List<JSONObject> = buildList {
    for (index in 0 until length()) {
        optJSONObject(index)?.let(::add)
    }
}
