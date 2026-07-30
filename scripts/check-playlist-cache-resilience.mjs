import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/playlist-cache/index.ts', import.meta.url), 'utf8');

for (const required of [
  "const CACHE_LOCK_ID = 'global'",
  "from('playlist_cache_generation_lock')",
  "error.code === '23505'",
  "previousCacheIsUsable ? 'ready' : 'error'",
  "'A atualização falhou, mas o cache anterior continua ativo.'",
  'finally {',
  'await releaseCacheLock(supabase, lock.token)',
  'const channelsUpload = await uploadJsonCachePart',
  'const moviesUpload = await uploadJsonCachePart',
  'const seriesUpload = await uploadJsonCachePart',
  'await mapInBatches',
]) {
  assert.ok(source.includes(required), `Proteção ausente: ${required}`);
}

assert.ok(!source.includes("const [liveStreams, vodStreams, seriesItems] = await Promise.all"), 'Catálogos grandes não podem ser carregados em paralelo.');
assert.ok(!source.includes("const [manifestUpload, channelsUpload, moviesUpload, seriesUpload] = await Promise.all"), 'Partes grandes não podem ser serializadas em paralelo.');

console.log('Playlist cache resilience checks passed.');
