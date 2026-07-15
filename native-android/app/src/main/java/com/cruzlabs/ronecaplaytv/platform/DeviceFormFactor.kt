package com.cruzlabs.ronecaplaytv.platform

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.content.pm.PackageManager

enum class DeviceFormFactor {
    MOBILE,
    TV,
}

fun Context.deviceFormFactor(): DeviceFormFactor {
    val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
    val isTelevision =
        uiModeManager.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)

    return if (isTelevision) DeviceFormFactor.TV else DeviceFormFactor.MOBILE
}
