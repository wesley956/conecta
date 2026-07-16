package com.ronecaplaytv.nativeapp.ui.home

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
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

private enum class QuickKind {
    Live,
    Movies,
    Series,
    MyList,
}

private data class QuickDestination(
    val title: String,
    val count: Int?,
    val kind: QuickKind,
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
        QuickDestination("TV ao vivo", channelCount, QuickKind.Live, onOpenChannels),
        QuickDestination("Filmes", movieCount, QuickKind.Movies, onOpenMovies),
        QuickDestination("Séries", seriesCount, QuickKind.Series, onOpenSeries),
        QuickDestination("Minha lista", null, QuickKind.MyList, onOpenPlayback),
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
        verticalArrangement = Arrangement.spacedBy(if (isWideLayout) 14.dp else 18.dp),
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
                        .height(if (isTelevision) 236.dp else 212.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
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
                            .weight(1f)
                            .fillMaxHeight(),
                    )

                    ModernExploreRail(
                        destinations = destinations,
                        isTelevision = isTelevision,
                        modifier = Modifier
                            .width(if (isTelevision) 254.dp else 224.dp)
                            .fillMaxHeight(),
                    )
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
                        .height(232.dp),
                )
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                text = "Explorar",
                                color = RonecaColors.TextPrimary,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "Acesso direto ao seu conteúdo",
                                color = RonecaColors.TextMuted,
                                fontSize = 10.sp,
                            )
                        }
                        AccentCut()
                    }
                    MobileExploreDock(destinations = destinations)
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
                            .size(7.dp)
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
                            Color(0x92050505),
                            Color(0x30050505),
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
                .fillMaxWidth(if (isWideLayout) 0.68f else 0.92f)
                .padding(if (isWideLayout) 22.dp else 19.dp),
        ) {
            Text(
                text = movie?.category?.uppercase() ?: "RONECAPLAYTV",
                color = RonecaColors.Primary,
                fontSize = if (isWideLayout) 10.sp else 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.4.sp,
                maxLines = 1,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = movie?.name ?: "Sua programação em um só lugar",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 29.sp else if (isWideLayout) 25.sp else 24.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = movie?.synopsis?.takeIf { it.isNotBlank() } ?: statusText,
                color = if (hasError) RonecaColors.Error else RonecaColors.TextSecondary,
                fontSize = 12.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(14.dp))
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
private fun MobileExploreDock(destinations: List<QuickDestination>) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        destinations.forEach { destination ->
            MobileExploreItem(
                destination = destination,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MobileExploreItem(
    destination: QuickDestination,
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
            .clickable(interactionSource = interactionSource, indication = null, onClick = destination.action)
            .focusable()
            .padding(horizontal = 2.dp, vertical = 3.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
                .border(
                    width = if (focused) 2.dp else 1.dp,
                    color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            QuickGlyph(
                kind = destination.kind,
                color = if (focused) RonecaColors.PrimaryStrong else RonecaColors.Primary,
                modifier = Modifier.size(24.dp),
            )
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .width(16.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(RonecaColors.RedStrong),
            )
        }
        Spacer(modifier = Modifier.height(7.dp))
        Text(
            text = destination.title,
            color = if (focused) RonecaColors.TextPrimary else RonecaColors.BodyText,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        destination.count?.let { count ->
            Text(
                text = compactNumber(count),
                color = RonecaColors.TextMuted,
                fontSize = 8.sp,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun ModernExploreRail(
    destinations: List<QuickDestination>,
    isTelevision: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Explorar",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 15.sp else 13.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Navegação rápida",
                    color = RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 10.sp else 9.sp,
                )
            }
            AccentCut()
        }

        destinations.forEach { destination ->
            ExploreRailItem(
                destination = destination,
                isTelevision = isTelevision,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ExploreRailItem(
    destination: QuickDestination,
    isTelevision: Boolean,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = modifier
            .fillMaxWidth()
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
            .background(if (focused) RonecaColors.SurfaceRaised else Color.Transparent)
            .border(
                width = if (focused) 1.dp else 0.dp,
                color = if (focused) RonecaColors.Primary else Color.Transparent,
                shape = RoundedCornerShape(13.dp),
            )
            .clickable(interactionSource = interactionSource, indication = null, onClick = destination.action)
            .focusable()
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(if (isTelevision) 37.dp else 33.dp)
                .clip(CircleShape)
                .background(RonecaColors.Surface)
                .border(
                    width = 1.dp,
                    color = if (focused) RonecaColors.RedStrong else RonecaColors.Border,
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            QuickGlyph(
                kind = destination.kind,
                color = if (focused) RonecaColors.PrimaryStrong else RonecaColors.Primary,
                modifier = Modifier.size(if (isTelevision) 19.dp else 17.dp),
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = destination.title,
                color = if (focused) RonecaColors.TextPrimary else RonecaColors.BodyText,
                fontSize = if (isTelevision) 12.sp else 10.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            destination.count?.let { count ->
                Text(
                    text = "${compactNumber(count)} itens",
                    color = RonecaColors.TextMuted,
                    fontSize = if (isTelevision) 9.sp else 8.sp,
                    maxLines = 1,
                )
            }
        }

        Text(
            text = "›",
            color = if (focused) RonecaColors.RedStrong else RonecaColors.TextMuted,
            fontSize = if (isTelevision) 20.sp else 17.sp,
            fontWeight = FontWeight.Light,
        )
    }
}

@Composable
private fun AccentCut() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.width(28.dp).height(2.dp).background(RonecaColors.Primary))
        Box(modifier = Modifier.width(9.dp).height(2.dp).background(RonecaColors.RedStrong))
    }
}

private fun compactNumber(value: Int): String = when {
    value >= 1_000_000 -> "${value / 1_000_000} mi"
    value >= 1_000 -> "${value / 1_000} mil"
    else -> value.toString()
}

@Composable
private fun QuickGlyph(
    kind: QuickKind,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val stroke = Stroke(width = size.minDimension * 0.082f)
        val w = size.width
        val h = size.height

        when (kind) {
            QuickKind.Live -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.12f, h * 0.25f),
                    size = Size(w * 0.76f, h * 0.58f),
                    cornerRadius = CornerRadius(w * 0.10f),
                    style = stroke,
                )
                drawLine(color, Offset(w * 0.36f, h * 0.10f), Offset(w * 0.50f, h * 0.25f), strokeWidth = stroke.width)
                drawLine(color, Offset(w * 0.64f, h * 0.10f), Offset(w * 0.50f, h * 0.25f), strokeWidth = stroke.width)
                drawCircle(color, radius = w * 0.055f, center = Offset(w * 0.50f, h * 0.54f))
            }

            QuickKind.Movies -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(w * 0.18f, h * 0.10f),
                    size = Size(w * 0.64f, h * 0.80f),
                    cornerRadius = CornerRadius(w * 0.08f),
                    style = stroke,
                )
                listOf(0.28f, 0.50f, 0.72f).forEach { y ->
                    drawCircle(color, radius = w * 0.035f, center = Offset(w * 0.27f, h * y))
                    drawCircle(color, radius = w * 0.035f, center = Offset(w * 0.73f, h * y))
                }
            }

            QuickKind.Series -> {
                repeat(3) { index ->
                    val offset = index * w * 0.10f
                    drawRoundRect(
                        color = color.copy(alpha = 1f - index * 0.18f),
                        topLeft = Offset(w * 0.16f + offset, h * 0.18f + offset * 0.35f),
                        size = Size(w * 0.58f, h * 0.62f),
                        cornerRadius = CornerRadius(w * 0.08f),
                        style = stroke,
                    )
                }
            }

            QuickKind.MyList -> {
                val path = Path().apply {
                    moveTo(w * 0.25f, h * 0.13f)
                    lineTo(w * 0.75f, h * 0.13f)
                    lineTo(w * 0.75f, h * 0.88f)
                    lineTo(w * 0.50f, h * 0.70f)
                    lineTo(w * 0.25f, h * 0.88f)
                    close()
                }
                drawPath(path, color = color, style = stroke)
            }
        }
    }
}
