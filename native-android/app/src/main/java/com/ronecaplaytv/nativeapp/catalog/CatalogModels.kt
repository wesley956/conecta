package com.ronecaplaytv.nativeapp.catalog

data class NativeChannel(
    val id: String,
    val name: String,
    val groupTitle: String,
    val logoUrl: String?,
    val primaryUrl: String,
    val playbackUrls: List<String>,
)

data class NativeMovie(
    val id: String,
    val name: String,
    val year: Int?,
    val duration: String?,
    val synopsis: String?,
    val coverUrl: String?,
    val category: String,
    val primaryUrl: String,
    val playbackUrls: List<String>,
)

data class NativeEpisode(
    val id: String,
    val number: Int,
    val name: String,
    val duration: String?,
    val primaryUrl: String,
    val playbackUrls: List<String>,
)

data class NativeSeason(
    val number: Int,
    val episodes: List<NativeEpisode>,
)

data class NativeSeries(
    val id: String,
    val name: String,
    val coverUrl: String?,
    val category: String,
    val synopsis: String?,
    val seasons: List<NativeSeason>,
    val xtreamSeriesId: String? = null,
)

data class NativeCatalogState(
    val channels: List<NativeChannel> = emptyList(),
    val movies: List<NativeMovie> = emptyList(),
    val series: List<NativeSeries> = emptyList(),
    val loadingSection: String? = null,
    val loaded: Boolean = false,
    val error: String? = null,
    val activePlaylistId: String? = null,
    val activePlaylistName: String? = null,
    val usingBackupPlaylist: Boolean = false,
    val failoverNotice: String? = null,
    val lastFailureReason: String? = null,
    val lastFailoverAtMillis: Long? = null,
    val lastFailoverAttemptId: String? = null,
    val lastFailoverOutcome: String? = null,
    val restoredFromSnapshot: Boolean = false,
    val snapshotSavedAtMillis: Long? = null,
    val snapshotAgeMillis: Long? = null,
    val snapshotReadMillis: Long? = null,
    val snapshotSizeBytes: Long? = null,
    val snapshotStale: Boolean = false,
    val loadGeneration: Long = 0L,
) {
    val isLoading: Boolean
        get() = loadingSection != null
}

data class NativeCatalogFailoverResult(
    val attemptId: String,
    val reason: String,
    val fromPlaylistId: String,
    val toPlaylistId: String,
    val state: NativeCatalogState,
)
