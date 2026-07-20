const fs = require('fs');

const playerFiles = [
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt',
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt',
];

const categoryFiles = {
  movies: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/movies/MoviesScreen.kt',
  series: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/series/SeriesScreen.kt',
  channels: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/channels/ChannelsScreen.kt',
};

function replaceRequired(source, original, replacement, description, path) {
  if (source.includes(replacement)) return source;
  if (!source.includes(original)) {
    throw new Error(`${description} não encontrado em ${path}`);
  }
  return source.replace(original, replacement);
}

function addPlayerImports(source) {
  if (!source.includes('import android.view.View')) {
    source = source.replace(
      'import androidx.activity.compose.BackHandler',
      'import android.view.View\nimport androidx.activity.compose.BackHandler',
    );
  }
  if (!source.includes('import androidx.compose.ui.focus.FocusRequester')) {
    source = source.replace(
      'import androidx.compose.ui.focus.onFocusChanged',
      'import androidx.compose.ui.focus.FocusRequester\nimport androidx.compose.ui.focus.focusRequester\nimport androidx.compose.ui.focus.onFocusChanged',
    );
  }
  return source;
}

function patchPlayer(path) {
  let source = fs.readFileSync(path, 'utf8');
  const isSeries = path.includes('SeriesNative');
  const drawerVar = isSeries ? 'episodeDrawerVisible' : 'channelDrawerVisible';
  const headerName = isSeries ? 'SeriesPlayerHeader' : 'PlayerHeader';
  const actionName = isSeries ? 'SeriesPlayerAction' : 'PlayerAction';

  source = addPlayerImports(source);

  const marker = '    BackHandler {';
  const playerState = [
    '    var playerViewRef by remember { mutableStateOf<PlayerView?>(null) }',
    '    var playerControlsVisible by remember { mutableStateOf(true) }',
    '    val headerFocusRequester = remember { FocusRequester() }',
    '',
  ].join('\n');
  if (!source.includes('val headerFocusRequester = remember { FocusRequester() }')) {
    if (!source.includes(marker)) throw new Error(`BackHandler não encontrado em ${path}`);
    source = source.replace(marker, playerState + marker);
  }

  const oldHandler = `            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {
                    if (${drawerVar}) ${drawerVar} = false else onBack()
                    true
                } else false
            },`;
  const newHandler = `            .onPreviewKeyEvent { event ->
                when {
                    event.type == KeyEventType.KeyUp && event.key == Key.Back -> {
                        if (${drawerVar}) ${drawerVar} = false else onBack()
                        true
                    }
                    isTelevision &&
                        event.type == KeyEventType.KeyDown &&
                        event.key == Key.DirectionUp &&
                        !${drawerVar} -> {
                        playerViewRef?.showController()
                        headerFocusRequester.requestFocus()
                        true
                    }
                    else -> false
                }
            },`;
  source = replaceRequired(source, oldHandler, newHandler, 'Tratamento principal do controle remoto', path);

  const oldPlayerView = `                    isFocusable = true
                    isFocusableInTouchMode = true
                    requestFocus()
                }
            },
            update = { playerView -> playerView.player = player },`;
  const newPlayerView = `                    isFocusable = true
                    isFocusableInTouchMode = true
                    setControllerVisibilityListener(
                        PlayerView.ControllerVisibilityListener { visibility ->
                            playerControlsVisible = visibility == View.VISIBLE
                        },
                    )
                    requestFocus()
                    playerViewRef = this
                }
            },
            update = { playerView ->
                playerView.player = player
                playerViewRef = playerView
            },`;
  source = replaceRequired(source, oldPlayerView, newPlayerView, 'Configuração do PlayerView', path);

  if (isSeries) {
    const oldHeader = `        SeriesPlayerHeader(
            seriesTitle = seriesTitle,
            currentEntry = currentEntry,
            isTelevision = isTelevision,
            onBack = onBack,
            onOpenEpisodes = { episodeDrawerVisible = true },
        )`;
    const newHeader = `        if (playerControlsVisible || episodeDrawerVisible) {
            SeriesPlayerHeader(
                seriesTitle = seriesTitle,
                currentEntry = currentEntry,
                isTelevision = isTelevision,
                backFocusRequester = headerFocusRequester,
                onBack = onBack,
                onOpenEpisodes = { episodeDrawerVisible = true },
            )
        }`;
    source = replaceRequired(source, oldHeader, newHeader, 'Cabeçalho do player de séries', path);
  } else {
    const oldHeader = `        PlayerHeader(
            title = title,
            isTelevision = isTelevision,
            live = currentChannelId != null,
            hasChannelDrawer = relatedChannels.isNotEmpty(),
            onBack = onBack,
            onOpenChannels = { channelDrawerVisible = true },
        )`;
    const newHeader = `        if (playerControlsVisible || channelDrawerVisible) {
            PlayerHeader(
                title = title,
                isTelevision = isTelevision,
                live = currentChannelId != null,
                hasChannelDrawer = relatedChannels.isNotEmpty(),
                backFocusRequester = headerFocusRequester,
                onBack = onBack,
                onOpenChannels = { channelDrawerVisible = true },
            )
        }`;
    source = replaceRequired(source, oldHeader, newHeader, 'Cabeçalho do player principal', path);
  }

  const oldHeaderSignature = isSeries
    ? `    isTelevision: Boolean,
    onBack: () -> Unit,`
    : `    hasChannelDrawer: Boolean,
    onBack: () -> Unit,`;
  const newHeaderSignature = isSeries
    ? `    isTelevision: Boolean,
    backFocusRequester: FocusRequester,
    onBack: () -> Unit,`
    : `    hasChannelDrawer: Boolean,
    backFocusRequester: FocusRequester,
    onBack: () -> Unit,`;
  source = replaceRequired(source, oldHeaderSignature, newHeaderSignature, `Assinatura de ${headerName}`, path);

  const oldBackAction = isSeries
    ? '            SeriesPlayerAction(label = "←", onClick = onBack)'
    : '            PlayerAction(label = "←", onClick = onBack)';
  const newBackAction = isSeries
    ? `            SeriesPlayerAction(
                label = "←",
                onClick = onBack,
                modifier = Modifier.focusRequester(backFocusRequester),
            )`
    : `            PlayerAction(
                label = "←",
                onClick = onBack,
                modifier = Modifier.focusRequester(backFocusRequester),
            )`;
  source = replaceRequired(source, oldBackAction, newBackAction, 'Botão voltar focável do cabeçalho', path);

  const oldActionSignature = `private fun ${actionName}(label: String, onClick: () -> Unit) {`;
  const newActionSignature = `private fun ${actionName}(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {`;
  source = replaceRequired(source, oldActionSignature, newActionSignature, `Assinatura de ${actionName}`, path);

  const oldActionModifier = `        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))`;
  const newActionModifier = `        modifier = modifier
            .clip(RoundedCornerShape(999.dp))`;
  const actionStart = source.indexOf(`private fun ${actionName}(`);
  if (actionStart < 0) throw new Error(`${actionName} não encontrado em ${path}`);
  const actionEnd = source.indexOf('\n}\n', actionStart) + 3;
  const actionBlock = source.slice(actionStart, actionEnd);
  if (!actionBlock.includes(newActionModifier)) {
    if (!actionBlock.includes(oldActionModifier)) throw new Error(`Modifier de ${actionName} não encontrado em ${path}`);
    source = source.slice(0, actionStart) + actionBlock.replace(oldActionModifier, newActionModifier) + source.slice(actionEnd);
  }

  fs.writeFileSync(path, source);
}

