package com.ronecaplaytv.nativeapp.ui.series

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
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
import com.ronecaplaytv.nativeapp.catalog.NativeEpisode
import com.ronecaplaytv.nativeapp.catalog.NativeSeason
import com.ronecaplaytv.nativeapp.catalog.NativeSeries
import com.ronecaplaytv.nativeapp.persistence.SavedProgress
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.components.ronecaFocusScale
import kotlinx.coroutines.delay

@Composable
fun SeriesDetailScreen(
    series: NativeSeries,
    recommendations: List<NativeSeries>,
    isFavorite: Boolean,
    isTelevision: Boolean,
    episodesLoading: Boolean,
    episodesError: String?,
    progress: List<SavedProgress>,
    onBack: () -> Unit,
    onToggleFavorite: () -> Unit,
    onRefreshEpisodes: () -> Unit,
    onPlayEpisode: (NativeSeason, NativeEpisode, String) -> Unit,
    onOpenRecommendation: (NativeSeries) -> Unit,
) {
    BackHandler(onBack = onBack)
    val resumeTarget = remember(series, progress) { resolveSeriesResumeTarget(series, progress) }
    var selectedSeasonNumber by remember(series.id, series.seasons, resumeTarget?.season?.number) {
        mutableIntStateOf(resumeTarget?.season?.number ?: series.seasons.firstOrNull()?.number ?: 1)
    }
    val selectedSeason = series.seasons.firstOrNull { it.number == selectedSeasonNumber }
    val primaryFocusRequester = remember(series.id) { FocusRequester() }
    val hasPrimaryFocusTarget = resumeTarget != null ||
        selectedSeason?.episodes?.isNotEmpty() == true ||
        series.seasons.isEmpty()

    LaunchedEffect(
        series.id,
        isTelevision,
        resumeTarget?.progress?.contentKey,
        selectedSeason?.episodes?.size,
        episodesLoading,
    ) {
        if (isTelevision && hasPrimaryFocusTarget) {
            delay(180)
            runCatching { primaryFocusRequester.requestFocus() }
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {
                    onBack()
                    true
                } else false
            },
        contentPadding = PaddingValues(
            start = if (isTelevision) 28.dp else 18.dp,
            end = if (isTelevision) 28.dp else 18.dp,
            top = if (isTelevision) 20.dp else 18.dp,
            bottom = 30.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            BackControl(
                isTelevision = isTelevision,
                focusRequester = if (series.seasons.isEmpty() && episodesLoading) {
                    primaryFocusRequester
                } else null,
                onBack = onBack,
            )
        }

        item {
            if (isTelevision) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(26.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    SeriesCover(series = series, modifier = Modifier.width(210.dp).height(315.dp))
                    SeriesHeader(
                        series = series,
                        isFavorite = isFavorite,
                        isTelevision = true,
                        modifier = Modifier.weight(1f),
                        resumeTarget = resumeTarget,
                        primaryFocusRequester = primaryFocusRequester,
                        onContinue = { target ->
                            onPlayEpisode(
                                target.season,
                                target.episode,
                                "${series.name} • T${target.season.number}E${target.episode.number}",
                            )
                        },
                        onToggleFavorite = onToggleFavorite,
                    )
                }
            } else {
                SeriesCover(
                    series = series,
                    modifier = Modifier.fillMaxWidth().height(400.dp),
                )
                Spacer(modifier = Modifier.height(16.dp))
                SeriesHeader(
                    series = series,
                    isFavorite = isFavorite,
                    isTelevision = false,
                    modifier = Modifier.fillMaxWidth(),
                    resumeTarget = resumeTarget,
                    primaryFocusRequester = primaryFocusRequester,
                    onContinue = { target ->
                        onPlayEpisode(
                            target.season,
                            target.episode,
                            "${series.name} • T${target.season.number}E${target.episode.number}",
                        )
                    },
                    onToggleFavorite = onToggleFavorite,
                )
            }
        }

        item {
            Text(
                text = "Temporadas",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 20.sp else 17.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(9.dp))
            if (series.seasons.isEmpty()) {
                EmptyEpisodesCard(
                    isTelevision = isTelevision,
                    loading = episodesLoading,
                    error = episodesError,
                    focusRequester = if (!episodesLoading) primaryFocusRequester else null,
                    onRefresh = onRefreshEpisodes,
                )
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(series.seasons, key = { it.number }) { season ->
                        SeasonChip(
                            seasonNumber = season.number,
                            selected = selectedSeasonNumber == season.number,
                            onClick = { selectedSeasonNumber = season.number },
                        )
                    }
                }
            }
        }

        if (selectedSeason != null) {
            item {
                Text(
                    text = "Episódios • Temporada ${selectedSeason.number}",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 20.sp else 17.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            items(selectedSeason.episodes, key = NativeEpisode::id) { episode ->
                val episodeProgress = progressForEpisode(series, selectedSeason, episode, progress)
                EpisodeRow(
                    episode = episode,
                    progress = episodeProgress,
                    isTelevision = isTelevision,
                    focusRequester = if (
                        resumeTarget == null && episode.id == selectedSeason.episodes.firstOrNull()?.id
                    ) primaryFocusRequester else null,
                    onClick = {
                        onPlayEpisode(
                            selectedSeason,
                            episode,
                            "${series.name} • T${selectedSeason.number}E${episode.number}",
                        )
                    },
                )
            }
        }

        if (recommendations.isNotEmpty()) {
            item {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Você também pode gostar",
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 21.sp else 18.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Séries da mesma categoria",
                    color = RonecaColors.TextSecondary,
                    fontSize = if (isTelevision) 13.sp else 12.sp,
                )
                Spacer(modifier = Modifier.height(12.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recommendations, key = NativeSeries::id) { item ->
                        RecommendationCard(
                            series = item,
                            isTelevision = isTelevision,
                            onClick = { onOpenRecommendation(item) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BackControl(
    isTelevision: Boolean,
    focusRequester: FocusRequester? = null,
    onBack: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val requestModifier = if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier
    Box(
        modifier = Modifier
            .then(requestModifier)
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .clip(RoundedCornerShape(999.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) RonecaColors.Focus else RonecaColors.Border,
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
private fun SeriesCover(series: NativeSeries, modifier: Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(RonecaColors.Surface)
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (!series.coverUrl.isNullOrBlank()) {
            RonecaAsyncImage(
                model = series.coverUrl,
                contentDescription = series.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text(text = "SÉRIE", color = RonecaColors.TextMuted)
        }
        Row(modifier = Modifier.align(Alignment.TopStart)) {
            Box(modifier = Modifier.width(34.dp).height(3.dp).background(RonecaColors.Primary))
            Box(modifier = Modifier.width(12.dp).height(3.dp).background(RonecaColors.RedStrong))
        }
    }
}

@Composable
private fun SeriesHeader(
    series: NativeSeries,
    isFavorite: Boolean,
    isTelevision: Boolean,
    modifier: Modifier,
    resumeTarget: SeriesResumeTarget?,
    primaryFocusRequester: FocusRequester,
    onContinue: (SeriesResumeTarget) -> Unit,
    onToggleFavorite: () -> Unit,
) {
    Column(modifier = modifier) {
        Text(
            text = series.category.ifBlank { "Série" }.uppercase(),
            color = RonecaColors.Primary,
            fontSize = if (isTelevision) 12.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = series.name,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 32.sp else 27.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(9.dp))
        Text(
            text = "${series.seasons.size} temporada(s) • ${series.seasons.sumOf { it.episodes.size }} episódio(s)",
            color = RonecaColors.TextSecondary,
            fontSize = if (isTelevision) 14.sp else 13.sp,
        )
        Spacer(modifier = Modifier.height(15.dp))
        Text(
            text = series.synopsis?.takeIf(String::isNotBlank)
                ?: "Sinopse não informada para esta série.",
            color = RonecaColors.BodyText,
            fontSize = if (isTelevision) 15.sp else 14.sp,
            lineHeight = if (isTelevision) 22.sp else 21.sp,
        )
        Spacer(modifier = Modifier.height(20.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            resumeTarget?.let { target ->
                DetailActionButton(
                    label = "▶  Continuar T${target.season.number} E${target.episode.number} • " +
                        formatPlaybackPosition(target.progress.positionMs),
                    primary = true,
                    isTelevision = isTelevision,
                    focusRequester = primaryFocusRequester,
                    onClick = { onContinue(target) },
                )
            }
            DetailActionButton(
                label = if (isFavorite) "★  Na Minha Lista" else "☆  Adicionar à Minha Lista",
                isTelevision = isTelevision,
                onClick = onToggleFavorite,
            )
        }
    }
}

@Composable
private fun DetailActionButton(
    label: String,
    isTelevision: Boolean,
    primary: Boolean = false,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val requestModifier = if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier
    Box(
        modifier = Modifier
            .then(requestModifier)
            .ronecaFocusScale(focused = focused, enabled = isTelevision)
            .clip(RoundedCornerShape(999.dp))
            .background(if (focused) RonecaColors.SurfaceRaised else RonecaColors.Surface)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    focused -> RonecaColors.Focus
                    primary -> RonecaColors.Primary
                    else -> RonecaColors.Border
                },
                shape = RoundedCornerShape(999.dp),
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
            .padding(horizontal = if (isTelevision) 20.dp else 16.dp, vertical = 12.dp),
    ) {
        Text(
            text = label,
            color = if (primary && !focused) RonecaColors.PrimaryStrong else RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 14.sp else 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun EmptyEpisodesCard(
    isTelevision: Boolean,
    loading: Boolean,
    error: String?,
    focusRequester: FocusRequester?,
    onRefresh: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(RonecaColors.Surface, RoundedCornerShape(12.dp))
            .border(
                1.dp,
                if (error == null) RonecaColors.Border else RonecaColors.Red.copy(alpha = 0.75f),
                RoundedCornerShape(12.dp),
            )
            .padding(if (isTelevision) 18.dp else 15.dp),
    ) {
        Text(
            text = when {
                loading -> "Carregando episódios..."
                error != null -> "Não foi possível carregar agora"
                else -> "Episódios ainda não carregados"
            },
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 16.sp else 14.sp,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = when {
                loading -> "Consultando o provedor de forma segura."
                error != null -> error
                else -> "Atualize para buscar temporadas e episódios novamente."
            },
            color = if (error == null) RonecaColors.TextSecondary else RonecaColors.Error,
            fontSize = if (isTelevision) 13.sp else 12.sp,
        )
        if (!loading) {
            Spacer(modifier = Modifier.height(12.dp))
            DetailActionButton(
                label = "↻  Atualizar episódios",
                isTelevision = isTelevision,
                focusRequester = focusRequester,
                onClick = onRefresh,
            )
        }
    }
}

@Composable
private fun SeasonChip(seasonNumber: Int, selected: Boolean, onClick: () -> Unit) {
    var focused by remember(seasonNumber) { mutableStateOf(false) }
    val interactionSource = remember(seasonNumber) { MutableInteractionSource() }

    Box(
        modifier = Modifier
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
            .onPreviewKeyEvent { event ->
                if (
                    event.type == KeyEventType.KeyDown &&
                    (event.key == Key.DirectionCenter ||
                        event.key == Key.Enter ||
                        event.key == Key.NumPadEnter ||
                        event.key == Key.Spacebar)
                ) {
                    onClick()
                    true
                } else {
                    false
                }
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = "Temporada $seasonNumber",
            color = when {
                focused -> RonecaColors.TextPrimary
                selected -> RonecaColors.Primary
                else -> RonecaColors.TextSecondary
            },
            fontSize = 12.sp,
            fontWeight = if (focused || selected) FontWeight.Medium else FontWeight.Normal,
        )
    }
}

@Composable
private fun EpisodeRow(
    episode: NativeEpisode,
    progress: SavedProgress?,
    isTelevision: Boolean,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
    val requestModifier = if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier

    Row(
        modifier = Modifier
            .then(requestModifier)
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
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(if (isTelevision) 16.dp else 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(if (isTelevision) 44.dp else 40.dp)
                .background(RonecaColors.Primary.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                .border(1.dp, RonecaColors.Primary.copy(alpha = 0.45f), RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = episode.number.toString(),
                color = RonecaColors.Primary,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(modifier = Modifier.width(13.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = episode.name,
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 15.sp else 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = progress?.let { saved ->
                    "Continuar de ${formatPlaybackPosition(saved.positionMs)}" +
                        episode.duration?.let { " • $it" }.orEmpty()
                } ?: episode.duration ?: "Duração não informada",
                color = RonecaColors.TextSecondary,
                fontSize = 12.sp,
            )
            if (progress != null) {
                Spacer(modifier = Modifier.height(7.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(RonecaColors.Border),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress.fraction)
                            .height(4.dp)
                            .background(RonecaColors.PrimaryStrong),
                    )
                }
            }
        }
        Text(
            text = if (progress == null) "▶" else "CONTINUAR",
            color = RonecaColors.Primary,
            fontSize = if (progress == null) 18.sp else 10.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun RecommendationCard(
    series: NativeSeries,
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
            if (!series.coverUrl.isNullOrBlank()) {
                RonecaAsyncImage(
                    model = series.coverUrl,
                    contentDescription = series.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }
        }
        Spacer(modifier = Modifier.height(7.dp))
        Text(
            text = series.name,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 11.sp else 10.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
        )
    }
}
