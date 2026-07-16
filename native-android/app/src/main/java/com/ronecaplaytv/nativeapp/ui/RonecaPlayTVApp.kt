package com.ronecaplaytv.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ronecaplaytv.nativeapp.activation.ActivationViewModel
import com.ronecaplaytv.nativeapp.catalog.CatalogViewModel
import com.ronecaplaytv.nativeapp.ui.activation.ActivationScreen
import com.ronecaplaytv.nativeapp.ui.catalog.CatalogListItem
import com.ronecaplaytv.nativeapp.ui.catalog.CatalogListScreen
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.home.HomeScreen
import com.ronecaplaytv.nativeapp.ui.navigation.MainNavigationBar
import com.ronecaplaytv.nativeapp.ui.navigation.MainTab
import com.ronecaplaytv.nativeapp.ui.playback.PlaybackScreen
import com.ronecaplaytv.nativeapp.ui.player.NativePlayerScreen
import com.ronecaplaytv.nativeapp.ui.settings.PlayerSettingsState
import com.ronecaplaytv.nativeapp.ui.settings.SettingsScreen
import com.ronecaplaytv.nativeapp.ui.theme.RonecaPlayTVTheme

private enum class NativeDestination {
    Home,
    Channels,
    Movies,
    Series,
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
    val sessionState by activationViewModel.state.collectAsStateWithLifecycle()
    val catalogState by catalogViewModel.state.collectAsStateWithLifecycle()
    var destination by remember { mutableStateOf(NativeDestination.Home) }
    var playerReturnDestination by remember { mutableStateOf(NativeDestination.Home) }
    var selectedStreamUrls by remember { mutableStateOf(emptyList<String>()) }
    var selectedTitle by remember { mutableStateOf("") }
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

    val channelItems = remember(catalogState.channels) {
        catalogState.channels.map { channel ->
            CatalogListItem(
                id = channel.id,
                title = channel.name,
                subtitle = channel.groupTitle,
                imageUrl = channel.logoUrl,
                playbackUrls = channel.playbackUrls.ifEmpty { listOf(channel.primaryUrl) },
            )
        }
    }

    val movieItems = remember(catalogState.movies) {
        catalogState.movies.map { movie ->
            CatalogListItem(
                id = movie.id,
                title = movie.name,
                subtitle = listOfNotNull(
                    movie.category,
                    movie.year?.toString(),
                    movie.duration,
                ).joinToString(" • "),
                imageUrl = movie.coverUrl,
                playbackUrls = movie.playbackUrls.ifEmpty { listOf(movie.primaryUrl) },
            )
        }
    }

    val seriesItems = remember(catalogState.series) {
        catalogState.series.map { series ->
            val episodes = series.seasons.sumOf { it.episodes.size }
            val firstEpisode = series.seasons.firstOrNull()?.episodes?.firstOrNull()

            CatalogListItem(
                id = series.id,
                title = series.name,
                subtitle = if (episodes > 0) {
                    "${series.category} • $episodes episódios"
                } else {
                    "${series.category} • detalhes indisponíveis"
                },
                imageUrl = series.coverUrl,
                playbackUrls = firstEpisode?.playbackUrls.orEmpty(),
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

    fun openPlayer(item: CatalogListItem) = openPlayer(item.title, item.playbackUrls)

    fun selectMainTab(tab: MainTab) {
        destination = when (tab) {
            MainTab.Home -> NativeDestination.Home
            MainTab.Channels -> NativeDestination.Channels
            MainTab.Movies -> NativeDestination.Movies
            MainTab.Series -> NativeDestination.Series
            MainTab.Settings -> NativeDestination.Settings
        }
    }

    val selectedTab = when (destination) {
        NativeDestination.Channels -> MainTab.Channels
        NativeDestination.Movies -> MainTab.Movies
        NativeDestination.Series -> MainTab.Series
        NativeDestination.Settings -> MainTab.Settings
        else -> MainTab.Home
    }

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

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(RonecaColors.Background),
        ) {
            Box(modifier = Modifier.weight(1f)) {
                when (destination) {
                    NativeDestination.Home -> HomeScreen(
                        isTelevision = isTelevision,
                        deviceCode = sessionState.deviceCode,
                        loadingSection = catalogState.loadingSection,
                        catalogError = catalogState.error,
                        channelCount = catalogState.channels.size,
                        movieCount = catalogState.movies.size,
                        seriesCount = catalogState.series.size,
                        onOpenChannels = { destination = NativeDestination.Channels },
                        onOpenMovies = { destination = NativeDestination.Movies },
                        onOpenSeries = { destination = NativeDestination.Series },
                        onOpenPlayback = { destination = NativeDestination.Playback },
                    )

                    NativeDestination.Channels -> CatalogListScreen(
                        title = "Canais",
                        items = channelItems,
                        isTelevision = isTelevision,
                        onBack = { destination = NativeDestination.Home },
                        onPlay = ::openPlayer,
                    )

                    NativeDestination.Movies -> CatalogListScreen(
                        title = "Filmes",
                        items = movieItems,
                        isTelevision = isTelevision,
                        onBack = { destination = NativeDestination.Home },
                        onPlay = ::openPlayer,
                    )

                    NativeDestination.Series -> CatalogListScreen(
                        title = "Séries",
                        items = seriesItems,
                        isTelevision = isTelevision,
                        onBack = { destination = NativeDestination.Home },
                        onPlay = ::openPlayer,
                    )

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

            MainNavigationBar(
                selectedTab = selectedTab,
                isTelevision = isTelevision,
                onSelect = ::selectMainTab,
            )
        }
    }
}
