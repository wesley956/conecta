package com.ronecaplaytv.nativeapp.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.diagnostics.NativeDiagnostics
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import java.util.Locale

// Espelha PlayerSubtitles.kt (mesma paridade Android x LG/Tizen): o app tinha seletor de
// legenda mas nenhum seletor de faixa de áudio — conteúdo com múltiplos idiomas de áudio
// (dublagem + original) ficava travado na faixa que o ExoPlayer escolhesse por padrão.
internal data class AudioTrackOption(
    val id: String,
    val groupIndex: Int,
    val trackIndex: Int,
    val displayName: String,
    val language: String?,
    val isSelected: Boolean,
    val isDefault: Boolean,
)

internal data class AudioTrackDescriptor(
    val groupIndex: Int,
    val trackIndex: Int,
    val label: String?,
    val language: String?,
    val isSupported: Boolean,
    val isSelected: Boolean,
    val selectionFlags: Int,
    val channelCount: Int,
)

internal fun buildAudioOptions(
    descriptors: List<AudioTrackDescriptor>,
): List<AudioTrackOption> {
    var fallbackNumber = 0
    val usedNames = mutableMapOf<String, Int>()

    return descriptors.filter(AudioTrackDescriptor::isSupported).map { descriptor ->
        val language = descriptor.language?.trim()?.takeIf(String::isNotEmpty)
        val baseName = descriptor.label?.trim()?.takeIf(String::isNotEmpty)
            ?: language?.let(::displayAudioLanguage)
            ?: "Áudio ${++fallbackNumber}"
        val channelSuffix = when (descriptor.channelCount) {
            in Int.MIN_VALUE..0 -> null
            1 -> "mono"
            2 -> "estéreo"
            else -> "${descriptor.channelCount}.1"
        }
        val qualifiedName = channelSuffix?.let { "$baseName ($it)" } ?: baseName
        val occurrence = (usedNames[qualifiedName] ?: 0) + 1
        usedNames[qualifiedName] = occurrence
        val displayName = if (occurrence == 1) qualifiedName else "$qualifiedName $occurrence"

        AudioTrackOption(
            id = "${descriptor.groupIndex}:${descriptor.trackIndex}",
            groupIndex = descriptor.groupIndex,
            trackIndex = descriptor.trackIndex,
            displayName = displayName.take(120),
            language = language?.take(35),
            isSelected = descriptor.isSelected,
            isDefault = descriptor.selectionFlags and C.SELECTION_FLAG_DEFAULT != 0,
        )
    }
}

private fun displayAudioLanguage(language: String): String {
    val normalized = language.replace('_', '-')
    val display = Locale.forLanguageTag(normalized).getDisplayLanguage(Locale("pt", "BR")).trim()
    return display.takeIf { it.isNotEmpty() }?.replaceFirstChar { character ->
        if (character.isLowerCase()) character.titlecase(Locale("pt", "BR")) else character.toString()
    } ?: language
}

private fun audioOptionsFrom(tracks: Tracks): List<AudioTrackOption> {
    val descriptors = buildList {
        tracks.groups.forEachIndexed { groupIndex, group ->
            if (group.type != C.TRACK_TYPE_AUDIO) return@forEachIndexed
            for (trackIndex in 0 until group.length) {
                val format = group.getTrackFormat(trackIndex)
                add(
                    AudioTrackDescriptor(
                        groupIndex = groupIndex,
                        trackIndex = trackIndex,
                        label = format.label,
                        language = format.language,
                        isSupported = group.isTrackSupported(trackIndex),
                        isSelected = group.isTrackSelected(trackIndex),
                        selectionFlags = format.selectionFlags,
                        channelCount = format.channelCount,
                    ),
                )
            }
        }
    }
    return buildAudioOptions(descriptors)
}

internal class PlayerAudioController(private val player: Player) {
    var options by mutableStateOf<List<AudioTrackOption>>(emptyList())
        private set
    var panelVisible by mutableStateOf(false)
        private set

    val selectedId: String?
        get() = options.firstOrNull(AudioTrackOption::isSelected)?.id

