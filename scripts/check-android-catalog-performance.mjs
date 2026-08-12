import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [store, repository, catalog, app, codecTest, generationTest, schema] = await Promise.all([
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/persistence/CatalogSnapshotStore.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionRepository.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/persistence/CatalogSnapshotCodecTest.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/catalog/CatalogLoadCoordinatorTest.kt'),
  read('native-android/CATALOG_SNAPSHOT_SCHEMA.md'),
]);

assert.match(store, /SCHEMA_VERSION = 1/);
assert.match(store, /AtomicFile\(/);
assert.match(store, /output\.fd\.sync\(\)/);
assert.match(store, /withContext\(Dispatchers\.IO\)/);
assert.match(store, /MAX_BYTES = 24L \* 1024L \* 1024L/);
assert.match(store, /payloadChecksum/);
assert.match(store, /DeviceAccessStatus\.Active/);
assert.doesNotMatch(store, /put\("(?:primaryUrl|playbackUrls|logoUrl|coverUrl|channelsUrl|moviesUrl|seriesUrl)"/);

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

assert.match(codecTest, /roundTripKeepsMetadataWithoutPersistingProviderUrlsOrCredentials/);
assert.match(codecTest, /corruptionAndUnknownSchemaAreRejected/);
assert.match(codecTest, /accessPolicyNeverRestoresBlockedOrExpiredSession/);
assert.match(generationTest, /onlyNewestGenerationCanPublish/);
assert.match(generationTest, /repeatedRefreshInvalidatesEveryOlderResult/);
assert.match(schema, /Homologação física pendente/);

console.log('✅ Android #270/#271: snapshot seguro, invalidação, concorrência e evidências validados.');
