package com.ronecaplaytv.nativeapp.ui.player

import android.view.KeyEvent
import com.ronecaplaytv.nativeapp.diagnostics.NativeDiagnostics
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * Centraliza somente as teclas físicas de mídia que podem chegar à Activity
 * mesmo quando o foco está em um elemento Compose diferente do vídeo.
 *
 * As setas e o botão central continuam no controlador Compose do player para
 * preservar a navegação de foco dos botões e dos painéis laterais.
 */
object NativePlaybackKeyRouter {
    data class Registration internal constructor(internal val id: Long)

    private data class ActiveHandler(
        val id: Long,
        val callback: (KeyEvent) -> Boolean,
    )

    private val nextId = AtomicLong(0L)
    private val activeHandler = AtomicReference<ActiveHandler?>(null)

    fun register(callback: (KeyEvent) -> Boolean): Registration {
        val id = nextId.incrementAndGet()
        activeHandler.set(ActiveHandler(id = id, callback = callback))
        NativeDiagnostics.record("playback.key_router_registered", mapOf("registration_id" to id))
        return Registration(id)
    }

    fun unregister(registration: Registration) {
        while (true) {
            val current = activeHandler.get() ?: return
            if (current.id != registration.id) return
            if (activeHandler.compareAndSet(current, null)) {
                NativeDiagnostics.record(
                    "playback.key_router_unregistered",
                    mapOf("registration_id" to registration.id),
                )
                return
            }
        }
    }

    fun dispatch(event: KeyEvent): Boolean {
        val handler = activeHandler.get() ?: return false
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            NativeDiagnostics.record(
                "playback.back_key",
                mapOf(
                    "action" to event.action,
                    "repeat_count" to event.repeatCount,
                    "registration_id" to handler.id,
                ),
            )
        }
        val consumed = handler.callback.invoke(event)
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            NativeDiagnostics.record(
                "playback.back_key_result",
                mapOf(
                    "consumed" to consumed,
                    "registration_id" to handler.id,
                ),
            )
        }
        return consumed
    }
}
