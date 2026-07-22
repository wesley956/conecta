package com.ronecaplaytv.nativeapp.ui.update

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.update.AppUpdateState
import com.ronecaplaytv.nativeapp.update.UpdateManifest

private data class UpdateNotesSummary(
    val description: String,
    val highlights: List<String>,
)

@Composable
fun AppUpdateOverlay(
    state: AppUpdateState,
    isTelevision: Boolean,
    onDownload: (UpdateManifest) -> Unit,
    onInstall: (AppUpdateState.ReadyToInstall) -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    val visible = when (state) {
        is AppUpdateState.Available,
        is AppUpdateState.Downloading,
        is AppUpdateState.ReadyToInstall -> true

        is AppUpdateState.Error -> state.userVisible
        else -> false
    }
    if (!visible) return

    val mandatory = when (state) {
        is AppUpdateState.Available -> state.manifest.mandatory
        is AppUpdateState.Downloading -> state.manifest.mandatory
        is AppUpdateState.ReadyToInstall -> state.manifest.mandatory
        else -> false
    }
    val canDismiss = !mandatory && state !is AppUpdateState.Downloading
    BackHandler(enabled = true) {
        if (canDismiss) onDismiss()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.90f))
            .padding(if (isTelevision) 24.dp else 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .width(if (isTelevision) 620.dp else 420.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(RonecaColors.Surface)
                .border(1.dp, RonecaColors.Primary.copy(alpha = 0.72f), RoundedCornerShape(24.dp))
                .padding(if (isTelevision) 26.dp else 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "ATUALIZAÇÃO DO APLICATIVO",
                color = RonecaColors.Primary,
                fontSize = if (isTelevision) 13.sp else 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp,
            )
            Spacer(modifier = Modifier.height(10.dp))

            when (state) {
                is AppUpdateState.Available -> AvailableContent(
                    state = state,
                    isTelevision = isTelevision,
                    canDismiss = canDismiss,
                    onDownload = onDownload,
                    onDismiss = onDismiss,
                )

                is AppUpdateState.Downloading -> DownloadingContent(state, isTelevision)

                is AppUpdateState.ReadyToInstall -> ReadyContent(
                    state = state,
                    isTelevision = isTelevision,
                    canDismiss = canDismiss,
                    onInstall = onInstall,
                    onDismiss = onDismiss,
                )

                is AppUpdateState.Error -> ErrorContent(
                    message = state.message,
                    isTelevision = isTelevision,
                    onRetry = onRetry,
                    onDismiss = onDismiss,
                )

                else -> Unit
            }
        }
    }
}

@Composable
private fun AvailableContent(
    state: AppUpdateState.Available,
    isTelevision: Boolean,
    canDismiss: Boolean,
    onDownload: (UpdateManifest) -> Unit,
    onDismiss: () -> Unit,
) {
    val summary = remember(state.manifest.notes, isTelevision) {
        summarizeUpdateNotes(state.manifest.notes, isTelevision)
    }

    Text(
        text = "Nova versão ${state.manifest.versionName}",
        color = RonecaColors.TextPrimary,
        fontSize = if (isTelevision) 29.sp else 24.sp,
        fontWeight = FontWeight.Bold,
    )
    Spacer(modifier = Modifier.height(8.dp))
    Text(
        text = summary.description,
        color = RonecaColors.TextSecondary,
        fontSize = if (isTelevision) 16.sp else 14.sp,
        textAlign = TextAlign.Center,
        maxLines = if (isTelevision) 2 else 3,
        overflow = TextOverflow.Ellipsis,
    )

    if (summary.highlights.isNotEmpty()) {
        Spacer(modifier = Modifier.height(if (isTelevision) 16.dp else 14.dp))
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 8.dp else 7.dp),
        ) {
            summary.highlights.forEach { highlight ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        text = "•",
                        color = RonecaColors.Primary,
                        fontSize = if (isTelevision) 16.sp else 14.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = highlight,
                        color = RonecaColors.TextSecondary,
                        fontSize = if (isTelevision) 15.sp else 13.sp,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }

    Spacer(modifier = Modifier.height(if (isTelevision) 20.dp else 18.dp))
    UpdateActions(
        primaryLabel = "ATUALIZAR AGORA",
        onPrimary = { onDownload(state.manifest) },
        secondaryLabel = "DEPOIS".takeIf { canDismiss },
        onSecondary = onDismiss,
    )
}

private fun summarizeUpdateNotes(rawNotes: String, isTelevision: Boolean): UpdateNotesSummary {
    val lines = rawNotes
        .replace("\r\n", "\n")
        .lineSequence()
        .map(String::trim)
        .filter(String::isNotBlank)
        .toList()

    val description = lines
        .firstOrNull { line ->
            !line.startsWith("#") &&
                !line.startsWith("-") &&
                !line.startsWith("•") &&
                !line.startsWith("*")
        }
        ?.removeMarkdownDecoration()
        ?.limitAtWordBoundary(if (isTelevision) 145 else 220)
        .orEmpty()
        .ifBlank { "Melhorias de estabilidade, navegação e desempenho." }

    val maximumHighlights = if (isTelevision) 3 else 4
    val maximumHighlightLength = if (isTelevision) 88 else 120
    val highlights = lines
        .asSequence()
        .filter { line ->
            line.startsWith("-") || line.startsWith("•") || line.startsWith("*")
        }
        .map { line ->
            line
                .removePrefix("-")
                .removePrefix("•")
                .removePrefix("*")
                .trim()
                .trimEnd(';', '.')
                .removeMarkdownDecoration()
                .limitAtWordBoundary(maximumHighlightLength)
        }
        .filter(String::isNotBlank)
        .distinct()
        .take(maximumHighlights)
        .toList()

    return UpdateNotesSummary(
        description = description,
        highlights = highlights,
    )
}

