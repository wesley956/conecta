package com.ronecaplaytv.nativeapp.network

import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.nio.charset.StandardCharsets
import javax.net.ssl.SSLException

class PlaylistDiagnosticRunner {
    fun run(task: PlaylistDiagnosticTask): PlaylistDiagnosticSubmission {
        val source = requirePublicHttpUrl(task.sourceUrl)
        val requested = task.checks.toSet()
        val checks = if (looksXtream(source, task.playlistType)) {
            runXtream(source, requested)
        } else {
            runM3u(source, requested)
        }
        return PlaylistDiagnosticSubmission(taskId = task.id, checks = checks.take(3))
    }

    private fun runXtream(source: URL, requested: Set<String>): List<PlaylistDiagnosticCheck> {
        val parsed = parseXtream(source) ?: return listOf(
            PlaylistDiagnosticCheck("head", false, null, null, "NONSTANDARD_XTREAM"),
            PlaylistDiagnosticCheck("auth", false, null, null, "NONSTANDARD_XTREAM"),
            PlaylistDiagnosticCheck("playback", false, null, null, "NONSTANDARD_XTREAM"),
        ).filter { requested.isEmpty() || it.kind in requested }

        val results = mutableListOf<PlaylistDiagnosticCheck>()
        if (requested.isEmpty() || "head" in requested) {
            results += technicalCheck("head") {
                val response = request(parsed.playerApi, "HEAD", 1_024)
                CheckOutcome(response.code in 200..299 || response.code == 405, response.code, null)
            }
        }

        var authBody: String? = null
        if (requested.isEmpty() || "auth" in requested || "playback" in requested) {
            val auth = technicalCheck("auth") {
                val response = request(parsed.playerApi, "GET", 128 * 1_024)
                authBody = response.body
                val userInfo = runCatching { JSONObject(response.body).optJSONObject("user_info") }.getOrNull()
                val authValue = userInfo?.opt("auth")?.toString()?.lowercase()
                val valid = response.code in 200..299 && userInfo != null && authValue !in setOf("0", "false", "disabled", "banned")
                CheckOutcome(valid, response.code, if (valid) null else if (response.code == 401) "AUTH_INVALID" else "RESPONSE_INVALID")
            }
            if (requested.isEmpty() || "auth" in requested) results += auth
            if (!auth.ok) {
                if (requested.isEmpty() || "playback" in requested) {
                    results += PlaylistDiagnosticCheck("playback", false, null, null, "AUTH_REQUIRED")
                }
                return results.take(3)
            }
        }

        if (requested.isEmpty() || "playback" in requested) {
            results += technicalCheck("playback") {
                val contentUrl = URL(parsed.playerApi.toString() + "&action=get_live_streams&start=0&limit=1")
                val response = request(contentUrl, "GET", 512 * 1_024)
                val sample = firstStream(response.body)
                    ?: return@technicalCheck CheckOutcome(false, response.code, "CONTENT_SAMPLE_MISSING")
                val playback = URL(
                    parsed.origin,
                    "${parsed.basePath}/live/${encodePath(parsed.username)}/${encodePath(parsed.password)}/${sample.first}.${sample.second}",
                )
                val playbackResponse = request(playback, "HEAD", 1_024)
                CheckOutcome(
                    playbackResponse.code in 200..299 || playbackResponse.code == 405,
                    playbackResponse.code,
                    null,
                )
            }
        }

        @Suppress("UNUSED_VARIABLE")
        val ignoredAuthBody = authBody
        return results.take(3)
    }

