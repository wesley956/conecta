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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
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
            delay(220)
            runCatching { firstFocusRequester.requestFocus() }
        }
    }

    val destinations = listOf(
        QuickDestination("TV ao vivo", "Programação agora", channelCount, "TV", onOpenChannels),
        QuickDestination("Filmes", "Catálogo de cinema", movieCount, "F", onOpenMovies),
        QuickDestination("Séries", "Temporadas e episódios", seriesCount, "S", onOpenSeries),
        QuickDestination("Minha lista", "Favoritos e progresso", null, "♡", onOpenPlayback),
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentPadding = PaddingValues(
            start = if (isWideLayout) 24.dp else 18.dp,
            end = if (isWideLayout) 24.dp else 18.dp,
            top = if (isWideLayout) 16.dp else 18.dp,
            bottom = 28.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(if (isWideLayout) 14.dp else 16.dp),
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

        if (isWideLayout) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(if (isTelevision) 260.dp else 225.dp),
                    horizontalArrangement = Arrangement.spacedBy(13.dp),
                ) {
                    HomeHero(
                        movie = featuredMovie,
                        statusText = statusText,
                        hasError = catalogError != null,
                        isTelevision = isTelevision,
                        isWideLayout = true,
                        firstFocusRequester = firstFocusRequester,
                        onPrimary = {
                            if (featuredMovie != null) onOpenFeatured(featuredMovie) else onOpenMovies()
                        },
                        onLive = onOpenChannels,
                        modifier = Modifier
                            .weight(1.72f)
                            .fillMaxHeight(),
                    )

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        verticalArrangement = Arrangement.spacedBy(9.dp),
                    ) {
                        Row(
                            modifier = Modifier.weight(1f),
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                        ) {
                            destinations.take(2).forEach { destination ->
                                QuickAccessCard(
                                    destination = destination,
                                    isTelevision = isTelevision,
                                    compact = true,
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxHeight(),
                                )
                            }
                        }
                        Row(
                            modifier = Modifier.weight(1f),
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                        ) {
                            destinations.drop(2).forEach { destination ->
                                QuickAccessCard(
                                    destination = destination,
                                    isTelevision = isTelevision,
                                    compact = true,
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxHeight(),
                                )
                            }
                        }
                    }
                }
            }
        } else {
            item {
                HomeHero(
                    movie = featuredMovie,
                    statusText = statusText,
                    hasError = catalogError != null,
                    isTelevision = false,
                    isWideLayout = false,
                    firstFocusRequester = firstFocusRequester,
                    onPrimary = {
                        if (featuredMovie != null) onOpenFeatured(featuredMovie) else onOpenMovies()
                    },
                    onLive = onOpenChannels,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(238.dp),
                )
            }
            item {
                Text(
                    text = "Explorar",
                    color = RonecaColors.TextPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    destinations.take(2).forEach { destination ->
                        QuickAccessCard(
                            destination = destination,
                            isTelevision = false,
                            compact = false,
                            modifier = Modifier
                                .weight(1f)
                                .height(96.dp),
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
                            compact = false,
                            modifier = Modifier
                                .weight(1f)
                                .height(96.dp),
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
                fontSize = if (isWideLayout) 10.sp else 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.8.sp,
            )
            Text(
                text = "Início",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 26.sp else if (isWideLayout) 23.sp else 22.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HeaderAction(label = "⌕  Buscar", onClick = onOpenSearch)
            if (isWideLayout) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(RonecaColors.Surface)
                        .border(1.dp, RonecaColors.Border, RoundedCornerShape(999.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .width(7.dp)
                            .height(7.dp)
                            .clip(CircleShape)
                            .background(RonecaColors.RedStrong),
                    )
                    Text(
                        text = deviceCode ?: "Aparelho ativo",
                        color = RonecaColors.TextSecondary,
                        fontSize = 10.sp,
                    )
                    if (!expiresAt.isNullOrBlank()) {
                        Text(text = "•", color = RonecaColors.TextMuted, fontSize = 10.sp)
                        Text(text = "Ativo", color = RonecaColors.Primary, fontSize = 10.sp)
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
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 8.dp),
    ) {
        Text(text = label, color = RonecaColors.TextSecondary, fontSize = 11.sp)
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
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(if (isWideLayout) 18.dp else 16.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(if (isWideLayout) 18.dp else 16.dp)),
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
                            Color(0xFC050505),
                            Color(0xE8050505),
                            Color(0x8A050505),
                            Color(0x24050505),
                        ),
                    ),
                ),
        )

        Row(modifier = Modifier.align(Alignment.TopStart)) {
            Box(modifier = Modifier.width(48.dp).height(3.dp).background(RonecaColors.Primary))
            Box(modifier = Modifier.width(15.dp).height(3.dp).background(RonecaColors.RedStrong))
        }

        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxWidth(if (isWideLayout) 0.72f else 0.92f)
                .padding(if (isWideLayout) 24.dp else 20.dp),
        ) {
            Text(
                text = movie?.category?.uppercase() ?: "RONECAPLAYTV",
                color = RonecaColors.Primary,
                fontSize = if (isWideLayout) 10.sp else 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.4.sp,
                maxLines = 1,
            )
            Spacer(modifier = Modifier.height(7.dp))
            Text(
                text = movie?.name ?: "Sua programação em um só lugar",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 31.sp else if (isWideLayout) 27.sp else 25.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = movie?.synopsis?.takeIf { it.isNotBlank() } ?: statusText,
                color = if (hasError) RonecaColors.Error else RonecaColors.TextSecondary,
                fontSize = if (isWideLayout) 12.sp else 12.sp,
                maxLines = if (isWideLayout) 2 else 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(15.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
                color = when {
                    focused -> RonecaColors.RedStrong
                    primary -> RonecaColors.PrimaryStrong
                    else -> RonecaColors.Border
                },
                shape = RoundedCornerShape(999.dp),
            )
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 16.dp, vertical = 9.dp),
    ) {
        Text(
            text = label,
            color = if (primary) Color(0xFF17130A) else RonecaColors.TextPrimary,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun QuickAccessCard(
    destination: QuickDestination,
    isTelevision: Boolean,
    compact: Boolean,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
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
            .clip(RoundedCornerShape(13.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(13.dp),
            )
            .clickable(interactionSource = interactionSource, indication = null, onClick = destination.action)
            .focusable(),
    ) {
        Row(modifier = Modifier.align(Alignment.TopStart)) {
            Box(modifier = Modifier.width(if (compact) 24.dp else 31.dp).height(3.dp).background(RonecaColors.Primary))
            Box(modifier = Modifier.width(if (compact) 9.dp else 11.dp).height(3.dp).background(RonecaColors.RedStrong))
        }

        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(if (compact) 11.dp else 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 11.dp),
        ) {
            Box(
                modifier = Modifier
                    .width(if (compact) 30.dp else 36.dp)
                    .height(if (compact) 30.dp else 36.dp)
                    .clip(CircleShape)
                    .background(RonecaColors.Primary.copy(alpha = 0.10f))
                    .border(1.dp, RonecaColors.Primary.copy(alpha = 0.46f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = destination.symbol,
                    color = RonecaColors.Primary,
                    fontSize = if (compact) 10.sp else 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = destination.title,
                    color = RonecaColors.TextPrimary,
                    fontSize = if (compact) 11.sp else 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
                Text(
                    text = destination.subtitle,
                    color = RonecaColors.TextSecondary,
                    fontSize = if (compact) 8.sp else 9.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            destination.count?.let { count ->
                Text(
                    text = count.toString(),
                    color = if (focused) RonecaColors.RedStrong else RonecaColors.TextMuted,
                    fontSize = if (compact) 9.sp else 10.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}