private fun String.removeMarkdownDecoration(): String =
    replace("**", "")
        .replace("__", "")
        .replace("`", "")
        .replace(Regex("\\s+"), " ")
        .trim()

private fun String.limitAtWordBoundary(maximumLength: Int): String {
    if (length <= maximumLength) return this
    val shortened = take(maximumLength + 1)
        .substringBeforeLast(' ', missingDelimiterValue = take(maximumLength))
        .trimEnd(',', ';', ':', '-', ' ')
    return "$shortened…"
}

@Composable
private fun DownloadingContent(state: AppUpdateState.Downloading, isTelevision: Boolean) {
    Text(
        text = "Baixando versão ${state.manifest.versionName}",
        color = RonecaColors.TextPrimary,
        fontSize = if (isTelevision) 26.sp else 22.sp,
        fontWeight = FontWeight.Bold,
    )
    Spacer(modifier = Modifier.height(10.dp))
    Text(
        text = state.progress?.let { "${(it * 100).toInt()}% concluído" } ?: "Preparando download seguro...",
        color = RonecaColors.TextSecondary,
        fontSize = if (isTelevision) 15.sp else 13.sp,
    )
    Spacer(modifier = Modifier.height(20.dp))
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(RonecaColors.BackgroundSoft),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth((state.progress ?: 0.08f).coerceIn(0.03f, 1f))
                .height(8.dp)
                .background(RonecaColors.Primary),
        )
    }
    Spacer(modifier = Modifier.height(14.dp))
    Text(
        text = "O arquivo será validado antes da instalação.",
        color = RonecaColors.TextMuted,
        fontSize = if (isTelevision) 13.sp else 12.sp,
    )
}

@Composable
private fun ReadyContent(
    state: AppUpdateState.ReadyToInstall,
    isTelevision: Boolean,
    canDismiss: Boolean,
    onInstall: (AppUpdateState.ReadyToInstall) -> Unit,
    onDismiss: () -> Unit,
) {
    Text(
        text = if (state.permissionRequired) "Permita a instalação" else "Atualização pronta",
        color = RonecaColors.TextPrimary,
        fontSize = if (isTelevision) 28.sp else 23.sp,
        fontWeight = FontWeight.Bold,
    )
    Spacer(modifier = Modifier.height(8.dp))
    Text(
        text = if (state.permissionRequired) {
            "Ative “Permitir desta fonte”, volte ao ronecaPlayerTV e selecione instalar novamente."
        } else {
            "O APK foi verificado. O Android pedirá sua confirmação para concluir a atualização."
        },
        color = RonecaColors.TextSecondary,
        fontSize = if (isTelevision) 16.sp else 14.sp,
        textAlign = TextAlign.Center,
    )
    Spacer(modifier = Modifier.height(24.dp))
    UpdateActions(
        primaryLabel = if (state.permissionRequired) "AUTORIZAR / INSTALAR" else "INSTALAR AGORA",
        onPrimary = { onInstall(state) },
        secondaryLabel = "DEPOIS".takeIf { canDismiss },
        onSecondary = onDismiss,
    )
}

@Composable
private fun ErrorContent(
    message: String,
    isTelevision: Boolean,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    Text(
        text = "Não foi possível atualizar",
        color = RonecaColors.TextPrimary,
        fontSize = if (isTelevision) 27.sp else 22.sp,
        fontWeight = FontWeight.Bold,
    )
    Spacer(modifier = Modifier.height(8.dp))
    Text(
        text = message,
        color = RonecaColors.TextSecondary,
        fontSize = if (isTelevision) 15.sp else 13.sp,
        textAlign = TextAlign.Center,
    )
    Spacer(modifier = Modifier.height(24.dp))
    UpdateActions(
        primaryLabel = "TENTAR NOVAMENTE",
        onPrimary = onRetry,
        secondaryLabel = "FECHAR",
        onSecondary = onDismiss,
    )
}

@Composable
private fun UpdateActions(
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryLabel: String?,
    onSecondary: () -> Unit,
) {
    val primaryFocusRequester = remember { FocusRequester() }
    LaunchedEffect(primaryLabel) {
        primaryFocusRequester.requestFocus()
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
    ) {
        if (secondaryLabel != null) {
            UpdateButton(
                label = secondaryLabel,
                primary = false,
                onClick = onSecondary,
                modifier = Modifier.weight(1f),
            )
        }
        UpdateButton(
            label = primaryLabel,
            primary = true,
            onClick = onPrimary,
            modifier = Modifier.weight(1.4f),
            focusRequester = primaryFocusRequester,
        )
    }
}

@Composable
private fun UpdateButton(
    label: String,
    primary: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val focusModifier = if (focusRequester != null) {
        Modifier.focusRequester(focusRequester)
    } else {
        Modifier
    }
    Box(
        modifier = modifier
            .then(focusModifier)
            .clip(RoundedCornerShape(12.dp))
            .background(
                when {
                    focused -> RonecaColors.RedStrong
                    primary -> RonecaColors.Primary
                    else -> RonecaColors.BackgroundSoft
                },
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused || primary) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 15.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (primary && !focused) Color(0xFF100E08) else RonecaColors.TextPrimary,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
    }
}
