package com.ronecaplaytv.nativeapp.network

import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class DeviceApi(private val functionsBaseUrl: String) {
    init {
        require(functionsBaseUrl.startsWith("https://")) {
            "O endpoint de produção deve utilizar HTTPS."
        }
    }

    suspend fun activate(
        deviceUuid: String,
        deviceType: String,
        appVersion: String,
    ): DeviceActivationResponse = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("deviceUuid", deviceUuid)
            .put("deviceType", deviceType)
            .put("appVersion", appVersion)

        val result = postJson(
            endpoint = "device-activate",
            payload = payload,
            headers = emptyMap(),
        )

        DeviceActivationResponse.from(result.statusCode, result.body)
    }

    suspend fun fetchConfig(
        deviceCode: String,
        deviceUuid: String,
        deviceCredential: String,
        playlistHealthId: String? = null,
        playlistHealthStatus: String? = null,
        playlistHealthError: String? = null,
    ): DeviceConfigResponse = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("deviceCode", deviceCode)
            .put("deviceUuid", deviceUuid)
            .apply {
                if (!playlistHealthId.isNullOrBlank() && !playlistHealthStatus.isNullOrBlank()) {
                    put(
                        "playlistHealth",
                        JSONObject()
                            .put("playlistId", playlistHealthId)
                            .put("status", playlistHealthStatus)
                            .apply {
                                playlistHealthError
                                    ?.takeIf(String::isNotBlank)
                                    ?.take(500)
                                    ?.let { put("error", it) }
                            },
                    )
                }
            }

        val result = postJson(
            endpoint = "device-config",
            payload = payload,
            headers = mapOf("x-device-credential" to deviceCredential),
        )

        DeviceConfigResponse.from(result.statusCode, result.body)
    }

    suspend fun fetchSeriesEpisodes(
        deviceCode: String,
        deviceUuid: String,
        deviceCredential: String,
        seriesId: String,
        playlistId: String?,
    ): SeriesEpisodesResponse = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("deviceCode", deviceCode)
            .put("deviceUuid", deviceUuid)
            .put("seriesId", seriesId)
            .apply { playlistId?.takeIf(String::isNotBlank)?.let { put("playlistId", it) } }

        val result = postJson(
            endpoint = "series-detail",
            payload = payload,
            headers = mapOf("x-device-credential" to deviceCredential),
            maxResponseBytes = SERIES_RESPONSE_BYTES,
            readTimeoutMs = SERIES_READ_TIMEOUT_MS,
        )

        SeriesEpisodesResponse.from(result.statusCode, result.body)
    }

    private fun postJson(
        endpoint: String,
        payload: JSONObject,
        headers: Map<String, String>,
        maxResponseBytes: Int = DEFAULT_MAX_RESPONSE_BYTES,
        readTimeoutMs: Int = DEFAULT_READ_TIMEOUT_MS,
    ): HttpJsonResult {
        val url = URL("${functionsBaseUrl.trimEnd('/')}/$endpoint")
        require(url.protocol == "https") { "Redirecionamento para protocolo inseguro bloqueado." }

        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = readTimeoutMs
            instanceFollowRedirects = false
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Cache-Control", "no-store")
            setRequestProperty("User-Agent", "RonecaPlayTV-Native")
            headers.forEach { (name, value) -> setRequestProperty(name, value) }
        }

        return try {
            val bytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }

            val statusCode = connection.responseCode
            if (statusCode in 300..399) {
                throw DeviceApiException("Redirecionamento inesperado bloqueado.", statusCode)
            }

            val responseStream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            }

            val bodyText = responseStream?.use { readLimitedUtf8(it, maxResponseBytes) }.orEmpty()
            val body = runCatching { JSONObject(bodyText) }.getOrElse {
                throw DeviceApiException(
                    message = "Resposta inválida do servidor.",
                    statusCode = statusCode,
                )
            }

            HttpJsonResult(statusCode = statusCode, body = body)
        } finally {
            connection.disconnect()
        }
    }

    private fun readLimitedUtf8(input: InputStream, maxResponseBytes: Int): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0

        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > maxResponseBytes) {
                throw DeviceApiException("Resposta do servidor excedeu o limite seguro.")
            }
            output.write(buffer, 0, read)
        }

        return output.toString(StandardCharsets.UTF_8.name())
    }

    private data class HttpJsonResult(
        val statusCode: Int,
        val body: JSONObject,
    )

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val DEFAULT_READ_TIMEOUT_MS = 20_000
        const val SERIES_READ_TIMEOUT_MS = 55_000
        const val DEFAULT_MAX_RESPONSE_BYTES = 1_048_576
        const val SERIES_RESPONSE_BYTES = 8 * 1_048_576
    }
}

class DeviceApiException(
    override val message: String,
    val statusCode: Int? = null,
) : Exception(message)

data class DeviceActivationResponse(
    val httpStatus: Int,
    val active: Boolean,
    val status: String,
    val deviceCode: String?,
    val deviceCredential: String?,
    val credentialIssued: Boolean,
    val clientName: String?,
    val expiresAt: String?,
    val message: String?,
) {
    companion object {
        fun from(httpStatus: Int, json: JSONObject) = DeviceActivationResponse(
            httpStatus = httpStatus,
            active = json.optBoolean("active", false),
            status = json.optString("status", "pending"),
            deviceCode = json.optNullableString("deviceCode"),
            deviceCredential = json.optNullableString("deviceCredential"),
            credentialIssued = json.optBoolean("credentialIssued", false),
            clientName = json.optNullableString("clientName"),
            expiresAt = json.optNullableString("expiresAt"),
            message = json.optNullableString("message"),
        )
    }
}

