import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [
  policy,
  selector,
  channels,
  movies,
  series,
  focus,
  playerRouter,
  tests,
  categoryMode,
  categoryModeTests,
  settings,
  preferences,
  app,
  mainNavigation,
  docs,
] = await Promise.all([
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/navigation/TvNavigationPolicy.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/TvCategorySelector.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/channels/ChannelsScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/movies/MoviesScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/series/SeriesScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/RonecaFocusVisual.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlaybackKeyRouter.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/ui/navigation/TvNavigationPolicyTest.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/settings/CategoryDisplayMode.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/ui/settings/CategoryDisplayModeTest.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/settings/SettingsScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/persistence/PlayerSettingsPreferences.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/navigation/MainNavigationBar.kt'),
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
assert.match(selector, /fun TvCategorySidePanel/);
assert.match(selector, /selectedFocusRequester\.requestFocus\(\)/);
assert.match(selector, /TextOverflow\.Ellipsis/);
assert.match(selector, /width = if \(focused\) 3\.dp else 1\.dp/);
assert.match(selector, /\.width\(320\.dp\)/);
assert.match(selector, /focusRequestKey/);
assert.match(selector, /event\.key == Key\.DirectionLeft/);
assert.match(selector, /onExitToMainMenu\(\)/);
assert.match(selector, /event\.key == Key\.DirectionRight -> \{/);
assert.match(selector, /onMoveToCatalog\(\)/);
assert.match(selector, /index == 0/);
assert.match(selector, /index == lastIndex/);

for (const screen of [channels, movies, series]) {
  assert.match(screen, /CategoryDisplayMode\.SidePanel/);
  assert.match(screen, /TvCategorySidePanel\(/);
  assert.match(screen, /LazyRow\(/);
  assert.match(screen, /deterministicFocusId/);
  assert.match(screen, /selectedCategory !in categories/);
  assert.match(screen, /focusCatalogAfterPanel/);
  assert.match(screen, /categoryPanelFocusRequestKey/);
  assert.match(screen, /selectedFocusRequester = categoryPanelRequester/);
  assert.match(screen, /focusProperties \{ left = categoryPanelRequester \}/);
  assert.match(screen, /onExitToMainMenu = onRequestMainNavigationFocus/);
  assert.match(screen, /onMoveToCatalog = \{ focusCatalogAfterPanel = true \}/);
}

assert.match(categoryMode, /Classic\(storageValue = "classic"/);
assert.match(categoryMode, /SidePanel\(storageValue = "side_panel"/);
assert.match(categoryMode, /\?: Classic/);
assert.match(categoryModeTests, /missingOrUnknownPreferenceKeepsPublishedClassicMode/);
assert.match(preferences, /KEY_CATEGORY_DISPLAY_MODE/);
assert.match(preferences, /CategoryDisplayMode\.Classic\.storageValue/);
assert.match(settings, /title = "Exibição das categorias"/);
assert.match(settings, /CategoryDisplayMode\.entries/);
assert.match(app, /categoryDisplayMode = settingsState\.categoryDisplayMode/g);
assert.match(app, /fixedCategoryPanelActive/);
assert.match(app, /mainNavigationOverlayOpen/);
assert.match(app, /BackHandler\(enabled = sessionState\.isActive && fixedCategoryPanelActive\)/);
assert.match(app, /categoryPanelFocusRequestKey \+= 1/);
assert.match(app, /openMainNavigationOverlay/);
assert.match(mainNavigation, /selectedTabRequester\.requestFocus\(\)/);
assert.match(mainNavigation, /focused -> 3\.dp/);

assert.match(playerRouter, /object NativePlaybackKeyRouter/);
assert.match(tests, /120/);
assert.match(tests, /removedFocusFallsBackDeterministically/);
assert.match(docs, /Player\/drawer/);
assert.match(docs, /`←` a partir das categorias revela o menu principal/);
assert.match(docs, /Homologação física pendente/);

console.log('✅ Android TV: modos clássico/lateral, persistência e contrato de foco validados.');
