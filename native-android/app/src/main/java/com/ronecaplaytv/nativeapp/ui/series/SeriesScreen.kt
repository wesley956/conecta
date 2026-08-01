package com.ronecaplaytv.nativeapp.ui.series

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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.components.ronecaFocusScale
import kotlinx.coroutines.delay

private const val FILTER_ALL = "Todas"
private const val FILTER_FAVORITES = "Minha Lista"
private const val FILTER_CONTINUE = "Continuar"

@Composable
fun SeriesScreen(
    series: List<NativeSeries>,
    isTelevision: Boolean,
    favoriteIds: Set<String>,
    startedSeriesIds: Set<String>,
    onOpenDetails: (NativeSeries) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var selectedCategory by rememberSaveable { mutableStateOf(FILTER_ALL) }
    var lastFocusedSeriesId by rememberSaveable { mutableStateOf<String?>(null) }
    var appliedFilterSignature by rememberSaveable { mutableStateOf("") }
    var searchFocused by remember { mutableStateOf(false) }

    val gridState = rememberLazyGridState()
    val categoryState = rememberLazyListState()
    val restoreFocusRequester = remember { FocusRequester() }

    val categories = remember(series) {
        listOf(FILTER_ALL, FILTER_FAVORITES, FILTER_CONTINUE) +
            series.map { it.category.ifBlank { "Outros" } }.distinct().sorted()
    }
    val filtered = remember(series, query, selectedCategory, favoriteIds, startedSeriesIds) {
        series.filter { item ->
            val categoryMatches = when (selectedCategory) {
                FILTER_ALL -> true
                FILTER_FAVORITES -> item.id in favoriteIds
                FILTER_CONTINUE -> item.id in startedSeriesIds
                else -> item.category == selectedCategory
            }
            categoryMatches && (query.isBlank() || item.name.contains(query, ignoreCase = true))
        }
    }

    val filteredSeriesIds = remember(filtered) {
        filtered.map(NativeSeries::id)
    }

    val filterSignature = remember(query, selectedCategory, favoriteIds, startedSeriesIds) {
        buildString {
            append(query.trim().lowercase())
            append('|')
            append(selectedCategory)
            if (selectedCategory == FILTER_FAVORITES) append('|').append(favoriteIds.hashCode())
            if (selectedCategory == FILTER_CONTINUE) append('|').append(startedSeriesIds.hashCode())
        }
    }

    LaunchedEffect(filterSignature, filteredSeriesIds, isTelevision) {
        val firstId = filteredSeriesIds.firstOrNull()
        if (appliedFilterSignature != filterSignature) {
            appliedFilterSignature = filterSignature
            lastFocusedSeriesId = firstId
            if (filtered.isNotEmpty()) gridState.scrollToItem(0)
        } else if (lastFocusedSeriesId !in filteredSeriesIds) {
            lastFocusedSeriesId = firstId
        }

        if (isTelevision && !searchFocused && lastFocusedSeriesId != null) {
            delay(100)
            runCatching { restoreFocusRequester.requestFocus() }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
    ) {
        val sidePadding = if (isTelevision) 24.dp else 18.dp
        Column(
            modifier = Modifier.padding(
                start = sidePadding,
                end = sidePadding,
                top = if (isTelevision) 16.dp else 18.dp,
            ),
        ) {
            if (isTelevision) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(0.34f)) {
                        Text(
                            text = "Séries",
                            color = RonecaColors.TextPrimary,
                            fontSize = 25.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "${filtered.size} séries",
                            color = RonecaColors.TextSecondary,
                            fontSize = 12.sp,
                        )
                    }
                    SeriesSearchField(
                        value = query,
                        onValueChange = { query = it },
                        isTelevision = true,
                        onFocusChanged = { searchFocused = it },
                        modifier = Modifier.weight(0.66f),
                    )
                }
            } else {
                Text(
                    text = "Séries",
                    color = RonecaColors.TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "${filtered.size} séries disponíveis",
                    color = RonecaColors.TextSecondary,
                    fontSize = 12.sp,
                )
                Spacer(modifier = Modifier.height(14.dp))
                SeriesSearchField(
                    value = query,
                    onValueChange = { query = it },
                    isTelevision = false,
                    onFocusChanged = { searchFocused = it },
                )
            }
            Spacer(modifier = Modifier.height(if (isTelevision) 9.dp else 10.dp))
            LazyRow(
                state = categoryState,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                items(categories, key = { it }) { category ->
                    SeriesCategoryChip(
                        label = category,
                        selected = selectedCategory == category,
                        onClick = { selectedCategory = category },
                    )
                }
            }
            Spacer(modifier = Modifier.height(if (isTelevision) 10.dp else 14.dp))
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(if (isTelevision) 6 else 2),
            state = gridState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = sidePadding, end = sidePadding, bottom = 28.dp),
            horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 11.dp else 10.dp),
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 12.dp else 14.dp),
        ) {
            items(filtered, key = NativeSeries::id) { item ->
                val focusModifier = if (item.id == lastFocusedSeriesId) {
                    Modifier.focusRequester(restoreFocusRequester)
                } else {
                    Modifier
                }
                SeriesPosterCard(
                    series = item,
                    isTelevision = isTelevision,
                    favorite = item.id in favoriteIds,
                    started = item.id in startedSeriesIds,
                    modifier = focusModifier,
                    onFocused = { lastFocusedSeriesId = item.id },
                    onClick = {
                        lastFocusedSeriesId = item.id
                        onOpenDetails(item)
                    },
                )
            }
        }
    }
}

