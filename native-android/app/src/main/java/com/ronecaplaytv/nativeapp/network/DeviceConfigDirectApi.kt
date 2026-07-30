package com.ronecaplaytv.nativeapp.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class DeviceConfigDirectApi(private val functionsBaseUrl: String) {
    init {
        require(functionsBaseUrl.startsWith("https://")) {
            "O endpoint de produção deve utilizar HTTPS."
        }
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

        val endpoint = URL("${functionsBaseUrl.trimEnd('/')}/device-config-direct")
        require(endpoint.protocol == "https") { "Redirecionamento para protocolo inseguro bloqueado." }

        val connection = (endpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = false
            doOutput = true
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

            val statusCode = connection.responseCode
            if (statusCode in 300..399) {
                throw DeviceApiException("Redirecionamento inesperado bloqueado.", statusCode)
            }

            val responseStream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            }

            val bodyText = responseStream?.use { readLimitedUtf8(it, MAX_RESPONSE_BYTES) }.orEmpty()
            val body = runCatching { JSONObject(bodyText) }.getOrElse {
                throw DeviceApiException(
                    message = "Resposta inválida do servidor.",
                    statusCode = statusCode,
                )
            }

            DeviceConfigResponse.from(statusCode, body)
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

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 25_000
        const val MAX_RESPONSE_BYTES = 1_048_576
    }
}
