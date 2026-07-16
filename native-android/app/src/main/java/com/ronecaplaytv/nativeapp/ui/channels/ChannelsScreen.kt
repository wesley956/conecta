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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
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
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

@Composable
fun ChannelsScreen(
    channels: List<NativeChannel>,
    isTelevision: Boolean,
    onPlay: (NativeChannel) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var selectedCategory by rememberSaveable { mutableStateOf("Todos") }
    var favoritesOnly by rememberSaveable { mutableStateOf(false) }
    var alphabetical by rememberSaveable { mutableStateOf(false) }
    var favorites by remember { mutableStateOf(emptySet<String>()) }

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
        favorites,
    ) {
        channels
            .asSequence()
            .filter { channel ->
                selectedCategory == "Todos" || channel.groupTitle == selectedCategory
            }
            .filter { channel ->
                !favoritesOnly || channel.id in favorites
            }
            .filter { channel ->
                query.isBlank() || channel.name.contains(query, ignoreCase = true)
            }
            .let { sequence ->
                if (alphabetical) sequence.sortedBy { it.name.lowercase() } else sequence
            }
            .toList()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
    ) {
        Column(
            modifier = Modifier.padding(
                start = if (isTelevision) 52.dp else 18.dp,
                end = if (isTelevision) 52.dp else 18.dp,
                top = if (isTelevision) 28.dp else 18.dp,
            ),
        ) {
            Text(
                text = "Canais",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 30.sp else 24.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "${filteredChannels.size} canais disponíveis",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 14.sp else 12.sp,
            )
            Spacer(modifier = Modifier.height(14.dp))
            SearchField(
                value = query,
                onValueChange = { query = it },
                isTelevision = isTelevision,
            )
            Spacer(modifier = Modifier.height(12.dp))
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
            Spacer(modifier = Modifier.height(10.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(categories) { category ->
                    FilterChip(
                        label = category,
                        selected = selectedCategory == category,
                        onClick = { selectedCategory = category },
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = if (isTelevision) 52.dp else 18.dp,
                end = if (isTelevision) 52.dp else 18.dp,
                bottom = 28.dp,
            ),
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
                    favorite = channel.id in favorites,
                    isTelevision = isTelevision,
                    onToggleFavorite = {
                        favorites = if (channel.id in favorites) {
                            favorites - channel.id
                        } else {
                            favorites + channel.id
                        }
                    },
                    onPlay = { onPlay(channel) },
                )
            }
        }
    }
}

@Composable
private fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    isTelevision: Boolean,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(8.dp))
            .padding(horizontal = 14.dp, vertical = if (isTelevision) 12.dp else 10.dp),
    ) {
        if (value.isBlank()) {
            Text(
                text = "Buscar canais...",
                color = RonecaColors.TextMuted,
                fontSize = if (isTelevision) 15.sp else 14.sp,
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(
                color = RonecaColors.BodyText,
                fontSize = if (isTelevision) 15.sp else 14.sp,
            ),
            cursorBrush = SolidColor(RonecaColors.Primary),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) RonecaColors.Primary.copy(alpha = 0.12f) else RonecaColors.Surface)
            .border(
                width = 1.dp,
                color = if (selected) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(8.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (selected) RonecaColors.Primary else RonecaColors.TextSecondary,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
        )
    }
}

@Composable
private fun ChannelItem(
    channel: NativeChannel,
    favorite: Boolean,
    isTelevision: Boolean,
    onToggleFavorite: () -> Unit,
    onPlay: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (focused) RonecaColors.SurfaceRaised else Color.Transparent)
            .border(
                width = if (focused) 1.dp else 0.dp,
                color = if (focused) RonecaColors.Primary else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onPlay()
                    true
                } else {
                    false
                }
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onPlay,
            )
            .focusable()
            .padding(horizontal = 12.dp, vertical = if (isTelevision) 12.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(if (isTelevision) 54.dp else 48.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(RonecaColors.Surface)
                .border(1.dp, RonecaColors.Border, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (!channel.logoUrl.isNullOrBlank()) {
                AsyncImage(
                    model = channel.logoUrl,
                    contentDescription = channel.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                )
            } else {
                Text(text = "TV", color = RonecaColors.TextMuted, fontSize = 12.sp)
            }
        }

        Spacer(modifier = Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = channel.name,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 16.sp else 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
            )
            Text(
                text = channel.groupTitle,
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
                maxLines = 1,
            )
        }

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onToggleFavorite)
                .padding(10.dp),
        ) {
            Text(
                text = if (favorite) "★" else "☆",
                color = if (favorite) RonecaColors.Yellow else RonecaColors.TextMuted,
                fontSize = if (isTelevision) 22.sp else 19.sp,
            )
        }
    }
}
