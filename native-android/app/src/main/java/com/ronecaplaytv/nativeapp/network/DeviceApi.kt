package com.ronecaplaytv.nativeapp.network

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
    ): DeviceConfigResponse = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("deviceCode", deviceCode)
            .put("deviceUuid", deviceUuid)

        val result = postJson(
            endpoint = "device-config",
            payload = payload,
            headers = mapOf("x-device-credential" to deviceCredential),
        )

        DeviceConfigResponse.from(result.statusCode, result.body)
    }

    private fun postJson(
        endpoint: String,
        payload: JSONObject,
        headers: Map<String, String>,
    ): HttpJsonResult {
        val url = URL("${functionsBaseUrl.trimEnd('/')}/$endpoint")
        require(url.protocol == "https") { "Redirecionamento para protocolo inseguro bloqueado." }

        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
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

            val bodyText = responseStream?.use(::readLimitedUtf8).orEmpty()
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

    private fun readLimitedUtf8(input: InputStream): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0

        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > MAX_RESPONSE_BYTES) {
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
        const val READ_TIMEOUT_MS = 20_000
        const val MAX_RESPONSE_BYTES = 1_048_576
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
    val cacheSnapshotUrl: String?,
    val channelsUrl: String?,
    val moviesUrl: String?,
    val seriesUrl: String?,
    val message: String?,
) {
    companion object {
        fun from(httpStatus: Int, json: JSONObject): DeviceConfigResponse {
            val cacheParts = json.optJSONObject("cacheParts")
            return DeviceConfigResponse(
                httpStatus = httpStatus,
                active = json.optBoolean("active", false),
                status = json.optString("status", "pending"),
                deviceCode = json.optNullableString("deviceCode"),
                clientName = json.optNullableString("clientName"),
                expiresAt = json.optNullableString("expiresAt"),
                playlistName = json.optNullableString("playlistName"),
                cacheSnapshotUrl = json.optNullableString("cacheSnapshotUrl"),
                channelsUrl = cacheParts?.optNullableString("channelsUrl"),
                moviesUrl = cacheParts?.optNullableString("moviesUrl"),
                seriesUrl = cacheParts?.optNullableString("seriesUrl"),
                message = json.optNullableString("message"),
            )
        }
    }
}

private fun JSONObject.optNullableString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().takeIf { it.isNotEmpty() }
}
