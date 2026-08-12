package com.ronecaplaytv.nativeapp.persistence

import android.content.Context
import android.os.SystemClock
import android.util.AtomicFile
import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig
import com.ronecaplaytv.nativeapp.activation.DeviceAccessStatus
import com.ronecaplaytv.nativeapp.catalog.NativeCatalogState
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

internal data class CatalogSnapshotRequest(
    val deviceCodeHash: String,
    val playlistId: String,
    val playlistRole: String,
    val configFingerprint: String,
)

internal data class CatalogSnapshotEnvelope(
    val schemaVersion: Int,
    val deviceCodeHash: String,
    val playlistId: String,
    val playlistRole: String,
    val configFingerprint: String,
    val savedAtMillis: Long,
    val appVersion: String,
    val state: NativeCatalogState,
)

internal data class CatalogSnapshotRead(
    val envelope: CatalogSnapshotEnvelope,
    val sizeBytes: Long,
    val readMillis: Long,
    val ageMillis: Long,
    val stale: Boolean,
)

internal object CatalogSnapshotAccessPolicy {
    fun mayRestore(status: DeviceAccessStatus): Boolean = status == DeviceAccessStatus.Active

    fun mustInvalidate(status: DeviceAccessStatus): Boolean =
        status == DeviceAccessStatus.Blocked || status == DeviceAccessStatus.Expired
}

internal object CatalogSnapshotIdentity {
    fun request(deviceCode: String, candidate: DevicePlaylistConfig): CatalogSnapshotRequest {
        val endpointShape = candidate.sourceEndpoints
            .sortedWith(compareBy({ it.priority }, { it.id }))
            .joinToString("|") { endpoint ->
                listOf(
                    endpoint.id,
                    endpoint.type,
                    endpoint.priority.toString(),
                    endpoint.primary.toString(),
                    endpoint.channelsUrl.isNullOrBlank().not().toString(),
                    endpoint.moviesUrl.isNullOrBlank().not().toString(),
                    endpoint.seriesUrl.isNullOrBlank().not().toString(),
                ).joinToString(":")
            }
        val safeShape = listOf(
            candidate.id,
            candidate.role.lowercase(),
            candidate.priority.toString(),
            candidate.channelsUrl.isNullOrBlank().not().toString(),
            candidate.moviesUrl.isNullOrBlank().not().toString(),
            candidate.seriesUrl.isNullOrBlank().not().toString(),
            candidate.networkPolicy.cacheKey,
            endpointShape,
        ).joinToString("|")
        return CatalogSnapshotRequest(
            deviceCodeHash = sha256("device-code:${deviceCode.trim()}") ,
            playlistId = candidate.id,
            playlistRole = candidate.role,
            configFingerprint = sha256("catalog-shape:$safeShape"),
        )
    }

    internal fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}

/**
 * Schema versionado do catálogo visível. URLs de imagens e reprodução nunca são
 * serializadas: elas podem carregar credenciais do provedor e são reconstruídas
 * somente depois que a configuração protegida for revalidada.
 */
internal object CatalogSnapshotCodec {
    const val SCHEMA_VERSION = 1
    const val MAX_BYTES = 24L * 1024L * 1024L
    private val json = Json { ignoreUnknownKeys = true }

    fun encode(envelope: CatalogSnapshotEnvelope): ByteArray {
        require(envelope.schemaVersion == SCHEMA_VERSION)
        require(envelope.state.loaded)
        require(envelope.state.channels.isNotEmpty() || envelope.state.movies.isNotEmpty() || envelope.state.series.isNotEmpty())

        val payload = catalogPayload(envelope.state)
        val payloadChecksum = CatalogSnapshotIdentity.sha256(payload.toString())
        return buildJsonObject {
            put("schemaVersion", envelope.schemaVersion)
            put("deviceCodeHash", envelope.deviceCodeHash)
            put("playlistId", envelope.playlistId)
            put("playlistRole", envelope.playlistRole)
            put("configFingerprint", envelope.configFingerprint)
            put("savedAt", envelope.savedAtMillis)
            put("appVersion", envelope.appVersion)
            put("channelCount", envelope.state.channels.size)
            put("movieCount", envelope.state.movies.size)
            put("seriesCount", envelope.state.series.size)
            put("payloadChecksum", payloadChecksum)
            put("payload", payload)
        }.toString().toByteArray(Charsets.UTF_8)
    }

