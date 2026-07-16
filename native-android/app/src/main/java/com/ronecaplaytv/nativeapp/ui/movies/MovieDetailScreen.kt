package com.ronecaplaytv.nativeapp.ui.movies

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

@Composable
fun MovieDetailScreen(
    movie: NativeMovie,
    isTelevision: Boolean,
    onBack: () -> Unit,
    onPlay: (NativeMovie) -> Unit,
) {
    BackHandler(onBack = onBack)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background)
            .verticalScroll(rememberScrollState())
            .padding(
                horizontal = if (isTelevision) 52.dp else 18.dp,
                vertical = if (isTelevision) 30.dp else 20.dp,
            ),
    ) {
        Text(
            text = "← Voltar",
            color = RonecaColors.Primary,
            fontSize = if (isTelevision) 15.sp else 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(bottom = 18.dp),
        )

        if (isTelevision) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(30.dp),
                verticalAlignment = Alignment.Top,
            ) {
                MovieCover(movie = movie, modifier = Modifier.width(250.dp).height(375.dp))
                MovieInfo(
                    movie = movie,
                    isTelevision = true,
                    modifier = Modifier.weight(1f),
                    onPlay = { onPlay(movie) },
                )
            }
        } else {
            MovieCover(
                movie = movie,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(430.dp),
            )
            Spacer(modifier = Modifier.height(20.dp))
            MovieInfo(
                movie = movie,
                isTelevision = false,
                modifier = Modifier.fillMaxWidth(),
                onPlay = { onPlay(movie) },
            )
        }
    }
}

@Composable
private fun MovieCover(
    movie: NativeMovie,
    modifier: Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(12.dp)),
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
    }
}

@Composable
private fun MovieInfo(
    movie: NativeMovie,
    isTelevision: Boolean,
    modifier: Modifier,
    onPlay: () -> Unit,
) {
    Column(modifier = modifier) {
        Text(
            text = movie.category.ifBlank { "Filme" }.uppercase(),
            color = RonecaColors.Purple,
            fontSize = if (isTelevision) 13.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.1.sp,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = movie.name,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 34.sp else 27.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = listOfNotNull(
                movie.year?.toString(),
                movie.duration,
                movie.category,
            ).joinToString(" • "),
            color = RonecaColors.TextSecondary,
            fontSize = if (isTelevision) 15.sp else 13.sp,
        )
        Spacer(modifier = Modifier.height(18.dp))
        Text(
            text = movie.synopsis?.takeIf(String::isNotBlank)
                ?: "Sinopse não informada para este título.",
            color = RonecaColors.BodyText,
            fontSize = if (isTelevision) 16.sp else 14.sp,
            lineHeight = if (isTelevision) 24.sp else 21.sp,
        )
        Spacer(modifier = Modifier.height(26.dp))
        FocusableActionCard(
            title = "Assistir agora",
            subtitle = "Abrir no player nativo",
            badge = "▶",
            enabled = movie.playbackUrls.isNotEmpty() || movie.primaryUrl.isNotBlank(),
            isTelevision = isTelevision,
            accentColor = RonecaColors.Primary,
            modifier = Modifier
                .fillMaxWidth(if (isTelevision) 0.58f else 1f)
                .height(if (isTelevision) 104.dp else 92.dp),
            onClick = onPlay,
        )
    }
}
