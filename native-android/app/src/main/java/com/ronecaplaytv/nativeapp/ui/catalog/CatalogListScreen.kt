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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
            delay(220)
            runCatching {
                if (firstPlayableIndex >= 0) {
                    firstItemRequester.requestFocus()
                } else {
                    backRequester.requestFocus()
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF090612),
                        Color(0xFF0E1020),
                        Color(0xFF070911),
                    ),
                ),
            )
            .padding(horizontal = if (isTelevision) 54.dp else 18.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = if (isTelevision) 30.dp else 18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "RONECA PLAY TV",
                    color = Color(0xFFB99BFF),
                    fontSize = if (isTelevision) 15.sp else 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = title,
                    color = Color.White,
                    fontSize = if (isTelevision) 36.sp else 27.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = "${items.size} itens disponíveis",
                    color = Color(0xFF9DA6BE),
                    fontSize = if (isTelevision) 16.sp else 13.sp,
                )
            }

            FocusableActionCard(
                title = "Voltar",
                subtitle = "Retornar à tela inicial",
                enabled = true,
                isTelevision = isTelevision,
                modifier = Modifier.width(if (isTelevision) 260.dp else 150.dp),
                focusRequester = if (firstPlayableIndex < 0) backRequester else null,
                onClick = onBack,
            )
        }

        Spacer(modifier = Modifier.height(if (isTelevision) 24.dp else 16.dp))

        if (items.isEmpty()) {
            Text(
                text = "Nenhum conteúdo disponível nesta seção.",
                color = Color(0xFFB8C0D9),
                fontSize = if (isTelevision) 20.sp else 16.sp,
            )
            return@Column
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentPadding = PaddingValues(bottom = 42.dp),
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 12.dp else 9.dp),
        ) {
            itemsIndexed(
                items = items,
                key = { _, item -> item.id },
            ) { index, item ->
                val playable = item.playbackUrls.isNotEmpty()
                FocusableActionCard(
                    title = item.title,
                    subtitle = item.subtitle,
                    badge = if (playable) "ASSISTIR" else "INDISPONÍVEL",
                    enabled = playable,
                    isTelevision = isTelevision,
                    modifier = Modifier.fillMaxWidth(),
                    focusRequester = if (index == firstPlayableIndex) firstItemRequester else null,
                    onClick = { onPlay(item) },
                )
            }
        }
    }
}
