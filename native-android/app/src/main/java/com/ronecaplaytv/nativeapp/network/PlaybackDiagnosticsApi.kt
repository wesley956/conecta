package com.ronecaplaytv.nativeapp.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class PlaybackDiagnosticsApi(private val functionsBaseUrl: String) {
    init {
        require(functionsBaseUrl.startsWith("https://")) {
            "O endpoint de diagnóstico deve utilizar HTTPS."
        }
    }

    suspend fun report(
        deviceCode: String,
        deviceUuid: String,
        deviceCredential: String,
        appVersion: String,
        errorCode: String,
        errorMessage: String,
        probableSource: String = "app",
    ) = withContext(Dispatchers.IO) {
        val eventId = "android-${java.util.UUID.randomUUID()}"
        val payload = JSONObject()
            .put("deviceCode", deviceCode)
            .put("deviceUuid", deviceUuid)
            .put("clientEventId", eventId)
            .put("correlationId", eventId)
            .put("platform", "android")
            .put("appVersion", appVersion)
            .put("contentType", "unknown")
            .put("contentTitle", "Reprodução Android")
            .put("errorCode", errorCode.take(100))
            .put("errorMessage", errorMessage.take(800))
            .put("severity", "high")
            .put("probableSource", probableSource)
            .put("recovered", false)
            .put("playerExited", false)
            .put("retryCount", 0)

        val url = URL("${functionsBaseUrl.trimEnd('/')}/playback-diagnostics-report")
        require(url.protocol == "https") { "Protocolo inseguro bloqueado." }
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 10_000
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
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IllegalStateException("Falha ao registrar diagnóstico: HTTP $status")
            }
        } finally {
            connection.disconnect()
        }
    }
}
