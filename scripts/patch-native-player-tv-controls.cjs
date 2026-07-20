const fs = require('fs');

const files = [
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt',
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt',
];

function wrapHeader(source, path) {
  if (path.includes('SeriesNative')) {
    const original = `        SeriesPlayerHeader(
            seriesTitle = seriesTitle,
            currentEntry = currentEntry,
            isTelevision = isTelevision,
            onBack = onBack,
            onOpenEpisodes = { episodeDrawerVisible = true },
        )`;
    const replacement = `        if (playerControlsVisible || episodeDrawerVisible) {
            SeriesPlayerHeader(
                seriesTitle = seriesTitle,
                currentEntry = currentEntry,
                isTelevision = isTelevision,
                onBack = onBack,
                onOpenEpisodes = { episodeDrawerVisible = true },
            )
        }`;

    if (!source.includes(replacement)) {
      if (!source.includes(original)) throw new Error('Cabeçalho de séries não encontrado em ' + path);
      source = source.replace(original, replacement);
    }
    return source;
  }

  const original = `        PlayerHeader(
            title = title,
            isTelevision = isTelevision,
            live = currentChannelId != null,
            hasChannelDrawer = relatedChannels.isNotEmpty(),
            onBack = onBack,
            onOpenChannels = { channelDrawerVisible = true },
        )`;
  const replacement = `        if (playerControlsVisible || channelDrawerVisible) {
            PlayerHeader(
                title = title,
                isTelevision = isTelevision,
                live = currentChannelId != null,
                hasChannelDrawer = relatedChannels.isNotEmpty(),
                onBack = onBack,
                onOpenChannels = { channelDrawerVisible = true },
            )
        }`;

  if (!source.includes(replacement)) {
    if (!source.includes(original)) throw new Error('Cabeçalho principal não encontrado em ' + path);
    source = source.replace(original, replacement);
  }
  return source;
}

function patch(path) {
  let source = fs.readFileSync(path, 'utf8');

  if (!source.includes('import android.view.View')) {
    source = source.replace(
      'import androidx.activity.compose.BackHandler',
      'import android.view.View\nimport androidx.activity.compose.BackHandler',
    );
  }

  const marker = '    BackHandler {';
  const playerViewState = '    var playerViewRef by remember { mutableStateOf<PlayerView?>(null) }';
  const controlsState = '    var playerControlsVisible by remember { mutableStateOf(true) }';

  if (!source.includes(playerViewState)) {
    source = source.replace(marker, `${playerViewState}\n${controlsState}\n\n${marker}`);
  } else if (!source.includes(controlsState)) {
    source = source.replace(playerViewState, `${playerViewState}\n${controlsState}`);
  }

  const oldHandler = `.onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {
                    if (`;
  const handlerIndex = source.indexOf(oldHandler);
  if (handlerIndex < 0) throw new Error('Handler principal não encontrado em ' + path);

  const handlerEnd = source.indexOf('            },\n    ) {', handlerIndex);
  if (handlerEnd < 0) throw new Error('Fim do handler não encontrado em ' + path);

  const drawerVar = path.includes('SeriesNative') ? 'episodeDrawerVisible' : 'channelDrawerVisible';
  const newHandler = `.onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {
                    if (${drawerVar}) ${drawerVar} = false else onBack()
                    true
                } else if (event.type == KeyEventType.KeyDown) {
                    when (event.key) {
                        Key.MediaPlayPause, Key.DirectionCenter, Key.Enter -> {
                            if (player.isPlaying) player.pause() else player.play()
                            playerViewRef?.showController()
                            true
                        }
                        Key.MediaPlay -> {
                            player.play()
                            playerViewRef?.showController()
                            true
                        }
                        Key.MediaPause -> {
                            player.pause()
                            playerViewRef?.showController()
                            true
                        }
                        Key.DirectionLeft -> {
                            playerViewRef?.showController()
                            if (player.isCurrentMediaItemSeekable) {
                                player.seekTo((player.currentPosition - 10_000L).coerceAtLeast(0L))
                                true
                            } else false
                        }
                        Key.DirectionRight -> {
                            playerViewRef?.showController()
                            if (player.isCurrentMediaItemSeekable) {
                                val duration = player.duration.takeIf { it > 0L } ?: Long.MAX_VALUE
                                player.seekTo((player.currentPosition + 10_000L).coerceAtMost(duration))
                                true
                            } else false
                        }
                        else -> {
                            playerViewRef?.showController()
                            false
                        }
                    }
                } else false
`;

  source = source.slice(0, handlerIndex) + newHandler + source.slice(handlerEnd);

  const focusBlock = `                    isFocusable = true
                    isFocusableInTouchMode = true
                    requestFocus()`;
  const visibilityBlock = `                    isFocusable = true
                    isFocusableInTouchMode = true
                    setControllerVisibilityListener(
                        PlayerView.ControllerVisibilityListener { visibility ->
                            playerControlsVisible = visibility == View.VISIBLE
                        },
                    )
                    requestFocus()`;

  if (!source.includes('PlayerView.ControllerVisibilityListener')) {
    if (!source.includes(focusBlock)) throw new Error('Configuração de foco do PlayerView não encontrada em ' + path);
    source = source.replace(focusBlock, visibilityBlock);
  }

  source = source.replace(
    '                    requestFocus()\n                }',
    '                    requestFocus()\n                    playerViewRef = this\n                }',
  );
  source = source.replace(
    '            update = { playerView -> playerView.player = player },',
    '            update = { playerView ->\n                playerView.player = player\n                playerViewRef = playerView\n            },',
  );

  source = wrapHeader(source, path);

  fs.writeFileSync(path, source);
}

files.forEach(patch);
console.log('Controles de TV e cabeçalhos sincronizados nos dois players.');
