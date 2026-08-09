import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [build, app, catalog, source, loadControl, diagnostics, workflow] = await Promise.all([
  read('native-android/app/build.gradle.kts'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/XtreamPlaybackSource.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/RonecaLoadControl.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/diagnostics/NativeDiagnostics.kt'),
  read('.github/workflows/validate-pull-request.yml'),
]);

assert.match(build, /versionCode = 40/);
assert.match(build, /versionName = "2\.8\.0"/);
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

console.log('Android TV: ciclo de vida, memória, Xtream compacto e diagnóstico seguro validados.');
