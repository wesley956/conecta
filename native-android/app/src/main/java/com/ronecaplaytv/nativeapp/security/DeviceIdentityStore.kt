package com.ronecaplaytv.nativeapp.security

import android.content.Context
import java.util.UUID

class DeviceIdentityStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    @Synchronized
    fun getOrCreateDeviceUuid(): String {
        val existing = preferences.getString(KEY_DEVICE_UUID, null)?.trim()
        if (!existing.isNullOrEmpty()) return existing

        val created = UUID.randomUUID().toString()
        preferences.edit().putString(KEY_DEVICE_UUID, created).apply()
        return created
    }

    fun getDeviceCode(): String? =
        preferences.getString(KEY_DEVICE_CODE, null)?.trim()?.takeIf { it.isNotEmpty() }

    fun saveDeviceCode(deviceCode: String) {
        preferences.edit().putString(KEY_DEVICE_CODE, deviceCode.trim()).apply()
    }

    fun clearDeviceCode() {
        preferences.edit().remove(KEY_DEVICE_CODE).apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "roneca_device_identity"
        const val KEY_DEVICE_UUID = "device_uuid"
        const val KEY_DEVICE_CODE = "device_code"
    }
}
