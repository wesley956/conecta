package com.ronecaplaytv.nativeapp.ui.player

import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.widget.TextView
import androidx.annotation.OptIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.DefaultTimeBar
import androidx.media3.ui.PlayerView
import com.ronecaplaytv.nativeapp.R

private const val MEDIA3_CONTROLLER_TIMEOUT_TV_MS = 5_000
private const val MEDIA3_CONTROLLER_TIMEOUT_TOUCH_MS = 3_000
private const val MEDIA3_TIME_BAR_KEY_INCREMENT_MS = 5_000L

/**
 * Ponte entre o PlayerView do Media3 e a navegação protegida do Roneca.
 *
 * O Media3 continua responsável pelo visual, pela barra arrastável, pelo
 * progresso, pelo play/pause e pelo scrubbing. Esta ponte existe somente para
 * garantir foco determinístico no controle remoto e impedir que OK/Enter seja
 * confundido com a ação de voltar.
 */
@OptIn(UnstableApi::class)
internal class RonecaMedia3Controller internal constructor(
    private val playerView: PlayerView,
) {
    fun showAndFocusPlayPause() {
        playerView.showController()
        playerView.post {
            val playPause = playerView.findViewById<View>(androidx.media3.ui.R.id.exo_play_pause)
            if (playPause?.requestFocus() != true) playerView.requestFocus()
        }
    }

    fun showAndFocusTimeBar() {
        playerView.showController()
        playerView.post {
            val timeBar = playerView.findViewById<View>(androidx.media3.ui.R.id.exo_progress)
            if (timeBar?.requestFocus() != true) showAndFocusPlayPause()
        }
    }

    fun hideController() {
        playerView.hideController()
    }

    fun dispatchKeyEvent(event: KeyEvent): Boolean = playerView.dispatchKeyEvent(event)
}

