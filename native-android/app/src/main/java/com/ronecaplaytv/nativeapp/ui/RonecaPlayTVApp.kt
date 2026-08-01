package com.ronecaplaytv.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ronecaplaytv.nativeapp.activation.ActivationViewModel
import com.ronecaplaytv.nativeapp.catalog.CatalogViewModel
import com.ronecaplaytv.nativeapp.catalog.ContentIdentity
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.persistence.PlaybackPreferences
import com.ronecaplaytv.nativeapp.persistence.PlayerSettingsPreferences
import com.ronecaplaytv.nativeapp.persistence.SavedProgress
import com.ronecaplaytv.nativeapp.series.SeriesEpisodesViewModel
import com.ronecaplaytv.nativeapp.ui.activation.ActivationScreen
import com.ronecaplaytv.nativeapp.ui.channels.ChannelsScreen
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.home.HomeScreen
import com.ronecaplaytv.nativeapp.ui.movies.MovieDetailScreen
import com.ronecaplaytv.nativeapp.ui.movies.MoviesScreen
import com.ronecaplaytv.nativeapp.ui.navigation.MainNavigationBar
import com.ronecaplaytv.nativeapp.ui.navigation.MainNavigationRail
import com.ronecaplaytv.nativeapp.ui.navigation.MainTab
import com.ronecaplaytv.nativeapp.ui.playback.PlaybackScreen
import com.ronecaplaytv.nativeapp.ui.player.NativePlayerScreen
import com.ronecaplaytv.nativeapp.ui.player.SeriesNativePlayerScreen
import com.ronecaplaytv.nativeapp.ui.search.SearchScreen
import com.ronecaplaytv.nativeapp.ui.series.SeriesDetailScreen
import com.ronecaplaytv.nativeapp.ui.series.SeriesScreen
import com.ronecaplaytv.nativeapp.ui.settings.PlaylistDiagnosticsState
import com.ronecaplaytv.nativeapp.ui.settings.SettingsScreen
import com.ronecaplaytv.nativeapp.ui.theme.RonecaPlayTVTheme
import com.ronecaplaytv.nativeapp.update.AppUpdateState
import java.text.Normalizer
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.launch

private enum class NativeDestination {
    Home,
    Search,
    Channels,
    Movies,
    MovieDetail,
    Series,
    SeriesDetail,
    Playback,
    Settings,
    Player,
}

private data class ActiveSeriesPlayback(
    val series: NativeSeries,
    val seasons: List<NativeSeason>,
    val seasonNumber: Int,
    val episodeId: String,
    val episodeNumber: Int,
)

private val recommendationSeparators = Regex("[^a-z0-9]+")
private val recommendationMarks = Regex("\\p{M}+")
private val recommendationStopWords = setOf(
    "a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "em", "na", "nas",
    "no", "nos", "para", "por", "um", "uma", "the", "and", "of", "in", "to",
)

private fun recommendationWords(vararg values: String?): Set<String> =
    values.asSequence()
        .filterNotNull()
        .flatMap { value ->
            Normalizer.normalize(value, Normalizer.Form.NFD)
                .lowercase(Locale.ROOT)
                .replace(recommendationMarks, "")
                .split(recommendationSeparators)
                .asSequence()
        }
        .filter { it.length >= 3 && it !in recommendationStopWords }
        .toSet()

private fun recommendedMovies(
    current: NativeMovie,
    catalog: List<NativeMovie>,
    limit: Int,
): List<NativeMovie> {
    val currentName = recommendationWords(current.name)
    val currentCategory = recommendationWords(current.category)
    val currentSynopsis = recommendationWords(current.synopsis)

    return catalog.asSequence()
        .filter { it.id != current.id }
        .map { candidate ->
            val candidateName = recommendationWords(candidate.name)
            val candidateCategory = recommendationWords(candidate.category)
            val candidateSynopsis = recommendationWords(candidate.synopsis)
            val exactCategory = candidate.category.equals(current.category, ignoreCase = true)
            val yearDistance = if (current.year != null && candidate.year != null) {
                kotlin.math.abs(current.year - candidate.year)
            } else {
                null
            }
            val score =
                (if (exactCategory) 140 else 0) +
                    ((currentCategory intersect candidateCategory).size * 28) +
                    ((currentName intersect candidateName).size * 36) +
                    (((currentSynopsis intersect candidateSynopsis).size * 3).coerceAtMost(36)) +
                    (if (!candidate.coverUrl.isNullOrBlank()) 10 else 0) +
                    (if (!candidate.synopsis.isNullOrBlank()) 6 else 0) +
                    when {
                        yearDistance == null -> 0
                        yearDistance <= 2 -> 10
                        yearDistance <= 5 -> 6
                        else -> 0
                    }
            candidate to score
        }
        .sortedWith(
            compareByDescending<Pair<NativeMovie, Int>> { it.second }
                .thenBy { it.first.name.lowercase(Locale.ROOT) },
        )
        .take(limit)
        .map(Pair<NativeMovie, Int>::first)
        .toList()
}

