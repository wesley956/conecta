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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ronecaplaytv.nativeapp.activation.ActivationViewModel
import com.ronecaplaytv.nativeapp.catalog.CatalogViewModel
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.persistence.PlaybackPreferences
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
import com.ronecaplaytv.nativeapp.ui.search.SearchScreen
import com.ronecaplaytv.nativeapp.ui.series.SeriesDetailScreen
import com.ronecaplaytv.nativeapp.ui.series.SeriesScreen
import com.ronecaplaytv.nativeapp.ui.settings.PlayerSettingsState
import com.ronecaplaytv.nativeapp.ui.settings.SettingsScreen
import com.ronecaplaytv.nativeapp.ui.theme.RonecaPlayTVTheme

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

@Composable
fun RonecaPlayTVApp(
    isTelevision: Boolean,
    activationViewModel: ActivationViewModel = viewModel(),
    catalogViewModel: CatalogViewModel = viewModel(),
) {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val isWideLayout = isTelevision || configuration.screenWidthDp > configuration.screenHeightDp
    val sessionState by activationViewModel.state.collectAsStateWithLifecycle()
    val catalogState by catalogViewModel.state.collectAsStateWithLifecycle()
    val playbackPreferences = remember { PlaybackPreferences(context) }

    var destination by remember { mutableStateOf(NativeDestination.Home) }
    var playerReturnDestination by remember { mutableStateOf(NativeDestination.Home) }
    var selectedStreamUrls by remember { mutableStateOf(emptyList<String>()) }
    var selectedTitle by remember { mutableStateOf("") }
    var selectedContentKey by remember { mutableStateOf("") }
    var selectedInitialPositionMs by remember { mutableStateOf(0L) }
    var selectedChannelGroup by remember { mutableStateOf<String?>(null) }
    var selectedMovie by remember { mutableStateOf<NativeMovie?>(null) }
    var selectedSeries by remember { mutableStateOf<NativeSeries?>(null) }
    var settingsState by remember { mutableStateOf(PlayerSettingsState()) }
    var favoriteChannelIds by remember { mutableStateOf(playbackPreferences.favoriteChannels()) }
    var favoriteMovieIds by remember { mutableStateOf(playbackPreferences.favoriteMovies()) }
    var favoriteSeriesIds by remember { mutableStateOf(playbackPreferences.favoriteSeries()) }
    var savedProgress by remember { mutableStateOf(playbackPreferences.startedProgress()) }

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

    fun refreshCatalog() {
        activationViewModel.refresh()
        catalogViewModel.load(
            channelsUrl = sessionState.channelsUrl,
            moviesUrl = sessionState.moviesUrl,
            seriesUrl = sessionState.seriesUrl,
        )
    }

    fun openPlayer(
        title: String,
        playbackUrls: List<String>,
        contentKey: String,
        channelGroup: String? = null,
    ) {
        val validUrls = playbackUrls.map(String::trim).filter(String::isNotBlank).distinct()
        if (validUrls.isEmpty()) return
        playerReturnDestination = destination
        selectedStreamUrls = validUrls
        selectedTitle = title
        selectedContentKey = contentKey
        selectedInitialPositionMs = playbackPreferences.progressFor(contentKey)?.positionMs ?: 0L
        selectedChannelGroup = channelGroup
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

    val selectedTab = when (destination) {
        NativeDestination.Channels -> MainTab.Channels
        NativeDestination.Movies, NativeDestination.MovieDetail -> MainTab.Movies
        NativeDestination.Series, NativeDestination.SeriesDetail -> MainTab.Series
        NativeDestination.Playback -> MainTab.Playback
        NativeDestination.Settings -> MainTab.Settings
        else -> MainTab.Home
    }

    val showMainNavigation = destination in setOf(
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

        if (destination == NativeDestination.Player) {
            val relatedChannels = selectedChannelGroup
                ?.let { group -> catalogState.channels.filter { it.groupTitle == group }.take(80) }
                .orEmpty()

            NativePlayerScreen(
                isTelevision = isTelevision,
                title = selectedTitle,
                streamUrls = selectedStreamUrls,
                initialPositionMs = selectedInitialPositionMs,
                relatedChannels = relatedChannels,
                onProgress = { positionMs, durationMs ->
                    if (selectedContentKey.startsWith("movie:") || selectedContentKey.startsWith("episode:")) {
                        playbackPreferences.saveProgress(selectedContentKey, positionMs, durationMs)
                        savedProgress = playbackPreferences.startedProgress()
                    }
                },
                onSelectChannel = ::selectChannelInsidePlayer,
                onBack = { destination = playerReturnDestination },
            )
            return@RonecaPlayTVTheme
        }

        val screenContent: @Composable () -> Unit = {
            when (destination) {
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
                    onOpenFeatured = { movie ->
                        selectedMovie = movie
                        destination = NativeDestination.MovieDetail
                    },
                )

                NativeDestination.Search -> SearchScreen(
                    channels = catalogState.channels,
                    movies = catalogState.movies,
                    series = catalogState.series,
                    isTelevision = isWideLayout,
                    onBack = { destination = NativeDestination.Home },
                    onPlayChannel = ::openChannel,
                    onOpenMovie = { movie ->
                        selectedMovie = movie
                        destination = NativeDestination.MovieDetail
                    },
                    onOpenSeries = { series ->
                        selectedSeries = series
                        destination = NativeDestination.SeriesDetail
                    },
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
                    onOpenDetails = { movie ->
                        selectedMovie = movie
                        destination = NativeDestination.MovieDetail
                    },
                )

                NativeDestination.MovieDetail -> {
                    val movie = selectedMovie
                    if (movie == null) {
                        destination = NativeDestination.Movies
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
                            onBack = { destination = NativeDestination.Movies },
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
                    onOpenDetails = { series ->
                        selectedSeries = series
                        destination = NativeDestination.SeriesDetail
                    },
                )

                NativeDestination.SeriesDetail -> {
                    val series = selectedSeries
                    if (series == null) {
                        destination = NativeDestination.Series
                    } else {
                        val recommendations = catalogState.series
                            .asSequence()
                            .filter { it.id != series.id && it.category.equals(series.category, ignoreCase = true) }
                            .take(14)
                            .toList()

                        SeriesDetailScreen(
                            series = series,
                            recommendations = recommendations,
                            isFavorite = series.id in favoriteSeriesIds,
                            isTelevision = isWideLayout,
                            onBack = { destination = NativeDestination.Series },
                            onToggleFavorite = {
                                favoriteSeriesIds = playbackPreferences.toggleFavoriteSeries(series.id)
                            },
                            onRefreshEpisodes = ::refreshCatalog,
                            onPlayEpisode = { episode, displayTitle ->
                                openPlayer(
                                    title = displayTitle,
                                    playbackUrls = episode.playbackUrls.ifEmpty { listOf(episode.primaryUrl) },
                                    contentKey = "episode:${series.id}:${episode.id}",
                                )
                            },
                            onOpenRecommendation = { recommendation ->
                                selectedSeries = recommendation
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
                    onOpenMovie = { movie ->
                        selectedMovie = movie
                        destination = NativeDestination.MovieDetail
                    },
                    onOpenSeries = { series ->
                        selectedSeries = series
                        destination = NativeDestination.SeriesDetail
                    },
                )

                NativeDestination.Settings -> SettingsScreen(
                    isTelevision = isWideLayout,
                    state = settingsState,
                    onStateChange = { settingsState = it },
                    onRefreshContent = ::refreshCatalog,
                )

                NativeDestination.Player -> Unit
            }
        }

        if (showMainNavigation && isWideLayout) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .background(RonecaColors.Background),
            ) {
                MainNavigationRail(
                    selectedTab = selectedTab,
                    isTelevision = isTelevision,
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
    }
}
