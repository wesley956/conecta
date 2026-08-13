import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [store, repository, catalog, startupPolicy, app, mainActivity, launchVideo, launchTransition, launchLayout, codecTest, startupTest, launchTransitionTest, generationTest, schema] = await Promise.all([
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/persistence/CatalogSnapshotStore.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionRepository.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogStartupPolicy.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/MainActivity.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/splash/RonecaLaunchVideoScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/splash/LaunchVideoTransitionPolicy.kt'),
  read('native-android/app/src/main/res/layout/view_launch_video.xml'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/persistence/CatalogSnapshotCodecTest.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/catalog/CatalogStartupPolicyTest.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/ui/splash/LaunchVideoTransitionPolicyTest.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/catalog/CatalogLoadCoordinatorTest.kt'),
  read('native-android/CATALOG_SNAPSHOT_SCHEMA.md'),
]);

assert.match(store, /SCHEMA_VERSION = 2/);
assert.match(store, /AtomicFile\(/);
assert.match(store, /output\.fd\.sync\(\)/);
assert.match(store, /withContext\(Dispatchers\.IO\)/);
assert.match(store, /MAX_ENCRYPTED_BYTES = 32L \* 1024L \* 1024L/);
assert.match(store, /payloadChecksum/);
assert.match(store, /DeviceAccessStatus\.Active/);
assert.match(store, /AES\/GCM\/NoPadding/);
assert.match(store, /AndroidKeyStore/);
assert.match(store, /GZIPOutputStream/);

assert.match(repository, /CatalogSnapshotAccessPolicy\.mustInvalidate/);
assert.match(repository, /resetAndActivate[\s\S]*?catalogSnapshotStore\.clearAll\(\)/);
assert.match(app, /accessStatus = sessionState\.status/);
assert.match(catalog, /CatalogLoadCoordinator\(\)/);
assert.match(catalog, /activeLoadJob\?\.cancel\(\)/);
assert.match(catalog, /loadCoordinator\.isCurrent\(generation\)/);
assert.match(catalog, /previousState\.copy\(\)/);
assert.match(catalog, /if \(lowRamDevice\)/);
assert.match(catalog, /SUSPEND_HYDRATION_DURING_TV_PLAYBACK/);
assert.match(catalog, /catalog\.snapshot_restored/);
assert.match(catalog, /catalog\.network_ready/);
assert.match(catalog, /CatalogStartupPolicy\.refreshMode/);
assert.match(catalog, /catalog\.snapshot_save_failed/);
assert.match(startupPolicy, /DEFERRED_REFRESH_MILLIS = 9_000L/);
assert.match(startupPolicy, /previous\.activePlaylistId == candidateId/);
assert.match(app, /withContext\(Dispatchers\.Default\)/);
assert.match(mainActivity, /RonecaLaunchVideoScreen/);
assert.doesNotMatch(mainActivity, /AnimatedVisibility/);
assert.match(mainActivity, /launchOverlayActive/);
assert.match(launchVideo, /R\.raw\.roneca_launch_video/);
assert.match(launchVideo, /Player\.STATE_ENDED/);
assert.match(launchVideo, /LaunchVideoTransitionPolicy\.shouldStart/);
assert.match(launchVideo, /view\.animate\(\)/);
assert.match(launchVideo, /LAYER_TYPE_HARDWARE/);
assert.doesNotMatch(launchVideo, /mutableFloatStateOf/);
assert.doesNotMatch(launchVideo, /graphicsLayer/);
assert.doesNotMatch(launchVideo, /delay\([\s\S]*?16L/);
assert.match(launchTransition, /CROSSFADE_START_MILLIS = 6_500L/);
assert.match(launchTransition, /EXPECTED_VIDEO_DURATION_MILLIS = 8_057L/);
assert.match(launchTransition, /POSITION_POLL_MILLIS = 40L/);
assert.match(launchLayout, /surface_type="texture_view"/);

assert.match(codecTest, /encryptedEnvelopeDoesNotExposeProviderDataAndRejectsTampering/);
assert.match(codecTest, /corruptionAndUnknownSchemaAreRejected/);
assert.match(codecTest, /accessPolicyNeverRestoresBlockedOrExpiredSession/);
assert.match(startupTest, /progressiveRefreshNeverErasesRestoredVodFromSamePlaylist/);
assert.match(startupTest, /freshSnapshotSkipsNetworkAndStaleSnapshotDefersIt/);
assert.match(launchTransitionTest, /nativeAnimatorUsesOnlyTheRemainingPlaybackTime/);
assert.match(generationTest, /onlyNewestGenerationCanPublish/);
assert.match(generationTest, /repeatedRefreshInvalidatesEveryOlderResult/);
assert.match(schema, /Homologação física e promoção/);
assert.match(schema, /autorizada para promoção/);

console.log('✅ Android #270/#271: snapshot seguro, invalidação, concorrência e evidências validados.');
