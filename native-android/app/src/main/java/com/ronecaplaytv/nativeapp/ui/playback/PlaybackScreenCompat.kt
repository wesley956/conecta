package com.ronecaplaytv.nativeapp.ui.playback

import androidx.compose.runtime.Composable
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.persistence.SavedProgress

/**
 * Compatibility entry point used by the current app navigation.
 * The direct-resume callbacks are connected in the next navigation refactor.
 */
@Composable
fun PlaybackScreen(
    isTelevision: Boolean,
    channels: List<NativeChannel>,
    movies: List<NativeMovie>,
    series: List<NativeSeries>,
    favoriteChannelIds: Set<String>,
    favoriteMovieIds: Set<String>,
    favoriteSeriesIds: Set<String>,
    progress: List<SavedProgress>,
    onBack: () -> Unit,
    onPlayChannel: (NativeChannel) -> Unit,
    onOpenMovie: (NativeMovie) -> Unit,
    onOpenSeries: (NativeSeries) -> Unit,
) {
    PlaybackScreen(
        isTelevision = isTelevision,
        channels = channels,
        movies = movies,
        series = series,
        favoriteChannelIds = favoriteChannelIds,
        favoriteMovieIds = favoriteMovieIds,
        favoriteSeriesIds = favoriteSeriesIds,
        progress = progress,
        onBack = onBack,
        onPlayChannel = onPlayChannel,
        onOpenMovie = onOpenMovie,
        onResumeMovie = onOpenMovie,
        onOpenSeries = onOpenSeries,
        onResumeSeries = { item, _ -> onOpenSeries(item) },
    )
}
