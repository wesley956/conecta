package com.ronecaplaytv.nativeapp.ui.movies

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

@Composable
fun MoviesScreen(
    movies: List<NativeMovie>,
    isTelevision: Boolean,
    onOpenDetails: (NativeMovie) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var selectedCategory by rememberSaveable { mutableStateOf("Todos") }

    val categories = remember(movies) {
        listOf("Todos") + movies.map { it.category.ifBlank { "Outros" } }.distinct().sorted()
    }
    val filtered = remember(movies, query, selectedCategory) {
        movies.filter { movie ->
            (selectedCategory == "Todos" || movie.category == selectedCategory) &&
                (query.isBlank() || movie.name.contains(query, ignoreCase = true))
        }
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
                text = "Filmes",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 30.sp else 24.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "${filtered.size} títulos disponíveis",
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 14.sp else 12.sp,
            )
            Spacer(modifier = Modifier.height(14.dp))
            MovieSearchField(
                value = query,
                onValueChange = { query = it },
                isTelevision = isTelevision,
            )
            Spacer(modifier = Modifier.height(10.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(categories.size) { index ->
                    val category = categories[index]
                    MovieCategoryChip(
                        label = category,
                        selected = selectedCategory == category,
                        onClick = { selectedCategory = category },
                    )
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(if (isTelevision) 5 else 2),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = if (isTelevision) 52.dp else 18.dp,
                end = if (isTelevision) 52.dp else 18.dp,
                bottom = 28.dp,
            ),
            horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 14.dp else 10.dp),
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 18.dp else 14.dp),
        ) {
            items(filtered, key = NativeMovie::id) { movie ->
                MoviePosterCard(
                    movie = movie,
                    isTelevision = isTelevision,
                    onClick = { onOpenDetails(movie) },
                )
            }
        }
    }
}

@Composable
private fun MovieSearchField(
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
                text = "Buscar filmes...",
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
private fun MovieCategoryChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) RonecaColors.Purple.copy(alpha = 0.14f) else RonecaColors.Surface)
            .border(
                width = 1.dp,
                color = if (selected) RonecaColors.Purple else RonecaColors.Border,
                shape = RoundedCornerShape(8.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (selected) Color(0xFFBFA7FF) else RonecaColors.TextSecondary,
            fontSize = 12.sp,
        )
    }
}

@Composable
private fun MoviePosterCard(
    movie: NativeMovie,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(2f / 3f)
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
                    event.type == KeyEventType.KeyUp &&
                    (event.key == Key.DirectionCenter || event.key == Key.Enter)
                ) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable(),
    ) {
        if (!movie.coverUrl.isNullOrBlank()) {
            AsyncImage(
                model = movie.coverUrl,
                contentDescription = movie.name,
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

        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp)
                .background(RonecaColors.Purple.copy(alpha = 0.82f), RoundedCornerShape(6.dp))
                .padding(horizontal = 8.dp, vertical = 5.dp),
        ) {
            Text(
                text = movie.category.ifBlank { "Filme" },
                color = Color.White,
                fontSize = if (isTelevision) 10.sp else 9.sp,
                maxLines = 1,
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(10.dp),
        ) {
            Text(
                text = movie.name,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 14.sp else 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
            )
            Text(
                text = listOfNotNull(movie.year?.toString(), movie.duration).joinToString(" • "),
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 11.sp else 10.sp,
                maxLines = 1,
            )
        }
    }
}
