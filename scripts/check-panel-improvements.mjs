import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [manager, registration, registrationCss, release, generator, inline] = await Promise.all([
  read('supabase/functions/playlist-source-manager/index.ts'),
  read('admin-panel/universal-playlist-registration.js'),
  read('admin-panel/universal-playlist-registration.css'),
  read('admin-panel/app-release.js'),
  read('scripts/generate-panel-config.mjs'),
  read('admin-panel/universal-playlist-inline.js'),
]);

assert.match(
  manager,
  /endpoints:panel_playlist_endpoints!panel_playlist_endpoints_playlist_id_fkey\(/,
  'A listagem precisa indicar a FK para não gerar relação ambígua no PostgREST.',
);
assert.doesNotMatch(
  release,
  /loadUniversalPlaylistRegistration|universal-playlist-registration\.js/,
  'app-release.js não pode reinstalar o módulo universal carregado por panel-config.js.',
);
assert.match(generator, /id: 'universal-playlist-registration'/);
assert.match(generator, /id: 'universal-playlist-inline'/);
assert.match(inline, /openInline/);

assert.match(registration, /data-upl-step-label="3">3\. Salvar/);
assert.doesNotMatch(registration, /data-upl-step-label="4"/);
assert.match(
  registration,
  /data-upl-pane="3"[\s\S]*?RonecaUniversalPlaylists\.save\(\)[\s\S]*?<\/section>/,
  'A terceira etapa deve salvar sem obrigar teste prévio.',
);
assert.match(
  registration,
  /testSaved\([\s\S]*?api\('test',[\s\S]*?go\(4\)/,
  'O diagnóstico da lista já salva deve continuar disponível no cartão.',
);
const goSource = registration.slice(
  registration.indexOf('function go(step)'),
  registration.indexOf('async function edit('),
);
assert.doesNotMatch(goSource, /test\(\)/, 'Navegar entre etapas não pode disparar teste de rede.');

assert.match(registrationCss, /\.upl-field textarea\.upl-provider-message \{ min-height: 140px; \}/);
assert.match(registrationCss, /\.upl-field textarea \{[\s\S]*?box-sizing: border-box;/);
assert.match(registrationCss, /\.upl-mode input\[type="radio"\][\s\S]*?width: 16px !important;[\s\S]*?min-height: 16px !important;/);
assert.match(registrationCss, /\.upl-modal-card \{[\s\S]*?width: min\(1040px, 100%\);[\s\S]*?max-height: 92vh;/);
assert.match(registration, /class="upl-optional-fields upl-field wide"/);
assert.match(registrationCss, /@media \(max-width: 820px\)[\s\S]*?height: 100dvh;[\s\S]*?box-sizing: border-box;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(registrationCss, /\.upl-field textarea\.upl-provider-message \{ min-height: 96px; \}/);
assert.match(registrationCss, /\.upl-optional-fields > \.upl-grid \{ display: none !important;/);

console.log('✅ Painel: FK explícita, carregamento único e cadastro compacto em três etapas validados.');
