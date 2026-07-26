package com.ronecaplaytv.nativeapp.persistence

import android.content.Context
import com.ronecaplaytv.nativeapp.ui.settings.PlayerSettingsState

/**
 * Persists only local playback preferences. No playlist credentials or stream URLs are stored.
 */
class PlayerSettingsPreferences(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    fun load(): PlayerSettingsState = PlayerSettingsState(
        decoderMode = preferences.getString(KEY_DECODER_MODE, "Hardware") ?: "Hardware",
        bufferSeconds = preferences.getInt(KEY_BUFFER_SECONDS, 5).coerceIn(2, 10),
        language = preferences.getString(KEY_LANGUAGE, "Português") ?: "Português",
        automaticReconnect = preferences.getBoolean(KEY_AUTOMATIC_RECONNECT, true),
        forceTvMode = preferences.getBoolean(KEY_FORCE_TV_MODE, false),
        launchSoundEnabled = preferences.getBoolean(KEY_LAUNCH_SOUND_ENABLED, true),
    )

    fun save(state: PlayerSettingsState) {
        preferences.edit()
            .putString(KEY_DECODER_MODE, state.decoderMode)
            .putInt(KEY_BUFFER_SECONDS, state.bufferSeconds.coerceIn(2, 10))
            .putString(KEY_LANGUAGE, state.language)
            .putBoolean(KEY_AUTOMATIC_RECONNECT, state.automaticReconnect)
            .putBoolean(KEY_FORCE_TV_MODE, state.forceTvMode)
            .putBoolean(KEY_LAUNCH_SOUND_ENABLED, state.launchSoundEnabled)
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "roneca_native_player_settings"
        const val KEY_DECODER_MODE = "decoder_mode"
        const val KEY_BUFFER_SECONDS = "buffer_seconds"
        const val KEY_LANGUAGE = "language"
        const val KEY_AUTOMATIC_RECONNECT = "automatic_reconnect"
        const val KEY_FORCE_TV_MODE = "force_tv_mode"
        const val KEY_LAUNCH_SOUND_ENABLED = "launch_sound_enabled"
    }
}
