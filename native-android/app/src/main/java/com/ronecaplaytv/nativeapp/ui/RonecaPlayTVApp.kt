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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ronecaplaytv.nativeapp.activation.ActivationViewModel
import com.ronecaplaytv.nativeapp.catalog.CatalogViewModel
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
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
    val configuration = LocalConfiguration.current
    val isWideLayout = isTelevision || configuration.screenWidthDp > configuration.screenHeightDp
    val sessionState by activationViewModel.state.collectAsStateWithLifecycle()
    val catalogState by catalogViewModel.state.collectAsStateWithLifecycle()
    var destination by remember { mutableStateOf(NativeDestination.Home) }
    var playerReturnDestination by remember { mutableStateOf(NativeDestination.Home) }
    var selectedStreamUrls by remember { mutableStateOf(emptyList<String>()) }
    var selectedTitle by remember { mutableStateOf("") }
    var selectedMovie by remember { mutableStateOf<NativeMovie?>(null) }
    var selectedSeries by remember { mutableStateOf<NativeSeries?>(null) }
    var settingsState by remember { mutableStateOf(PlayerSettingsState()) }

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

    fun openPlayer(title: String, playbackUrls: List<String>) {
        val validUrls = playbackUrls.map(String::trim).filter(String::isNotBlank).distinct()
        if (validUrls.isEmpty()) return
        playerReturnDestination = destination
        selectedStreamUrls = validUrls
        selectedTitle = title
        destination = NativeDestination.Player
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
                isTelevision = isTelevision,
                onRefresh = activationViewModel::refresh,
                onReset = activationViewModel::resetSecureActivation,
            )
            return@RonecaPlayTVTheme
        }

        if (destination == NativeDestination.Player) {
            NativePlayerScreen(
                isTelevision = isTelevision,
                title = selectedTitle,
                streamUrls = selectedStreamUrls,
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
                    isTelevision = isTelevision,
                    onBack = { destination = NativeDestination.Home },
                    onPlayChannel = { channel ->
                        openPlayer(
                            channel.name,
                            channel.playbackUrls.ifEmpty { listOf(channel.primaryUrl) },
                        )
                    },
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
                    isTelevision = isTelevision,
                    onPlay = { channel ->
                        openPlayer(
                            channel.name,
                            channel.playbackUrls.ifEmpty { listOf(channel.primaryUrl) },
                        )
                    },
                )

                NativeDestination.Movies -> MoviesScreen(
                    movies = catalogState.movies,
                    isTelevision = isTelevision,
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
                        MovieDetailScreen(
                            movie = movie,
                            isTelevision = isTelevision,
                            onBack = { destination = NativeDestination.Movies },
                            onPlay = { selected ->
                                openPlayer(
                                    selected.name,
                                    selected.playbackUrls.ifEmpty { listOf(selected.primaryUrl) },
                                )
                            },
                        )
                    }
                }

                NativeDestination.Series -> SeriesScreen(
                    series = catalogState.series,
                    isTelevision = isTelevision,
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
                        SeriesDetailScreen(
                            series = series,
                            isTelevision = isTelevision,
                            onBack = { destination = NativeDestination.Series },
                            onPlayEpisode = { episode, displayTitle ->
                                openPlayer(
                                    displayTitle,
                                    episode.playbackUrls.ifEmpty { listOf(episode.primaryUrl) },
                                )
                            },
                        )
                    }
                }

                NativeDestination.Playback -> PlaybackScreen(
                    isTelevision = isTelevision,
                    onBack = { destination = NativeDestination.Home },
                )

                NativeDestination.Settings -> SettingsScreen(
                    isTelevision = isTelevision,
                    state = settingsState,
                    onStateChange = { settingsState = it },
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
