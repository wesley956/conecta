package com.ronecaplaytv.nativeapp.ui.series

import com.ronecaplaytv.nativeapp.catalog.ContentIdentity
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.persistence.SavedProgress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class SeriesProgressResolverTest {
    private val episodeOne = NativeEpisode("ep-1", 1, "Piloto", "42 min", "url-1", listOf("url-1"))
    private val episodeTwo = NativeEpisode("ep-2", 2, "Retorno", "44 min", "url-2", listOf("url-2"))
    private val seasonOne = NativeSeason(1, listOf(episodeOne))
    private val seasonTwo = NativeSeason(2, listOf(episodeTwo))
    private val series = NativeSeries(
        id = "provider-series-id",
        name = "Minha Série",
        coverUrl = null,
        category = "Drama",
        synopsis = null,
        seasons = listOf(seasonOne, seasonTwo),
    )

    @Test
    fun latestStableProgressSelectsItsSeasonAndEpisode() {
        val progress = listOf(
            SavedProgress(ContentIdentity.episode(series, seasonOne, episodeOne), 60_000L, 2_400_000L, 10L),
            SavedProgress(ContentIdentity.episode(series, seasonTwo, episodeTwo), 120_000L, 2_600_000L, 20L),
        )

        val target = resolveSeriesResumeTarget(series, progress)

        assertNotNull(target)
        assertEquals(2, target?.season?.number)
        assertEquals(2, target?.episode?.number)
        assertEquals(120_000L, target?.progress?.positionMs)
    }

    @Test
    fun legacyProviderProgressStillFindsTheEpisode() {
        val saved = SavedProgress(
            contentKey = "episode:${series.id}:${episodeTwo.id}",
            positionMs = 90_000L,
            durationMs = 2_600_000L,
            updatedAt = 30L,
        )

        val target = resolveSeriesResumeTarget(series, listOf(saved))

        assertEquals(2, target?.season?.number)
        assertEquals(episodeTwo.id, target?.episode?.id)
    }

    @Test
    fun playbackPositionUsesTvFriendlyClock() {
        assertEquals("18:42", formatPlaybackPosition(1_122_000L))
        assertEquals("1:02:03", formatPlaybackPosition(3_723_000L))
    }
}
