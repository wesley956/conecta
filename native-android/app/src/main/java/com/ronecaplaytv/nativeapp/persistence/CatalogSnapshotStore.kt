package com.ronecaplaytv.nativeapp.persistence

import android.content.Context
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
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
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.KeyStore
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
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
    val authoritativeContentRevision: String?,
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
            candidate.accessMode.orEmpty(),
            candidate.cacheReady.toString(),
            candidate.updatedAt.orEmpty(),
            candidate.cacheVersion.orEmpty(),
            candidate.cacheUpdatedAt.orEmpty(),
            candidate.cacheManifestSha256.orEmpty(),
            endpointShape,
        ).joinToString("|")
        return CatalogSnapshotRequest(
            deviceCodeHash = sha256("device-code:${deviceCode.trim()}") ,
            playlistId = candidate.id,
            playlistRole = candidate.role,
            configFingerprint = sha256("catalog-shape:$safeShape"),
            authoritativeContentRevision = candidate.authoritativeContentRevision,
        )
    }

    internal fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}

/**
 * Schema versionado do catálogo utilizável. O payload inclui imagens e reprodução,
 * mas nunca chega ao disco em claro: CatalogSnapshotStore comprime e protege todo
 * o conteúdo com AES-GCM/Android Keystore antes do AtomicFile.
 */