data class DeviceConfigResponse(
    val httpStatus: Int,
    val active: Boolean,
    val status: String,
    val deviceCode: String?,
    val clientName: String?,
    val expiresAt: String?,
    val playlistName: String?,
    val selectedPlaylistId: String?,
    val cacheSnapshotUrl: String?,
    val channelsUrl: String?,
    val moviesUrl: String?,
    val seriesUrl: String?,
    val playlists: List<DevicePlaylistConfig>,
    val message: String?,
) {
    companion object {
        fun from(httpStatus: Int, json: JSONObject): DeviceConfigResponse {
            val cacheParts = json.optJSONObject("cacheParts")
            val playlistsJson = json.optJSONArray("playlists")
            val playlists = buildList {
                if (playlistsJson != null) {
                    for (index in 0 until playlistsJson.length()) {
                        val item = playlistsJson.optJSONObject(index) ?: continue
                        val id = item.optNullableString("id") ?: continue
                        val itemCacheParts = item.optJSONObject("cacheParts")
                        add(
                            DevicePlaylistConfig(
                                id = id,
                                name = item.optNullableString("name") ?: "Lista ${index + 1}",
                                priority = item.optInt("priority", index + 1).coerceAtLeast(1),
                                role = item.optNullableString("role")
                                    ?: if (index == 0) "primary" else "backup",
                                channelsUrl = itemCacheParts?.optNullableString("channelsUrl"),
                                moviesUrl = itemCacheParts?.optNullableString("moviesUrl"),
                                seriesUrl = itemCacheParts?.optNullableString("seriesUrl"),
                            ),
                        )
                    }
                }
            }.sortedBy(DevicePlaylistConfig::priority)
            return DeviceConfigResponse(
                httpStatus = httpStatus,
                active = json.optBoolean("active", false),
                status = json.optString("status", "pending"),
                deviceCode = json.optNullableString("deviceCode"),
                clientName = json.optNullableString("clientName"),
                expiresAt = json.optNullableString("expiresAt"),
                playlistName = json.optNullableString("playlistName"),
                selectedPlaylistId = json.optNullableString("selectedPlaylistId"),
                cacheSnapshotUrl = json.optNullableString("cacheSnapshotUrl"),
                channelsUrl = cacheParts?.optNullableString("channelsUrl"),
                moviesUrl = cacheParts?.optNullableString("moviesUrl"),
                seriesUrl = cacheParts?.optNullableString("seriesUrl"),
                playlists = playlists,
                message = json.optNullableString("message"),
            )
        }
    }
}

data class SeriesEpisodesResponse(
    val httpStatus: Int,
    val seriesId: String?,
    val seasons: List<NativeSeason>,
    val message: String?,
) {
    val successful: Boolean
        get() = httpStatus in 200..299

    companion object {
        fun from(httpStatus: Int, json: JSONObject): SeriesEpisodesResponse {
            val seasonsJson = json.optJSONArray("seasons")
            val seasons = buildList {
                if (seasonsJson != null) {
                    for (seasonIndex in 0 until seasonsJson.length()) {
                        val seasonJson = seasonsJson.optJSONObject(seasonIndex) ?: continue
                        val seasonNumber = seasonJson.optInt("number", seasonIndex + 1).coerceAtLeast(1)
                        val episodesJson = seasonJson.optJSONArray("episodes")
                        val episodes = buildList {
                            if (episodesJson != null) {
                                for (episodeIndex in 0 until episodesJson.length()) {
                                    val episodeJson = episodesJson.optJSONObject(episodeIndex) ?: continue
                                    val id = episodeJson.optNullableString("id") ?: continue
                                    val name = episodeJson.optNullableString("name") ?: "Episódio ${episodeIndex + 1}"
                                    val primaryUrl = episodeJson.optNullableString("url") ?: continue
                                    val playbackUrlsJson = episodeJson.optJSONArray("playbackUrls")
                                    val playbackUrls = buildList {
                                        if (playbackUrlsJson != null) {
                                            for (urlIndex in 0 until playbackUrlsJson.length()) {
                                                playbackUrlsJson.optString(urlIndex)
                                                    .trim()
                                                    .takeIf(String::isNotBlank)
                                                    ?.let(::add)
                                            }
                                        }
                                    }.ifEmpty { listOf(primaryUrl) }

                                    add(
                                        NativeEpisode(
                                            id = id,
                                            number = episodeJson.optInt("number", episodeIndex + 1).coerceAtLeast(1),
                                            name = name,
                                            duration = episodeJson.optNullableString("duration"),
                                            primaryUrl = primaryUrl,
                                            playbackUrls = playbackUrls.distinct(),
                                        ),
                                    )
                                }
                            }
                        }.sortedBy(NativeEpisode::number)

                        if (episodes.isNotEmpty()) {
                            add(NativeSeason(number = seasonNumber, episodes = episodes))
                        }
                    }
                }
            }.sortedBy(NativeSeason::number)

            return SeriesEpisodesResponse(
                httpStatus = httpStatus,
                seriesId = json.optNullableString("seriesId"),
                seasons = seasons,
                message = json.optNullableString("message"),
            )
        }
    }
}

private fun JSONObject.optNullableString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().takeIf { it.isNotEmpty() }
}
