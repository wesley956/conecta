package com.ronecaplaytv.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.MaterialTheme
import com.ronecaplaytv.nativeapp.activation.ActivationViewModel
import com.ronecaplaytv.nativeapp.catalog.CatalogViewModel
import com.ronecaplaytv.nativeapp.ui.activation.ActivationScreen
import com.ronecaplaytv.nativeapp.ui.catalog.CatalogListItem
import com.ronecaplaytv.nativeapp.ui.catalog.CatalogListScreen
import com.ronecaplaytv.nativeapp.ui.home.HomeScreen
import com.ronecaplaytv.nativeapp.ui.player.NativePlayerScreen

private const val DEFAULT_TEST_STREAM = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"

private enum class NativeDestination {
    Home,
    Channels,
    Movies,
    Series,
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
    var selectedStreamUrls by remember { mutableStateOf(listOf(DEFAULT_TEST_STREAM)) }
    var selectedTitle by remember { mutableStateOf("Teste de reprodução") }

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
                playbackUrls = movie.playbackUrls.ifEmpty { listOf(movie.primaryUrl) },
            )
        }
    }

    val seriesItems = remember(catalogState.series) {
        catalogState.series.map { series ->
            val episodes = series.seasons.sumOf { it.episodes.size }
            val firstEpisode = series.seasons
                .firstOrNull()
                ?.episodes
                ?.firstOrNull()

            CatalogListItem(
                id = series.id,
                title = series.name,
                subtitle = if (episodes > 0) {
                    "${series.category} • $episodes episódios"
                } else {
                    "${series.category} • detalhes ainda não sincronizados"
                },
                playbackUrls = firstEpisode?.playbackUrls.orEmpty(),
            )
        }
    }

    fun openPlayer(item: CatalogListItem) {
        if (!item.isPlayable) return
        selectedStreamUrls = item.playbackUrls
        selectedTitle = item.title
        destination = NativeDestination.Player
    }

    MaterialTheme {
        if (!sessionState.isActive) {
            ActivationScreen(
                state = sessionState,
                isTelevision = isTelevision,
                onRefresh = activationViewModel::refresh,
                onReset = activationViewModel::resetSecureActivation,
            )
            return@MaterialTheme
        }

        when (destination) {
            NativeDestination.Home -> HomeScreen(
                isTelevision = isTelevision,
                channelCount = catalogState.channels.size,
                movieCount = catalogState.movies.size,
                seriesCount = catalogState.series.size,
                loadingSection = catalogState.loadingSection,
                catalogError = catalogState.error,
                onOpenChannels = { destination = NativeDestination.Channels },
                onOpenMovies = { destination = NativeDestination.Movies },
                onOpenSeries = { destination = NativeDestination.Series },
                onOpenPlayer = {
                    selectedStreamUrls = listOf(DEFAULT_TEST_STREAM)
                    selectedTitle = "Teste de reprodução"
                    destination = NativeDestination.Player
                },
            )

            NativeDestination.Channels -> CatalogListScreen(
                title = "Canais ao vivo",
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

            NativeDestination.Player -> NativePlayerScreen(
                isTelevision = isTelevision,
                title = selectedTitle,
                streamUrls = selectedStreamUrls,
                onBack = { destination = NativeDestination.Home },
            )
        }
    }
}