@Composable
private fun SeriesSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    isTelevision: Boolean,
    onFocusChanged: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(999.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(999.dp))
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        if (value.isBlank()) {
            Text(
                text = "⌕  Buscar série",
                color = RonecaColors.TextMuted,
                fontSize = if (isTelevision) 13.sp else 14.sp,
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(
                color = RonecaColors.BodyText,
                fontSize = if (isTelevision) 13.sp else 14.sp,
            ),
            cursorBrush = SolidColor(RonecaColors.Primary),
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { onFocusChanged(it.isFocused) },
        )
    }
}

@Composable
private fun SeriesCategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .ronecaFocusScale(focused = focused, focusedScale = 1.045f)
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    focused -> RonecaColors.SurfaceRaised
                    selected -> RonecaColors.Primary.copy(alpha = 0.12f)
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
                shape = RoundedCornerShape(999.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(
            text = label,
            color = when {
                focused -> RonecaColors.TextPrimary
                selected -> RonecaColors.Primary
                else -> RonecaColors.TextSecondary
            },
            fontSize = 11.sp,
            fontWeight = if (focused || selected) FontWeight.Medium else FontWeight.Normal,
            maxLines = 1,
        )
    }
}

@Composable
private fun SeriesPosterCard(
    series: NativeSeries,
    isTelevision: Boolean,
    favorite: Boolean,
    started: Boolean,
    modifier: Modifier = Modifier,
    onFocused: () -> Unit,
    onClick: () -> Unit,
) {
    var focused by remember(series.id) { mutableStateOf(false) }
    val interactionSource = remember(series.id) { MutableInteractionSource() }
    val seasonCount = series.seasons.size

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(2f / 3f)
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .clip(RoundedCornerShape(12.dp))
            .background(RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Focus else RonecaColors.Border,
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged {
                focused = it.isFocused
                if (it.isFocused) onFocused()
            }
            .onPreviewKeyEvent { event ->
                val activationKey = event.key == Key.DirectionCenter ||
                    event.key == Key.Enter ||
                    event.key == Key.NumPadEnter ||
                    event.key == Key.Spacebar
                if (activationKey) {
                    if (event.type == KeyEventType.KeyDown) onClick()
                    true
                } else {
                    false
                }
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable(),
    ) {
        if (!series.coverUrl.isNullOrBlank()) {
            AsyncImage(
                model = series.coverUrl,
                contentDescription = series.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color.Transparent, Color(0xE6000000)),
                    ),
                ),
        )

        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(7.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            if (favorite) Badge("★", RonecaColors.Primary)
            if (started) Badge("CONTINUAR", RonecaColors.RedStrong)
        }

        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(7.dp)
                .background(Color(0xD9080808), RoundedCornerShape(999.dp))
                .border(1.dp, RonecaColors.Primary.copy(alpha = 0.70f), RoundedCornerShape(999.dp))
                .padding(horizontal = 8.dp, vertical = 5.dp),
        ) {
            Text(
                text = if (seasonCount > 0) "$seasonCount T" else "SÉRIE",
                color = RonecaColors.Primary,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(if (isTelevision) 8.dp else 10.dp),
        ) {
            Text(
                text = series.name,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 12.sp else 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
            )
            Text(
                text = series.category,
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 9.sp else 10.sp,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun Badge(text: String, color: Color) {
    Box(
        modifier = Modifier
            .background(Color(0xD9080808), RoundedCornerShape(999.dp))
            .border(1.dp, color.copy(alpha = 0.70f), RoundedCornerShape(999.dp))
            .padding(horizontal = 7.dp, vertical = 4.dp),
    ) {
        Text(text = text, color = color, fontSize = 8.sp, fontWeight = FontWeight.Bold)
    }
}
