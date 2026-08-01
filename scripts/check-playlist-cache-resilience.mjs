import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/playlist-cache/index.ts', import.meta.url), 'utf8');
const externalWriters = await Promise.all([
  '../supabase/functions/admin-panel/index.ts',
  '../supabase/functions/seller-panel/index.ts',
  '../supabase/functions/admin-inline-playlist/index.ts',
  '../supabase/functions/subscription-playlist-edit/index.ts',
].map(path => readFile(new URL(path, import.meta.url), 'utf8')));

for (const required of [
  "rpc('claim_playlist_cache_generation'",
  "rpc('heartbeat_playlist_cache_generation'",
  "rpc('complete_playlist_cache_generation'",
  "rpc('fail_playlist_cache_generation'",
  'const CACHE_GENERATIONS_TO_KEEP = 2',
  'buildCacheManifest({',
  'manifestSha256: manifestUpload.sha256',
  "upsert: false",
  "cacheControl: '31536000'",
  "message: 'Esta lista já possui uma geração de cache em andamento.'",
  "'A atualização falhou, mas o cache anterior continua ativo.'",
  'const channelsUpload = await uploadJsonCachePart',
  'const moviesUpload = await uploadJsonCachePart',
  'const seriesUpload = await uploadJsonCachePart',
  'await mapDefinedInBatches',
  'iterateNonEmptyLines(raw)',
  'runTasksWithConcurrency([',
  'snapshot.channels = []',
  'snapshot.movies = []',
  'snapshot.series = []',
  'const hasXtreamCredentials = Boolean(parseXtreamSource(playlist.playlist_url))',
  "hasXtreamCredentials || playlistType === 'xtream'",
]) {
  assert.ok(source.includes(required), `Proteção ausente: ${required}`);
}

assert.ok(!source.includes("const [liveStreams, vodStreams, seriesItems] = await Promise.all"), 'Catálogos grandes não podem ser carregados em paralelo.');
assert.ok(!source.includes("const [manifestUpload, channelsUpload, moviesUpload, seriesUpload] = await Promise.all"), 'Partes grandes não podem ser serializadas em paralelo.');
assert.ok(!source.includes("const CACHE_LOCK_ID = 'global'"), 'A geração não pode voltar a usar uma trava global.');
assert.ok(!source.includes("from('playlist_cache_generation_lock')"), 'A Edge Function não pode depender da trava global legada.');
assert.ok(!source.includes("raw.split(/\\r?\\n/)"), 'O parser M3U não pode duplicar toda a lista em um vetor de linhas.');
for (const writer of externalWriters) {
  assert.ok(
    !writer.includes("playlist_cache_status: 'processing'"),
    'Chamadores externos não podem marcar processing antes de obter o lease.',
  );
}

console.log('Playlist cache resilience checks passed.');
