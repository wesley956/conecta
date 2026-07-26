package com.ronecaplaytv.nativeapp.ui.movies

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
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
import coil3.compose.AsyncImage
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.components.ronecaFocusScale

@Composable
fun MovieDetailScreen(
    movie: NativeMovie,
    recommendations: List<NativeMovie>,
    isFavorite: Boolean,
    isTelevision: Boolean,
    onBack: () -> Unit,
    onToggleFavorite: () -> Unit,
    onPlay: (NativeMovie) -> Unit,
    onOpenRecommendation: (NativeMovie) -> Unit,
) {
    BackHandler(onBack = onBack)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {
                    onBack()
                    true
                } else {
                    false
                }
            }
            .verticalScroll(rememberScrollState())
            .padding(
                horizontal = if (isTelevision) 28.dp else 18.dp,
                vertical = if (isTelevision) 20.dp else 18.dp,
            ),
    ) {
        BackControl(isTelevision = isTelevision, onBack = onBack)
        Spacer(modifier = Modifier.height(14.dp))

        if (isTelevision) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(26.dp),
                verticalAlignment = Alignment.Top,
            ) {
                MovieCover(movie = movie, modifier = Modifier.width(220.dp).height(330.dp))
                MovieInfo(
                    movie = movie,
                    isFavorite = isFavorite,
                    isTelevision = true,
                    modifier = Modifier.weight(1f),
                    onPlay = { onPlay(movie) },
                    onToggleFavorite = onToggleFavorite,
                )
            }
        } else {
            MovieCover(
                movie = movie,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(430.dp),
            )
            Spacer(modifier = Modifier.height(18.dp))
            MovieInfo(
                movie = movie,
                isFavorite = isFavorite,
                isTelevision = false,
                modifier = Modifier.fillMaxWidth(),
                onPlay = { onPlay(movie) },
                onToggleFavorite = onToggleFavorite,
            )
        }

        if (recommendations.isNotEmpty()) {
            Spacer(modifier = Modifier.height(if (isTelevision) 28.dp else 24.dp))
            Text(
                text = "Você também pode gostar",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 21.sp else 18.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Títulos do mesmo estilo",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
            )
            Spacer(modifier = Modifier.height(12.dp))
            LazyRow(
                contentPadding = PaddingValues(bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(recommendations, key = NativeMovie::id) { item ->
                    RecommendationCard(
                        movie = item,
                        isTelevision = isTelevision,
                        onClick = { onOpenRecommendation(item) },
                    )
                }
            }
        }
    }
}

@Composable
private fun BackControl(isTelevision: Boolean, onBack: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .clip(RoundedCornerShape(999.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.PrimaryStrong else RonecaColors.Border,
                shape = RoundedCornerShape(999.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter ||
                        event.key == Key.Enter ||
                        event.key == Key.NumPadEnter)
                ) {
                    onBack()
                    true
                } else {
                    false
                }
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onBack)
            .focusable()
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = "←  Voltar",
            color = RonecaColors.Primary,
            fontSize = if (isTelevision) 13.sp else 12.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun MovieCover(movie: NativeMovie, modifier: Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (!movie.coverUrl.isNullOrBlank()) {
            AsyncImage(
                model = movie.coverUrl,
                contentDescription = movie.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text(text = "FILME", color = RonecaColors.TextMuted)
        }
        Row(
            modifier = Modifier.align(Alignment.TopStart),
        ) {
            Box(modifier = Modifier.width(34.dp).height(3.dp).background(RonecaColors.Primary))
            Box(modifier = Modifier.width(12.dp).height(3.dp).background(RonecaColors.RedStrong))
        }
    }
}

@Composable
private fun MovieInfo(
    movie: NativeMovie,
    isFavorite: Boolean,
    isTelevision: Boolean,
    modifier: Modifier,
    onPlay: () -> Unit,
    onToggleFavorite: () -> Unit,
) {
    Column(modifier = modifier) {
        Text(
            text = movie.category.ifBlank { "Filme" }.uppercase(),
            color = RonecaColors.Primary,
            fontSize = if (isTelevision) 12.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = movie.name,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 32.sp else 27.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(9.dp))
        Text(
            text = listOfNotNull(movie.year?.toString(), movie.duration, movie.category).joinToString(" • "),
            color = RonecaColors.TextSecondary,
            fontSize = if (isTelevision) 14.sp else 13.sp,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = movie.synopsis?.takeIf(String::isNotBlank)
                ?: "Sinopse não informada para este título.",
            color = RonecaColors.BodyText,
            fontSize = if (isTelevision) 15.sp else 14.sp,
            lineHeight = if (isTelevision) 22.sp else 21.sp,
        )
        Spacer(modifier = Modifier.height(22.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            DetailActionButton(
                label = "▶  Assistir agora",
                primary = true,
                enabled = movie.playbackUrls.isNotEmpty() || movie.primaryUrl.isNotBlank(),
                isTelevision = isTelevision,
                onClick = onPlay,
            )
            DetailActionButton(
                label = if (isFavorite) "★  Na Minha Lista" else "☆  Minha Lista",
                primary = false,
                enabled = true,
                isTelevision = isTelevision,
                onClick = onToggleFavorite,
            )
        }
    }
}

@Composable
private fun DetailActionButton(
    label: String,
    primary: Boolean,
    enabled: Boolean,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val background = when {
        !enabled -> RonecaColors.Surface
        primary -> RonecaColors.Primary
        focused -> RonecaColors.SurfaceRaised
        else -> RonecaColors.Surface
    }
    val foreground = if (primary && enabled) Color(0xFF100E08) else RonecaColors.TextPrimary

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(background)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    !enabled -> RonecaColors.Border
                    focused -> RonecaColors.RedStrong
                    primary -> RonecaColors.PrimaryStrong
                    else -> RonecaColors.Border
                },
                shape = RoundedCornerShape(999.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    enabled && event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .clickable(
                enabled = enabled,
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable(enabled = enabled)
            .padding(
                horizontal = if (isTelevision) 22.dp else 17.dp,
                vertical = if (isTelevision) 13.dp else 12.dp,
            ),
    ) {
        Text(
            text = label,
            color = foreground,
            fontSize = if (isTelevision) 14.sp else 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun RecommendationCard(
    movie: NativeMovie,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val width = if (isTelevision) 135.dp else 118.dp

    Column(
        modifier = Modifier
            .width(width)
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .clip(RoundedCornerShape(12.dp))
            .background(RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(7.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(9.dp))
                .background(RonecaColors.BackgroundSoft),
        ) {
            if (!movie.coverUrl.isNullOrBlank()) {
                AsyncImage(
                    model = movie.coverUrl,
                    contentDescription = movie.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }
        }
        Spacer(modifier = Modifier.height(7.dp))
        Text(
            text = movie.name,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 11.sp else 10.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
        )
    }
}