@OptIn(UnstableApi::class)
@Composable
internal fun RonecaMedia3PlayerView(
    player: Player,
    title: String,
    eyebrow: String,
    live: Boolean,
    isTelevision: Boolean,
    aspectMode: PlayerAspectMode,
    drawerLabel: String?,
    drawerVisible: Boolean,
    onBack: () -> Unit,
    onOpenDrawer: (() -> Unit)?,
    onAspectModeChange: (PlayerAspectMode) -> Unit,
    onControllerVisibilityChanged: (Boolean) -> Unit,
    onControllerReady: (RonecaMedia3Controller?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val currentOnBack by rememberUpdatedState(onBack)
    val currentOnOpenDrawer by rememberUpdatedState(onOpenDrawer)
    val currentAspectMode by rememberUpdatedState(aspectMode)
    val currentOnAspectModeChange by rememberUpdatedState(onAspectModeChange)
    val currentOnControllerVisibilityChanged by rememberUpdatedState(onControllerVisibilityChanged)
    val currentOnControllerReady by rememberUpdatedState(onControllerReady)

    AndroidView(
        modifier = modifier,
        factory = { context ->
            val playerView = LayoutInflater.from(context)
                .inflate(R.layout.roneca_media3_player, null, false) as PlayerView

            playerView.apply {
                this.player = player
                keepScreenOn = true
                useController = true
                controllerAutoShow = true
                setControllerHideOnTouch(true)
                setControllerShowTimeoutMs(
                    if (isTelevision) MEDIA3_CONTROLLER_TIMEOUT_TV_MS else MEDIA3_CONTROLLER_TIMEOUT_TOUCH_MS,
                )
                setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
                setControllerVisibilityListener(
                    PlayerView.ControllerVisibilityListener { visibility ->
                        currentOnControllerVisibilityChanged(visibility == View.VISIBLE)
                    },
                )
                findViewById<View>(R.id.roneca_media3_back)?.setOnClickListener {
                    currentOnBack()
                }
                findViewById<TextView>(R.id.roneca_media3_drawer)?.setOnClickListener {
                    currentOnOpenDrawer?.invoke()
                }
                findViewById<TextView>(R.id.roneca_media3_aspect)?.setOnClickListener {
                    currentOnAspectModeChange(currentAspectMode.next())
                }
                resizeMode = aspectMode.toMedia3ResizeMode()
                isFocusable = true
                isFocusableInTouchMode = true
            }

            configureMedia3FocusGraph(playerView)
            val controller = RonecaMedia3Controller(playerView)
            playerView.post {
                currentOnControllerReady(controller)
                controller.showAndFocusPlayPause()
            }
            playerView
        },
        update = { playerView ->
            playerView.player = player
            playerView.setControllerShowTimeoutMs(
                if (isTelevision) MEDIA3_CONTROLLER_TIMEOUT_TV_MS else MEDIA3_CONTROLLER_TIMEOUT_TOUCH_MS,
            )
            playerView.findViewById<TextView>(R.id.roneca_media3_eyebrow)?.text = eyebrow
            playerView.findViewById<TextView>(R.id.roneca_media3_title)?.text = title
            playerView.findViewById<TextView>(R.id.roneca_media3_live)?.visibility =
                if (live) View.VISIBLE else View.GONE
            playerView.resizeMode = aspectMode.toMedia3ResizeMode()
            playerView.findViewById<TextView>(R.id.roneca_media3_aspect)?.apply {
                text = "Tela • ${aspectMode.displayName}"
                contentDescription = "Aspecto da imagem: ${aspectMode.storageValue}. Pressione para alterar."
            }

            playerView.findViewById<TextView>(R.id.roneca_media3_drawer)?.apply {
                val available = !drawerLabel.isNullOrBlank() && currentOnOpenDrawer != null
                visibility = if (available) View.VISIBLE else View.GONE
                text = drawerLabel?.let { "☰  $it" }.orEmpty()
            }

            if (drawerVisible) playerView.hideController()
        },
    )

    DisposableEffect(Unit) {
        onDispose { currentOnControllerReady(null) }
    }
}

@OptIn(UnstableApi::class)
private fun configureMedia3FocusGraph(playerView: PlayerView) {
    playerView.post {
        val playPause = playerView.findViewById<View>(androidx.media3.ui.R.id.exo_play_pause)
        val timeBar = playerView.findViewById<DefaultTimeBar>(androidx.media3.ui.R.id.exo_progress)
        val back = playerView.findViewById<View>(R.id.roneca_media3_back)
        val drawer = playerView.findViewById<View>(R.id.roneca_media3_drawer)
        val aspect = playerView.findViewById<View>(R.id.roneca_media3_aspect)

        timeBar?.apply {
            isFocusable = true
            isFocusableInTouchMode = true
            setKeyTimeIncrement(MEDIA3_TIME_BAR_KEY_INCREMENT_MS)
            nextFocusUpId = androidx.media3.ui.R.id.exo_play_pause
        }

        playPause?.apply {
            nextFocusDownId = androidx.media3.ui.R.id.exo_progress
            nextFocusUpId = R.id.roneca_media3_back
        }
        back?.nextFocusDownId = androidx.media3.ui.R.id.exo_play_pause
        drawer?.nextFocusDownId = androidx.media3.ui.R.id.exo_play_pause
        aspect?.nextFocusDownId = androidx.media3.ui.R.id.exo_play_pause
    }
}

@OptIn(UnstableApi::class)
private fun PlayerAspectMode.toMedia3ResizeMode(): Int = when (this) {
    PlayerAspectMode.Original -> AspectRatioFrameLayout.RESIZE_MODE_FIT
    PlayerAspectMode.Fill -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
    PlayerAspectMode.Stretch -> AspectRatioFrameLayout.RESIZE_MODE_FILL
    PlayerAspectMode.FixedWidth -> AspectRatioFrameLayout.RESIZE_MODE_FIXED_WIDTH
    PlayerAspectMode.FixedHeight -> AspectRatioFrameLayout.RESIZE_MODE_FIXED_HEIGHT
}