    private fun runM3u(source: URL, requested: Set<String>): List<PlaylistDiagnosticCheck> {
        val results = mutableListOf<PlaylistDiagnosticCheck>()
        if (requested.isEmpty() || "head" in requested) {
            results += technicalCheck("head") {
                val response = request(source, "HEAD", 1_024)
                CheckOutcome(response.code in 200..299 || response.code == 405, response.code, null)
            }
        }
        if (requested.isEmpty() || "auth" in requested) {
            results += PlaylistDiagnosticCheck("auth", true, null, 0, "NOT_APPLICABLE")
        }
        if (requested.isEmpty() || "playback" in requested) {
            results += technicalCheck("playback") {
                val sampleResponse = request(source, "GET", 512 * 1_024)
                val itemUrl = firstM3uUrl(sampleResponse.body)
                    ?: return@technicalCheck CheckOutcome(false, sampleResponse.code, "CONTENT_SAMPLE_MISSING")
                val playback = requirePublicHttpUrl(itemUrl)
                val playbackResponse = request(playback, "HEAD", 1_024)
                CheckOutcome(
                    playbackResponse.code in 200..299 || playbackResponse.code == 405,
                    playbackResponse.code,
                    null,
                )
            }
        }
        return results.take(3)
    }

    private fun technicalCheck(kind: String, block: () -> CheckOutcome): PlaylistDiagnosticCheck {
        val started = SystemClock.elapsedRealtime()
        return try {
            val outcome = block()
            PlaylistDiagnosticCheck(
                kind = kind,
                ok = outcome.ok,
                httpStatus = outcome.httpStatus,
                latencyMs = (SystemClock.elapsedRealtime() - started).coerceAtMost(120_000),
                code = outcome.code,
            )
        } catch (_: SocketTimeoutException) {
            PlaylistDiagnosticCheck(kind, false, null, elapsed(started), "TIMEOUT")
        } catch (_: SSLException) {
            PlaylistDiagnosticCheck(kind, false, null, elapsed(started), "CERTIFICATE_INVALID")
        } catch (_: SecurityException) {
            PlaylistDiagnosticCheck(kind, false, null, elapsed(started), "BLOCKED_TARGET")
        } catch (_: Exception) {
            PlaylistDiagnosticCheck(kind, false, null, elapsed(started), "NETWORK_ERROR")
        }
    }

    private fun elapsed(started: Long) = (SystemClock.elapsedRealtime() - started).coerceAtMost(120_000)

    private fun request(url: URL, method: String, maxBytes: Int, redirectsLeft: Int = 3): TechnicalResponse {
        val target = requirePublicHttpUrl(url.toString())
        val connection = (target.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = if (method == "HEAD") 3_000 else 5_000
            readTimeout = if (method == "HEAD") 3_000 else 5_000
            instanceFollowRedirects = false
            setRequestProperty("Accept", if (method == "GET") "application/json, text/plain, */*" else "*/*")
            setRequestProperty("User-Agent", "RonecaPlayTV-Native-Diagnostic")
            if (method == "GET") setRequestProperty("Range", "bytes=0-${maxBytes - 1}")
        }

        try {
            val code = connection.responseCode
            if (code in 300..399) {
                val location = connection.getHeaderField("Location")
                    ?: return TechnicalResponse(code, "")
                if (redirectsLeft <= 0) return TechnicalResponse(code, "")
                val redirected = URL(target, location)
                if (!sameOrigin(target, redirected)) throw SecurityException("Cross-origin redirect blocked")
                return request(redirected, method, maxBytes, redirectsLeft - 1)
            }
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val body = if (method == "HEAD") "" else stream?.use { readLimitedUtf8(it, maxBytes) }.orEmpty()
            return TechnicalResponse(code, body)
        } finally {
            connection.disconnect()
        }
    }

