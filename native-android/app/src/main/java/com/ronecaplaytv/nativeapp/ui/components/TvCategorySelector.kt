package com.ronecaplaytv.nativeapp.ui.components

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.navigation.isRonecaActivationKey
import kotlinx.coroutines.delay

@Composable
fun TvCategoryButton(
    selectedCategory: String,
    categoryCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .ronecaFocusScale(focused = focused)
            .clip(RoundedCornerShape(999.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Focus else RonecaColors.Border,
                shape = RoundedCornerShape(999.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (event.isRonecaActivationKey()) {
                    onClick()
                    true
                } else false
            }
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = "Categorias  •  $selectedCategory  ($categoryCount)",
            color = if (focused) RonecaColors.TextPrimary else RonecaColors.TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun TvCategorySelector(
    title: String,
    categories: List<String>,
    selectedCategory: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val selectedIndex = categories.indexOf(selectedCategory).coerceAtLeast(0)
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)
    val selectedRequester = remember { FocusRequester() }

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
                .background(Color.Black.copy(alpha = 0.70f)),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(min = 430.dp, max = 620.dp)
                    .fillMaxHeight(0.82f)
                    .clip(RoundedCornerShape(18.dp))
                    .background(RonecaColors.SurfaceOverlay)
                    .border(1.dp, RonecaColors.Border, RoundedCornerShape(18.dp))
                    .padding(18.dp),
            ) {
                Text(
                    text = title,
                    color = RonecaColors.TextPrimary,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(5.dp))
                Text(
                    text = "Use ↑/↓ e confirme com OK. Back fecha sem alterar.",
                    color = RonecaColors.TextSecondary,
                    fontSize = 12.sp,
                )
                Spacer(modifier = Modifier.height(14.dp))
                LazyColumn(
                    state = listState,
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    items(categories, key = { it }) { category ->
                        val selected = category == selectedCategory
                        TvCategoryRow(
                            label = category,
                            selected = selected,
                            modifier = if (selected) Modifier.focusRequester(selectedRequester) else Modifier,
                            onClick = {
                                onSelect(category)
                                onDismiss()
                            },
                        )
                    }
                }
            }
        }
    }

    LaunchedEffect(categories, selectedCategory) {
        if (categories.isNotEmpty()) {
            listState.scrollToItem(selectedIndex)
            delay(80)
            runCatching { selectedRequester.requestFocus() }
        }
    }
}

@Composable
private fun TvCategoryRow(
    label: String,
    selected: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    var focused by remember(label) { mutableStateOf(false) }
    val interaction = remember(label) { MutableInteractionSource() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(
                when {
                    focused -> RonecaColors.SurfaceRaised
                    selected -> RonecaColors.PrimarySoft
                    else -> RonecaColors.BackgroundSoft
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
            .onPreviewKeyEvent { event ->
                if (event.isRonecaActivationKey()) {
                    onClick()
                    true
                } else false
            }
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 16.dp, vertical = 13.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f),
            color = RonecaColors.TextPrimary,
            fontSize = 15.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (selected) {
            Text(
                text = "SELECIONADA ✓",
                color = RonecaColors.PrimaryStrong,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