function replaceComposableFunction(source, functionName, nextFunctionName, replacement, path) {
  if (source.includes(replacement)) return source;
  const pattern = new RegExp(`@Composable\\nprivate fun ${functionName}\\([\\s\\S]*?\\n}\\n\\n@Composable\\nprivate fun ${nextFunctionName}\\(`);
  if (!pattern.test(source)) throw new Error(`${functionName} não encontrado em ${path}`);
  return source.replace(pattern, `${replacement}\n\n@Composable\nprivate fun ${nextFunctionName}(`);
}

function patchCategoryChips() {
  const moviePath = categoryFiles.movies;
  let movies = fs.readFileSync(moviePath, 'utf8');
  const movieReplacement = `@Composable
private fun MovieCategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
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
                    focused -> RonecaColors.RedStrong
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
}`;
  movies = replaceComposableFunction(movies, 'MovieCategoryChip', 'MoviePosterCard', movieReplacement, moviePath);
  fs.writeFileSync(moviePath, movies);

  const seriesPath = categoryFiles.series;
  let series = fs.readFileSync(seriesPath, 'utf8');
  const seriesReplacement = `@Composable
private fun SeriesCategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
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
                    focused -> RonecaColors.RedStrong
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
}`;
  series = replaceComposableFunction(series, 'SeriesCategoryChip', 'SeriesPosterCard', seriesReplacement, seriesPath);
  fs.writeFileSync(seriesPath, series);

  const channelPath = categoryFiles.channels;
  let channels = fs.readFileSync(channelPath, 'utf8');
  const channelReplacement = `@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }
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
                    focused -> RonecaColors.RedStrong
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
}`;
  channels = replaceComposableFunction(channels, 'FilterChip', 'ChannelItem', channelReplacement, channelPath);
  fs.writeFileSync(channelPath, channels);
}

playerFiles.forEach(patchPlayer);
patchCategoryChips();
console.log('Navegação da TV e indicação visual de foco aplicadas ao aplicativo nativo.');