    private fun readLimitedUtf8(input: InputStream, maxBytes: Int): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            val accepted = minOf(read, maxBytes - total)
            if (accepted > 0) output.write(buffer, 0, accepted)
            total += accepted
            if (total >= maxBytes) break
        }
        return output.toString(StandardCharsets.UTF_8.name())
    }

    private fun requirePublicHttpUrl(raw: String): URL {
        val url = URL(raw.trim())
        require(url.protocol == "http" || url.protocol == "https") { "Unsupported protocol" }
        require(url.userInfo.isNullOrBlank()) { "Credentials in authority blocked" }
        val host = url.host.lowercase()
        require(host.isNotBlank() && host != "localhost" && !host.endsWith(".local") && !isPrivateIpv4(host)) {
            "Private host blocked"
        }
        return url
    }

    private fun isPrivateIpv4(host: String): Boolean {
        val parts = host.split('.').mapNotNull { it.toIntOrNull() }
        if (parts.size != 4 || parts.any { it !in 0..255 }) return false
        val (a, b) = parts
        return a == 0 || a == 10 || a == 127 ||
            (a == 100 && b in 64..127) ||
            (a == 169 && b == 254) ||
            (a == 172 && b in 16..31) ||
            (a == 192 && b == 168) || a >= 224
    }

    private fun sameOrigin(left: URL, right: URL): Boolean =
        left.protocol.equals(right.protocol, true) &&
            left.host.equals(right.host, true) &&
            effectivePort(left) == effectivePort(right)

    private fun effectivePort(url: URL): Int = if (url.port >= 0) url.port else url.defaultPort

    private fun looksXtream(url: URL, declaredType: String): Boolean {
        val path = url.path.lowercase().trimEnd('/')
        return declaredType.equals("xtream", true) ||
            (url.query?.contains("username=") == true && url.query?.contains("password=") == true &&
                (path.endsWith("/get.php") || path.endsWith("/player_api.php")))
    }

    private fun parseXtream(source: URL): XtreamSource? {
        val params = queryParams(source.query)
        val username = params["username"]?.firstOrNull()?.takeIf { it.isNotBlank() } ?: return null
        val password = params["password"]?.firstOrNull()?.takeIf { it.isNotBlank() } ?: return null
        val normalizedPath = source.path.trimEnd('/')
        val basePath = normalizedPath.replace(Regex("/(get|player_api)\\.php$", RegexOption.IGNORE_CASE), "")
        val extra = params.filterKeys { it !in setOf("username", "password", "action") }
        val query = buildList {
            add("username=${encodeQuery(username)}")
            add("password=${encodeQuery(password)}")
            extra.forEach { (key, values) -> values.forEach { add("${encodeQuery(key)}=${encodeQuery(it)}") } }
        }.joinToString("&")
        val origin = URL("${source.protocol}://${source.authority}/")
        val playerApi = URL(origin, "${basePath.trimStart('/')}/player_api.php?$query")
        return XtreamSource(origin, basePath, username, password, playerApi)
    }

    private fun queryParams(query: String?): Map<String, List<String>> {
        if (query.isNullOrBlank()) return emptyMap()
        return query.split('&').mapNotNull { part ->
            val index = part.indexOf('=')
            val key = if (index >= 0) part.substring(0, index) else part
            val value = if (index >= 0) part.substring(index + 1) else ""
            decode(key) to decode(value)
        }.groupBy({ it.first }, { it.second })
    }

    private fun firstStream(raw: String): Pair<Long, String>? {
        return runCatching {
            val array = JSONArray(raw)
            val item = array.optJSONObject(0) ?: return null
            val id = item.optLong("stream_id", 0L).takeIf { it > 0 } ?: return null
            val extension = item.optString("container_extension", "ts")
                .takeIf { it.matches(Regex("[A-Za-z0-9]+")) } ?: "ts"
            id to extension
        }.getOrNull()
    }

    private fun firstM3uUrl(raw: String): String? = raw.lineSequence()
        .map(String::trim)
        .firstOrNull { it.startsWith("http://", true) || it.startsWith("https://", true) }

    private fun encodeQuery(value: String): String = java.net.URLEncoder.encode(value, StandardCharsets.UTF_8.name())
        .replace("+", "%20")

    private fun encodePath(value: String): String = encodeQuery(value).replace("%2F", "%252F", true)

    private fun decode(value: String): String = java.net.URLDecoder.decode(value, StandardCharsets.UTF_8.name())

    private data class TechnicalResponse(val code: Int, val body: String)
    private data class CheckOutcome(val ok: Boolean, val httpStatus: Int?, val code: String?)
    private data class XtreamSource(
        val origin: URL,
        val basePath: String,
        val username: String,
        val password: String,
        val playerApi: URL,
    )
}
