package com.ronecaplaytv.nativeapp.catalog

import org.junit.Assert.assertEquals
import org.junit.Test

class CatalogStartupPolicyTest {
    @Test
    fun freshSnapshotSkipsNetworkAndStaleSnapshotDefersIt() {
        val fresh = state(snapshotStale = false)
        val stale = state(snapshotStale = true)

        assertEquals(CatalogStartupRefreshMode.Skip, CatalogStartupPolicy.refreshMode(fresh, force = false))
        assertEquals(CatalogStartupRefreshMode.Deferred, CatalogStartupPolicy.refreshMode(stale, force = false))
        assertEquals(CatalogStartupRefreshMode.Immediate, CatalogStartupPolicy.refreshMode(fresh, force = true))
        assertEquals(CatalogStartupRefreshMode.Immediate, CatalogStartupPolicy.refreshMode(null, force = false))
    }

    @Test
    fun progressiveRefreshNeverErasesRestoredVodFromSamePlaylist() {
        val previous = state(snapshotStale = true)
        val newChannel = channel("new-channel")

        val visible = CatalogStartupPolicy.visibleParts(
            previous = previous,
            candidateId = "playlist-1",
            progressive = true,
            channels = listOf(newChannel),
            movies = emptyList(),
            series = emptyList(),
        )

        assertEquals(listOf(newChannel), visible.channels)
        assertEquals(previous.movies, visible.movies)
        assertEquals(previous.series, visible.series)
    }

    @Test
    fun failoverToAnotherPlaylistDoesNotMixCatalogs() {
        val visible = CatalogStartupPolicy.visibleParts(
            previous = state(snapshotStale = true),
            candidateId = "playlist-2",
            progressive = true,
            channels = listOf(channel("backup")),
            movies = emptyList(),
            series = emptyList(),
        )

        assertEquals(1, visible.channels.size)
        assertEquals(emptyList<NativeMovie>(), visible.movies)
        assertEquals(emptyList<NativeSeries>(), visible.series)
    }

    private fun state(snapshotStale: Boolean) = NativeCatalogState(
        channels = listOf(channel("cached-channel")),
        movies = listOf(
            NativeMovie(
                id = "movie-1",
                name = "Filme",
                year = 2026,
                duration = null,
                synopsis = null,
                coverUrl = "https://image.example/movie.jpg",
                category = "Filmes",
                primaryUrl = "https://stream.example/movie",
                playbackUrls = listOf("https://stream.example/movie"),
            ),
        ),
        series = listOf(
            NativeSeries("series-1", "Série", "https://image.example/series.jpg", "Séries", null, emptyList()),
        ),
        loaded = true,
        activePlaylistId = "playlist-1",
        snapshotStale = snapshotStale,
    )

    private fun channel(id: String) = NativeChannel(
        id = id,
        name = id,
        groupTitle = "Geral",
        logoUrl = null,
        primaryUrl = "https://stream.example/$id",
        playbackUrls = listOf("https://stream.example/$id"),
    )
}
