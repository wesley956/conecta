import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [
  build,
  app,
  catalog,
  source,
  loadControl,
  diagnostics,
  workflow,
  colors,
  activation,
  media3View,
  aspect,
  recovery,
  image,
  manifest,
  wordmark,
] = await Promise.all([
  read('native-android/app/build.gradle.kts'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/XtreamPlaybackSource.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/RonecaLoadControl.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/diagnostics/NativeDiagnostics.kt'),
  read('.github/workflows/validate-pull-request.yml'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/FocusableActionCard.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/activation/ActivationScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/RonecaMedia3PlayerView.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/PlayerAspectMode.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/PlaybackFailurePolicy.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/RonecaAsyncImage.kt'),
  read('native-android/app/src/main/AndroidManifest.xml'),
  read('native-android/brand/ronecaplaytv-wordmark.svg'),
]);

assert.match(build, /versionCode = 41/);
assert.match(build, /versionName = "2\.9\.0"/);
assert.match(build, /SUSPEND_HYDRATION_DURING_TV_PLAYBACK/);
assert.match(build, /COMPACT_XTREAM_PLAYBACK_URLS/);
assert.match(app, /Lifecycle\.Event\.ON_STOP/);
assert.match(app, /playerSuspendedForLifecycle = true/);
assert.match(app, /withContext\(Dispatchers\.Default\)/);
assert.match(catalog, /progressiveHydrationJob\?\.cancel\(\)/);
assert.match(catalog, /setTelevisionPlaybackActive/);
assert.match(source, /class XtreamLiveUrls/);
assert.match(source, /XtreamPlaybackSource\(<redacted>\)/);
assert.doesNotMatch(source, /override fun toString\(\).*password/);
assert.match(loadControl, /LOW_RAM_TARGET_BUFFER_BYTES/);
assert.match(loadControl, /isLowRamDevice -> 18_000/);
assert.match(diagnostics, /SENSITIVE_FIELD_PARTS/);
assert.match(diagnostics, /process\.previous_exit/);
assert.match(workflow, /:app:testDebugUnitTest :app:assembleDebug/);
assert.match(colors, /Background = Color\(0xFF080809\)/);
assert.match(colors, /Primary = Color\(0xFFE3262E\)/);
assert.match(colors, /Focus = RedStrong/);
assert.match(activation, /R\.drawable\.roneca_player_tv_lockup/);
assert.doesNotMatch(activation, /▣  Roneca Player TV/);
assert.match(media3View, /aspectMode\.toMedia3ResizeMode\(\)/);
assert.match(media3View, /RESIZE_MODE_ZOOM/);
assert.match(media3View, /RESIZE_MODE_FILL/);
assert.match(aspect, /Original\("Original"/);
assert.match(aspect, /FixedWidth\("Ajustar largura"/);
assert.match(aspect, /FixedHeight\("Ajustar altura"/);
assert.match(recovery, /2_000L, 4_000L, 8_000L/);
assert.match(recovery, /httpStatus == 401 \|\| httpStatus == 403/);
assert.match(recovery, /httpStatus == 404 \|\| httpStatus == 410/);
assert.match(recovery, /PlaybackFailureKind\.Decoder/);
assert.match(recovery, /PlaybackFailureKind\.SecureConnection/);
assert.match(image, /FilterQuality\.High/);
assert.match(image, /R\.drawable\.roneca_media_placeholder/);
assert.match(manifest, /@mipmap\/ic_launcher/);
assert.match(manifest, /@drawable\/roneca_player_tv_banner/);
assert.doesNotMatch(wordmark, /<text\b/);
assert.match(app, /PendingPlaybackValidation/);
assert.match(app, /playlistWidePlaybackFailures/);
assert.match(app, /if \(reason !in playlistWidePlaybackFailures\)/);
assert.match(app, /onPlaybackValidated = ::markPlaybackValidated/);
assert.match(app, /pending\.playlistId != catalogState\.activePlaylistId/);

console.log('Android 2.9: marca, ativação, aspecto, imagens e recuperação inteligente validados.');