    fun decode(bytes: ByteArray): CatalogSnapshotEnvelope? {
        if (bytes.isEmpty() || bytes.size > MAX_BYTES) return null
        return runCatching {
            val root = json.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
            if (root.int("schemaVersion") != SCHEMA_VERSION) return null
            val payload = root["payload"]?.jsonObject ?: return null
            val checksum = root.string("payloadChecksum") ?: return null
            if (CatalogSnapshotIdentity.sha256(payload.toString()) != checksum) return null

            val state = decodeCatalog(payload) ?: return null
            if (
                state.channels.size != root.int("channelCount") ||
                state.movies.size != root.int("movieCount") ||
                state.series.size != root.int("seriesCount")
            ) return null

            CatalogSnapshotEnvelope(
                schemaVersion = SCHEMA_VERSION,
                deviceCodeHash = root.requiredString("deviceCodeHash", 64),
                playlistId = root.requiredString("playlistId", 200),
                playlistRole = root.requiredString("playlistRole", 32),
                configFingerprint = root.requiredString("configFingerprint", 64),
                savedAtMillis = root["savedAt"]?.jsonPrimitive?.longOrNull ?: return null,
                appVersion = root.requiredString("appVersion", 40),
                state = state,
            )
        }.getOrNull()
    }

    private fun catalogPayload(state: NativeCatalogState) = buildJsonObject {
        putJsonArray("channels") {
            state.channels.forEach { channel ->
                addJsonObject {
                    put("id", channel.id)
                    put("name", channel.name)
                    put("group", channel.groupTitle)
                }
            }
        }
        putJsonArray("movies") {
            state.movies.forEach { movie ->
                addJsonObject {
                    put("id", movie.id)
                    put("name", movie.name)
                    movie.year?.let { put("year", it) }
                    movie.duration?.let { put("duration", it) }
                    movie.synopsis?.let { put("synopsis", it) }
                    put("category", movie.category)
                }
            }
        }
        putJsonArray("series") {
            state.series.forEach { item ->
                addJsonObject {
                    put("id", item.id)
                    put("name", item.name)
                    put("category", item.category)
                    item.synopsis?.let { put("synopsis", it) }
                    item.xtreamSeriesId?.let { put("xtreamSeriesId", it) }
                    putJsonArray("seasons") {
                        item.seasons.forEach { season ->
                            addJsonObject {
                                put("number", season.number)
                                putJsonArray("episodes") {
                                    season.episodes.forEach { episode ->
                                        addJsonObject {
                                            put("id", episode.id)
                                            put("number", episode.number)
                                            put("name", episode.name)
                                            episode.duration?.let { put("duration", it) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private fun decodeCatalog(payload: JsonObject): NativeCatalogState? {
        val channels = payload.array("channels").map { element ->
            val item = element.jsonObject
            NativeChannel(
                id = item.requiredString("id", 300),
                name = item.requiredString("name", 500),
                groupTitle = item.string("group")?.take(500).orEmpty(),
                logoUrl = null,
                primaryUrl = "",
                playbackUrls = emptyList(),
            )
        }
        val movies = payload.array("movies").map { element ->
            val item = element.jsonObject
            NativeMovie(
                id = item.requiredString("id", 300),
                name = item.requiredString("name", 500),
                year = item["year"]?.jsonPrimitive?.intOrNull,
                duration = item.string("duration")?.take(120),
                synopsis = item.string("synopsis")?.take(4_000),
                coverUrl = null,
                category = item.string("category")?.take(500).orEmpty(),
                primaryUrl = "",
                playbackUrls = emptyList(),
            )
        }
        val series = payload.array("series").map { element ->
            val item = element.jsonObject
            NativeSeries(
                id = item.requiredString("id", 300),
                name = item.requiredString("name", 500),
                coverUrl = null,
                category = item.string("category")?.take(500).orEmpty(),
                synopsis = item.string("synopsis")?.take(4_000),
                seasons = item.array("seasons").map { seasonElement ->
                    val season = seasonElement.jsonObject
                    NativeSeason(
                        number = season.int("number"),
                        episodes = season.array("episodes").map { episodeElement ->
                            val episode = episodeElement.jsonObject
                            NativeEpisode(
                                id = episode.requiredString("id", 300),
                                number = episode.int("number"),
                                name = episode.requiredString("name", 500),
                                duration = episode.string("duration")?.take(120),
                                primaryUrl = "",
                                playbackUrls = emptyList(),
                            )
                        },
                    )
                },
                xtreamSeriesId = item.string("xtreamSeriesId")?.take(300),
            )
        }
        if (channels.isEmpty() && movies.isEmpty() && series.isEmpty()) return null
        return NativeCatalogState(channels = channels, movies = movies, series = series, loaded = true)
    }

    private fun JsonObject.array(name: String): JsonArray = this[name]?.jsonArray ?: JsonArray(emptyList())
    private fun JsonObject.string(name: String): String? = this[name]?.jsonPrimitive?.contentOrNull
    private fun JsonObject.int(name: String): Int = this[name]?.jsonPrimitive?.intOrNull ?: 0
    private fun JsonObject.requiredString(name: String, maxLength: Int): String {
        val value = string(name)?.trim().orEmpty()
        require(value.isNotEmpty() && value.length <= maxLength)
        return value
    }
}

internal class CatalogSnapshotStore(context: Context) {
    private val directory = File(context.applicationContext.noBackupFilesDir, DIRECTORY_NAME)

    suspend fun read(request: CatalogSnapshotRequest): CatalogSnapshotRead? = withContext(Dispatchers.IO) {
        val atomicFile = AtomicFile(fileFor(request))
        val baseFile = atomicFile.baseFile
        if (!baseFile.isFile) return@withContext null
        if (baseFile.length() <= 0L || baseFile.length() > CatalogSnapshotCodec.MAX_BYTES) {
            atomicFile.delete()
            return@withContext null
        }

        val started = SystemClock.elapsedRealtimeNanos()
        val bytes = runCatching { atomicFile.openRead().use { it.readBytes() } }.getOrElse {
            atomicFile.delete()
            return@withContext null
        }
        val envelope = CatalogSnapshotCodec.decode(bytes) ?: run {
            atomicFile.delete()
            return@withContext null
        }
        if (
            envelope.deviceCodeHash != request.deviceCodeHash ||
            envelope.playlistId != request.playlistId ||
            envelope.configFingerprint != request.configFingerprint
        ) return@withContext null

        val ageMillis = (System.currentTimeMillis() - envelope.savedAtMillis).coerceAtLeast(0L)
        if (ageMillis > MAX_RETENTION_MILLIS) {
            atomicFile.delete()
            return@withContext null
        }
        CatalogSnapshotRead(
            envelope = envelope,
            sizeBytes = bytes.size.toLong(),
            readMillis = (SystemClock.elapsedRealtimeNanos() - started) / 1_000_000L,
            ageMillis = ageMillis,
            stale = ageMillis > FRESH_TTL_MILLIS,
        )
    }

    suspend fun write(
        request: CatalogSnapshotRequest,
        state: NativeCatalogState,
        appVersion: String,
    ): Long? = withContext(Dispatchers.IO) {
        val bytes = runCatching {
            CatalogSnapshotCodec.encode(
                CatalogSnapshotEnvelope(
                    schemaVersion = CatalogSnapshotCodec.SCHEMA_VERSION,
                    deviceCodeHash = request.deviceCodeHash,
                    playlistId = request.playlistId,
                    playlistRole = request.playlistRole,
                    configFingerprint = request.configFingerprint,
                    savedAtMillis = System.currentTimeMillis(),
                    appVersion = appVersion,
                    state = state,
                ),
            )
        }.getOrNull() ?: return@withContext null
        if (bytes.size > CatalogSnapshotCodec.MAX_BYTES) return@withContext null

        directory.mkdirs()
        val atomicFile = AtomicFile(fileFor(request))
        val output = runCatching { atomicFile.startWrite() }.getOrNull() ?: return@withContext null
        try {
            output.write(bytes)
            output.fd.sync()
            atomicFile.finishWrite(output)
            bytes.size.toLong()
        } catch (_: Throwable) {
            atomicFile.failWrite(output)
            null
        }
    }

    suspend fun clearAll() = withContext(Dispatchers.IO) {
        directory.listFiles()?.forEach { file -> AtomicFile(file).delete() }
    }

    private fun fileFor(request: CatalogSnapshotRequest): File {
        val name = CatalogSnapshotIdentity.sha256("${request.deviceCodeHash}|${request.playlistId}")
        return File(directory, "$name.json")
    }

    private companion object {
        const val DIRECTORY_NAME = "catalog-snapshots-v1"
        const val FRESH_TTL_MILLIS = 12L * 60L * 60L * 1_000L
        const val MAX_RETENTION_MILLIS = 30L * 24L * 60L * 60L * 1_000L
    }
}