    fun updateTracks(tracks: Tracks) {
        val updated = audioOptionsFrom(tracks)
        if (updated == options) return
        options = updated
        if (updated.size <= 1) panelVisible = false
        NativeDiagnostics.record(
            "playback.audio_tracks",
            mapOf(
                "track_count" to updated.size,
                "languages" to updated.mapNotNull(AudioTrackOption::language).distinct().take(8).joinToString(","),
            ),
        )
    }

    fun openPanel() {
        if (options.size > 1) panelVisible = true
    }

    fun closePanel() {
        panelVisible = false
    }

    fun select(optionId: String) {
        val option = options.firstOrNull { it.id == optionId } ?: return
        val group = player.currentTracks.groups.getOrNull(option.groupIndex) ?: return
        if (group.type != C.TRACK_TYPE_AUDIO || option.trackIndex !in 0 until group.length) return
        if (!group.isTrackSupported(option.trackIndex)) return

        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
            .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, option.trackIndex))
            .build()
        closePanel()
        updateTracks(player.currentTracks)
        NativeDiagnostics.record(
            "playback.audio_selection",
            mapOf(
                "language" to option.language,
                "label" to option.displayName.take(80),
            ),
        )
    }

    /** Remove qualquer override ligado ao TrackGroup da mídia anterior. */
    fun resetForContentChange() {
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
            .build()
        options = emptyList()
        panelVisible = false
    }
}

@Composable
internal fun rememberPlayerAudioController(player: Player): PlayerAudioController {
    val controller = remember(player) { PlayerAudioController(player) }
    DisposableEffect(player, controller) {
        val listener = object : Player.Listener {
            override fun onTracksChanged(tracks: Tracks) {
                controller.updateTracks(tracks)
            }
        }
        player.addListener(listener)
        controller.updateTracks(player.currentTracks)
        onDispose { player.removeListener(listener) }
    }
    return controller
}

@Composable
internal fun AudioSelectorDialog(
    options: List<AudioTrackOption>,
    selectedId: String?,
    isTelevision: Boolean,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val focusRequester = remember(selectedId, options) { FocusRequester() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
            usePlatformDefaultWidth = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .background(Color.Black.copy(alpha = 0.72f)),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth(if (isTelevision) 0.54f else 0.90f)
                    .fillMaxHeight(if (isTelevision) 0.78f else 0.72f)
                    .widthIn(max = 660.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(RonecaColors.SurfaceOverlay)
                    .border(1.dp, RonecaColors.Border, RoundedCornerShape(18.dp))
                    .padding(if (isTelevision) 20.dp else 16.dp),
            ) {
                Text(
                    text = "Áudio",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 24.sp else 20.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Escolha o idioma ou faixa de áudio deste conteúdo.",
                    color = RonecaColors.TextSecondary,
                    fontSize = 12.sp,
                )
                Spacer(modifier = Modifier.height(14.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    items(options, key = AudioTrackOption::id) { option ->
                        AudioOptionRow(
                            label = option.displayName,
                            selected = option.id == selectedId,
                            modifier = if (option.id == selectedId) {
                                Modifier.focusRequester(focusRequester)
                            } else {
                                Modifier
                            },
                            onClick = { onSelect(option.id) },
                        )
                    }
                }
            }
        }
    }

    androidx.compose.runtime.LaunchedEffect(selectedId, options) {
        kotlinx.coroutines.delay(80)
        runCatching { focusRequester.requestFocus() }
    }
}

@Composable
private fun AudioOptionRow(
    label: String,
    selected: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    var focused by remember(label) { mutableStateOf(false) }
    val interactionSource = remember(label) { MutableInteractionSource() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(
                when {
                    focused -> RonecaColors.SurfaceRaised
                    selected -> RonecaColors.Primary.copy(alpha = 0.14f)
                    else -> RonecaColors.Surface
                },
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    focused -> RonecaColors.Focus
                    selected -> RonecaColors.Primary
                    else -> RonecaColors.Border
                },
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 16.dp, vertical = 13.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            color = RonecaColors.TextPrimary,
            fontSize = 14.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (selected) {
            Text(text = "ATIVA ✓", color = RonecaColors.PrimaryStrong, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}
