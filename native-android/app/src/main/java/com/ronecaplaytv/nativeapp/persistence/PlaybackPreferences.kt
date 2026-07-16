package com.ronecaplaytv.nativeapp.persistence

import android.content.Context

/**
 * Small local persistence layer for favorites and playback progress.
 * No playlist credentials or stream URLs are stored here.
 */
class PlaybackPreferences(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    fun favoriteChannels(): Set<String> = readSet(KEY_FAVORITE_CHANNELS)
    fun favoriteMovies(): Set<String> = readSet(KEY_FAVORITE_MOVIES)
    fun favoriteSeries(): Set<String> = readSet(KEY_FAVORITE_SERIES)

    fun toggleFavoriteChannel(id: String): Set<String> = toggleSet(KEY_FAVORITE_CHANNELS, id)
    fun toggleFavoriteMovie(id: String): Set<String> = toggleSet(KEY_FAVORITE_MOVIES, id)
    fun toggleFavoriteSeries(id: String): Set<String> = toggleSet(KEY_FAVORITE_SERIES, id)

    fun progressFor(contentKey: String): SavedProgress? {
        val record = preferences.getString(progressKey(contentKey), null) ?: return null
        val parts = record.split('|')
        if (parts.size != 3) return null

        val positionMs = parts[0].toLongOrNull() ?: return null
        val durationMs = parts[1].toLongOrNull() ?: return null
        val updatedAt = parts[2].toLongOrNull() ?: return null
        if (positionMs <= 0L || durationMs <= 0L) return null

        return SavedProgress(
            contentKey = contentKey,
            positionMs = positionMs,
            durationMs = durationMs,
            updatedAt = updatedAt,
        )
    }

    fun saveProgress(contentKey: String, positionMs: Long, durationMs: Long) {
        if (contentKey.isBlank() || positionMs < MIN_PROGRESS_MS || durationMs <= 0L) return

        val safePosition = positionMs.coerceAtMost(durationMs)
        val remainingMs = durationMs - safePosition
        if (remainingMs <= COMPLETION_THRESHOLD_MS) {
            clearProgress(contentKey)
            return
        }

        val now = System.currentTimeMillis()
        preferences.edit()
            .putString(progressKey(contentKey), "$safePosition|$durationMs|$now")
            .putStringSet(KEY_STARTED_CONTENT, startedContentKeys() + contentKey)
            .apply()
    }

    fun clearProgress(contentKey: String) {
        preferences.edit()
            .remove(progressKey(contentKey))
            .putStringSet(KEY_STARTED_CONTENT, startedContentKeys() - contentKey)
            .apply()
    }

    fun startedProgress(): List<SavedProgress> = startedContentKeys()
        .mapNotNull(::progressFor)
        .sortedByDescending(SavedProgress::updatedAt)

    private fun startedContentKeys(): Set<String> = readSet(KEY_STARTED_CONTENT)

    private fun readSet(key: String): Set<String> =
        preferences.getStringSet(key, emptySet()).orEmpty().toSet()

    private fun toggleSet(key: String, id: String): Set<String> {
        if (id.isBlank()) return readSet(key)
        val current = readSet(key).toMutableSet()
        if (!current.add(id)) current.remove(id)
        preferences.edit().putStringSet(key, current).apply()
        return current.toSet()
    }

    private fun progressKey(contentKey: String) = "progress_${contentKey.hashCode()}_${contentKey.length}"

    private companion object {
        const val PREFERENCES_NAME = "roneca_native_playback"
        const val KEY_FAVORITE_CHANNELS = "favorite_channels"
        const val KEY_FAVORITE_MOVIES = "favorite_movies"
        const val KEY_FAVORITE_SERIES = "favorite_series"
        const val KEY_STARTED_CONTENT = "started_content"
        const val MIN_PROGRESS_MS = 8_000L
        const val COMPLETION_THRESHOLD_MS = 45_000L
    }
}

data class SavedProgress(
    val contentKey: String,
    val positionMs: Long,
    val durationMs: Long,
    val updatedAt: Long,
) {
    val fraction: Float
        get() = if (durationMs <= 0L) 0f else (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
}
