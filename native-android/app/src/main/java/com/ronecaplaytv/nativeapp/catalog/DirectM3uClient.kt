package com.ronecaplaytv.nativeapp.catalog

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.FilterInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer
import java.util.Locale

internal data class DirectM3uCatalog(
    val channels: List<NativeChannel>,
    val movies: List<NativeMovie>,
    val series: List<NativeSeries>,
)

internal class DirectM3uClient {
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
        val connection = openConnection(sourceUrl)
        return try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw CatalogLoadException("A lista direta respondeu HTTP $status.")
            }

            val declaredSize = connection.contentLengthLong
            if (declaredSize > MAX_PLAYLIST_BYTES) {
                throw CatalogLoadException("A lista direta excede o limite seguro para este aparelho.")
            }

            connection.inputStream.use { input ->
                parsePlaylist(LimitedM3uInputStream(input, MAX_PLAYLIST_BYTES))
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun openConnection(sourceUrl: String): HttpURLConnection {
        val url = URL(sourceUrl)
        require(url.protocol == "http" || url.protocol == "https") {
            "Protocolo da lista direta não permitido."
        }

        return (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            useCaches = false
            setRequestProperty("Accept", "*/*")
            setRequestProperty("Cache-Control", "no-cache")
            setRequestProperty("User-Agent", "RonecaPlayTV-Native")
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
        return patterns.firstNotNullOfOrNull { it.find(extInf)?.groupValues?.getOrNull(1)?.trim() }.orEmpty()
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
            return if (combined.contains("serie") || combined.contains("temporada") || combined.contains("season")) {
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
        val seriesName = EPISODE_PATTERNS.fold(name) { current, pattern -> current.replace(pattern, "") }
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
            .joinToString(" ") { word -> word.replaceFirstChar { it.titlecase(Locale("pt", "BR")) } }
    }

    private fun yearFromName(name: String): Int? = YEAR_PATTERN.find(name)?.value?.toIntOrNull()

    private fun slug(value: String): String = normalize(value)
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
        .ifBlank { "outros" }

    private fun normalize(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFD)
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
                    NativeSeason(number = number, episodes = episodes.sortedBy(NativeEpisode::number))
                },
        )
    }

    private enum class EntryKind { LIVE, MOVIE, SERIES }

    companion object {
        const val DIRECT_MARKER = "#roneca-direct-m3u"

        fun isDirectUrl(url: String): Boolean = url.contains(DIRECT_MARKER)

        private fun sourceUrl(markedUrl: String): String = markedUrl.substringBefore(DIRECT_MARKER)

        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 150_000
        private const val MAX_PLAYLIST_BYTES = 90L * 1024L * 1024L
        private const val BUFFER_SIZE = 64 * 1024

        private val YEAR_PATTERN = Regex("\\b(19\\d{2}|20\\d{2})\\b")
        private val QUALITY_MARKERS = Regex(
            "\\b(4K|UHD|FHD|HD|SD|DUB|DUBLADO|LEG|LEGENDADO|DUAL AUDIO|BLURAY|WEB-DL|WEBRIP|BRRIP|X264|X265|H264|H265)\\b",
            RegexOption.IGNORE_CASE,
        )
        private val EPISODE_PATTERNS = listOf(
            Regex("\\bS(\\d{1,2})\\s*E(\\d{1,3})\\b", RegexOption.IGNORE_CASE),
            Regex("\\bT(\\d{1,2})\\s*E(\\d{1,3})\\b", RegexOption.IGNORE_CASE),
            Regex("\\b(\\d{1,2})x(\\d{1,3})\\b", RegexOption.IGNORE_CASE),
        )
        private val VOD_EXTENSIONS = listOf(".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v")
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
