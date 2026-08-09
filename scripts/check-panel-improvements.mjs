import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [manager, registration, release, generator, inline] = await Promise.all([
  read('supabase/functions/playlist-source-manager/index.ts'),
  read('admin-panel/universal-playlist-registration.js'),
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

assert.match(registration, /data-upl-step-label="3">3\. Conferência e salvar/);
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

console.log('✅ Painel: FK explícita, carregamento único e cadastro em três etapas validados.');
