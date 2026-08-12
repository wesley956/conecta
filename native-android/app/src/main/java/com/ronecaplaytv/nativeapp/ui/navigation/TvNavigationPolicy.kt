package com.ronecaplaytv.nativeapp.ui.navigation

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type

/** Política única de ativação para superfícies Compose fora do player Media3. */
internal fun KeyEvent.isRonecaActivationKey(allowSpacebar: Boolean = true): Boolean {
    if (type != KeyEventType.KeyDown) return false
    return key == Key.DirectionCenter ||
        key == Key.Enter ||
        key == Key.NumPadEnter ||
        (allowSpacebar && key == Key.Spacebar)
}

/**
 * Mantém o item contextual se ele continuar visível. Se sumir após refresh ou
 * filtro, o fallback é sempre o primeiro item válido, nunca um elemento oculto.
 */
internal fun deterministicFocusId(previousId: String?, visibleIds: List<String>): String? =
    previousId?.takeIf(visibleIds::contains) ?: visibleIds.firstOrNull()

internal fun tvBrowsableCategories(
    allCategories: List<String>,
    specialFilters: Set<String>,
): List<String> = allCategories.filterNot(specialFilters::contains).distinct()
