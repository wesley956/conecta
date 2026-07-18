const fs = require('fs');

const files = [
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt',
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt',
];

function patch(path) {
  let source = fs.readFileSync(path, 'utf8');

  const marker = '    BackHandler {';
  if (!source.includes('var playerViewRef by remember { mutableStateOf<PlayerView?>(null) }')) {
    source = source.replace(marker, '    var playerViewRef by remember { mutableStateOf<PlayerView?>(null) }\n\n' + marker);
  }

  const oldHandler = `.onPreviewKeyEvent { event ->\n                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {\n                    if (`;
  const handlerIndex = source.indexOf(oldHandler);
  if (handlerIndex < 0) throw new Error('Handler principal não encontrado em ' + path);

  const handlerEnd = source.indexOf('            },\n    ) {', handlerIndex);
  if (handlerEnd < 0) throw new Error('Fim do handler não encontrado em ' + path);

  const drawerVar = path.includes('SeriesNative') ? 'episodeDrawerVisible' : 'channelDrawerVisible';
  const newHandler = `.onPreviewKeyEvent { event ->\n                if (event.type == KeyEventType.KeyUp && event.key == Key.Back) {\n                    if (${drawerVar}) ${drawerVar} = false else onBack()\n                    true\n                } else if (event.type == KeyEventType.KeyDown) {\n                    when (event.key) {\n                        Key.MediaPlayPause, Key.DirectionCenter, Key.Enter -> {\n                            if (player.isPlaying) player.pause() else player.play()\n                            playerViewRef?.showController()\n                            true\n                        }\n                        Key.MediaPlay -> {\n                            player.play()\n                            playerViewRef?.showController()\n                            true\n                        }\n                        Key.MediaPause -> {\n                            player.pause()\n                            playerViewRef?.showController()\n                            true\n                        }\n                        Key.DirectionLeft -> {\n                            playerViewRef?.showController()\n                            if (player.isCurrentMediaItemSeekable) {\n                                player.seekTo((player.currentPosition - 10_000L).coerceAtLeast(0L))\n                                true\n                            } else false\n                        }\n                        Key.DirectionRight -> {\n                            playerViewRef?.showController()\n                            if (player.isCurrentMediaItemSeekable) {\n                                val duration = player.duration.takeIf { it > 0L } ?: Long.MAX_VALUE\n                                player.seekTo((player.currentPosition + 10_000L).coerceAtMost(duration))\n                                true\n                            } else false\n                        }\n                        else -> {\n                            playerViewRef?.showController()\n                            false\n                        }\n                    }\n                } else false\n`;

  source = source.slice(0, handlerIndex) + newHandler + source.slice(handlerEnd);

  source = source.replace(
    '                    requestFocus()\n                }',
    '                    requestFocus()\n                    playerViewRef = this\n                }',
  );
  source = source.replace(
    '            update = { playerView -> playerView.player = player },',
    '            update = { playerView ->\n                playerView.player = player\n                playerViewRef = playerView\n            },',
  );

  fs.writeFileSync(path, source);
}

files.forEach(patch);
console.log('Controles de TV aplicados aos dois players.');
