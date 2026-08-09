package com.ronecaplaytv.nativeapp.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import coil3.compose.AsyncImage
import com.ronecaplaytv.nativeapp.R

/**
 * Carregamento visual único para capas, banners e logotipos do catálogo.
 *
 * O Coil dimensiona a requisição pela área real do componente, mantém cache de
 * memória/disco e esta camada garante interpolação de alta qualidade e um
 * fallback oficial sem esticar uma miniatura além do necessário.
 */
@Composable
fun RonecaAsyncImage(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Fit,
    alignment: Alignment = Alignment.Center,
) {
    AsyncImage(
        model = model,
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
        alignment = alignment,
        placeholder = painterResource(R.drawable.roneca_media_placeholder),
        error = painterResource(R.drawable.roneca_media_placeholder),
        fallback = painterResource(R.drawable.roneca_media_placeholder),
        filterQuality = FilterQuality.High,
    )
}
