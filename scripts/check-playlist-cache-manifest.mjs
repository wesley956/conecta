import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  buildCacheManifest,
  encodeJsonCachePart,
  sha256Hex,
} from '../supabase/functions/_shared/cacheManifest.ts';
import { runTasksWithConcurrency } from '../supabase/functions/_shared/limitedConcurrency.ts';

const channels = await encodeJsonCachePart({ channels: [{ id: 'channel-1', name: 'Canal autorizado' }] });
const movies = await encodeJsonCachePart({ movies: [] });
const series = await encodeJsonCachePart({ series: [] });

assert.equal(channels.sizeBytes, Buffer.byteLength(channels.body));
assert.match(channels.sha256, /^[0-9a-f]{64}$/);
assert.equal(channels.sha256, await sha256Hex(channels.body));

const manifest = buildCacheManifest({
  schemaVersion: 2,
  generatedAt: '2026-08-01T00:00:00.000Z',
  playlistId: 'playlist-1',
  playlistName: 'Lista de teste',
  attemptId: 'attempt-1',
  version: 'version-1',
  counts: { channels: 1, movies: 0, series: 0, total: 1 },
  channels: { path: 'playlist-1/attempt-1/channels.json', sizeBytes: channels.sizeBytes, sha256: channels.sha256 },
  movies: { path: 'playlist-1/attempt-1/movies.json', sizeBytes: movies.sizeBytes, sha256: movies.sha256 },
  series: { path: 'playlist-1/attempt-1/series.json', sizeBytes: series.sizeBytes, sha256: series.sha256 },
  manifestPath: 'playlist-1/attempt-1/manifest.json',
});

assert.equal(manifest.attemptId, 'attempt-1');
assert.equal(manifest.integrity.algorithm, 'sha256');
assert.equal(manifest.integrity.channels.sha256, channels.sha256);
assert.equal(manifest.integrity.channels.bytes, channels.sizeBytes);
assert.equal(manifest.files.manifest, 'playlist-1/attempt-1/manifest.json');

let active = 0;
let maximumActive = 0;
const results = await runTasksWithConcurrency(
  Array.from({ length: 7 }, (_, index) => async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return index;
  }),
  2,
);

assert.equal(maximumActive, 2, 'O coletor Xtream deve respeitar o limite configurado.');
assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6], 'O paralelismo não deve alterar a ordem lógica dos resultados.');

await assert.rejects(
  () => runTasksWithConcurrency([async () => true], 0),
  /inteiro positivo/,
);

console.log('Manifest SHA-256 e limite de concorrência do cache validados.');