private fun recommendedSeries(
    current: NativeSeries,
    catalog: List<NativeSeries>,
    limit: Int,
): List<NativeSeries> {
    val currentName = recommendationWords(current.name)
    val currentCategory = recommendationWords(current.category)
    val currentSynopsis = recommendationWords(current.synopsis)

    return catalog.asSequence()
        .filter { it.id != current.id }
        .map { candidate ->
            val candidateName = recommendationWords(candidate.name)
            val candidateCategory = recommendationWords(candidate.category)
            val candidateSynopsis = recommendationWords(candidate.synopsis)
            val exactCategory = candidate.category.equals(current.category, ignoreCase = true)
            val score =
                (if (exactCategory) 140 else 0) +
                    ((currentCategory intersect candidateCategory).size * 28) +
                    ((currentName intersect candidateName).size * 36) +
                    (((currentSynopsis intersect candidateSynopsis).size * 3).coerceAtMost(36)) +
                    (if (!candidate.coverUrl.isNullOrBlank()) 10 else 0) +
                    (if (!candidate.synopsis.isNullOrBlank()) 6 else 0) +
                    (if (candidate.seasons.isNotEmpty()) 5 else 0)
            candidate to score
        }
        .sortedWith(
            compareByDescending<Pair<NativeSeries, Int>> { it.second }
                .thenBy { it.first.name.lowercase(Locale.ROOT) },
        )
        .take(limit)
        .map(Pair<NativeSeries, Int>::first)
        .toList()
}

