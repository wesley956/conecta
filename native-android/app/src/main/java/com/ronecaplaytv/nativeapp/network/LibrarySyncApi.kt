package com.ronecaplaytv.nativeapp.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Adapter para a fonte canônica de favoritos/progresso/preferências.
 *
 * Este lote não substitui PlaybackPreferences automaticamente: o rollout do APK precisa
 * migrar estado local e validar merge/conflitos em homologação antes de habilitar leitura
 * server-first. O adapter permite esse rollout sem reutilizar web_session ou PIN Web.
 */
class LibrarySyncApi(private val functionsBaseUrl: String) {
    init {
        require(functionsBaseUrl.startsWith("https://")) { "O endpoint de sincronização deve utilizar HTTPS." }
    }

    suspend fun snapshot(identity: DeviceLibraryIdentity): JSONObject = request(identity, JSONObject().put("action", "get"))

    suspend fun setFavorite(
        identity: DeviceLibraryIdentity,
        contentKey: String,
        contentType: String,
        active: Boolean,
    ): JSONObject = request(
        identity,
        JSONObject()
            .put("action", "favorite")
            .put("contentKey", requireContentKey(contentKey))
            .put("contentType", require(contentType in setOf("channel", "movie", "series")) { "Tipo de favorito inválido." }.let { contentType })
            .put("active", active),
    )

    suspend fun setProgress(
        identity: DeviceLibraryIdentity,
        contentKey: String,
        contentType: String,
        positionMs: Long,
        durationMs: Long,
    ): JSONObject = request(
        identity,
        JSONObject()
            .put("action", "progress")
            .put("contentKey", requireContentKey(contentKey))
            .put("contentType", require(contentType in setOf("movie", "episode")) { "Tipo de progresso inválido." }.let { contentType })
            .put("positionMs", positionMs.coerceAtLeast(0L))
            .put("durationMs", durationMs.coerceAtLeast(1L)),
    )

    suspend fun setPreferences(
        identity: DeviceLibraryIdentity,
        aspectMode: String?,
        language: String?,
        subtitleLanguage: String?,
    ): JSONObject = request(
        identity,
        JSONObject()
            .put("action", "preferences")
            .apply {
                aspectMode?.let {
                    require(it in setOf("contain", "cover", "fill")) { "Modo de aspecto inválido." }
                    put("aspectMode", it)
                }
                language?.take(40)?.let { put("language", it) }
                subtitleLanguage?.take(40)?.let { put("subtitleLanguage", it) }
            },
    )

    private suspend fun request(identity: DeviceLibraryIdentity, payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val endpoint = URL("${functionsBaseUrl.trimEnd('/')}/device-library")
        require(endpoint.protocol == "https") { "Protocolo inseguro bloqueado." }
        payload.put("deviceCode", identity.deviceCode).put("deviceUuid", identity.deviceUuid)

        val connection = (endpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 12_000
            instanceFollowRedirects = false
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Cache-Control", "no-store")
            setRequestProperty("User-Agent", "RonecaPlayTV-Native")
            setRequestProperty("x-device-credential", identity.deviceCredential)
        }
        try {
            val bytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }
            val status = connection.responseCode
            if (status in 300..399) throw DeviceApiException("Redirecionamento inesperado bloqueado.", status)
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bodyText = stream?.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(4 * 1024)
                var total = 0
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    total += read
                    if (total > 512 * 1024) throw DeviceApiException("Resposta de sincronização excedeu o limite seguro.", status)
                    output.write(buffer, 0, read)
                }
                output.toString(StandardCharsets.UTF_8.name())
            }.orEmpty()
            val body = runCatching { JSONObject(bodyText) }.getOrElse { JSONObject() }
            if (status !in 200..299 || body.optBoolean("ok", true).not()) {
                throw DeviceApiException(body.optString("message", body.optString("code", "Falha de sincronização.")), status)
            }
            body
        } finally {
            connection.disconnect()
        }
    }

    private fun requireContentKey(value: String): String {
        val key = value.trim()
        require(key.length in 3..500 && Regex("^(channel|movie|series|episode):[a-z0-9:-]+$").matches(key)) {
            "Identidade lógica inválida."
        }
        return key
    }
}

data class DeviceLibraryIdentity(
    val deviceCode: String,
    val deviceUuid: String,
    val deviceCredential: String,
) {
    init {
        require(deviceCode.isNotBlank() && deviceUuid.isNotBlank() && deviceCredential.isNotBlank()) {
            "Identidade do aparelho incompleta."
        }
    }
}
