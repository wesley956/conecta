package com.ronecaplaytv.nativeapp.ui.catalog

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text

data class CatalogListItem(
    val id: String,
    val title: String,
    val subtitle: String,
    val playbackUrl: String?,
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF080B12))
            .padding(horizontal = if (isTelevision) 56.dp else 18.dp),
    ) {
        Text(
            text = title,
            color = Color.White,
            fontSize = if (isTelevision) 38.sp else 27.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 28.dp, bottom = 18.dp),
        )

        if (items.isEmpty()) {
            Text(
                text = "Nenhum conteúdo disponível nesta seção.",
                color = Color(0xFFB8C0D9),
                fontSize = if (isTelevision) 20.sp else 16.sp,
            )
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(if (isTelevision) 12.dp else 8.dp),
        ) {
            items(
                items = items,
                key = CatalogListItem::id,
            ) { item ->
                Button(
                    onClick = { onPlay(item) },
                    enabled = item.playbackUrl != null,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = if (isTelevision) 8.dp else 4.dp),
                    ) {
                        Text(
                            text = item.title,
                            fontSize = if (isTelevision) 22.sp else 17.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = item.subtitle,
                            fontSize = if (isTelevision) 16.sp else 13.sp,
                            color = Color(0xFFB8C0D9),
                        )
                    }
                }
            }
        }
    }
}
