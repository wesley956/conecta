import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildXtreamApiUrl,
  buildXtreamStreamUrl,
  parseXtreamSource,
} from '../supabase/functions/_shared/xtreamSource.ts';
import {
  classifyPlaylistCacheFailure,
} from '../supabase/functions/_shared/playlistAccessMode.ts';

const subpath = parseXtreamSource(
  'https://provider.example:8443/customer-a/get.php?username=user%40name&password=p%40ss%2Fword&output=m3u8',
);
assert.ok(subpath, 'A fonte Xtream com subcaminho deve ser reconhecida.');
assert.equal(subpath.baseUrl, 'https://provider.example:8443/customer-a');
assert.equal(
  buildXtreamApiUrl(subpath, 'get_live_streams'),
  'https://provider.example:8443/customer-a/player_api.php?username=user%40name&password=p%40ss%2Fword&action=get_live_streams',
);
assert.equal(
  buildXtreamStreamUrl(subpath, 'live', 42, 'm3u8'),
  'https://provider.example:8443/customer-a/live/user%40name/p%40ss%2Fword/42.m3u8',
);

const root = parseXtreamSource(
  'http://provider.example/player_api.php?username=demo&password=secret',
);
assert.ok(root, 'A fonte Xtream na raiz deve ser reconhecida.');
assert.equal(root.baseUrl, 'http://provider.example');
assert.equal(
  buildXtreamApiUrl(root),
  'http://provider.example/player_api.php?username=demo&password=secret',
);

const refusedWithCredentialsInUrl = classifyPlaylistCacheFailure([
  {
    method: 'xtream',
    status: 'error',
    error: 'error sending request for url (https://provider.example/player_api.php?username=demo&password=secret): tcp connect error: Connection refused (os error 111)',
  },
  {
    method: 'm3u',
    status: 'error',
    error: 'error sending request for url (https://provider.example/get.php?username=demo&password=secret): client error (Connect): Connection refused',
  },
], 'xtream');
assert.equal(refusedWithCredentialsInUrl.code, 'DATACENTER_BLOCKED');
assert.equal(refusedWithCredentialsInUrl.accessMode, 'direct');
assert.equal(refusedWithCredentialsInUrl.directEligible, true);

const explicitAuthFailure = classifyPlaylistCacheFailure([
  {
    method: 'xtream',
    status: 'error',
    error: 'A conta Xtream não autorizou o acesso.',
  },
], 'xtream');
assert.equal(explicitAuthFailure.code, 'INVALID_CREDENTIALS');
assert.equal(explicitAuthFailure.accessMode, 'blocked');
assert.equal(explicitAuthFailure.directEligible, false);

const endpointNotFound = classifyPlaylistCacheFailure([
  { method: 'xtream', status: 'error', error: 'Login Xtream: HTTP 404.' },
  { method: 'm3u', status: 'error', error: 'Lista M3U: HTTP 404.' },
], 'xtream');
assert.equal(endpointNotFound.code, 'PROVIDER_ENDPOINT_NOT_FOUND');
assert.equal(endpointNotFound.accessMode, 'blocked');

const cache = await readFile(
  new URL('../supabase/functions/playlist-cache/index.ts', import.meta.url),
  'utf8',
);
assert.ok(!cache.includes('if (movies.length === 0)'), 'VOD vazio não pode invalidar TV ou séries válidas.');
assert.ok(!cache.includes('playlistUrl: snapshot.playlistUrl'), 'O cache não deve duplicar a URL secreta da fonte.');
const fetchJsonSource = cache.slice(cache.indexOf('async function fetchJson'), cache.indexOf('async function fetchText'));
assert.ok(fetchJsonSource.includes('resposta não é JSON.'), 'JSON inválido deve usar uma mensagem redigida.');
assert.ok(!fetchJsonSource.includes('raw.slice('), 'Respostas inválidas do provedor não devem vazar conteúdo no erro.');
assert.ok(!fetchJsonSource.includes('${raw}'), 'O corpo inválido não pode ser interpolado no erro.');
assert.ok(cache.includes("'Login Xtream', source.origin"), 'Chamadas Xtream devem bloquear redirecionamento de credenciais para outro domínio.');
assert.ok(cache.includes("errorCode: 'cache_generation_busy'"));
assert.ok(cache.includes("rpc('claim_playlist_cache_generation'"));

const accessMode = await readFile(
  new URL('../supabase/functions/_shared/playlistAccessMode.ts', import.meta.url),
  'utf8',
);
assert.ok(accessMode.includes("code: 'PROVIDER_ENDPOINT_NOT_FOUND'"));
assert.ok(!accessMode.includes("code: 'DATACENTER_HTTP_404'"));
assert.ok(accessMode.includes('removeUrlsAndQueryCredentials'));

const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
assert.match(config, /\[functions\.device-config-direct\]\s+verify_jwt = false/);

console.log('Xtream, cache parcial e configuração direta validados.');
