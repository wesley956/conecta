package com.ronecaplaytv.nativeapp.ui.search

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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.ronecaplaytv.nativeapp.ui.components.RonecaAsyncImage
import com.ronecaplaytv.nativeapp.catalog.NativeChannel
import com.ronecaplaytv.nativeapp.catalog.NativeMovie
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.components.ronecaFocusScale
import kotlinx.coroutines.delay

private const val MAX_RESULTS_PER_SECTION = 20

@Composable
fun SearchScreen(
    channels: List<NativeChannel>,
    movies: List<NativeMovie>,
    series: List<NativeSeries>,
    isTelevision: Boolean,
    onBack: () -> Unit,
    onPlayChannel: (NativeChannel) -> Unit,
    onOpenMovie: (NativeMovie) -> Unit,
    onOpenSeries: (NativeSeries) -> Unit,
) {
    BackHandler(onBack = onBack)
    var query by rememberSaveable { mutableStateOf("") }
    var searchFocused by remember { mutableStateOf(false) }
    val searchFocusRequester = remember { FocusRequester() }

    LaunchedEffect(isTelevision) {
        if (isTelevision) {
            delay(160)
            runCatching { searchFocusRequester.requestFocus() }
        }
    }

    // Varredura completa (achado #9): antes cada categoria cortava em 20 resultados sem avisar —
    // uma busca com 45 canais parecia ter exatamente 20, sem nenhum sinal de que faltava gente.
    // Agora guarda a contagem TOTAL de cada categoria separada da lista exibida (limitada a 20),
    // e o cabeçalho da seção mostra "exibindo X de Y" quando há mais resultados do que o limite.
    val channelMatches = remember(channels, query) {
        if (query.isBlank()) emptyList() else channels
            .filter { it.name.contains(query, ignoreCase = true) }
    }
    val movieMatches = remember(movies, query) {
        if (query.isBlank()) emptyList() else movies
            .filter { it.name.contains(query, ignoreCase = true) }
    }
    val seriesMatches = remember(series, query) {
        if (query.isBlank()) emptyList() else series
            .filter { it.name.contains(query, ignoreCase = true) }
    }
    val channelResults = remember(channelMatches) { channelMatches.take(MAX_RESULTS_PER_SECTION) }
    val movieResults = remember(movieMatches) { movieMatches.take(MAX_RESULTS_PER_SECTION) }
    val seriesResults = remember(seriesMatches) { seriesMatches.take(MAX_RESULTS_PER_SECTION) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background),
        contentPadding = PaddingValues(
            start = if (isTelevision) 52.dp else 18.dp,
            end = if (isTelevision) 52.dp else 18.dp,
            top = if (isTelevision) 28.dp else 18.dp,
            bottom = 30.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Busca",
                        color = RonecaColors.TextPrimary,
                        fontSize = if (isTelevision) 30.sp else 24.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "Canais, filmes e séries em um só lugar",
                        color = RonecaColors.TextSecondary,
                        fontSize = if (isTelevision) 14.sp else 12.sp,
                    )
                }
                Text(
                    text = "← Voltar",
                    color = RonecaColors.Primary,
                    fontSize = if (isTelevision) 14.sp else 12.sp,
                    modifier = Modifier.clickable(onClick = onBack).padding(10.dp),
                )
            }
            Spacer(modifier = Modifier.height(14.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (searchFocused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
                    .border(
                        if (searchFocused) 2.dp else 1.dp,
                        if (searchFocused) RonecaColors.Focus else RonecaColors.Primary,
                        RoundedCornerShape(8.dp),
                    )
                    .padding(horizontal = 15.dp, vertical = if (isTelevision) 13.dp else 11.dp),
            ) {
                if (query.isBlank()) {
                    Text(
                        text = "Buscar canais, filmes, séries...",
                        color = RonecaColors.TextMuted,
                        fontSize = if (isTelevision) 16.sp else 14.sp,
                    )
                }
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = TextStyle(
                        color = RonecaColors.BodyText,
                        fontSize = if (isTelevision) 16.sp else 14.sp,
                    ),
                    cursorBrush = SolidColor(RonecaColors.Primary),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(searchFocusRequester)
                        .onFocusChanged { searchFocused = it.isFocused },
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        if (query.isBlank()) {
            item {
                EmptyMessage("Digite um nome para iniciar a busca.", isTelevision)
            }
        } else if (channelResults.isEmpty() && movieResults.isEmpty() && seriesResults.isEmpty()) {
            item {
                EmptyMessage("Nenhum resultado encontrado para “$query”.", isTelevision)
            }
        }

        if (channelResults.isNotEmpty()) {
            item { SectionHeader("Canais", channelResults.size, channelMatches.size, isTelevision) }
            items(channelResults, key = { "channel-${it.id}" }) { channel ->
                SearchResultRow(
                    title = channel.name,
                    subtitle = channel.groupTitle,
                    imageUrl = channel.logoUrl,
                    badge = "TV",
                    isTelevision = isTelevision,
                    onClick = { onPlayChannel(channel) },
                )
            }
        }

        if (movieResults.isNotEmpty()) {
            item { SectionHeader("Filmes", movieResults.size, movieMatches.size, isTelevision) }
            items(movieResults, key = { "movie-${it.id}" }) { movie ->
                SearchResultRow(
                    title = movie.name,
                    subtitle = listOfNotNull(movie.year?.toString(), movie.category).joinToString(" • "),
                    imageUrl = movie.coverUrl,
                    badge = "FILME",
                    isTelevision = isTelevision,
                    onClick = { onOpenMovie(movie) },
                )
            }
        }

        if (seriesResults.isNotEmpty()) {
            item { SectionHeader("Séries", seriesResults.size, seriesMatches.size, isTelevision) }
            items(seriesResults, key = { "series-${it.id}" }) { item ->
                SearchResultRow(
                    title = item.name,
                    subtitle = item.category,
                    imageUrl = item.coverUrl,
                    badge = "SÉRIE",
                    isTelevision = isTelevision,
                    onClick = { onOpenSeries(item) },
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String, shown: Int, total: Int, isTelevision: Boolean) {
    Text(
        text = if (total > shown) "$title • $shown de $total" else "$title • $total",
        color = RonecaColors.TextSecondary,
        fontSize = if (isTelevision) 14.sp else 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 12.dp, bottom = 2.dp),
    )
}

@Composable
private fun EmptyMessage(message: String, isTelevision: Boolean) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(RonecaColors.Surface, RoundedCornerShape(12.dp))
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(12.dp))
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = message,
            color = RonecaColors.TextMuted,
            fontSize = if (isTelevision) 16.sp else 14.sp,
        )
    }
}

@Composable
private fun SearchResultRow(
    title: String,
    subtitle: String,
    imageUrl: String?,
    badge: String,
    isTelevision: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .clip(RoundedCornerShape(12.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Focus else RonecaColors.Border,
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
                } else {
                    false
                }
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .focusable()
            .padding(if (isTelevision) 14.dp else 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(if (isTelevision) 58.dp else 50.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(RonecaColors.BackgroundSoft)
                .border(1.dp, RonecaColors.Border, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (!imageUrl.isNullOrBlank()) {
                RonecaAsyncImage(
                    model = imageUrl,
                    contentDescription = title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Text(text = badge, color = RonecaColors.TextMuted, fontSize = 10.sp)
            }
        }
        Spacer(modifier = Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 16.sp else 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
            )
            Text(
                text = subtitle,
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
                maxLines = 1,
            )
        }
        Text(text = "›", color = RonecaColors.Primary, fontSize = 24.sp)
    }
}
