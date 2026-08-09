package com.ronecaplaytv.nativeapp.ui.catalog

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.components.RonecaAsyncImage
import com.ronecaplaytv.nativeapp.ui.components.CompactActionButton
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay

data class CatalogListItem(
    val id: String,
    val title: String,
    val subtitle: String,
    val imageUrl: String?,
    val playbackUrls: List<String>,
)

@Composable
fun CatalogListScreen(
    title: String,
    items: List<CatalogListItem>,
    isTelevision: Boolean,
    onBack: () -> Unit,
    onPlay: (CatalogListItem) -> Unit,
) {
    BackHandler(onBack = onBack)

    val firstItemRequester = remember { FocusRequester() }
    val backRequester = remember { FocusRequester() }
    val firstPlayableIndex = items.indexOfFirst { it.playbackUrls.isNotEmpty() }
    val isChannelSection = title.contains("canal", ignoreCase = true)

    LaunchedEffect(isTelevision, items.size, firstPlayableIndex) {
        if (isTelevision) {
            delay(240)
            runCatching {
                if (firstPlayableIndex >= 0) {
                    firstItemRequester.requestFocus()
                } else {
                    backRequester.requestFocus()
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background)
            .padding(horizontal = if (isTelevision) 52.dp else 18.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = if (isTelevision) 28.dp else 18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Roneca Player TV",
                    color = RonecaColors.Primary,
                    fontSize = if (isTelevision) 14.sp else 11.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = title,
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 34.sp else 27.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = "${items.size} itens disponíveis",
                    color = RonecaColors.TextSecondary,
                    fontSize = if (isTelevision) 15.sp else 13.sp,
                )
            }

            CompactActionButton(
                label = "Voltar",
                enabled = true,
                isTelevision = isTelevision,
                modifier = Modifier.width(if (isTelevision) 205.dp else 145.dp),
                focusRequester = if (firstPlayableIndex < 0) backRequester else null,
                accentColor = RonecaColors.Primary,
                onClick = onBack,
            )
        }

        Spacer(modifier = Modifier.height(if (isTelevision) 24.dp else 16.dp))

        if (items.isEmpty()) {
            Text(
                text = "Nenhum conteúdo disponível nesta seção.",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 20.sp else 16.sp,
            )
            return@Column
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(
                when {
                    isTelevision && isChannelSection -> 4
                    isTelevision -> 6
                    isChannelSection -> 2
                    else -> 3
                },
            ),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentPadding = PaddingValues(bottom = 42.dp),
            horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 16.dp else 10.dp),
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 18.dp else 12.dp),
        ) {
            itemsIndexed(
                items = items,
                key = { _, item -> item.id },
            ) { index, item ->
                CatalogMediaCard(
                    item = item,
                    isTelevision = isTelevision,
                    isChannel = isChannelSection,
                    focusRequester = if (index == firstPlayableIndex) firstItemRequester else null,
                    onClick = { if (item.playbackUrls.isNotEmpty()) onPlay(item) },
                )
            }
        }
    }
}

@Composable
private fun CatalogMediaCard(
    item: CatalogListItem,
    isTelevision: Boolean,
    isChannel: Boolean,
    focusRequester: FocusRequester?,
    onClick: () -> Unit,
) {
    val playable = item.playbackUrls.isNotEmpty()
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val focusModifier = if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier

    Column(
        modifier = Modifier
            .then(focusModifier)
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (playable && event.type == KeyEventType.KeyDown && (
                        event.key == Key.DirectionCenter ||
                            event.key == Key.Enter ||
                            event.key == Key.NumPadEnter
                        )
                ) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .graphicsLayer {
                val scale = if (focused && isTelevision) 1.035f else 1f
                scaleX = scale
                scaleY = scale
                alpha = if (playable) 1f else 0.58f
                shadowElevation = if (focused) 10.dp.toPx() else 1.dp.toPx()
            }
            .clickable(
                enabled = playable,
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable(enabled = playable),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(if (isChannel) 1.55f else 0.68f)
                .clip(RoundedCornerShape(14.dp))
                .background(RonecaColors.Surface)
                .border(
                    width = if (focused) 2.dp else 1.dp,
                    color = if (focused) Color.White else RonecaColors.Divider,
                    shape = RoundedCornerShape(14.dp),
                ),
        ) {
            if (!item.imageUrl.isNullOrBlank()) {
                RonecaAsyncImage(
                    model = item.imageUrl,
                    contentDescription = item.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = if (isChannel) ContentScale.Fit else ContentScale.Crop,
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.linearGradient(
                                listOf(RonecaColors.SurfaceRaised, RonecaColors.BackgroundSoft),
                            ),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (isChannel) "TV" else "PLAY",
                        color = RonecaColors.TextMuted,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            if (!playable) {
                Text(
                    text = "Detalhes",
                    color = RonecaColors.TextSecondary,
                    fontSize = 11.sp,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xCC111318))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = item.title,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 14.sp else 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
        Text(
            text = item.subtitle,
            color = RonecaColors.TextMuted,
            fontSize = if (isTelevision) 11.sp else 10.sp,
            maxLines = 1,
        )
    }
}
