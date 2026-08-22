package com.ronecaplaytv.nativeapp.ui.series

import com.ronecaplaytv.nativeapp.catalog.ContentIdentity
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.persistence.SavedProgress

internal data class SeriesResumeTarget(
    val season: NativeSeason,
    val episode: NativeEpisode,
    val progress: SavedProgress,
)

internal fun resolveSeriesResumeTarget(
    series: NativeSeries,
    progress: List<SavedProgress>,
): SeriesResumeTarget? = series.seasons
    .asSequence()
    .flatMap { season ->
        season.episodes.asSequence().mapNotNull { episode ->
            progressForEpisode(series, season, episode, progress)?.let { saved ->
                SeriesResumeTarget(season = season, episode = episode, progress = saved)
            }
        }
    }
    .maxByOrNull { it.progress.updatedAt }

internal fun progressForEpisode(
    series: NativeSeries,
    season: NativeSeason,
    episode: NativeEpisode,
    progress: List<SavedProgress>,
): SavedProgress? {
    val stableKey = ContentIdentity.episode(series, season, episode)
    val legacyKey = "episode:${series.id}:${episode.id}"
    return progress
        .asSequence()
        .filter { saved ->
            saved.contentKey == stableKey ||
                saved.contentKey == legacyKey ||
                (
                    ContentIdentity.episodeMatchesSeries(saved.contentKey, series) &&
                        ContentIdentity.episodeCoordinates(saved.contentKey) ==
                        (season.number to episode.number)
                    )
        }
        .maxByOrNull(SavedProgress::updatedAt)
}

internal fun formatPlaybackPosition(positionMs: Long): String {
    val totalSeconds = (positionMs.coerceAtLeast(0L) / 1_000L)
    val hours = totalSeconds / 3_600L
    val minutes = (totalSeconds % 3_600L) / 60L
    val seconds = totalSeconds % 60L
    return if (hours > 0L) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%02d:%02d".format(minutes, seconds)
    }
}
