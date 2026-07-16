package com.ronecaplaytv.nativeapp.ui.home

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay

private data class QuickDestination(
    val title: String,
    val subtitle: String,
    val count: Int?,
    val symbol: String,
    val action: () -> Unit,
)

@Composable
fun HomeScreen(
    isTelevision: Boolean,
    isWideLayout: Boolean,
    deviceCode: String?,
    expiresAt: String?,
    loadingSection: String?,
    catalogError: String?,
    channelCount: Int,
    movieCount: Int,
    seriesCount: Int,
    featuredMovie: NativeMovie?,
    onOpenChannels: () -> Unit,
    onOpenMovies: () -> Unit,
    onOpenSeries: () -> Unit,
    onOpenPlayback: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenFeatured: (NativeMovie) -> Unit,
) {
    val firstFocusRequester = remember { FocusRequester() }
    val statusText = when {
        loadingSection != null -> "Sincronizando $loadingSection"
        catalogError != null -> catalogError
        else -> "Catálogo atualizado"
    }

    LaunchedEffect(isWideLayout, featuredMovie?.id, channelCount, movieCount, seriesCount) {
        if (isWideLayout) {
            delay(260)
            runCatching { firstFocusRequester.requestFocus() }
        }
    }

    val destinations = listOf(
        QuickDestination("TV ao vivo", "Programação em tempo real", channelCount, "TV", onOpenChannels),
        QuickDestination("Filmes", "Explore o catálogo", movieCount, "F", onOpenMovies),
        QuickDestination("Séries", "Temporadas e episódios", seriesCount, "S", onOpenSeries),
        QuickDestination("Minha lista", "Favoritos e em andamento", null, "♡", onOpenPlayback),
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentPadding = PaddingValues(
            start = if (isWideLayout) 30.dp else 18.dp,
            end = if (isWideLayout) 30.dp else 18.dp,
            top = if (isWideLayout) 22.dp else 18.dp,
            bottom = 30.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(if (isWideLayout) 22.dp else 16.dp),
    ) {
        item {
            HomeHeader(
                isTelevision = isTelevision,
                isWideLayout = isWideLayout,
                deviceCode = deviceCode,
                expiresAt = expiresAt,
                onOpenSearch = onOpenSearch,
            )
        }

        item {
            HomeHero(
                movie = featuredMovie,
                statusText = statusText,
                hasError = catalogError != null,
                isTelevision = isTelevision,
                isWideLayout = isWideLayout,
                firstFocusRequester = firstFocusRequester,
                onPrimary = {
                    if (featuredMovie != null) onOpenFeatured(featuredMovie) else onOpenMovies()
                },
                onLive = onOpenChannels,
            )
        }

        item {
            Text(
                text = "Explorar",
                color = RonecaColors.TextPrimary,
                fontSize = if (isWideLayout) 20.sp else 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        if (isWideLayout) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    destinations.forEach { destination ->
                        QuickAccessCard(
                            destination = destination,
                            isTelevision = isTelevision,
                            modifier = Modifier
                                .weight(1f)
                                .height(if (isTelevision) 118.dp else 104.dp),
                        )
                    }
                }
            }
        } else {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    destinations.take(2).forEach { destination ->
                        QuickAccessCard(
                            destination = destination,
                            isTelevision = false,
                            modifier = Modifier
                                .weight(1f)
                                .height(112.dp),
                        )
                    }
                }
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    destinations.drop(2).forEach { destination ->
                        QuickAccessCard(
                            destination = destination,
                            isTelevision = false,
                            modifier = Modifier
                                .weight(1f)
                                .height(112.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeHeader(
    isTelevision: Boolean,
    isWideLayout: Boolean,
    deviceCode: String?,
    expiresAt: String?,
    onOpenSearch: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(
                text = "RONECAPLAYTV",
                color = RonecaColors.Primary,
                fontSize = if (isWideLayout) 12.sp else 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
            )
            Text(
                text = "Início",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 30.sp else if (isWideLayout) 26.sp else 23.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HeaderAction(label = "⌕  Buscar", onClick = onOpenSearch)
            if (isWideLayout) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(RonecaColors.Surface)
                        .border(1.dp, RonecaColors.Border, RoundedCornerShape(999.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .width(8.dp)
                            .height(8.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(RonecaColors.Primary),
                    )
                    Text(
                        text = deviceCode ?: "Aparelho ativo",
                        color = RonecaColors.TextSecondary,
                        fontSize = 12.sp,
                    )
                    if (!expiresAt.isNullOrBlank()) {
                        Text(text = "•", color = RonecaColors.TextMuted)
                        Text(text = "Acesso ativo", color = RonecaColors.TextSecondary, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun HeaderAction(label: String, onClick: () -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(999.dp))
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 15.dp, vertical = 10.dp),
    ) {
        Text(text = label, color = RonecaColors.TextSecondary, fontSize = 12.sp)
    }
}

@Composable
private fun HomeHero(
    movie: NativeMovie?,
    statusText: String,
    hasError: Boolean,
    isTelevision: Boolean,
    isWideLayout: Boolean,
    firstFocusRequester: FocusRequester,
    onPrimary: () -> Unit,
    onLive: () -> Unit,
) {
    val heroHeight = when {
        isTelevision -> 330.dp
        isWideLayout -> 285.dp
        else -> 270.dp
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(heroHeight)
            .clip(RoundedCornerShape(if (isWideLayout) 22.dp else 18.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(if (isWideLayout) 22.dp else 18.dp)),
    ) {
        if (!movie?.coverUrl.isNullOrBlank()) {
            AsyncImage(
                model = movie?.coverUrl,
                contentDescription = movie?.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            Color(0xFA050505),
                            Color(0xE6050505),
                            Color(0x99050505),
                            Color(0x33050505),
                        ),
                    ),
                ),
        )

        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxWidth(if (isWideLayout) 0.62f else 0.90f)
                .padding(if (isWideLayout) 34.dp else 22.dp),
        ) {
            Text(
                text = movie?.category?.uppercase() ?: "RONECAPLAYTV",
                color = RonecaColors.Primary,
                fontSize = if (isWideLayout) 12.sp else 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp,
                maxLines = 1,
            )
            Spacer(modifier = Modifier.height(9.dp))
            Text(
                text = movie?.name ?: "Sua programação em um só lugar",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 42.sp else if (isWideLayout) 34.sp else 27.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = movie?.synopsis?.takeIf { it.isNotBlank() } ?: statusText,
                color = if (hasError) RonecaColors.Error else RonecaColors.TextSecondary,
                fontSize = if (isWideLayout) 14.sp else 13.sp,
                maxLines = if (isWideLayout) 3 else 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                HeroButton(
                    label = if (movie != null) "Ver detalhes" else "Explorar filmes",
                    primary = true,
                    focusRequester = firstFocusRequester,
                    onClick = onPrimary,
                )
                HeroButton(label = "TV ao vivo", primary = false, onClick = onLive)
            }
        }
    }
}

@Composable
private fun HeroButton(
    label: String,
    primary: Boolean,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val requestModifier = if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier

    Box(
        modifier = Modifier
            .then(requestModifier)
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter || event.key == Key.NumPadEnter)
                ) {
                    onClick()
                    true
                } else false
            }
            .clip(RoundedCornerShape(999.dp))
            .background(
                if (primary) RonecaColors.PrimaryStrong
                else if (focused) RonecaColors.SurfaceRaised else RonecaColors.SurfaceOverlay,
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (primary) RonecaColors.PrimaryStrong else if (focused) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(999.dp),
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable()
            .padding(horizontal = 20.dp, vertical = 12.dp),
    ) {
        Text(
            text = label,
            color = if (primary) Color(0xFF17130A) else RonecaColors.TextPrimary,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun QuickAccessCard(
    destination: QuickDestination,
    isTelevision: Boolean,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Column(
        modifier = modifier
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter || event.key == Key.NumPadEnter)
                ) {
                    destination.action()
                    true
                } else false
            }
            .clip(RoundedCornerShape(14.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = destination.action,
            )
            .focusable()
            .padding(if (isTelevision) 18.dp else 15.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = destination.symbol,
                color = RonecaColors.Primary,
                fontSize = if (isTelevision) 18.sp else 15.sp,
                fontWeight = FontWeight.Bold,
            )
            destination.count?.let { count ->
                Text(
                    text = count.toString(),
                    color = RonecaColors.TextMuted,
                    fontSize = 11.sp,
                )
            }
        }
        Column {
            Text(
                text = destination.title,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 16.sp else 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            Text(
                text = destination.subtitle,
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 11.sp else 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
