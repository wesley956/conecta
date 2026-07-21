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
  if (!source.includes('useController = false')) {
    throw new Error(`${path} deve usar somente os controles nativos Compose.`);
  }
  if (source.includes('useController = true')) {
    throw new Error(`${path} ainda habilita o controlador interno conflitante do PlayerView.`);
  }
}

const releaseWorkflow = fs.readFileSync('.github/workflows/release-native-android.yml', 'utf8');
if (releaseWorkflow.includes('--clobber')) {
  throw new Error('A release nativa não pode substituir artefatos publicados.');
}
if (releaseWorkflow.includes('patch-native-player-tv-controls')) {
  throw new Error('O player final deve estar versionado no código, sem patch durante o build.');
}

console.log('✅ Plataforma validada: somente player Android nativo e releases imutáveis.');
