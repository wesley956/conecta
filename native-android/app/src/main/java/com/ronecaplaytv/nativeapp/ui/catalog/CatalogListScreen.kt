package com.ronecaplaytv.nativeapp.ui.catalog

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay

data class CatalogListItem(
    val id: String,
    val title: String,
    val subtitle: String,
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

    val sectionAccent = when {
        title.contains("filme", ignoreCase = true) -> RonecaColors.Pink
        title.contains("série", ignoreCase = true) -> RonecaColors.Cyan
        else -> RonecaColors.Primary
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        sectionAccent.copy(alpha = 0.18f),
                        Color(0xFF090B13),
                        RonecaColors.Background,
                    ),
                ),
            )
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
                    text = "RONECA PLAY TV",
                    color = sectionAccent,
                    fontSize = if (isTelevision) 14.sp else 11.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 2.sp,
                )
                Text(
                    text = title,
                    color = RonecaColors.TextPrimary,
                    fontSize = if (isTelevision) 36.sp else 27.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = "${items.size} itens disponíveis",
                    color = RonecaColors.TextSecondary,
                    fontSize = if (isTelevision) 15.sp else 13.sp,
                )
            }

            FocusableActionCard(
                title = "Voltar",
                subtitle = "Tela inicial",
                badge = "←",
                enabled = true,
                isTelevision = isTelevision,
                accentColor = RonecaColors.Orange,
                modifier = Modifier
                    .width(if (isTelevision) 240.dp else 150.dp)
                    .height(if (isTelevision) 96.dp else 78.dp),
                focusRequester = if (firstPlayableIndex < 0) backRequester else null,
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
            columns = GridCells.Fixed(if (isTelevision) 3 else 2),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentPadding = PaddingValues(bottom = 42.dp),
            horizontalArrangement = Arrangement.spacedBy(if (isTelevision) 18.dp else 10.dp),
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 18.dp else 10.dp),
        ) {
            itemsIndexed(
                items = items,
                key = { _, item -> item.id },
            ) { index, item ->
                val playable = item.playbackUrls.isNotEmpty()
                val accent = when (index % 4) {
                    0 -> sectionAccent
                    1 -> RonecaColors.Cyan
                    2 -> RonecaColors.Pink
                    else -> RonecaColors.Green
                }

                FocusableActionCard(
                    title = item.title,
                    subtitle = item.subtitle,
                    badge = if (playable) "▶" else "—",
                    enabled = playable,
                    isTelevision = isTelevision,
                    accentColor = accent,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(if (isTelevision) 154.dp else 126.dp),
                    focusRequester = if (index == firstPlayableIndex) firstItemRequester else null,
                    onClick = { onPlay(item) },
                )
            }
        }
    }
}
