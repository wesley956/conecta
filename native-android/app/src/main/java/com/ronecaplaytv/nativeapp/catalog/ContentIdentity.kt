package com.ronecaplaytv.nativeapp.catalog

import java.text.Normalizer
import java.util.Locale

/**
 * Stable local identifiers for equivalent content across primary and backup playlists.
 * Provider ids and stream URLs are intentionally excluded because they commonly change.
 */
object ContentIdentity {
    private val marks = Regex("\\p{M}+")
    private val separators = Regex("[^a-z0-9]+")

    fun channel(channel: NativeChannel): String =
        "channel:${token(channel.name)}:${token(channel.groupTitle)}"

    fun movie(movie: NativeMovie): String =
        "movie:${token(movie.name)}:${movie.year ?: 0}"

    fun series(series: NativeSeries): String =
        "series:${token(series.name)}"

    fun episode(series: NativeSeries, season: NativeSeason, episode: NativeEpisode): String =
        "episode:${token(series.name)}:s${season.number}:e${episode.number}"

    fun episodeSeriesToken(contentKey: String): String? {
        if (!contentKey.startsWith("episode:")) return null
        return contentKey.removePrefix("episode:").substringBefore(":s").takeIf(String::isNotBlank)
    }

    fun episodeCoordinates(contentKey: String): Pair<Int, Int>? {
        val match = Regex(":s(\\d+):e(\\d+)$").find(contentKey) ?: return null
        val season = match.groupValues[1].toIntOrNull() ?: return null
        val episode = match.groupValues[2].toIntOrNull() ?: return null
        return season to episode
    }

    fun episodeMatchesSeries(contentKey: String, series: NativeSeries): Boolean =
        episodeSeriesToken(contentKey) == token(series.name) ||
            contentKey.startsWith("episode:${series.id}:")

    fun token(value: String?): String {
        val normalized = Normalizer.normalize(value.orEmpty(), Normalizer.Form.NFD)
            .lowercase(Locale.ROOT)
            .replace(marks, "")
            .replace(separators, "-")
            .trim('-')
        return normalized.ifBlank { "sem-nome" }
    }
}
