package com.ronecaplaytv.nativeapp.diagnostics

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Debug
import android.util.Log
import android.view.Choreographer
import androidx.media3.common.PlaybackException
import com.ronecaplaytv.nativeapp.BuildConfig
import com.ronecaplaytv.nativeapp.network.PlaybackDiagnosticsApi
import com.ronecaplaytv.nativeapp.security.DeviceIdentityStore
import com.ronecaplaytv.nativeapp.security.SecureCredentialStore
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

object NativeDiagnostics {
    private const val TAG = "RonecaDiagnostics"
    private val uploadScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var applicationContext: Context? = null

    fun initialize(context: Context) {
        applicationContext = context.applicationContext
    }

    fun record(event: String, fields: Map<String, Any?> = emptyMap()) {
        val safeEvent = event.lowercase(Locale.ROOT)
            .replace(Regex("[^a-z0-9_.-]"), "_")
            .take(64)
        if (safeEvent.isBlank()) return
        val safe = sanitizeFields(fields)
        Log.d(TAG, buildString {
            append("event=")
            append(safeEvent)
            safe.forEach { (key, value) -> append(' ').append(key).append('=').append(value) }
        })
    }

    fun recordPlaybackFailure(error: PlaybackException, failureKind: String) {
        val causeChain = generateSequence(error.cause) { it.cause }
            .take(8)
            .map { it::class.java.simpleName }
            .filter(String::isNotBlank)
            .joinToString(">")
            .take(260)
        val safeMessage = sanitizeDiagnosticMessage(error.message)
        record(
            "playback.raw_error",
            mapOf(
                "error_code" to error.errorCode,
                "error_name" to error.errorCodeName,
                "failure_kind" to failureKind,
                "cause_chain" to causeChain,
                "message" to safeMessage,
            ),
        )

        val context = applicationContext ?: return
        uploadScope.launch {
            runCatching {
                val identityStore = DeviceIdentityStore(context)
                val deviceCode = identityStore.getDeviceCode() ?: return@runCatching
                val credential = SecureCredentialStore(context).load() ?: return@runCatching
                val diagnosticMessage = buildString {
                    append("Media3 ")
                    append(error.errorCodeName)
                    if (causeChain.isNotBlank()) append("; causes=").append(causeChain)
                    if (safeMessage.isNotBlank()) append("; message=").append(safeMessage)
                }.take(800)
                PlaybackDiagnosticsApi(BuildConfig.SUPABASE_FUNCTIONS_URL).report(
                    deviceCode = deviceCode,
                    deviceUuid = identityStore.getOrCreateDeviceUuid(),
                    deviceCredential = credential,
                    appVersion = BuildConfig.VERSION_NAME,
                    errorCode = error.errorCodeName,
                    errorMessage = diagnosticMessage,
                    probableSource = if (error.errorCode == PlaybackException.ERROR_CODE_FAILED_RUNTIME_CHECK) "app" else "unknown",
                )
            }.onFailure { uploadError ->
                Log.w(TAG, "Falha ao enviar diagnóstico bruto do player", uploadError)
            }
        }
    }

    fun recordMemory(context: Context, event: String) {
        val runtime = Runtime.getRuntime()
        record(
            event,
            mapOf(
                "heap_used_bytes" to runtime.totalMemory() - runtime.freeMemory(),
                "heap_max_bytes" to runtime.maxMemory(),
                "pss_kb" to Debug.getPss(),
                "low_ram" to (context.getSystemService(ActivityManager::class.java)?.isLowRamDevice == true),
            ),
        )
    }

    fun recordPreviousExit(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val manager = context.getSystemService(ActivityManager::class.java) ?: return
        val exit = manager.getHistoricalProcessExitReasons(context.packageName, 0, 1).firstOrNull()
            ?: return
        record(
            "process.previous_exit",
            mapOf(
                "reason" to exit.reason,
                "status" to exit.status,
                "importance" to exit.importance,
                "pss_kb" to exit.pss,
                "rss_kb" to exit.rss,
            ),
        )
    }
}

internal fun sanitizeFields(fields: Map<String, Any?>): Map<String, String> = buildMap {
    fields.forEach { (rawKey, rawValue) ->
        val key = rawKey.lowercase(Locale.ROOT)
        if (!key.matches(Regex("^[a-z][a-z0-9_]{0,47}$"))) return@forEach
        if (SENSITIVE_FIELD_PARTS.any(key::contains)) return@forEach
        val value = when (rawValue) {
            null -> return@forEach
            is Boolean, is Byte, is Short, is Int, is Long, is Float, is Double -> rawValue.toString()
            is String -> rawValue.trim().take(120)
            else -> return@forEach
        }
        if (value.isBlank() || SENSITIVE_VALUE.containsMatchIn(value)) return@forEach
        put(key, value.replace(Regex("\\s+"), "_"))
    }
}

private fun sanitizeDiagnosticMessage(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return value
        .replace(Regex("(?i)https?://\\S+"), "<url>")
        .replace(Regex("(?i)(bearer|token|password|username|authorization)[=: ]+\\S+"), "$1=<redacted>")
        .replace(Regex("\\s+"), " ")
        .trim()
        .take(360)
}

class FrameJankMonitor : Choreographer.FrameCallback {
    private var running = false
    private var previousFrameNanos = 0L
    private var slowFrames = 0

    fun start() {
        if (running) return
        running = true
        previousFrameNanos = 0L
        slowFrames = 0
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop() {
        if (!running) return
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
        NativeDiagnostics.record("ui.jank_session", mapOf("slow_frames" to slowFrames))
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        if (previousFrameNanos > 0L && frameTimeNanos - previousFrameNanos >= SLOW_FRAME_NANOS) {
            slowFrames += 1
        }
        previousFrameNanos = frameTimeNanos
        Choreographer.getInstance().postFrameCallback(this)
    }
}

private val SENSITIVE_FIELD_PARTS = listOf(
    "url", "uri", "host", "user", "password", "credential", "token", "authorization", "cookie", "playlist",
)
private val SENSITIVE_VALUE = Regex(
    "(?i)(https?://|device\\s+[a-z0-9._-]+|bearer\\s+[a-z0-9._-]+|password=|username=|token=)",
)
private const val SLOW_FRAME_NANOS = 50_000_000L
