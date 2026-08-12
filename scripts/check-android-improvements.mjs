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
  brandLockup,
  media3View,
  aspect,
  recovery,
  nativePlayer,
  navigation,
  iconForeground,
  legacyIcon,
  legacyRoundIcon,
  image,
  manifest,
  wordmark,
  playbackDiagnosticsApi,
  panelPremium,
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
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/brand/RonecaBrandLockup.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/RonecaMedia3PlayerView.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/PlayerAspectMode.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/PlaybackFailurePolicy.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/navigation/MainNavigationBar.kt'),
  read('native-android/app/src/main/res/drawable/roneca_icon_foreground.xml'),
  read('native-android/app/src/main/res/mipmap-anydpi/ic_launcher.xml'),
  read('native-android/app/src/main/res/mipmap-anydpi/ic_launcher_round.xml'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/RonecaAsyncImage.kt'),
  read('native-android/app/src/main/AndroidManifest.xml'),
  read('native-android/brand/ronecaplaytv-wordmark.svg'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/PlaybackDiagnosticsApi.kt'),
  read('admin-panel/roneca-panel-premium.js'),
]);

assert.match(build, /versionCode = 47/);
assert.match(build, /versionName = "2\.9\.6"/);
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
assert.match(diagnostics, /recordPlaybackFailure/);
assert.match(diagnostics, /PlaybackDiagnosticsApi/);
assert.match(playbackDiagnosticsApi, /playback-diagnostics-report/);
assert.match(playbackDiagnosticsApi, /x-device-credential/);
assert.doesNotMatch(playbackDiagnosticsApi, /playlistUrl|streamUrl|sourceUrl/);
assert.match(workflow, /:app:testDebugUnitTest :app:assembleDebug/);
assert.match(colors, /Background = Color\(0xFF080809\)/);
assert.match(colors, /Primary = Color\(0xFFE3262E\)/);
assert.match(colors, /Focus = RedStrong/);
assert.match(activation, /RonecaBrandLockup\(/);
assert.doesNotMatch(activation, /text = "Player TV"/);
assert.match(brandLockup, /BrandGold = Color\(0xFFFFD45A\)/);
assert.match(brandLockup, /BrandRed = Color\(0xFFE3262E\)/);
assert.match(brandLockup, /text = "Player"[\s\S]*?color = BrandGold/);
assert.match(brandLockup, /text = "TV"[\s\S]*?color = BrandRed/);
assert.match(media3View, /aspectMode\.toMedia3ResizeMode\(\)/);
assert.match(aspect, /Original\("Original"/);
assert.match(aspect, /Fill\("Preencher"/);
assert.match(aspect, /Stretch\("Estender"/);
assert.doesNotMatch(aspect, /FixedWidth/);
assert.doesNotMatch(aspect, /FixedHeight/);
assert.match(recovery, /PlaybackFailureKind\.RuntimeCheck/);
assert.match(recovery, /FAILED_RUNTIME_CHECK/);
assert.match(recovery, /CLEARTEXT_NOT_PERMITTED/);
assert.match(nativePlayer, /MediaCodecSelector\.PREFER_SOFTWARE/);
assert.match(nativePlayer, /MediaCodecSelector\.DEFAULT/);
assert.match(nativePlayer, /setMediaCodecSelector\(codecSelector\)/);
assert.match(nativePlayer, /playerGeneration \+= 1/);
assert.match(nativePlayer, /playback\.decoder_fallback/);
assert.match(nativePlayer, /PLAYBACK_VALIDATION_WINDOW_MS = 8_000L/);
assert.match(nativePlayer, /if \(recoveryInProgress \|\| terminalFailureReported\)/);
assert.match(nativePlayer, /playback\.error_state/);
assert.match(nativePlayer, /playback\.vod_terminal/);
assert.match(navigation, /verticalScroll\(scrollState\)/);
assert.match(iconForeground, /<vector/);
assert.match(iconForeground, /android:width="108dp"/);
assert.match(iconForeground, /android:scaleX="0\.66"/);
assert.match(iconForeground, /android:scaleY="0\.66"/);
assert.match(iconForeground, /android:translateY="26"/);
assert.doesNotMatch(iconForeground, /roneca_player_tv_emblem/);
assert.match(legacyIcon, /@drawable\/roneca_icon_foreground/);
assert.match(legacyRoundIcon, /@drawable\/roneca_icon_foreground/);
assert.doesNotMatch(legacyIcon, /roneca_player_tv_emblem/);
assert.doesNotMatch(legacyRoundIcon, /roneca_player_tv_emblem/);
assert.match(image, /FilterQuality\.High/);
assert.match(manifest, /@mipmap\/ic_launcher/);
assert.match(wordmark, /<text x="40" y="232"[^>]*>Roneca<\/text>/);
assert.match(wordmark, /<text x="790" y="232"[^>]*>Player<\/text>/);
assert.match(wordmark, /<text x="1495" y="232"[^>]*>TV<\/text>/);
assert.doesNotMatch(panelPremium, /brandWordmark/);
assert.doesNotMatch(panelPremium, /image\.src\s*=/);
assert.match(panelPremium, /login-brand-lockup, \.seller-login-brand/);
assert.match(panelPremium, /directLogos\.slice\(1\)/);
assert.match(app, /PendingPlaybackValidation/);
assert.match(app, /playlistWidePlaybackFailures/);
assert.match(app, /onPlaybackValidated = ::markPlaybackValidated/);

console.log('Android 2.9.6: VOD estável, launcher vetorial seguro e identidade visual única validados.');
