import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [policy, selector, channels, movies, series, focus, playerRouter, tests, docs] = await Promise.all([
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/navigation/TvNavigationPolicy.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/TvCategorySelector.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/channels/ChannelsScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/movies/MoviesScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/series/SeriesScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/RonecaFocusVisual.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlaybackKeyRouter.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/ui/navigation/TvNavigationPolicyTest.kt'),
  read('native-android/TV_NAVIGATION_POLICY.md'),
]);

assert.match(policy, /type != KeyEventType\.KeyDown/);
for (const key of ['DirectionCenter', 'Enter', 'NumPadEnter', 'Spacebar']) {
  assert.match(policy, new RegExp(`Key\\.${key}`));
}
assert.match(policy, /deterministicFocusId/);
assert.match(policy, /tvBrowsableCategories/);
assert.match(focus, /focusedScale: Float = 1\.035f/);
assert.match(focus, /tween\(durationMillis = 75\)/);

assert.match(selector, /LazyColumn/);
assert.match(selector, /SELECIONADA ✓/);
assert.match(selector, /dismissOnBackPress = true/);
assert.match(selector, /selectedRequester\.requestFocus\(\)/);
assert.match(selector, /TextOverflow\.Ellipsis/);

for (const screen of [channels, movies, series]) {
  assert.match(screen, /if \(isTelevision\)[\s\S]*?TvCategoryButton/);
  assert.match(screen, /TvCategorySelector\(/);
  assert.match(screen, /else \{[\s\S]*?LazyRow\(/);
  assert.match(screen, /rememberSaveable \{ mutableStateOf\(false\) \}/);
  assert.match(screen, /deterministicFocusId/);
  assert.match(screen, /selectedCategory !in categories/);
}

assert.match(playerRouter, /object NativePlaybackKeyRouter/);
assert.match(tests, /120/);
assert.match(tests, /removedFocusFallsBackDeterministically/);
assert.match(docs, /Player\/drawer/);
assert.match(docs, /Homologação física pendente/);

console.log('✅ Android #272/#273: política D-pad e seletor vertical de categorias validados.');
