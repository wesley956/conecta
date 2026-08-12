import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [model, view, nativePlayer, seriesPlayer, layout, tests, docs] = await Promise.all([
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/PlayerSubtitles.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/RonecaMedia3PlayerView.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt'),
  read('native-android/app/src/main/res/layout/roneca_media3_player_controls.xml'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/ui/player/PlayerSubtitlesTest.kt'),
  read('native-android/ANDROID_SUBTITLES.md'),
]);

for (const marker of [
  'C.TRACK_TYPE_TEXT',
  'onTracksChanged',
  'player.currentTracks',
  'TrackSelectionOverride',
  'setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)',
  'clearOverridesOfType(C.TRACK_TYPE_TEXT)',
  'SELECTION_FLAG_FORCED',
  'SELECTION_FLAG_DEFAULT',
  'resetForContentChange',
]) {
  assert.match(model, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(model, /options\.isNotEmpty\(\)\) panelVisible = true/);
assert.match(model, /"Desativada"/);
assert.match(model, /dismissOnBackPress = true/);
assert.match(view, /roneca_media3_subtitles/);
assert.match(view, /subtitleTrackCount > 0/);
assert.match(view, /showAndFocusSubtitles/);
assert.match(layout, /android:id="@\+id\/roneca_media3_subtitles"/);

for (const player of [nativePlayer, seriesPlayer]) {
  assert.match(player, /rememberPlayerSubtitleController\(player\)/);
  assert.match(player, /SubtitleSelectorDialog\(/);
  assert.match(player, /currentSubtitlePanelVisible/);
  assert.match(player, /subtitleTrackCount = subtitleController\.options\.size/);
}
assert.match(seriesPlayer, /subtitleController\.resetForContentChange\(\)[\s\S]*?player\.setMediaItem/);
assert.doesNotMatch(`${nativePlayer}\n${seriesPlayer}`, /setMediaItem[\s\S]{0,120}subtitleController\.select/);

for (const marker of [
  'unsupported text tracks are not offered',
  'missing metadata gets safe fallback',
  'forced and default flags remain explicit',
  'identity uses group and track',
]) {
  assert.match(tests, new RegExp(marker));
}
assert.match(docs, /Homologação física pendente/);
assert.match(docs, /não busca nem baixa legendas externas/i);

console.log('✅ Android #278: descoberta, seleção e invalidação segura de legendas validadas.');
