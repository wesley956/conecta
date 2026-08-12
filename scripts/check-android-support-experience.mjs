import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [model, api, repository, activation, supportUi, settings, app, tests, docs, build] = await Promise.all([
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/SupportProfile.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceApi.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionRepository.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/activation/ActivationScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/support/SupportUi.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/settings/SettingsScreen.kt'),
  read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt'),
  read('native-android/app/src/test/java/com/ronecaplaytv/nativeapp/activation/SupportContactPolicyTest.kt'),
  read('native-android/ANDROID_SUPPORT_EXPERIENCE.md'),
  read('native-android/app/build.gradle.kts'),
]);

for (const marker of ['Seller', 'System', 'Generic', 'safeHttpsUri', 'safeWhatsappUri', 'safeEmailUri']) {
  assert.match(model, new RegExp(marker));
}
assert.match(api, /optJSONObject\("supportProfile"\)/);
assert.match(api, /showInApp/);
assert.match(repository, /supportProfile = supportProfile/);
assert.match(app, /supportProfile = sessionState\.supportProfile/);

assert.match(activation, /maxWidth >= 840\.dp/);
assert.match(activation, /maxWidth >= 600\.dp/);
assert.match(activation, /showQrCode = medium/);
assert.match(activation, /copyFocusRequester/);
assert.match(activation, /ActivityNotFoundException/);

assert.match(supportUi, /QRCodeWriter/);
assert.match(supportUi, /Color\.BLACK/);
assert.match(supportUi, /Color\.WHITE/);
assert.match(supportUi, /dismissOnBackPress = true/);
assert.match(supportUi, /showQrCode = isTelevision/);
assert.match(settings, /SectionTitle\("SUPORTE"/);
assert.match(settings, /SupportDialog/);
assert.match(build, /com\.google\.zxing:core:3\.5\.4/);

for (const marker of ['unsafe or credentialed urls are rejected', 'generic profile', 'whatsapp is normalized']) {
  assert.match(tests, new RegExp(marker));
}
assert.match(docs, /Homologação física pendente/);
assert.doesNotMatch(`${activation}\n${settings}\n${supportUi}`, /L5NATQAF4EOTB1|wa\.me\/message/);

console.log('✅ Android #276/#277: ativação responsiva e suporte dinâmico validados.');
