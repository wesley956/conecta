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
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.components.ronecaFocusScale
import kotlinx.coroutines.delay

private const val FILTER_ALL = "Todos"
private const val FILTER_FAVORITES = "Minha Lista"
private const val FILTER_CONTINUE = "Continuar"

@Composable
fun MoviesScreen(
    movies: List<NativeMovie>,
    isTelevision: Boolean,
    favoriteIds: Set<String>,
    startedIds: Set<String>,
    onOpenDetails: (NativeMovie) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var selectedCategory by rememberSaveable { mutableStateOf(FILTER_ALL) }
    var lastFocusedMovieId by rememberSaveable { mutableStateOf<String?>(null) }
    var appliedFilterSignature by rememberSaveable { mutableStateOf("") }
    var searchFocused by remember { mutableStateOf(false) }

    val gridState = rememberLazyGridState()
    val categoryState = rememberLazyListState()
    val restoreFocusRequester = remember { FocusRequester() }

    val categories = remember(movies) {
        listOf(FILTER_ALL, FILTER_FAVORITES, FILTER_CONTINUE) +
            movies.map { it.category.ifBlank { "Outros" } }.distinct().sorted()
    }
    val filtered = remember(movies, query, selectedCategory, favoriteIds, startedIds) {
        movies.filter { movie ->
            val categoryMatches = when (selectedCategory) {
                FILTER_ALL -> true
                FILTER_FAVORITES -> movie.id in favoriteIds
                FILTER_CONTINUE -> movie.id in startedIds
                else -> movie.category == selectedCategory
            }
            categoryMatches && (query.isBlank() || movie.name.contains(query, ignoreCase = true))
        }
    }

    val filteredMovieIds = remember(filtered) {
        filtered.map(NativeMovie::id)
    }

    val filterSignature = remember(query, selectedCategory, favoriteIds, startedIds) {
        buildString {
            append(query.trim().lowercase())
            append('|')
            append(selectedCategory)
            if (selectedCategory == FILTER_FAVORITES) append('|').append(favoriteIds.hashCode())
            if (selectedCategory == FILTER_CONTINUE) append('|').append(startedIds.hashCode())
        }
    }

    LaunchedEffect(filterSignature, filteredMovieIds, isTelevision) {
        val firstId = filteredMovieIds.firstOrNull()
        if (appliedFilterSignature != filterSignature) {
            appliedFilterSignature = filterSignature
            lastFocusedMovieId = firstId
            if (filtered.isNotEmpty()) gridState.scrollToItem(0)
        } else if (lastFocusedMovieId !in filteredMovieIds) {
            lastFocusedMovieId = firstId
        }

        if (isTelevision && !searchFocused && lastFocusedMovieId != null) {
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
                            text = "Filmes",
                            color = RonecaColors.TextPrimary,
                            fontSize = 25.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "${filtered.size} títulos",
                            color = RonecaColors.TextSecondary,
                            fontSize = 12.sp,
                        )
                    }
                    MovieSearchField(
                        value = query,
                        onValueChange = { query = it },
                        isTelevision = true,
                        onFocusChanged = { searchFocused = it },
                        modifier = Modifier.weight(0.66f),
                    )
                }
            } else {
                Text(
                    text = "Filmes",
                    color = RonecaColors.TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "${filtered.size} títulos disponíveis",
                    color = RonecaColors.TextSecondary,
                    fontSize = 12.sp,
                )
                Spacer(modifier = Modifier.height(14.dp))
                MovieSearchField(
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
                    MovieCategoryChip(
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
            contentPadding = PaddingValues(
                start = sidePadding,
                end = sidePadding,
                bottom = 28.dp,
            ),
            horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 11.dp else 10.dp),
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 12.dp else 14.dp),
        ) {
            items(filtered, key = NativeMovie::id) { movie ->
                val focusModifier = if (movie.id == lastFocusedMovieId) {
                    Modifier.focusRequester(restoreFocusRequester)
                } else {
                    Modifier
                }
                MoviePosterCard(
                    movie = movie,
                    isTelevision = isTelevision,
                    favorite = movie.id in favoriteIds,
                    started = movie.id in startedIds,
                    modifier = focusModifier,
                    onFocused = { lastFocusedMovieId = movie.id },
                    onClick = {
                        lastFocusedMovieId = movie.id
                        onOpenDetails(movie)
                    },
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
                text = "⌕  Buscar filme",
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
private fun MovieCategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
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
private fun MoviePosterCard(
    movie: NativeMovie,
    isTelevision: Boolean,
    favorite: Boolean,
    started: Boolean,
    modifier: Modifier = Modifier,
    onFocused: () -> Unit,
    onClick: () -> Unit,
) {
    var focused by remember(movie.id) { mutableStateOf(false) }
    val interactionSource = remember(movie.id) { MutableInteractionSource() }

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

        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(7.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            if (favorite) Badge("★", RonecaColors.Primary)
            if (started) Badge("CONTINUAR", RonecaColors.RedStrong)
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(if (isTelevision) 8.dp else 10.dp),
        ) {
            Text(
                text = movie.name,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 12.sp else 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
            )
            Text(
                text = listOfNotNull(movie.year?.toString(), movie.category).joinToString(" • "),
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