internal object CatalogSnapshotCodec {
    const val SCHEMA_VERSION = 2
    const val MAX_ENCRYPTED_BYTES = 32L * 1024L * 1024L
    const val MAX_PLAINTEXT_BYTES = 96L * 1024L * 1024L
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
        if (bytes.isEmpty() || bytes.size > MAX_PLAINTEXT_BYTES) return null
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
                    channel.logoUrl?.let { put("logo", it) }
                    put("primary", channel.primaryUrl)
                    putJsonArray("playback") {
                        channel.playbackUrls.distinct().take(MAX_PLAYBACK_URLS).forEach { add(it) }
                    }
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
                    movie.coverUrl?.let { put("cover", it) }
                    put("category", movie.category)
                    put("primary", movie.primaryUrl)
                    putJsonArray("playback") {
                        movie.playbackUrls.distinct().take(MAX_PLAYBACK_URLS).forEach { add(it) }
                    }
                }
            }
        }
        putJsonArray("series") {
            state.series.forEach { item ->
                addJsonObject {
                    put("id", item.id)
                    put("name", item.name)
                    put("category", item.category)
                    item.coverUrl?.let { put("cover", it) }
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
                                            put("primary", episode.primaryUrl)
                                            putJsonArray("playback") {
                                                episode.playbackUrls.distinct().take(MAX_PLAYBACK_URLS).forEach { add(it) }
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
    }

    private fun decodeCatalog(payload: JsonObject): NativeCatalogState? {
        val channels = payload.array("channels").map { element ->
            val item = element.jsonObject
            NativeChannel(
                id = item.requiredString("id", 300),
                name = item.requiredString("name", 500),
                groupTitle = item.string("group")?.take(500).orEmpty(),
                logoUrl = item.safeUrl("logo"),
                primaryUrl = item.requiredUrl("primary"),
                playbackUrls = item.safeUrls("playback").ifEmpty {
                    listOf(item.requiredUrl("primary"))
                },
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
                coverUrl = item.safeUrl("cover"),
                category = item.string("category")?.take(500).orEmpty(),
                primaryUrl = item.requiredUrl("primary"),
                playbackUrls = item.safeUrls("playback").ifEmpty {
                    listOf(item.requiredUrl("primary"))
                },
            )
        }
        val series = payload.array("series").map { element ->
            val item = element.jsonObject
            NativeSeries(
                id = item.requiredString("id", 300),
                name = item.requiredString("name", 500),
                coverUrl = item.safeUrl("cover"),
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
                                primaryUrl = episode.requiredUrl("primary"),
                                playbackUrls = episode.safeUrls("playback").ifEmpty {
                                    listOf(episode.requiredUrl("primary"))
                                },
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
    private fun JsonObject.safeUrl(name: String): String? = string(name)
        ?.trim()
        ?.takeIf { it.length in 1..MAX_URL_LENGTH }
    private fun JsonObject.requiredUrl(name: String): String = requireNotNull(safeUrl(name))
    private fun JsonObject.safeUrls(name: String): List<String> = array(name)
        .mapNotNull { it.jsonPrimitive.contentOrNull?.trim() }
        .filter { it.length in 1..MAX_URL_LENGTH }
        .distinct()
        .take(MAX_PLAYBACK_URLS)
    private fun JsonObject.requiredString(name: String, maxLength: Int): String {
        val value = string(name)?.trim().orEmpty()
        require(value.isNotEmpty() && value.length <= maxLength)
        return value
    }

    private const val MAX_URL_LENGTH = 8_192
    private const val MAX_PLAYBACK_URLS = 8
}

internal class CatalogSnapshotStore(context: Context) {
    private val directory = File(context.applicationContext.noBackupFilesDir, DIRECTORY_NAME)
    private val legacyDirectory = File(context.applicationContext.noBackupFilesDir, LEGACY_DIRECTORY_NAME)
    private val cipher = CatalogSnapshotCipher()

    suspend fun read(request: CatalogSnapshotRequest): CatalogSnapshotRead? = withContext(Dispatchers.IO) {
        val atomicFile = AtomicFile(fileFor(request))
        val baseFile = atomicFile.baseFile
        if (!baseFile.isFile) return@withContext null
        if (baseFile.length() <= 0L || baseFile.length() > CatalogSnapshotCodec.MAX_ENCRYPTED_BYTES) {
            atomicFile.delete()
            return@withContext null
        }

        val started = SystemClock.elapsedRealtimeNanos()
        val encrypted = runCatching { atomicFile.openRead().use { it.readBytes() } }.getOrElse {
            atomicFile.delete()
            return@withContext null
        }
        val compressed = cipher.open(encrypted, associatedData(request)) ?: run {
            atomicFile.delete()
            return@withContext null
        }
        val bytes = gunzipBounded(compressed, CatalogSnapshotCodec.MAX_PLAINTEXT_BYTES) ?: run {
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
            sizeBytes = encrypted.size.toLong(),
            readMillis = (SystemClock.elapsedRealtimeNanos() - started) / 1_000_000L,
            ageMillis = ageMillis,
            stale = request.authoritativeContentRevision == null && ageMillis > FRESH_TTL_MILLIS,
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
        if (bytes.size > CatalogSnapshotCodec.MAX_PLAINTEXT_BYTES) return@withContext null
        val compressed = gzip(bytes)
        val encrypted = cipher.seal(compressed, associatedData(request)) ?: return@withContext null
        if (encrypted.size > CatalogSnapshotCodec.MAX_ENCRYPTED_BYTES) return@withContext null

        directory.mkdirs()
        val atomicFile = AtomicFile(fileFor(request))
        val output = runCatching { atomicFile.startWrite() }.getOrNull() ?: return@withContext null
        try {
            output.write(encrypted)
            output.fd.sync()
            atomicFile.finishWrite(output)
            encrypted.size.toLong()
        } catch (_: Throwable) {
            atomicFile.failWrite(output)
            null
        }
    }

    suspend fun clearAll() = withContext(Dispatchers.IO) {
        directory.listFiles()?.forEach { file -> AtomicFile(file).delete() }
        legacyDirectory.listFiles()?.forEach { file -> AtomicFile(file).delete() }
    }

    private fun fileFor(request: CatalogSnapshotRequest): File {
        val name = CatalogSnapshotIdentity.sha256("${request.deviceCodeHash}|${request.playlistId}")
        return File(directory, "$name.bin")
    }

    private fun associatedData(request: CatalogSnapshotRequest): ByteArray =
        "${request.deviceCodeHash}|${request.playlistId}".toByteArray(Charsets.UTF_8)

    private companion object {
        const val DIRECTORY_NAME = "catalog-snapshots-v2"
        const val LEGACY_DIRECTORY_NAME = "catalog-snapshots-v1"
        const val FRESH_TTL_MILLIS = 12L * 60L * 60L * 1_000L
        const val MAX_RETENTION_MILLIS = 90L * 24L * 60L * 60L * 1_000L
    }
}

internal class CatalogSnapshotCipher(
    private val keyProvider: () -> SecretKey = AndroidCatalogSnapshotKeyStore::getOrCreate,
) {
    fun seal(plaintext: ByteArray, associatedData: ByteArray): ByteArray? = runCatching {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, keyProvider())
        cipher.updateAAD(associatedData)
        val ciphertext = cipher.doFinal(plaintext)
        ByteBuffer.allocate(HEADER_BYTES + cipher.iv.size + ciphertext.size)
            .putInt(MAGIC)
            .put(VERSION)
            .put(cipher.iv.size.toByte())
            .put(cipher.iv)
            .put(ciphertext)
            .array()
    }.getOrNull()

    fun open(sealed: ByteArray, associatedData: ByteArray): ByteArray? = runCatching {
        require(sealed.size > HEADER_BYTES + MIN_IV_BYTES)
        val buffer = ByteBuffer.wrap(sealed)
        require(buffer.int == MAGIC)
        require(buffer.get() == VERSION)
        val ivSize = buffer.get().toInt() and 0xff
        require(ivSize in MIN_IV_BYTES..MAX_IV_BYTES)
        require(buffer.remaining() > ivSize)
        val iv = ByteArray(ivSize).also(buffer::get)
        val ciphertext = ByteArray(buffer.remaining()).also(buffer::get)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            keyProvider(),
            GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv),
        )
        cipher.updateAAD(associatedData)
        cipher.doFinal(ciphertext)
    }.getOrNull()

    private companion object {
        const val MAGIC = 0x52505456
        const val VERSION: Byte = 1
        const val HEADER_BYTES = Int.SIZE_BYTES + 2
        const val MIN_IV_BYTES = 12
        const val MAX_IV_BYTES = 32
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_LENGTH_BITS = 128
    }
}

private object AndroidCatalogSnapshotKeyStore {
    fun getOrCreate(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "roneca_catalog_snapshot_v2"
}

private fun gzip(bytes: ByteArray): ByteArray = ByteArrayOutputStream().use { output ->
    GZIPOutputStream(output).use { it.write(bytes) }
    output.toByteArray()
}

private fun gunzipBounded(bytes: ByteArray, maximumBytes: Long): ByteArray? = runCatching {
    GZIPInputStream(ByteArrayInputStream(bytes)).use { input ->
        ByteArrayOutputStream().use { output ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0L
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= maximumBytes)
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        }
    }
}.getOrNull()
