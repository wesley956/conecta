package com.ronecaplaytv.nativeapp.catalog

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.BufferedReader
import java.io.FilterInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.net.URL
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.TimeUnit

internal data class DirectM3uCatalog(
    val channels: List<NativeChannel>,
    val movies: List<NativeMovie>,
    val series: List<NativeSeries>,
)

internal class DirectM3uClient {
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .readTimeout(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .retryOnConnectionFailure(true)
        .build()

    @Volatile
    private var cachedSourceUrl: String? = null

    @Volatile
    private var cachedCatalog: DirectM3uCatalog? = null

    suspend fun load(markedUrl: String): DirectM3uCatalog {
        val sourceUrl = sourceUrl(markedUrl)
        cachedCatalog?.takeIf { cachedSourceUrl == sourceUrl }?.let { return it }

        return withContext(Dispatchers.IO) {
            cachedCatalog?.takeIf { cachedSourceUrl == sourceUrl } ?: downloadAndParse(sourceUrl).also {
                cachedSourceUrl = sourceUrl
                cachedCatalog = it
            }
        }
    }

    private fun downloadAndParse(sourceUrl: String): DirectM3uCatalog {
        val failures = mutableListOf<String>()

        for ((index, profile) in REQUEST_PROFILES.withIndex()) {
            val request = buildRequest(sourceUrl, profile)
            try {
                val response = httpClient.newCall(request).execute()
                try {
                    val status = response.code
                    if (!response.isSuccessful) {
                        failures += responseTrace(profile, response)
                        if (status == 401) break
                        if (index == 0 && status !in PROFILE_RETRY_STATUSES) break
                        continue
                    }

                    val body = response.body
                    val declaredSize = body.contentLength()
                    if (declaredSize > MAX_PLAYLIST_BYTES) {
                        throw CatalogLoadException(
                            "A lista direta excede o limite seguro para este aparelho.",
                        )
                    }

                    return body.byteStream().use { input ->
                        parsePlaylist(LimitedM3uInputStream(input, MAX_PLAYLIST_BYTES))
                    }
                } finally {
                    response.close()
                }
            } catch (error: CatalogLoadException) {
                failures += "${profile.label}: ${error.message.orEmpty()}"
                if (index == 0 && !isProfileSensitiveFailure(error.message.orEmpty())) break
            } catch (error: Exception) {
                failures += "${profile.label}: ${safeNetworkFailure(error)}"
                if (index == 0) break
            }
        }

        val summary = failures
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
            .takeLast(4)
            .joinToString(" | ")
            .take(460)
            .ifBlank { "falha não identificada" }
        throw CatalogLoadException("M3U_TRACE $summary")
    }

    private fun buildRequest(sourceUrl: String, profile: RequestProfile): Request {
        val parsed = URL(sourceUrl)
        require(parsed.protocol == "http" || parsed.protocol == "https") {
            "Protocolo da lista direta não permitido."
        }

        return Request.Builder()
            .url(sourceUrl)
            .get()
            .header("Accept", profile.accept)
            .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.7")
            .header("Cache-Control", "no-cache")
            .header("Pragma", "no-cache")
            .header("User-Agent", profile.userAgent)
            .apply {
                profile.requestedWith?.let { header("X-Requested-With", it) }
                profile.referer?.let { header("Referer", it) }
            }
            .build()
    }

    private fun responseTrace(profile: RequestProfile, response: Response): String {
        val finalUrl = response.request.url
        val scheme = finalUrl.scheme
        val host = finalUrl.host
        val port = finalUrl.port
        val path = finalUrl.encodedPath.take(80)
        val portLabel = when {
            scheme == "https" && port == 443 -> ""
            scheme == "http" && port == 80 -> ""
            else -> ":$port"
        }
        val server = response.header("Server")
            ?.replace(Regex("[^A-Za-z0-9._/-]"), "")
            ?.take(28)
            ?.ifBlank { null }
            ?: "-"
        val contentType = response.header("Content-Type")
            ?.substringBefore(';')
            ?.replace(Regex("[^A-Za-z0-9.+/-]"), "")
            ?.take(32)
            ?.ifBlank { null }
            ?: "-"
        val location = response.header("Location")
            ?.let(::safeLocation)
            ?: "-"
        return "${profile.label}:${response.code}/${response.protocol} " +
            "$scheme://$host$portLabel$path srv=$server ct=$contentType loc=$location"
    }

    private fun safeLocation(value: String): String {
        val parsed = runCatching { URL(value) }.getOrNull() ?: return "relative"
        val portLabel = when {
            parsed.protocol == "https" && parsed.port in listOf(-1, 443) -> ""
            parsed.protocol == "http" && parsed.port in listOf(-1, 80) -> ""
            parsed.port > 0 -> ":${parsed.port}"
            else -> ""
        }
        return "${parsed.protocol}://${parsed.host}$portLabel${parsed.path.take(50)}"
    }

    private fun isProfileSensitiveFailure(message: String): Boolean {
        val normalized = message.lowercase(Locale.ROOT)
        return normalized.contains("não retornou canais") ||
            normalized.contains("dados inválidos") ||
            normalized.contains("resposta vazia")
    }

    private fun safeNetworkFailure(error: Exception): String {
        val message = error.message.orEmpty().lowercase(Locale.ROOT)
        return when {
            message.contains("timed out") || message.contains("timeout") -> "timeout"
            message.contains("failed to connect") || message.contains("connection refused") -> "connect_fail"
            message.contains("unable to resolve host") || message.contains("unknown host") -> "dns_fail"
            message.contains("certificate") || message.contains("ssl") || message.contains("tls") -> "tls_fail"
            else -> error::class.java.simpleName.ifBlank { "network_fail" }
        }
    }

    private fun parsePlaylist(input: InputStream): DirectM3uCatalog {
        val channels = mutableListOf<NativeChannel>()
        val movies = mutableListOf<NativeMovie>()
        val seriesByKey = linkedMapOf<String, MutableSeries>()
        var pendingExtInf: String? = null
        var channelCounter = 0
        var movieCounter = 0
        var seriesCounter = 0
        var episodeCounter = 0

        BufferedReader(InputStreamReader(input, Charsets.UTF_8), BUFFER_SIZE).useLines { lines ->
            lines.forEach { rawLine ->
                val line = rawLine.trim().removePrefix("\uFEFF")
                if (line.isBlank()) return@forEach

                if (line.startsWith("#EXTINF", ignoreCase = true)) {
                    pendingExtInf = line
                    return@forEach
                }

                val extInf = pendingExtInf ?: return@forEach
                if (line.startsWith("#")) return@forEach
                if (!isPlayableUrl(line)) {
                    pendingExtInf = null
                    return@forEach
                }
                pendingExtInf = null

                val name = readName(extInf)
                val groupTitle = readAttribute(extInf, "group-title").ifBlank { "Outros" }
                val logo = readAttribute(extInf, "tvg-logo").ifBlank { null }
                val kind = classify(name, groupTitle, line)

                when (kind) {
                    EntryKind.LIVE -> {
                        channelCounter += 1
                        channels += NativeChannel(
                            id = "direct-ch-$channelCounter",
                            name = name,
                            groupTitle = cleanCategory(groupTitle, "Outros"),
                            logoUrl = logo,
                            primaryUrl = line,
                            playbackUrls = listOf(line),
                        )
                    }

                    EntryKind.MOVIE -> {
                        movieCounter += 1
                        movies += NativeMovie(
                            id = "direct-mv-$movieCounter",
                            name = cleanMovieName(name),
                            year = yearFromName(name),
                            duration = null,
                            synopsis = "Filme autorizado pelo painel.",
                            coverUrl = logo,
                            category = cleanCategory(groupTitle, "Filmes"),
                            primaryUrl = line,
                            playbackUrls = listOf(line),
                        )
                    }

                    EntryKind.SERIES -> {
                        val episodeInfo = parseEpisode(name)
                        val key = "${slug(groupTitle)}-${slug(episodeInfo.seriesName)}"
                        val current = seriesByKey.getOrPut(key) {
                            seriesCounter += 1
                            MutableSeries(
                                id = "direct-sr-$seriesCounter",
                                name = episodeInfo.seriesName,
                                coverUrl = logo,
                                category = cleanCategory(groupTitle, "Séries"),
                            )
                        }
                        episodeCounter += 1
                        current.addEpisode(
                            seasonNumber = episodeInfo.season,
                            episode = NativeEpisode(
                                id = "${current.id}-ep-$episodeCounter",
                                number = episodeInfo.episode,
                                name = name,
                                duration = null,
                                primaryUrl = line,
                                playbackUrls = listOf(line),
                            ),
                        )
                    }
                }
            }
        }

        val series = seriesByKey.values.map(MutableSeries::build)
        if (channels.isEmpty() && movies.isEmpty() && series.isEmpty()) {
            throw CatalogLoadException("A lista direta não retornou canais, filmes ou séries.")
        }

        return DirectM3uCatalog(
            channels = channels,
            movies = movies,
            series = series,
        )
    }

    private fun readName(extInf: String): String {
        val commaIndex = extInf.lastIndexOf(',')
        if (commaIndex >= 0 && commaIndex < extInf.lastIndex) {
            return extInf.substring(commaIndex + 1).trim().ifBlank { "Sem nome" }
        }
        return readAttribute(extInf, "tvg-name").ifBlank { "Sem nome" }
    }

    private fun readAttribute(extInf: String, attribute: String): String {
        val escaped = Regex.escape(attribute)
        val patterns = listOf(
            Regex("$escaped\\s*=\\s*\"([^\"]*)\"", RegexOption.IGNORE_CASE),
            Regex("$escaped\\s*=\\s*'([^']*)'", RegexOption.IGNORE_CASE),
            Regex("$escaped\\s*=\\s*([^\\s,]+)", RegexOption.IGNORE_CASE),
        )
        return patterns.firstNotNullOfOrNull {
            it.find(extInf)?.groupValues?.getOrNull(1)?.trim()
        }.orEmpty()
    }

    private fun classify(name: String, groupTitle: String, streamUrl: String): EntryKind {
        val combined = normalize("$groupTitle $name")
        val path = runCatching { URL(streamUrl).path.lowercase(Locale.ROOT) }
            .getOrElse { streamUrl.lowercase(Locale.ROOT) }

        if (Regex("\\b24\\s*h(oras)?\\b").containsMatchIn(combined) || combined.contains("24/7")) {
            return EntryKind.LIVE
        }
        if (path.contains("/series/")) return EntryKind.SERIES
        if (path.contains("/movie/")) return EntryKind.MOVIE
        if (EPISODE_PATTERNS.any { it.containsMatchIn(name) }) return EntryKind.SERIES
        if (path.endsWith(".ts") || path.endsWith(".m3u8")) return EntryKind.LIVE
        if (VOD_EXTENSIONS.any(path::endsWith)) {
            return if (
                combined.contains("serie") ||
                combined.contains("temporada") ||
                combined.contains("season")
            ) {
                EntryKind.SERIES
            } else {
                EntryKind.MOVIE
            }
        }
        if (combined.contains("filme") || combined.contains("movie") || combined.contains("vod")) {
            return EntryKind.MOVIE
        }
        return EntryKind.LIVE
    }

    private fun parseEpisode(name: String): EpisodeInfo {
        val match = EPISODE_PATTERNS.firstNotNullOfOrNull { it.find(name) }
        val season = match?.groupValues?.getOrNull(1)?.toIntOrNull()?.coerceAtLeast(1) ?: 1
        val episode = match?.groupValues?.getOrNull(2)?.toIntOrNull()?.coerceAtLeast(1) ?: 1
        val seriesName = EPISODE_PATTERNS.fold(name) { current, pattern ->
            current.replace(pattern, "")
        }
            .replace(Regex("\\s*[-–|]\\s*$"), "")
            .replace(Regex("\\s{2,}"), " ")
            .trim()
            .ifBlank { name }
        return EpisodeInfo(seriesName, season, episode)
    }

    private fun cleanMovieName(name: String): String = name
        .replace(Regex("\\b(?:19|20)\\d{2}\\b"), "")
        .replace(QUALITY_MARKERS, "")
        .replace('_', ' ')
        .replace('.', ' ')
        .replace(Regex("\\s{2,}"), " ")
        .trim()
        .ifBlank { name }

    private fun cleanCategory(value: String, fallback: String): String {
        val cleaned = value
            .replace(QUALITY_MARKERS, "")
            .replace('|', ' ')
            .replace(Regex("\\s{2,}"), " ")
            .trim()
            .ifBlank { fallback }
        return cleaned.lowercase(Locale("pt", "BR"))
            .split(Regex("\\s+"))
            .joinToString(" ") { word ->
                word.replaceFirstChar { it.titlecase(Locale("pt", "BR")) }
            }
    }

    private fun yearFromName(name: String): Int? =
        YEAR_PATTERN.find(name)?.value?.toIntOrNull()

    private fun slug(value: String): String = normalize(value)
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
        .ifBlank { "outros" }

    private fun normalize(value: String): String =
        Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .lowercase(Locale.ROOT)

    private fun isPlayableUrl(value: String): Boolean =
        value.startsWith("http://", ignoreCase = true) ||
            value.startsWith("https://", ignoreCase = true) ||
            value.startsWith("rtmp://", ignoreCase = true)

    private data class EpisodeInfo(
        val seriesName: String,
        val season: Int,
        val episode: Int,
    )

    private data class MutableSeries(
        val id: String,
        val name: String,
        val coverUrl: String?,
        val category: String,
        val seasons: MutableMap<Int, MutableList<NativeEpisode>> = linkedMapOf(),
    ) {
        fun addEpisode(seasonNumber: Int, episode: NativeEpisode) {
            seasons.getOrPut(seasonNumber) { mutableListOf() } += episode
        }

        fun build() = NativeSeries(
            id = id,
            name = name,
            coverUrl = coverUrl,
            category = category,
            synopsis = "Série autorizada pelo painel.",
            seasons = seasons.entries
                .sortedBy(Map.Entry<Int, MutableList<NativeEpisode>>::key)
                .map { (number, episodes) ->
                    NativeSeason(
                        number = number,
                        episodes = episodes.sortedBy(NativeEpisode::number),
                    )
                },
        )
    }

    private data class RequestProfile(
        val label: String,
        val userAgent: String,
        val accept: String,
        val requestedWith: String? = null,
        val referer: String? = null,
    )

    private enum class EntryKind { LIVE, MOVIE, SERIES }

    companion object {
        const val DIRECT_MARKER = "#roneca-direct-m3u"

        fun isDirectUrl(url: String): Boolean = url.contains(DIRECT_MARKER)

        private fun sourceUrl(markedUrl: String): String =
            markedUrl.substringBefore(DIRECT_MARKER)

        private const val CONNECT_TIMEOUT_MS = 15_000L
        private const val READ_TIMEOUT_MS = 150_000L
        private const val MAX_PLAYLIST_BYTES = 90L * 1024L * 1024L
        private const val BUFFER_SIZE = 64 * 1024
        private val PROFILE_RETRY_STATUSES = setOf(403, 404, 406)
        private val REQUEST_PROFILES = listOf(
            RequestProfile(
                label = "Roneca",
                userAgent = "RonecaPlayTV-Native",
                accept = "application/x-mpegURL, application/vnd.apple.mpegurl, */*",
            ),
            RequestProfile(
                label = "Smarters",
                userAgent = "IPTVSmartersPro",
                accept = "*/*",
                requestedWith = "com.nst.iptvsmarterstvbox",
            ),
            RequestProfile(
                label = "VLC",
                userAgent = "VLC/3.0.21 LibVLC/3.0.21",
                accept = "*/*",
            ),
            RequestProfile(
                label = "Android",
                userAgent = "okhttp/5.3.2",
                accept = "*/*",
            ),
        )

        private val YEAR_PATTERN = Regex("\\b(19\\d{2}|20\\d{2})\\b")
        private val QUALITY_MARKERS = Regex(
            "\\b(4K|UHD|FHD|HD|SD|DUB|DUBLADO|LEG|LEGENDADO|DUAL AUDIO|" +
                "BLURAY|WEB-DL|WEBRIP|BRRIP|X264|X265|H264|H265)\\b",
            RegexOption.IGNORE_CASE,
        )
        private val EPISODE_PATTERNS = listOf(
            Regex("\\bS(\\d{1,2})\\s*E(\\d{1,3})\\b", RegexOption.IGNORE_CASE),
            Regex("\\bT(\\d{1,2})\\s*E(\\d{1,3})\\b", RegexOption.IGNORE_CASE),
            Regex("\\b(\\d{1,2})x(\\d{1,3})\\b", RegexOption.IGNORE_CASE),
        )
        private val VOD_EXTENSIONS = listOf(
            ".mp4",
            ".mkv",
            ".avi",
            ".mov",
            ".wmv",
            ".flv",
            ".webm",
            ".m4v",
        )
    }
}

private class LimitedM3uInputStream(
    input: InputStream,
    private val maximumBytes: Long,
) : FilterInputStream(input) {
    private var totalRead = 0L

    override fun read(): Int {
        val value = super.read()
        if (value >= 0) registerRead(1)
        return value
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        val count = super.read(buffer, offset, length)
        if (count > 0) registerRead(count.toLong())
        return count
    }

    private fun registerRead(count: Long) {
        totalRead += count
        if (totalRead > maximumBytes) {
            throw CatalogLoadException("Download da lista direta excedeu o limite seguro.")
        }
    }
}
