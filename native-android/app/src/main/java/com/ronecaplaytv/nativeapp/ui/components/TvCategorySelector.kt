package com.ronecaplaytv.nativeapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.navigation.isRonecaActivationKey
import kotlinx.coroutines.delay

/**
 * Painel fixo da tela de catálogo para TV. A largura usa 18% da área disponível,
 * deixando o catálogo como elemento principal; em mobile os chips clássicos são
 * preservados pelas telas consumidoras.
 */
@Composable
fun TvCategorySidePanel(
    title: String,
    categories: List<String>,
    selectedCategory: String,
    categoryCounts: Map<String, Int>,
    focusRequestKey: Int,
    selectedFocusRequester: FocusRequester,
    onSelect: (String) -> Unit,
    onExitToMainMenu: () -> Unit,
    onMoveToCatalog: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (categories.isEmpty()) return

    val selectedIndex = categories.indexOf(selectedCategory).coerceAtLeast(0)
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)

    Column(
        modifier = modifier
            .fillMaxWidth(0.18f)
            .fillMaxHeight()
            .background(RonecaColors.SurfaceOverlay)
            .border(width = 1.dp, color = RonecaColors.Border)
            .padding(start = 12.dp, end = 10.dp, top = 16.dp, bottom = 12.dp),
    ) {
        Text(
            text = title.uppercase(),
            color = RonecaColors.Primary,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = "Categorias",
            color = RonecaColors.TextPrimary,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "${categories.size} opções",
            color = RonecaColors.TextSecondary,
            fontSize = 10.sp,
        )
        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 3.dp, vertical = 3.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            itemsIndexed(categories, key = { _, category -> category }) { index, category ->
                val selected = category == selectedCategory
                TvCategorySidePanelRow(
                    label = category,
                    count = categoryCounts[category],
                    selected = selected,
                    index = index,
                    lastIndex = categories.lastIndex,
                        onExitToMainMenu = onExitToMainMenu,
                        onMoveToCatalog = onMoveToCatalog,
                        modifier = if (selected) {
                            Modifier.focusRequester(selectedFocusRequester)
                    } else {
                        Modifier
                    },
                    onClick = { onSelect(category) },
                )
            }
        }
    }

    LaunchedEffect(focusRequestKey) {
        if (focusRequestKey <= 0) return@LaunchedEffect
        listState.scrollToItem(selectedIndex)
        delay(90)
        runCatching { selectedFocusRequester.requestFocus() }
    }
}

@Composable
private fun TvCategorySidePanelRow(
    label: String,
    count: Int?,
    selected: Boolean,
    index: Int,
    lastIndex: Int,
    onExitToMainMenu: () -> Unit,
    onMoveToCatalog: () -> Unit,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    var focused by remember(label) { mutableStateOf(false) }
    val interaction = remember(label) { MutableInteractionSource() }
    val shape = RoundedCornerShape(10.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .ronecaFocusScale(focused = focused, focusedScale = 1.012f)
            .clip(shape)
            .background(
                when {
                    focused -> RonecaColors.SurfaceRaised
                    selected -> RonecaColors.PrimarySoft
                    else -> RonecaColors.BackgroundSoft
                },
            )
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = when {
                    focused -> RonecaColors.Focus
                    selected -> RonecaColors.Primary
                    else -> RonecaColors.Border
                },
                shape = shape,
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                when {
                    event.isRonecaActivationKey() -> {
                        onClick()
                        true
                    }
                    event.type != KeyEventType.KeyDown -> false
                    event.key == Key.DirectionLeft -> {
                        onExitToMainMenu()
                        true
                    }
                    event.key == Key.DirectionRight -> {
                        onMoveToCatalog()
                        true
                    }
                    event.key == Key.DirectionUp && index == 0 -> true
                    event.key == Key.DirectionDown && index == lastIndex -> true
                    else -> false
                }
            }
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 10.dp, vertical = 9.dp),
    ) {
        if (focused) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .width(3.dp)
                    .height(22.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(RonecaColors.RedStrong),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = if (focused) 7.dp else 0.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                modifier = Modifier.weight(1f),
                color = RonecaColors.TextPrimary,
                fontSize = 13.sp,
                fontWeight = if (focused || selected) FontWeight.Bold else FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = buildString {
                    if (count != null) append(count)
                    if (selected) append("  ✓")
                },
                color = if (focused) RonecaColors.TextPrimary else RonecaColors.PrimaryStrong,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
