import fs from 'node:fs';

const forbiddenPaths = [
  'android',
  'capacitor.config.ts',
  'capacitor.config.json',
  'src',
  'vite.config.ts',
  'index.html',
  '.github/workflows/build-android-debug.yml',
  '.github/workflows/release-android-apk.yml',
  'scripts/patch-native-player-tv-controls.cjs',
];

const remaining = forbiddenPaths.filter((path) => fs.existsSync(path));
if (remaining.length > 0) {
  throw new Error(`Caminhos legados ainda presentes: ${remaining.join(', ')}`);
}

const nativePlayers = [
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt',
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt',
];

for (const path of nativePlayers) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes('RonecaMedia3PlayerView(')) {
    throw new Error(`${path} deve usar o PlayerView protegido do Media3.`);
  }
  if (source.includes('NativePlayerChrome(')) {
    throw new Error(`${path} ainda usa a barra artesanal em vez do controlador Media3.`);
  }
  if (!source.includes('NativePlaybackKeyRouter.register')) {
    throw new Error(`${path} perdeu o roteamento global de teclas físicas.`);
  }
  if (!source.includes('KEYCODE_DPAD_CENTER') || !source.includes('controlsVisible')) {
    throw new Error(`${path} deve proteger OK/Enter conforme a visibilidade dos controles.`);
  }
  if (!source.includes('KEYCODE_BACK') || !source.includes('togglePlayPause()')) {
    throw new Error(`${path} deve separar explicitamente Voltar de Play/Pause.`);
  }
  if (!source.includes('event.repeatCount == 0') || !source.includes('initialActionDown')) {
    throw new Error(`${path} deve responder ao primeiro pressionamento sem repetir o comando.`);
  }
  if (!source.includes('PROGRESS_SAVE_INTERVAL_MS = 10_000L')) {
    throw new Error(`${path} deve limitar a gravação periódica de progresso.`);
  }
  if (!source.includes('DisposableEffect(player, media3Controller)') ||
      !source.includes('rememberUpdatedState(controlsVisible)')) {
    throw new Error(`${path} não pode registrar novamente as teclas a cada mudança dos controles.`);
  }
}

const performanceFiles = {
  channels:
    'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/channels/ChannelsScreen.kt',
  movies:
    'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/movies/MoviesScreen.kt',
  series:
    'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/series/SeriesScreen.kt',
  loadControl:
    'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/RonecaLoadControl.kt',
  focus:
    'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/RonecaFocusVisual.kt',
  launchSound:
    'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/splash/RonecaLaunchSound.kt',
  app:
    'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt',
};

const performanceSources = Object.fromEntries(
  Object.entries(performanceFiles).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]),
);

for (const [key, marker] of [
  ['channels', 'filteredChannelIds = remember(filteredChannels)'],
  ['movies', 'filteredMovieIds = remember(filtered)'],
  ['series', 'filteredSeriesIds = remember(filtered)'],
]) {
  if (!performanceSources[key].includes(marker)) {
    throw new Error(`${performanceFiles[key]} voltou a reconstruir todos os IDs durante o foco.`);
  }
  if (!performanceSources[key].includes('KeyEventType.KeyDown')) {
    throw new Error(`${performanceFiles[key]} deve responder ao primeiro pressionamento de OK.`);
  }
}

for (const marker of [
  'TV_TARGET_BUFFER_BYTES = 24 * 1024 * 1024',
  'setPrioritizeTimeOverSizeThresholds(false)',
  'maximumBufferMs = if (isTelevision) 30_000 else 25_000',
]) {
  if (!performanceSources.loadControl.includes(marker)) {
    throw new Error(`${performanceFiles.loadControl} perdeu o limite de memória: ${marker}`);
  }
}

if (!performanceSources.focus.includes('tween(durationMillis = 75)')) {
  throw new Error(`${performanceFiles.focus} deve manter a resposta visual rápida.`);
}
if (!performanceSources.launchSound.includes('DURATION_SECONDS = 3.0')) {
  throw new Error(`${performanceFiles.launchSound} deve manter a assinatura sonora de três segundos.`);
}
if (!performanceSources.app.includes('LaunchedEffect(destination)')) {
  throw new Error(`${performanceFiles.app} deve atualizar o progresso fora da reprodução.`);
}

const media3BridgePath =
  'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/RonecaMedia3PlayerView.kt';
const media3Bridge = fs.readFileSync(media3BridgePath, 'utf8');
for (const marker of [
  'useController = true',
  'setControllerVisibilityListener',
  'exo_play_pause',
  'exo_progress',
  'setKeyTimeIncrement',
]) {
  if (!media3Bridge.includes(marker)) {
    throw new Error(`${media3BridgePath} não contém a proteção obrigatória: ${marker}`);
  }
}

const controllerLayout = fs.readFileSync(
  'native-android/app/src/main/res/layout/roneca_media3_player_controls.xml',
  'utf8',
);
for (const marker of ['@id/exo_play_pause', '@id/exo_progress_placeholder', 'roneca_media3_back']) {
  if (!controllerLayout.includes(marker)) {
    throw new Error(`Layout Media3 incompleto: ${marker}`);
  }
}

const releaseWorkflow = fs.readFileSync('.github/workflows/release-native-android.yml', 'utf8');
if (releaseWorkflow.includes('--clobber')) {
  throw new Error('A release nativa não pode substituir artefatos publicados.');
}
if (releaseWorkflow.includes('patch-native-player-tv-controls')) {
  throw new Error('O player final deve estar versionado no código, sem patch durante o build.');
}

console.log('✅ Plataforma validada: Android nativo, Media3 interativo e navegação protegida.');
