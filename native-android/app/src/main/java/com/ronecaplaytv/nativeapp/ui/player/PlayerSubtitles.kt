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

internal data class SubtitleTrackOption(
    val id: String,
    val groupIndex: Int,
    val trackIndex: Int,
    val displayName: String,
    val language: String?,
    val isSelected: Boolean,
    val isDefault: Boolean,
    val isForced: Boolean,
)

internal data class SubtitleTrackDescriptor(
    val groupIndex: Int,
    val trackIndex: Int,
    val label: String?,
    val language: String?,
    val isSupported: Boolean,
    val isSelected: Boolean,
    val selectionFlags: Int,
)

internal fun buildSubtitleOptions(
    descriptors: List<SubtitleTrackDescriptor>,
): List<SubtitleTrackOption> {
    var fallbackNumber = 0
    val usedNames = mutableMapOf<String, Int>()

    return descriptors.filter(SubtitleTrackDescriptor::isSupported).map { descriptor ->
        val language = descriptor.language?.trim()?.takeIf(String::isNotEmpty)
        val baseName = descriptor.label?.trim()?.takeIf(String::isNotEmpty)
            ?: language?.let(::displayLanguage)
            ?: "Legenda ${++fallbackNumber}"
        val flags = buildList {
            if (descriptor.selectionFlags and C.SELECTION_FLAG_FORCED != 0) add("forçada")
            if (descriptor.selectionFlags and C.SELECTION_FLAG_DEFAULT != 0) add("padrão")
        }
        val qualifiedName = if (flags.isEmpty()) baseName else "$baseName (${flags.joinToString()})"
        val occurrence = (usedNames[qualifiedName] ?: 0) + 1
        usedNames[qualifiedName] = occurrence
        val displayName = if (occurrence == 1) qualifiedName else "$qualifiedName $occurrence"

        SubtitleTrackOption(
            id = "${descriptor.groupIndex}:${descriptor.trackIndex}",
            groupIndex = descriptor.groupIndex,
            trackIndex = descriptor.trackIndex,
            displayName = displayName.take(120),
            language = language?.take(35),
            isSelected = descriptor.isSelected,
            isDefault = descriptor.selectionFlags and C.SELECTION_FLAG_DEFAULT != 0,
            isForced = descriptor.selectionFlags and C.SELECTION_FLAG_FORCED != 0,
        )
    }
}

private fun displayLanguage(language: String): String {
    val normalized = language.replace('_', '-')
    val display = Locale.forLanguageTag(normalized).getDisplayLanguage(Locale("pt", "BR")).trim()
    return display.takeIf { it.isNotEmpty() }?.replaceFirstChar { character ->
        if (character.isLowerCase()) character.titlecase(Locale("pt", "BR")) else character.toString()
    } ?: language
}

private fun subtitleOptionsFrom(tracks: Tracks): List<SubtitleTrackOption> {
    val descriptors = buildList {
        tracks.groups.forEachIndexed { groupIndex, group ->
            if (group.type != C.TRACK_TYPE_TEXT) return@forEachIndexed
            for (trackIndex in 0 until group.length) {
                val format = group.getTrackFormat(trackIndex)
                add(
                    SubtitleTrackDescriptor(
                        groupIndex = groupIndex,
                        trackIndex = trackIndex,
                        label = format.label,
                        language = format.language,
                        isSupported = group.isTrackSupported(trackIndex),
                        isSelected = group.isTrackSelected(trackIndex),
                        selectionFlags = format.selectionFlags,
                    ),
                )
            }
        }
    }
    return buildSubtitleOptions(descriptors)
}

internal class PlayerSubtitleController(private val player: Player) {
    var options by mutableStateOf<List<SubtitleTrackOption>>(emptyList())
        private set
    var panelVisible by mutableStateOf(false)
        private set
    var explicitlyDisabled by mutableStateOf(false)
        private set

    val selectedId: String?
        get() = options.firstOrNull(SubtitleTrackOption::isSelected)?.id

    fun updateTracks(tracks: Tracks) {
        val updated = subtitleOptionsFrom(tracks)
        if (updated == options) return
        options = updated
        if (updated.isEmpty()) panelVisible = false
        NativeDiagnostics.record(
            "playback.subtitle_tracks",
            mapOf(
                "track_count" to updated.size,
                "languages" to updated.mapNotNull(SubtitleTrackOption::language).distinct().take(8).joinToString(","),
                "selected" to updated.any(SubtitleTrackOption::isSelected),
            ),
        )
    }

    fun openPanel() {
        if (options.isNotEmpty()) panelVisible = true
    }

    fun closePanel() {
        panelVisible = false
    }

    fun disable() {
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build()
        explicitlyDisabled = true
        closePanel()
        updateTracks(player.currentTracks)
        NativeDiagnostics.record("playback.subtitle_selection", mapOf("enabled" to false))
    }

    fun select(optionId: String) {
        val option = options.firstOrNull { it.id == optionId } ?: return
        val group = player.currentTracks.groups.getOrNull(option.groupIndex) ?: return
        if (group.type != C.TRACK_TYPE_TEXT || option.trackIndex !in 0 until group.length) return
        if (!group.isTrackSupported(option.trackIndex)) return

        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, option.trackIndex))
            .build()
        explicitlyDisabled = false
        closePanel()
        updateTracks(player.currentTracks)
        NativeDiagnostics.record(
            "playback.subtitle_selection",
            mapOf(
                "enabled" to true,
                "language" to option.language,
                "label" to option.displayName.take(80),
                "forced" to option.isForced,
            ),
        )
    }

    /** Remove qualquer override ligado ao TrackGroup da mídia anterior. */
    fun resetForContentChange() {
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            .build()
        explicitlyDisabled = false
        options = emptyList()
        panelVisible = false
    }
}

@Composable
internal fun rememberPlayerSubtitleController(player: Player): PlayerSubtitleController {
    val controller = remember(player) { PlayerSubtitleController(player) }
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
internal fun SubtitleSelectorDialog(
    options: List<SubtitleTrackOption>,
    selectedId: String?,
    disabled: Boolean,
    isTelevision: Boolean,
    onDisable: () -> Unit,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val selectedKey = if (disabled || selectedId == null) DISABLED_ID else selectedId
    val focusRequester = remember(selectedKey, options) { FocusRequester() }
    val rows = remember(options) {
        listOf<SubtitleTrackOption?>(null) + options
    }

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
                    text = "Legendas",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 24.sp else 20.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Escolha uma faixa disponível neste conteúdo.",
                    color = RonecaColors.TextSecondary,
                    fontSize = 12.sp,
                )
                Spacer(modifier = Modifier.height(14.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    items(rows, key = { it?.id ?: DISABLED_ID }) { option ->
                        val id = option?.id ?: DISABLED_ID
                        SubtitleOptionRow(
                            label = option?.displayName ?: "Desativada",
                            selected = id == selectedKey,
                            modifier = if (id == selectedKey) Modifier.focusRequester(focusRequester) else Modifier,
                            onClick = { if (option == null) onDisable() else onSelect(option.id) },
                        )
                    }
                }
            }
        }
    }

    androidx.compose.runtime.LaunchedEffect(selectedKey, options) {
        kotlinx.coroutines.delay(80)
        runCatching { focusRequester.requestFocus() }
    }
}

@Composable
private fun SubtitleOptionRow(
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

private const val DISABLED_ID = "disabled"
