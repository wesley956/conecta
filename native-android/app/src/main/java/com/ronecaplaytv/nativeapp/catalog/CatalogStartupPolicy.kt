package com.ronecaplaytv.nativeapp.catalog

internal enum class CatalogStartupRefreshMode {
    Immediate,
    Deferred,
    Skip,
}

internal data class CatalogVisibleParts(
    val channels: List<NativeChannel>,
    val movies: List<NativeMovie>,
    val series: List<NativeSeries>,
)

internal object CatalogStartupPolicy {
    const val DEFERRED_REFRESH_MILLIS = 9_000L

    fun refreshMode(restored: NativeCatalogState?, force: Boolean): CatalogStartupRefreshMode = when {
        force -> CatalogStartupRefreshMode.Immediate
        restored == null -> CatalogStartupRefreshMode.Immediate
        restored.snapshotStale -> CatalogStartupRefreshMode.Deferred
        else -> CatalogStartupRefreshMode.Skip
    }

    /**
     * A via rápida Xtream publica canais antes de VOD. Em uma atualização da
     * mesma lista, as seções ainda não hidratadas devem permanecer visíveis.
     */
    fun visibleParts(
        previous: NativeCatalogState?,
        candidateId: String,
        progressive: Boolean,
        channels: List<NativeChannel>,
        movies: List<NativeMovie>,
        series: List<NativeSeries>,
    ): CatalogVisibleParts {
        val canReuse = progressive && previous?.loaded == true &&
            previous.activePlaylistId == candidateId
        if (!canReuse) return CatalogVisibleParts(channels, movies, series)

        return CatalogVisibleParts(
            channels = channels.ifEmpty { previous.channels },
            movies = movies.ifEmpty { previous.movies },
            series = series.ifEmpty { previous.series },
        )
    }
}