@Composable
fun RonecaPlayTVApp(
    isTelevision: Boolean,
    appUpdateState: AppUpdateState,
    onCheckForAppUpdate: () -> Unit,
    activationViewModel: ActivationViewModel = viewModel(),
    catalogViewModel: CatalogViewModel = viewModel(),
    seriesEpisodesViewModel: SeriesEpisodesViewModel = viewModel(),
) {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val naturallyWideLayout = isTelevision || configuration.screenWidthDp > configuration.screenHeightDp
    val sessionState by activationViewModel.state.collectAsStateWithLifecycle()
    val catalogState by catalogViewModel.state.collectAsStateWithLifecycle()
    val episodesState by seriesEpisodesViewModel.state.collectAsStateWithLifecycle()
    val playbackPreferences = remember { PlaybackPreferences(context) }
    val playerSettingsPreferences = remember { PlayerSettingsPreferences(context) }
    val coroutineScope = rememberCoroutineScope()
    val destinationStateHolder = rememberSaveableStateHolder()

    var destination by remember { mutableStateOf(NativeDestination.Home) }
    var playerReturnDestination by remember { mutableStateOf(NativeDestination.Home) }
    var detailReturnDestination by remember { mutableStateOf(NativeDestination.Home) }
    var selectedStreamUrls by remember { mutableStateOf(emptyList<String>()) }
    var selectedTitle by remember { mutableStateOf("") }
    var selectedContentKey by remember { mutableStateOf("") }
    var selectedInitialPositionMs by remember { mutableStateOf(0L) }
    var selectedChannelGroup by remember { mutableStateOf<String?>(null) }
    var selectedMovie by remember { mutableStateOf<NativeMovie?>(null) }
    var selectedSeries by remember { mutableStateOf<NativeSeries?>(null) }
    var activeSeriesPlayback by remember { mutableStateOf<ActiveSeriesPlayback?>(null) }
    var pendingSeriesResume by remember { mutableStateOf<Pair<NativeSeries, SavedProgress>?>(null) }
    var settingsState by remember { mutableStateOf(playerSettingsPreferences.load()) }
    var favoriteChannelIds by remember { mutableStateOf(playbackPreferences.favoriteChannels()) }
    var favoriteMovieIds by remember { mutableStateOf(playbackPreferences.favoriteMovies()) }
    var favoriteSeriesIds by remember { mutableStateOf(playbackPreferences.favoriteSeries()) }
    var savedProgress by remember { mutableStateOf(playbackPreferences.startedProgress()) }
    var failoverInProgress by remember { mutableStateOf(false) }

    LaunchedEffect(
        catalogState.activePlaylistId,
        catalogState.channels,
        catalogState.movies,
        catalogState.series,
    ) {
        if (!catalogState.loaded) return@LaunchedEffect
        favoriteChannelIds = playbackPreferences.migrateFavoriteChannels(
            catalogState.channels.associate { it.id to ContentIdentity.channel(it) },
        )
        favoriteMovieIds = playbackPreferences.migrateFavoriteMovies(
            catalogState.movies.associate { it.id to ContentIdentity.movie(it) },
        )
        favoriteSeriesIds = playbackPreferences.migrateFavoriteSeries(
            catalogState.series.associate { it.id to ContentIdentity.series(it) },
        )
        val progressAliases = buildMap {
            catalogState.movies.forEach { movie ->
                put("movie:${movie.id}", ContentIdentity.movie(movie))
            }
            catalogState.series.forEach { series ->
                series.seasons.forEach { season ->
                    season.episodes.forEach { episode ->
                        put(
                            "episode:${series.id}:${episode.id}",
                            ContentIdentity.episode(series, season, episode),
                        )
                    }
                }
            }
        }
        savedProgress = playbackPreferences.migrateProgress(progressAliases)
    }

    LaunchedEffect(
        selectedSeries?.id,
        episodesState.seriesId,
        episodesState.playlistId,
        episodesState.seasons,
    ) {
        val series = selectedSeries ?: return@LaunchedEffect
        if (
            episodesState.seasons.isEmpty() ||
            episodesState.seriesId != series.xtreamSeriesId ||
            episodesState.playlistId != catalogState.activePlaylistId
        ) return@LaunchedEffect
        val aliases = buildMap {
            episodesState.seasons.forEach { season ->
                season.episodes.forEach { episode ->
                    put(
                        "episode:${series.id}:${episode.id}",
                        ContentIdentity.episode(series, season, episode),
                    )
                }
            }
        }
        savedProgress = playbackPreferences.migrateProgress(aliases)
    }

    LaunchedEffect(destination) {
        if (destination != NativeDestination.Player) {
            savedProgress = playbackPreferences.startedProgress()
        }
    }

    val isWideLayout = naturallyWideLayout || settingsState.forceTvMode

    LaunchedEffect(isTelevision) {
        activationViewModel.initialize(isTelevision)
    }

    LaunchedEffect(
        sessionState.isActive,
        sessionState.channelsUrl,
        sessionState.moviesUrl,
        sessionState.seriesUrl,
        sessionState.selectedPlaylistId,
        sessionState.playlists,
    ) {
        if (sessionState.isActive) {
            catalogViewModel.load(
                channelsUrl = sessionState.channelsUrl,
                moviesUrl = sessionState.moviesUrl,
                seriesUrl = sessionState.seriesUrl,
                selectedPlaylistId = sessionState.selectedPlaylistId,
                playlists = sessionState.playlists,
            )
        }
    }

    LaunchedEffect(
        destination,
        selectedSeries?.id,
        selectedSeries?.xtreamSeriesId,
        selectedSeries?.seasons?.size,
        catalogState.activePlaylistId,
    ) {
        val series = selectedSeries
        if (
            destination == NativeDestination.SeriesDetail &&
            series != null &&
            series.seasons.isEmpty() &&
            !series.xtreamSeriesId.isNullOrBlank()
        ) {
            seriesEpisodesViewModel.load(series.xtreamSeriesId, catalogState.activePlaylistId)
        }
    }

    fun refreshCatalog() {
        activationViewModel.refresh()
        catalogViewModel.load(
            channelsUrl = sessionState.channelsUrl,
            moviesUrl = sessionState.moviesUrl,
            seriesUrl = sessionState.seriesUrl,
            selectedPlaylistId = sessionState.selectedPlaylistId,
            playlists = sessionState.playlists,
            force = true,
        )
    }

    fun activateBackupPlaylist(reason: String, positionMs: Long, durationMs: Long) {
        if (failoverInProgress) return
        val attemptId = "android:${UUID.randomUUID()}"
        val failedContentKey = selectedContentKey
        val failedTitle = selectedTitle
        val failedSeriesPlayback = activeSeriesPlayback
        val failedPlaylistId = catalogState.activePlaylistId
        if (durationMs > 0L && positionMs > 0L && !failedContentKey.startsWith("channel:")) {
            playbackPreferences.saveProgress(failedContentKey, positionMs, durationMs)
        }
        activationViewModel.reportPlaylistFailure(
            playlistId = failedPlaylistId,
            error = reason,
            correlationId = attemptId,
            failoverAttemptId = attemptId,
        )

        failoverInProgress = true
        coroutineScope.launch {
            val result = catalogViewModel.failoverActivePlaylist(reason, attemptId)
            if (result == null) {
                failoverInProgress = false
                destination = playerReturnDestination
                activeSeriesPlayback = null
                return@launch
            }

            val recovered = when {
                failedContentKey.startsWith("channel:") -> {
                    val channel = result.state.channels.firstOrNull {
                        ContentIdentity.channel(it) == failedContentKey
                    } ?: result.state.channels.firstOrNull {
                        ContentIdentity.token(it.name) == ContentIdentity.token(failedTitle)
                    }
                    channel?.let {
                        selectedStreamUrls = it.playbackUrls.ifEmpty { listOf(it.primaryUrl) }
                            .map(String::trim)
                            .filter(String::isNotBlank)
                            .distinct()
                        selectedTitle = it.name
                        selectedContentKey = ContentIdentity.channel(it)
                        selectedInitialPositionMs = 0L
                        selectedChannelGroup = it.groupTitle
                    } != null
                }

                failedContentKey.startsWith("movie:") -> {
                    val movie = result.state.movies.firstOrNull {
                        ContentIdentity.movie(it) == failedContentKey
                    } ?: result.state.movies.firstOrNull {
                        ContentIdentity.token(it.name) == ContentIdentity.token(failedTitle)
                    }
                    movie?.let {
                        selectedStreamUrls = it.playbackUrls.ifEmpty { listOf(it.primaryUrl) }
                            .map(String::trim)
                            .filter(String::isNotBlank)
                            .distinct()
                        selectedTitle = it.name
                        selectedContentKey = ContentIdentity.movie(it)
                        selectedInitialPositionMs = positionMs.coerceAtLeast(0L)
                        selectedChannelGroup = null
                        activeSeriesPlayback = null
                    } != null
                }

                failedSeriesPlayback != null -> {
                    val series = result.state.series.firstOrNull {
                        ContentIdentity.series(it) == ContentIdentity.series(failedSeriesPlayback.series)
                    }
                    val seasons = when {
                        series == null -> emptyList()
                        series.seasons.isNotEmpty() -> series.seasons
                        series.xtreamSeriesId.isNullOrBlank() -> emptyList()
                        else -> runCatching {
                            seriesEpisodesViewModel.fetchNow(
                                series.xtreamSeriesId,
                                result.toPlaylistId,
                            )
                        }.getOrDefault(emptyList())
                    }
                    val season = seasons.firstOrNull { it.number == failedSeriesPlayback.seasonNumber }
                    val episode = season?.episodes?.firstOrNull {
                        it.number == failedSeriesPlayback.episodeNumber
                    }
                    if (series != null && season != null && episode != null) {
                        val resolvedSeries = series.copy(seasons = seasons)
                        selectedSeries = resolvedSeries
                        activeSeriesPlayback = ActiveSeriesPlayback(
                            series = resolvedSeries,
                            seasons = seasons,
                            seasonNumber = season.number,
                            episodeId = episode.id,
                            episodeNumber = episode.number,
                        )
                        selectedStreamUrls = episode.playbackUrls.ifEmpty { listOf(episode.primaryUrl) }
                        selectedTitle = "${series.name} • T${season.number} E${episode.number}"
                        selectedContentKey = ContentIdentity.episode(resolvedSeries, season, episode)
                        selectedInitialPositionMs = positionMs.coerceAtLeast(0L)
                        selectedChannelGroup = null
                        true
                    } else {
                        false
                    }
                }

                else -> false
            }

            failoverInProgress = false
            if (recovered && selectedStreamUrls.isNotEmpty()) {
                activationViewModel.reportPlaylistSuccess(result.toPlaylistId)
                savedProgress = playbackPreferences.startedProgress()
                destination = NativeDestination.Player
            } else {
                catalogViewModel.markFailoverContentMissing(attemptId)
                destination = playerReturnDestination
                activeSeriesPlayback = null
            }
        }
    }

    fun openPlayer(
        title: String,
        playbackUrls: List<String>,
        contentKey: String,
        channelGroup: String? = null,
        initialPositionOverrideMs: Long? = null,
    ) {
        val validUrls = playbackUrls.map(String::trim).filter(String::isNotBlank).distinct()
        if (validUrls.isEmpty()) return
        playerReturnDestination = destination
        activeSeriesPlayback = null
        selectedStreamUrls = validUrls
        selectedTitle = title
        selectedContentKey = contentKey
        selectedInitialPositionMs = initialPositionOverrideMs
            ?: playbackPreferences.progressFor(contentKey)?.positionMs
            ?: 0L
        selectedChannelGroup = channelGroup
        destination = NativeDestination.Player
    }

    fun openSeriesEpisode(
        series: NativeSeries,
        seasons: List<NativeSeason>,
        season: NativeSeason,
        episode: NativeEpisode,
        initialPositionOverrideMs: Long? = null,
        preserveReturnDestination: Boolean = false,
    ) {
        val playbackUrls = episode.playbackUrls.ifEmpty { listOf(episode.primaryUrl) }
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        if (playbackUrls.isEmpty()) return
        if (!preserveReturnDestination) playerReturnDestination = destination
        val resolvedSeries = series.copy(seasons = seasons)
        selectedSeries = resolvedSeries
        activeSeriesPlayback = ActiveSeriesPlayback(
            series = resolvedSeries,
            seasons = seasons,
            seasonNumber = season.number,
            episodeId = episode.id,
            episodeNumber = episode.number,
        )
        selectedStreamUrls = playbackUrls
        selectedTitle = "${series.name} • T${season.number} E${episode.number}"
        selectedContentKey = ContentIdentity.episode(resolvedSeries, season, episode)
        selectedInitialPositionMs = initialPositionOverrideMs
            ?: playbackPreferences.progressFor(selectedContentKey)?.positionMs
            ?: 0L
        selectedChannelGroup = null
        destination = NativeDestination.Player
    }

    fun openChannel(channel: NativeChannel) {
        openPlayer(
            title = channel.name,
            playbackUrls = channel.playbackUrls.ifEmpty { listOf(channel.primaryUrl) },
            contentKey = ContentIdentity.channel(channel),
            channelGroup = channel.groupTitle,
        )
    }

    fun openMovie(movie: NativeMovie) {
        openPlayer(
            title = movie.name,
            playbackUrls = movie.playbackUrls.ifEmpty { listOf(movie.primaryUrl) },
            contentKey = ContentIdentity.movie(movie),
        )
    }

    fun openMovieDetails(movie: NativeMovie, returnDestination: NativeDestination = destination) {
        selectedMovie = movie
        detailReturnDestination = returnDestination
        destination = NativeDestination.MovieDetail
    }

    fun openSeriesDetails(series: NativeSeries, returnDestination: NativeDestination = destination) {
        selectedSeries = series
        detailReturnDestination = returnDestination
        pendingSeriesResume = null
        seriesEpisodesViewModel.clear()
        destination = NativeDestination.SeriesDetail
    }

    fun resumeSeries(series: NativeSeries, saved: SavedProgress) {
        detailReturnDestination = destination
        selectedSeries = series
        pendingSeriesResume = series to saved
        seriesEpisodesViewModel.clear()
        destination = NativeDestination.SeriesDetail
    }

    fun selectChannelInsidePlayer(channel: NativeChannel) {
        val validUrls = channel.playbackUrls.ifEmpty { listOf(channel.primaryUrl) }
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        if (validUrls.isEmpty()) return
        selectedStreamUrls = validUrls
        selectedTitle = channel.name
        selectedContentKey = ContentIdentity.channel(channel)
        selectedInitialPositionMs = 0L
        selectedChannelGroup = channel.groupTitle
    }

    fun selectMainTab(tab: MainTab) {
        destination = when (tab) {
            MainTab.Home -> NativeDestination.Home
            MainTab.Channels -> NativeDestination.Channels
            MainTab.Movies -> NativeDestination.Movies
            MainTab.Series -> NativeDestination.Series
            MainTab.Playback -> NativeDestination.Playback
            MainTab.Settings -> NativeDestination.Settings
        }
    }

    LaunchedEffect(
        pendingSeriesResume,
        episodesState.seriesId,
        episodesState.seasons,
        episodesState.loading,
    ) {
        val pending = pendingSeriesResume ?: return@LaunchedEffect
        val series = pending.first
        val saved = pending.second
        val seasons = when {
            series.seasons.isNotEmpty() -> series.seasons
            episodesState.seriesId == series.xtreamSeriesId &&
                episodesState.playlistId == catalogState.activePlaylistId -> episodesState.seasons
            else -> emptyList()
        }
        if (seasons.isEmpty()) return@LaunchedEffect

        val coordinates = ContentIdentity.episodeCoordinates(saved.contentKey)
        val legacyEpisodeId = saved.contentKey
            .takeIf { it.startsWith("episode:${series.id}:") }
            ?.removePrefix("episode:${series.id}:")
        val season = when {
            coordinates != null -> seasons.firstOrNull { it.number == coordinates.first }
            legacyEpisodeId != null -> seasons.firstOrNull { candidate ->
                candidate.episodes.any { it.id == legacyEpisodeId }
            }
            else -> null
        }
        val episode = when {
            coordinates != null -> season?.episodes?.firstOrNull { it.number == coordinates.second }
            legacyEpisodeId != null -> season?.episodes?.firstOrNull { it.id == legacyEpisodeId }
            else -> null
        }
        pendingSeriesResume = null

        if (episode != null && season != null) {
            openSeriesEpisode(
                series = series,
                seasons = seasons,
                season = season,
                episode = episode,
                initialPositionOverrideMs = saved.positionMs,
            )
        }
    }

    val progressKeys = remember(savedProgress) { savedProgress.map(SavedProgress::contentKey).toSet() }
    val startedMovieIds = remember(savedProgress, catalogState.movies) {
        catalogState.movies.filterTo(linkedSetOf()) { movie ->
            ContentIdentity.movie(movie) in progressKeys || "movie:${movie.id}" in progressKeys
        }.mapTo(linkedSetOf(), NativeMovie::id)
    }
    val startedSeriesIds = remember(savedProgress, catalogState.series) {
        catalogState.series.filterTo(linkedSetOf()) { series ->
            savedProgress.any { ContentIdentity.episodeMatchesSeries(it.contentKey, series) }
        }.mapTo(linkedSetOf(), NativeSeries::id)
    }
    val favoriteChannelDisplayIds = remember(favoriteChannelIds, catalogState.channels) {
        catalogState.channels.filterTo(linkedSetOf()) { channel ->
            ContentIdentity.channel(channel) in favoriteChannelIds || channel.id in favoriteChannelIds
        }.mapTo(linkedSetOf(), NativeChannel::id)
    }
    val favoriteMovieDisplayIds = remember(favoriteMovieIds, catalogState.movies) {
        catalogState.movies.filterTo(linkedSetOf()) { movie ->
            ContentIdentity.movie(movie) in favoriteMovieIds || movie.id in favoriteMovieIds
        }.mapTo(linkedSetOf(), NativeMovie::id)
    }
    val favoriteSeriesDisplayIds = remember(favoriteSeriesIds, catalogState.series) {
        catalogState.series.filterTo(linkedSetOf()) { series ->
            ContentIdentity.series(series) in favoriteSeriesIds || series.id in favoriteSeriesIds
        }.mapTo(linkedSetOf(), NativeSeries::id)
    }

    val featuredMovies = remember(catalogState.movies) {
        catalogState.movies
            .asSequence()
            .filter { !it.coverUrl.isNullOrBlank() }
            .take(18)
            .toList()
            .ifEmpty { catalogState.movies.take(18) }
    }
    val featuredSeries = remember(catalogState.series) {
        catalogState.series
            .asSequence()
            .filter { !it.coverUrl.isNullOrBlank() }
            .take(18)
            .toList()
            .ifEmpty { catalogState.series.take(18) }
    }

    val baseDestination = if (destination == NativeDestination.Player) {
        playerReturnDestination
    } else {
        destination
    }

    val selectedTab = when (baseDestination) {
        NativeDestination.Channels -> MainTab.Channels
        NativeDestination.Movies, NativeDestination.MovieDetail -> MainTab.Movies
        NativeDestination.Series, NativeDestination.SeriesDetail -> MainTab.Series
        NativeDestination.Playback -> MainTab.Playback
        NativeDestination.Settings -> MainTab.Settings
        else -> MainTab.Home
    }

    val showMainNavigation = baseDestination in setOf(
        NativeDestination.Home,
        NativeDestination.Channels,
        NativeDestination.Movies,
        NativeDestination.Series,
        NativeDestination.Playback,
        NativeDestination.Settings,
    )

    RonecaPlayTVTheme {
        if (!sessionState.isActive) {
            ActivationScreen(
                state = sessionState,
                isTelevision = isWideLayout,
                onRefresh = activationViewModel::refresh,
                onReset = activationViewModel::resetSecureActivation,
            )
            return@RonecaPlayTVTheme
        }

        val screenContent: @Composable () -> Unit = {
            destinationStateHolder.SaveableStateProvider(baseDestination.name) {
                when (baseDestination) {
                    NativeDestination.Home -> HomeScreen(
                        isTelevision = isTelevision,
                        isWideLayout = isWideLayout,
                        deviceCode = sessionState.deviceCode,
                        expiresAt = sessionState.expiresAt,
                        loadingSection = catalogState.loadingSection,
                        catalogError = catalogState.error ?: catalogState.failoverNotice,
                        channelCount = catalogState.channels.size,
                        movieCount = catalogState.movies.size,
                        seriesCount = catalogState.series.size,
                        featuredMovies = featuredMovies,
                        featuredSeries = featuredSeries,
                        onOpenChannels = { destination = NativeDestination.Channels },
                        onOpenMovies = { destination = NativeDestination.Movies },
                        onOpenSeries = { destination = NativeDestination.Series },
                        onOpenPlayback = { destination = NativeDestination.Playback },
                        onOpenSearch = { destination = NativeDestination.Search },
                        onOpenFeatured = { movie -> openMovieDetails(movie) },
                        onOpenFeaturedSeries = { series -> openSeriesDetails(series) },
                    )

                    NativeDestination.Search -> SearchScreen(
                        channels = catalogState.channels,
                        movies = catalogState.movies,
                        series = catalogState.series,
                        isTelevision = isWideLayout,
                        onBack = { destination = NativeDestination.Home },
                        onPlayChannel = ::openChannel,
                        onOpenMovie = { movie -> openMovieDetails(movie) },
                        onOpenSeries = { series -> openSeriesDetails(series) },
                    )

                    NativeDestination.Channels -> ChannelsScreen(
                        channels = catalogState.channels,
                        isTelevision = isWideLayout,
                        favoriteIds = favoriteChannelDisplayIds,
                        onToggleFavorite = { channel ->
                            favoriteChannelIds = playbackPreferences.toggleFavoriteChannel(
                                ContentIdentity.channel(channel),
                            )
                        },
                        onPlay = ::openChannel,
                    )

                    NativeDestination.Movies -> MoviesScreen(
                        movies = catalogState.movies,
                        isTelevision = isWideLayout,
                        favoriteIds = favoriteMovieDisplayIds,
                        startedIds = startedMovieIds,
                        onOpenDetails = { movie -> openMovieDetails(movie, NativeDestination.Movies) },
                    )

                    NativeDestination.MovieDetail -> {
                        val movie = selectedMovie
                        if (movie == null) {
                            destination = detailReturnDestination
                        } else {
                            val recommendations = remember(movie.id, catalogState.movies) {
                                recommendedMovies(
                                    current = movie,
                                    catalog = catalogState.movies,
                                    limit = 14,
                                )
                            }

                            MovieDetailScreen(
                                movie = movie,
                                recommendations = recommendations,
                                isFavorite = ContentIdentity.movie(movie) in favoriteMovieIds ||
                                    movie.id in favoriteMovieIds,
                                isTelevision = isWideLayout,
                                onBack = { destination = detailReturnDestination },
                                onToggleFavorite = {
                                    favoriteMovieIds = playbackPreferences.toggleFavoriteMovie(
                                        ContentIdentity.movie(movie),
                                    )
                                },
                                onPlay = ::openMovie,
                                onOpenRecommendation = { recommendation ->
                                    selectedMovie = recommendation
                                },
                            )
                        }
                    }

                    NativeDestination.Series -> SeriesScreen(
                        series = catalogState.series,
                        isTelevision = isWideLayout,
                        favoriteIds = favoriteSeriesDisplayIds,
                        startedSeriesIds = startedSeriesIds,
                        onOpenDetails = { series -> openSeriesDetails(series, NativeDestination.Series) },
                    )

                    NativeDestination.SeriesDetail -> {
                        val baseSeries = selectedSeries
                        if (baseSeries == null) {
                            destination = detailReturnDestination
                        } else {
                            val resolvedSeries = if (
                                baseSeries.seasons.isEmpty() &&
                                !baseSeries.xtreamSeriesId.isNullOrBlank() &&
                                episodesState.seriesId == baseSeries.xtreamSeriesId &&
                                episodesState.playlistId == catalogState.activePlaylistId &&
                                episodesState.seasons.isNotEmpty()
                            ) {
                                baseSeries.copy(seasons = episodesState.seasons)
                            } else {
                                baseSeries
                            }
                            val recommendations = remember(baseSeries.id, catalogState.series) {
                                recommendedSeries(
                                    current = baseSeries,
                                    catalog = catalogState.series,
                                    limit = 14,
                                )
                            }

                            SeriesDetailScreen(
                                series = resolvedSeries,
                                recommendations = recommendations,
                                isFavorite = ContentIdentity.series(baseSeries) in favoriteSeriesIds ||
                                    baseSeries.id in favoriteSeriesIds,
                                isTelevision = isWideLayout,
                                episodesLoading = episodesState.seriesId == baseSeries.xtreamSeriesId &&
                                    episodesState.playlistId == catalogState.activePlaylistId &&
                                    episodesState.loading,
                                episodesError = episodesState
                                    .takeIf {
                                        it.seriesId == baseSeries.xtreamSeriesId &&
                                            it.playlistId == catalogState.activePlaylistId
                                    }
                                    ?.error,
                                onBack = {
                                    pendingSeriesResume = null
                                    destination = detailReturnDestination
                                },
                                onToggleFavorite = {
                                    favoriteSeriesIds = playbackPreferences.toggleFavoriteSeries(
                                        ContentIdentity.series(baseSeries),
                                    )
                                },
                                onRefreshEpisodes = {
                                    val xtreamId = baseSeries.xtreamSeriesId
                                    if (!xtreamId.isNullOrBlank()) {
                                        seriesEpisodesViewModel.load(xtreamId, catalogState.activePlaylistId, force = true)
                                    } else {
                                        refreshCatalog()
                                    }
                                },
                                onPlayEpisode = { episode, _ ->
                                    pendingSeriesResume = null
                                    val season = resolvedSeries.seasons.firstOrNull { candidate ->
                                        candidate.episodes.any { it.id == episode.id }
                                    }
                                    if (season != null) {
                                        openSeriesEpisode(
                                            series = resolvedSeries,
                                            seasons = resolvedSeries.seasons,
                                            season = season,
                                            episode = episode,
                                        )
                                    }
                                },
                                onOpenRecommendation = { recommendation ->
                                    selectedSeries = recommendation
                                    pendingSeriesResume = null
                                    seriesEpisodesViewModel.clear()
                                },
                            )
                        }
                    }

                    NativeDestination.Playback -> PlaybackScreen(
                        isTelevision = isWideLayout,
                        channels = catalogState.channels,
                        movies = catalogState.movies,
                        series = catalogState.series,
                        favoriteChannelIds = favoriteChannelIds,
                        favoriteMovieIds = favoriteMovieIds,
                        favoriteSeriesIds = favoriteSeriesIds,
                        progress = savedProgress,
                        onBack = { destination = NativeDestination.Home },
                        onPlayChannel = ::openChannel,
                        onOpenMovie = { movie -> openMovieDetails(movie) },
                        onResumeMovie = ::openMovie,
                        onOpenSeries = { series -> openSeriesDetails(series) },
                        onResumeSeries = ::resumeSeries,
                    )

                    NativeDestination.Settings -> SettingsScreen(
                        isTelevision = isWideLayout,
                        state = settingsState,
                        appUpdateState = appUpdateState,
                        playlistDiagnostics = PlaylistDiagnosticsState(
                            activePlaylistName = catalogState.activePlaylistName,
                            usingBackupPlaylist = catalogState.usingBackupPlaylist,
                            lastFailoverAtMillis = catalogState.lastFailoverAtMillis,
                            lastFailureReason = catalogState.lastFailureReason,
                            channels = catalogState.channels.size,
                            movies = catalogState.movies.size,
                            series = catalogState.series.size,
                        ),
                        onStateChange = { updated ->
                            settingsState = updated
                            playerSettingsPreferences.save(updated)
                        },
                        onRefreshContent = ::refreshCatalog,
                        onCheckForAppUpdate = onCheckForAppUpdate,
                    )

                    NativeDestination.Player -> Unit
                }
            }
        }

        Box(modifier = Modifier.fillMaxSize()) {
            if (showMainNavigation && isWideLayout) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(RonecaColors.Background),
                ) {
                    MainNavigationRail(
                        selectedTab = selectedTab,
                        isTelevision = isTelevision || settingsState.forceTvMode,
                        onSelect = ::selectMainTab,
                    )
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                    ) {
                        screenContent()
                    }
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(RonecaColors.Background),
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        screenContent()
                    }

                    if (showMainNavigation) {
                        MainNavigationBar(
                            selectedTab = selectedTab,
                            isTelevision = false,
                            onSelect = ::selectMainTab,
                        )
                    }
                }
            }

            if (destination == NativeDestination.Player) {
                val seriesPlayback = activeSeriesPlayback
                if (seriesPlayback != null) {
                    SeriesNativePlayerScreen(
                        isTelevision = isTelevision || settingsState.forceTvMode,
                        seriesTitle = seriesPlayback.series.name,
                        seasons = seriesPlayback.seasons,
                        initialEpisodeId = seriesPlayback.episodeId,
                        initialPositionMs = selectedInitialPositionMs,
                        decoderMode = settingsState.decoderMode,
                        bufferSeconds = settingsState.bufferSeconds,
                        automaticReconnect = settingsState.automaticReconnect,
                        positionForEpisode = { episode ->
                            val season = seriesPlayback.seasons.firstOrNull { candidate ->
                                candidate.episodes.any { it.id == episode.id }
                            }
                            season?.let {
                                playbackPreferences.progressFor(
                                    ContentIdentity.episode(seriesPlayback.series, it, episode),
                                )?.positionMs
                            } ?: 0L
                        },
                        onEpisodeChanged = { season, episode ->
                            activeSeriesPlayback = seriesPlayback.copy(
                                seasonNumber = season.number,
                                episodeId = episode.id,
                                episodeNumber = episode.number,
                            )
                            selectedTitle = "${seriesPlayback.series.name} • T${season.number} E${episode.number}"
                            selectedContentKey = ContentIdentity.episode(
                                seriesPlayback.series,
                                season,
                                episode,
                            )
                            selectedInitialPositionMs = 0L
                        },
                        onProgress = { season, episode, positionMs, durationMs ->
                            val contentKey = ContentIdentity.episode(
                                seriesPlayback.series,
                                season,
                                episode,
                            )
                            playbackPreferences.saveProgress(contentKey, positionMs, durationMs)
                        },
                        onTerminalPlaybackFailure = ::activateBackupPlaylist,
                        onBack = {
                            destination = playerReturnDestination
                            activeSeriesPlayback = null
                        },
                    )
                } else {
                    val relatedChannels = remember(selectedChannelGroup, catalogState.channels) {
                        selectedChannelGroup
                            ?.let { group ->
                                catalogState.channels.filter { it.groupTitle.equals(group, ignoreCase = true) }
                            }
                            .orEmpty()
                    }
                    val currentChannelId = selectedContentKey
                        .takeIf { it.startsWith("channel:") }
                        ?.removePrefix("channel:")

                    NativePlayerScreen(
                        isTelevision = isTelevision || settingsState.forceTvMode,
                        title = selectedTitle,
                        streamUrls = selectedStreamUrls,
                        initialPositionMs = selectedInitialPositionMs,
                        relatedChannels = relatedChannels,
                        currentChannelId = currentChannelId,
                        decoderMode = settingsState.decoderMode,
                        bufferSeconds = settingsState.bufferSeconds,
                        automaticReconnect = settingsState.automaticReconnect,
                        onProgress = { positionMs, durationMs ->
                            if (selectedContentKey.startsWith("movie:") || selectedContentKey.startsWith("episode:")) {
                                playbackPreferences.saveProgress(selectedContentKey, positionMs, durationMs)
                            }
                        },
                        onSelectChannel = ::selectChannelInsidePlayer,
                        onTerminalPlaybackFailure = ::activateBackupPlaylist,
                        onBack = { destination = playerReturnDestination },
                    )
                }
            }
        }
    }
}
