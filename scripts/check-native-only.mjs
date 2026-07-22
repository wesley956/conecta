import fs from 'node:fs';

const forbiddenPaths = [
  'android',
  'capacitor.config.ts',
  'capacitor.config.json',
  'src/screens/PlayerScreen.tsx',
  'src/screens/PlayerV2Screen.tsx',
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
  if (!source.includes('KEYCODE_DPAD_CENTER') || !source.includes('!controlsVisible')) {
    throw new Error(`${path} deve proteger OK/Enter quando os controles estão escondidos.`);
  }
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
