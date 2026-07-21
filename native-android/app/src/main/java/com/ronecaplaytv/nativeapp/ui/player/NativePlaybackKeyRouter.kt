package com.ronecaplaytv.nativeapp.ui.player

import android.view.KeyEvent
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
        return Registration(id)
    }

    fun unregister(registration: Registration) {
        while (true) {
            val current = activeHandler.get() ?: return
            if (current.id != registration.id) return
            if (activeHandler.compareAndSet(current, null)) return
        }
    }

    fun dispatch(event: KeyEvent): Boolean = activeHandler.get()?.callback?.invoke(event) ?: false
}
