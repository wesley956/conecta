package com.ronecaplaytv.nativeapp.platform

import android.app.UiModeManager
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration

object DeviceFormFactor {
    fun isTelevision(context: Context): Boolean {
        val uiModeManager = context.getSystemService(UiModeManager::class.java)
        val isTvUiMode = uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
        val hasLeanback = context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)

        return isTvUiMode || hasLeanback
    }

    fun isLowRam(context: Context): Boolean =
        context.getSystemService(ActivityManager::class.java)?.isLowRamDevice == true
}
