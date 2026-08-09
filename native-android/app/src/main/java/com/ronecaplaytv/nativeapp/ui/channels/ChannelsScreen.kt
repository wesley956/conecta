package com.ronecaplaytv.nativeapp.ui.channels

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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
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
import com.ronecaplaytv.nativeapp.ui.components.RonecaAsyncImage
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.components.ronecaFocusScale
import kotlinx.coroutines.delay

@Composable
fun ChannelsScreen(
    channels: List<NativeChannel>,
    isTelevision: Boolean,
    favoriteIds: Set<String>,
    onToggleFavorite: (NativeChannel) -> Unit,
    onPlay: (NativeChannel) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var selectedCategory by rememberSaveable { mutableStateOf("Todos") }
    var favoritesOnly by rememberSaveable { mutableStateOf(false) }
    var alphabetical by rememberSaveable { mutableStateOf(false) }
    var lastFocusedChannelId by rememberSaveable { mutableStateOf<String?>(null) }
    var appliedFilterSignature by rememberSaveable { mutableStateOf("") }
    var searchFocused by remember { mutableStateOf(false) }

    val categoryState = rememberLazyListState()
    val gridState = rememberLazyGridState()
    val mobileListState = rememberLazyListState()
    val restoreFocusRequester = remember { FocusRequester() }

    val categories = remember(channels) {
        listOf("Todos") + channels
            .map { it.groupTitle.ifBlank { "Outros" } }
            .distinct()
            .sorted()
    }

    val filteredChannels = remember(
        channels,
        query,
        selectedCategory,
        favoritesOnly,
        alphabetical,
        favoriteIds,
    ) {
        channels
            .asSequence()
            .filter { selectedCategory == "Todos" || it.groupTitle == selectedCategory }
            .filter { !favoritesOnly || it.id in favoriteIds }
            .filter { query.isBlank() || it.name.contains(query, ignoreCase = true) }
            .let { sequence -> if (alphabetical) sequence.sortedBy { it.name.lowercase() } else sequence }
            .toList()
    }

    val filteredChannelIds = remember(filteredChannels) {
        filteredChannels.map(NativeChannel::id)
    }

    val filterSignature = remember(query, selectedCategory, favoritesOnly, alphabetical, favoriteIds) {
        buildString {
            append(query.trim().lowercase())
            append('|').append(selectedCategory)
            append('|').append(favoritesOnly)
            append('|').append(alphabetical)
            if (favoritesOnly) append('|').append(favoriteIds.hashCode())
        }
    }

    LaunchedEffect(filterSignature, filteredChannelIds, isTelevision) {
        val firstId = filteredChannelIds.firstOrNull()
        if (appliedFilterSignature != filterSignature) {
            appliedFilterSignature = filterSignature
            lastFocusedChannelId = firstId
            if (filteredChannels.isNotEmpty()) {
                if (isTelevision) gridState.scrollToItem(0) else mobileListState.scrollToItem(0)
            }
        } else if (lastFocusedChannelId !in filteredChannelIds) {
            lastFocusedChannelId = firstId
        }

        if (isTelevision && !searchFocused && lastFocusedChannelId != null) {
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
                            text = "TV ao vivo",
                            color = RonecaColors.TextPrimary,
                            fontSize = 25.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "${filteredChannels.size} canais",
                            color = RonecaColors.TextSecondary,
                            fontSize = 12.sp,
                        )
                    }
                    SearchField(
                        value = query,
                        onValueChange = { query = it },
                        isTelevision = true,
                        onFocusChanged = { searchFocused = it },
                        modifier = Modifier.weight(0.66f),
                    )
                }
                Spacer(modifier = Modifier.height(10.dp))
                LazyRow(
                    state = categoryState,
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    item {
                        FilterChip(
                            label = "Todos",
                            selected = !favoritesOnly && !alphabetical && selectedCategory == "Todos",
                            onClick = {
                                favoritesOnly = false
                                alphabetical = false
                                selectedCategory = "Todos"
                            },
                        )
                    }
                    item {
                        FilterChip(
                            label = "Favoritos",
                            selected = favoritesOnly,
                            onClick = { favoritesOnly = !favoritesOnly },
                        )
                    }
                    item {
                        FilterChip(
                            label = "A-Z",
                            selected = alphabetical,
                            onClick = { alphabetical = !alphabetical },
                        )
                    }
                    items(categories.drop(1), key = { it }) { category ->
                        FilterChip(
                            label = category,
                            selected = selectedCategory == category,
                            onClick = {
                                favoritesOnly = false
                                selectedCategory = category
                            },
                        )
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
            } else {
                Text(
                    text = "Canais",
                    color = RonecaColors.TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "${filteredChannels.size} canais disponíveis",
                    color = RonecaColors.TextSecondary,
                    fontSize = 12.sp,
                )
                Spacer(modifier = Modifier.height(14.dp))
                SearchField(
                    value = query,
                    onValueChange = { query = it },
                    isTelevision = false,
                    onFocusChanged = { searchFocused = it },
                )
                Spacer(modifier = Modifier.height(10.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        FilterChip(
                            label = "Todos",
                            selected = !favoritesOnly && !alphabetical,
                            onClick = {
                                favoritesOnly = false
                                alphabetical = false
                            },
                        )
                    }
                    item {
                        FilterChip(
                            label = "Favoritos",
                            selected = favoritesOnly,
                            onClick = { favoritesOnly = !favoritesOnly },
                        )
                    }
                    item {
                        FilterChip(
                            label = "A-Z",
                            selected = alphabetical,
                            onClick = { alphabetical = !alphabetical },
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                LazyRow(
                    state = categoryState,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(categories, key = { it }) { category ->
                        FilterChip(
                            label = category,
                            selected = selectedCategory == category,
                            onClick = { selectedCategory = category },
                        )
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }

        if (isTelevision) {
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                state = gridState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 24.dp, end = 24.dp, bottom = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(filteredChannels, key = NativeChannel::id) { channel ->
                    val focusModifier = if (channel.id == lastFocusedChannelId) {
                        Modifier.focusRequester(restoreFocusRequester)
                    } else {
                        Modifier
                    }
                    ChannelItem(
                        channel = channel,
                        favorite = channel.id in favoriteIds,
                        isTelevision = true,
                        compact = true,
                        modifier = focusModifier,
                        onFocused = { lastFocusedChannelId = channel.id },
                        onToggleFavorite = { onToggleFavorite(channel) },
                        onPlay = {
                            lastFocusedChannelId = channel.id
                            onPlay(channel)
                        },
                    )
                }
            }
        } else {
            LazyColumn(
                state = mobileListState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 28.dp),
            ) {
                if (filteredChannels.isEmpty()) {
                    item {
                        Text(
                            text = "Nenhum canal encontrado.",
                            color = RonecaColors.TextMuted,
                            modifier = Modifier.padding(vertical = 28.dp),
                        )
                    }
                }
                items(filteredChannels, key = NativeChannel::id) { channel ->
                    ChannelItem(
                        channel = channel,
                        favorite = channel.id in favoriteIds,
                        isTelevision = false,
                        compact = false,
                        onFocused = { lastFocusedChannelId = channel.id },
                        onToggleFavorite = { onToggleFavorite(channel) },
                        onPlay = {
                            lastFocusedChannelId = channel.id
                            onPlay(channel)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchField(
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
                text = "⌕  Buscar canal",
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
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
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
private fun ChannelItem(
    channel: NativeChannel,
    favorite: Boolean,
    isTelevision: Boolean,
    compact: Boolean,
    modifier: Modifier = Modifier,
    onFocused: () -> Unit,
    onToggleFavorite: () -> Unit,
    onPlay: () -> Unit,
) {
    var focused by remember(channel.id) { mutableStateOf(false) }
    val interactionSource = remember(channel.id) { MutableInteractionSource() }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .clip(RoundedCornerShape(10.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Focus else RonecaColors.Border,
                shape = RoundedCornerShape(10.dp),
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
                    if (event.type == KeyEventType.KeyDown) onPlay()
                    true
                } else {
                    false
                }
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onPlay)
            .focusable()
            .padding(horizontal = if (compact) 10.dp else 12.dp, vertical = if (compact) 9.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(if (compact) 42.dp else if (isTelevision) 50.dp else 48.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(RonecaColors.BackgroundSoft)
                .border(1.dp, RonecaColors.Border, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (!channel.logoUrl.isNullOrBlank()) {
                RonecaAsyncImage(
                    model = channel.logoUrl,
                    contentDescription = channel.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                )
            } else {
                Text(text = "TV", color = RonecaColors.TextMuted, fontSize = 10.sp)
            }
        }

        Spacer(modifier = Modifier.width(if (compact) 10.dp else 14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = channel.name,
                color = RonecaColors.TextPrimary,
                fontSize = if (compact) 13.sp else 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
            )
            Text(
                text = channel.groupTitle,
                color = RonecaColors.TextSecondary,
                fontSize = if (compact) 10.sp else 12.sp,
                maxLines = 1,
            )
        }

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onToggleFavorite)
                .padding(if (compact) 7.dp else 10.dp),
        ) {
            Text(
                text = if (favorite) "★" else "☆",
                color = if (favorite) RonecaColors.Primary else RonecaColors.TextMuted,
                fontSize = if (compact) 17.sp else 19.sp,
            )
        }
    }
}
