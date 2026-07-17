const fs = require('fs');

function replaceBlock(path, marker, replacement) {
  const source = fs.readFileSync(path, 'utf8');
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Bloco não encontrado em ${path}: ${marker}`);
  const next = source.indexOf('\n@Composable', start + marker.length);
  if (next < 0) throw new Error(`Fim do bloco não encontrado em ${path}`);
  const updated = source.slice(0, start) + replacement.trimEnd() + '\n' + source.slice(next);
  fs.writeFileSync(path, updated);
}

const moviePath = 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/movies/MoviesScreen.kt';
replaceBlock(moviePath, '@Composable\nprivate fun MovieCategoryChip', `@Composable
private fun MovieCategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    focused -> RonecaColors.Primary.copy(alpha = 0.26f)
                    selected -> RonecaColors.Primary.copy(alpha = 0.12f)
                    else -> RonecaColors.Surface
                },
            )
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = if (focused || selected) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(999.dp),
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
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (focused || selected) RonecaColors.TextPrimary else RonecaColors.TextSecondary,
            fontSize = 11.sp,
            fontWeight = if (focused || selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
        )
    }
}
`);

const seriesPath = 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/series/SeriesScreen.kt';
replaceBlock(seriesPath, '@Composable\nprivate fun SeriesCategoryChip', `@Composable
private fun SeriesCategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    focused -> RonecaColors.Primary.copy(alpha = 0.26f)
                    selected -> RonecaColors.Primary.copy(alpha = 0.12f)
                    else -> RonecaColors.Surface
                },
            )
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = if (focused || selected) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(999.dp),
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
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (focused || selected) RonecaColors.TextPrimary else RonecaColors.TextSecondary,
            fontSize = 11.sp,
            fontWeight = if (focused || selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
        )
    }
}
`);

const channelPath = 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/channels/ChannelsScreen.kt';
replaceBlock(channelPath, '@Composable\nprivate fun FilterChip', `@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    focused -> RonecaColors.Primary.copy(alpha = 0.26f)
                    selected -> RonecaColors.Primary.copy(alpha = 0.12f)
                    else -> RonecaColors.Surface
                },
            )
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = if (focused || selected) RonecaColors.Primary else RonecaColors.Border,
                shape = RoundedCornerShape(999.dp),
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
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .focusable()
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (focused || selected) RonecaColors.TextPrimary else RonecaColors.TextSecondary,
            fontSize = 11.sp,
            fontWeight = if (focused || selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
        )
    }
}
`);

for (const path of [moviePath, seriesPath, channelPath]) {
  const text = fs.readFileSync(path, 'utf8');
  if (!text.includes('width = if (focused) 3.dp else 1.dp')) {
    throw new Error(`Validação de foco falhou em ${path}`);
  }
  if (!text.includes('.focusable()')) {
    throw new Error(`Componente sem foco em ${path}`);
  }
}

console.log('OK: foco visível aplicado às categorias de canais, filmes e séries.');
