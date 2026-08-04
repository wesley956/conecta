package com.ronecaplaytv.nativeapp.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

data class ProviderAttemptReport(
    val clientEventId: String,
    val playlistId: String,
    val correlationId: String,
    val phase: String,
    val section: String,
    val transport: String,
    val strategyKey: String,
    val protocol: String,
    val host: String,
    val port: Int?,
    val path: String?,
    val httpVersion: String? = null,
    val requestProfile: String? = null,
    val outputFormat: String? = null,
    val result: String,
    val httpStatus: Int? = null,
    val durationMs: Long = 0,
    val responseBytes: Long? = null,
    val contentType: String? = null,
    val serverHeader: String? = null,
    val redirect: String? = null,
    val itemCount: Int? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val platform: String,
    val appVersion: String,
    val occurredAt: String,
)

class ProviderAttemptApi(private val functionsBaseUrl: String) {
    init {
        require(functionsBaseUrl.startsWith("https://")) {
            "O endpoint da matriz deve utilizar HTTPS."
        }
    }

    suspend fun report(
        deviceCode: String,
        deviceUuid: String,
        deviceCredential: String,
        attempt: ProviderAttemptReport,
    ) = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("deviceCode", deviceCode)
            .put("deviceUuid", deviceUuid)
            .put("clientEventId", attempt.clientEventId)
            .put("playlistId", attempt.playlistId)
            .put("correlationId", attempt.correlationId)
            .put("phase", attempt.phase)
            .put("section", attempt.section)
            .put("transport", attempt.transport)
            .put("strategyKey", attempt.strategyKey)
            .put("protocol", attempt.protocol)
            .put("host", attempt.host)
            .put("result", attempt.result)
            .put("durationMs", attempt.durationMs)
            .put("platform", attempt.platform)
            .put("appVersion", attempt.appVersion)
            .put("occurredAt", attempt.occurredAt)
            .apply {
                attempt.port?.let { put("port", it) }
                attempt.path?.let { put("path", it) }
                attempt.httpVersion?.let { put("httpVersion", it) }
                attempt.requestProfile?.let { put("requestProfile", it) }
                attempt.outputFormat?.let { put("outputFormat", it) }
                attempt.httpStatus?.let { put("httpStatus", it) }
                attempt.responseBytes?.let { put("responseBytes", it) }
                attempt.contentType?.let { put("contentType", it) }
                attempt.serverHeader?.let { put("serverHeader", it) }
                attempt.redirect?.let { put("redirect", it) }
                attempt.itemCount?.let { put("itemCount", it) }
                attempt.errorCode?.let { put("errorCode", it) }
                attempt.errorMessage?.take(800)?.let { put("errorMessage", it) }
            }

        val endpoint = URL("${functionsBaseUrl.trimEnd('/')}/playlist-provider-attempt-report")
        require(endpoint.protocol == "https") { "Endpoint inseguro da matriz bloqueado." }

        val connection = (endpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = false
            doOutput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Cache-Control", "no-store")
            setRequestProperty("User-Agent", "RonecaPlayTV-Native")
            setRequestProperty("x-device-credential", deviceCredential)
        }

        try {
            val bytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }

            val status = connection.responseCode
            val responseStream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseText = responseStream?.use { readLimitedUtf8(it, MAX_RESPONSE_BYTES) }.orEmpty()
            if (status !in 200..299) {
                val message = runCatching {
                    JSONObject(responseText).optString("error")
                }.getOrNull().orEmpty().ifBlank {
                    "Falha ao registrar tentativa da matriz (HTTP $status)."
                }
                throw DeviceApiException(message, status)
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun readLimitedUtf8(input: InputStream, maximumBytes: Int): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > maximumBytes) {
                throw DeviceApiException("Resposta da matriz excedeu o limite seguro.")
            }
            output.write(buffer, 0, read)
        }
        return output.toString(StandardCharsets.UTF_8.name())
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 20_000
        const val MAX_RESPONSE_BYTES = 256 * 1024
    }
}
