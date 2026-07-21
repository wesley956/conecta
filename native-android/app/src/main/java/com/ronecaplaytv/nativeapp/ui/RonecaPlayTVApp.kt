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
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ronecaplaytv.nativeapp.activation.ActivationViewModel
import com.ronecaplaytv.nativeapp.catalog.CatalogViewModel
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
import com.ronecaplaytv.nativeapp.ui.settings.SettingsScreen
import com.ronecaplaytv.nativeapp.ui.theme.RonecaPlayTVTheme
import com.ronecaplaytv.nativeapp.update.AppUpdateState

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
)

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

    val isWideLayout = naturallyWideLayout || settingsState.forceTvMode

    LaunchedEffect(isTelevision) {
        activationViewModel.initialize(isTelevision)
    }

    LaunchedEffect(
        sessionState.isActive,
        sessionState.channelsUrl,
        sessionState.moviesUrl,
        sessionState.seriesUrl,
    ) {
        if (sessionState.isActive) {
            catalogViewModel.load(
                channelsUrl = sessionState.channelsUrl,
                moviesUrl = sessionState.moviesUrl,
                seriesUrl = sessionState.seriesUrl,
            )
        }
    }

    LaunchedEffect(
        destination,
        selectedSeries?.id,
        selectedSeries?.xtreamSeriesId,
        selectedSeries?.seasons?.size,
    ) {
        val series = selectedSeries
        if (
            destination == NativeDestination.SeriesDetail &&
            series != null &&
            series.seasons.isEmpty() &&
            !series.xtreamSeriesId.isNullOrBlank()
        ) {
            seriesEpisodesViewModel.load(series.xtreamSeriesId)
        }
    }

    fun refreshCatalog() {
        activationViewModel.refresh()
        catalogViewModel.load(
            channelsUrl = sessionState.channelsUrl,
            moviesUrl = sessionState.moviesUrl,
            seriesUrl = sessionState.seriesUrl,
            force = true,
        )
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
        )
        selectedStreamUrls = playbackUrls
        selectedTitle = "${series.name} • T${season.number} E${episode.number}"
        selectedContentKey = "episode:${series.id}:${episode.id}"
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
            contentKey = "channel:${channel.id}",
            channelGroup = channel.groupTitle,
        )
    }

    fun openMovie(movie: NativeMovie) {
        openPlayer(
            title = movie.name,
            playbackUrls = movie.playbackUrls.ifEmpty { listOf(movie.primaryUrl) },
            contentKey = "movie:${movie.id}",
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
        selectedContentKey = "channel:${channel.id}"
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
            episodesState.seriesId == series.xtreamSeriesId -> episodesState.seasons
            else -> emptyList()
        }
        if (seasons.isEmpty()) return@LaunchedEffect

        val episodeId = saved.contentKey.removePrefix("episode:${series.id}:")
        val season = seasons.firstOrNull { candidate ->
            candidate.episodes.any { it.id == episodeId }
        }
        val episode = season?.episodes?.firstOrNull { it.id == episodeId }
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

    val startedMovieIds = remember(savedProgress) {
        savedProgress.mapNotNull { entry ->
            entry.contentKey.takeIf { it.startsWith("movie:") }?.removePrefix("movie:")
        }.toSet()
    }
    val startedSeriesIds = remember(savedProgress) {
        savedProgress.mapNotNull { entry ->
            entry.contentKey
                .takeIf { it.startsWith("episode:") }
                ?.removePrefix("episode:")
                ?.substringBefore(':')
        }.toSet()
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
                        catalogError = catalogState.error,
                        channelCount = catalogState.channels.size,
                        movieCount = catalogState.movies.size,
                        seriesCount = catalogState.series.size,
                        featuredMovie = catalogState.movies.firstOrNull { !it.coverUrl.isNullOrBlank() }
                            ?: catalogState.movies.firstOrNull(),
                        onOpenChannels = { destination = NativeDestination.Channels },
                        onOpenMovies = { destination = NativeDestination.Movies },
                        onOpenSeries = { destination = NativeDestination.Series },
                        onOpenPlayback = { destination = NativeDestination.Playback },
                        onOpenSearch = { destination = NativeDestination.Search },
                        onOpenFeatured = { movie -> openMovieDetails(movie) },
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
                        favoriteIds = favoriteChannelIds,
                        onToggleFavorite = { channel ->
                            favoriteChannelIds = playbackPreferences.toggleFavoriteChannel(channel.id)
                        },
                        onPlay = ::openChannel,
                    )

                    NativeDestination.Movies -> MoviesScreen(
                        movies = catalogState.movies,
                        isTelevision = isWideLayout,
                        favoriteIds = favoriteMovieIds,
                        startedIds = startedMovieIds,
                        onOpenDetails = { movie -> openMovieDetails(movie, NativeDestination.Movies) },
                    )

                    NativeDestination.MovieDetail -> {
                        val movie = selectedMovie
                        if (movie == null) {
                            destination = detailReturnDestination
                        } else {
                            val recommendations = catalogState.movies
                                .asSequence()
                                .filter { it.id != movie.id && it.category.equals(movie.category, ignoreCase = true) }
                                .take(14)
                                .toList()

                            MovieDetailScreen(
                                movie = movie,
                                recommendations = recommendations,
                                isFavorite = movie.id in favoriteMovieIds,
                                isTelevision = isWideLayout,
                                onBack = { destination = detailReturnDestination },
                                onToggleFavorite = {
                                    favoriteMovieIds = playbackPreferences.toggleFavoriteMovie(movie.id)
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
                        favoriteIds = favoriteSeriesIds,
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
                                episodesState.seasons.isNotEmpty()
                            ) {
                                baseSeries.copy(seasons = episodesState.seasons)
                            } else {
                                baseSeries
                            }
                            val recommendations = catalogState.series
                                .asSequence()
                                .filter { it.id != baseSeries.id && it.category.equals(baseSeries.category, ignoreCase = true) }
                                .take(14)
                                .toList()

                            SeriesDetailScreen(
                                series = resolvedSeries,
                                recommendations = recommendations,
                                isFavorite = baseSeries.id in favoriteSeriesIds,
                                isTelevision = isWideLayout,
                                episodesLoading = episodesState.seriesId == baseSeries.xtreamSeriesId && episodesState.loading,
                                episodesError = episodesState
                                    .takeIf { it.seriesId == baseSeries.xtreamSeriesId }
                                    ?.error,
                                onBack = {
                                    pendingSeriesResume = null
                                    destination = detailReturnDestination
                                },
                                onToggleFavorite = {
                                    favoriteSeriesIds = playbackPreferences.toggleFavoriteSeries(baseSeries.id)
                                },
                                onRefreshEpisodes = {
                                    val xtreamId = baseSeries.xtreamSeriesId
                                    if (!xtreamId.isNullOrBlank()) {
                                        seriesEpisodesViewModel.load(xtreamId, force = true)
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
                            playbackPreferences
                                .progressFor("episode:${seriesPlayback.series.id}:${episode.id}")
                                ?.positionMs
                                ?: 0L
                        },
                        onEpisodeChanged = { season, episode ->
                            activeSeriesPlayback = seriesPlayback.copy(
                                seasonNumber = season.number,
                                episodeId = episode.id,
                            )
                            selectedTitle = "${seriesPlayback.series.name} • T${season.number} E${episode.number}"
                            selectedContentKey = "episode:${seriesPlayback.series.id}:${episode.id}"
                            selectedInitialPositionMs = 0L
                        },
                        onProgress = { _, episode, positionMs, durationMs ->
                            val contentKey = "episode:${seriesPlayback.series.id}:${episode.id}"
                            playbackPreferences.saveProgress(contentKey, positionMs, durationMs)
                            savedProgress = playbackPreferences.startedProgress()
                        },
                        onBack = {
                            destination = playerReturnDestination
                            activeSeriesPlayback = null
                        },
                    )
                } else {
                    val relatedChannels = selectedChannelGroup
                        ?.let { group ->
                            catalogState.channels.filter { it.groupTitle.equals(group, ignoreCase = true) }
                        }
                        .orEmpty()
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
                                savedProgress = playbackPreferences.startedProgress()
                            }
                        },
                        onSelectChannel = ::selectChannelInsidePlayer,
                        onBack = { destination = playerReturnDestination },
                    )
                }
            }
        }
    }
}
