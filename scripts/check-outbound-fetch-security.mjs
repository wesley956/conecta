import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertAllowedPlaylistUrl,
  assertAllowedOutboundOrigin,
  assertPublicPlaylistTarget,
  isPrivateIpAddress,
} from '../supabase/functions/_shared/outboundFetch.ts';

assert.equal(assertAllowedPlaylistUrl('https://new-provider.example/get.php?username=a').hostname, 'new-provider.example');
assert.throws(() => assertAllowedPlaylistUrl('file:///etc/passwd'), /HTTP e HTTPS/);
assert.throws(() => assertAllowedPlaylistUrl('http://127.0.0.1/list.m3u'), /privados/);
assert.throws(() => assertAllowedPlaylistUrl('http://192.168.1.1/list.m3u'), /privados/);
assert.throws(() => assertAllowedPlaylistUrl('http://[::1]/list.m3u'), /privados/);
assert.throws(() => assertAllowedPlaylistUrl('http://metadata.google.internal/list.m3u'), /privados/);

for (const address of [
  '10.0.0.1',
  '100.64.0.1',
  '169.254.169.254',
  '172.16.0.1',
  '192.168.0.1',
  '198.51.100.1',
  '203.0.113.1',
  '::1',
  '::ffff:127.0.0.1',
  '::ffff:192.168.1.1',
  'fc00::1',
  'fe80::1',
]) {
  assert.equal(isPrivateIpAddress(address), true, address);
}

assert.equal(isPrivateIpAddress('8.8.8.8'), false);
assert.equal(isPrivateIpAddress('2606:4700:4700::1111'), false);

assert.doesNotThrow(() => assertAllowedOutboundOrigin(
  new URL('https://provider.example:8443/player_api.php'),
  ['https://provider.example:8443'],
));
assert.throws(
  () => assertAllowedOutboundOrigin(
    new URL('https://redirected.example/player_api.php'),
    ['https://provider.example'],
  ),
  /outro domínio/,
);

const publicTarget = new URL('https://new-provider.example/list.m3u');
await assertPublicPlaylistTarget(publicTarget, async (_hostname, type) => type === 'A' ? ['8.8.8.8'] : []);

await assert.rejects(
  () => assertPublicPlaylistTarget(publicTarget, async (_hostname, type) => type === 'A' ? ['10.0.0.10'] : []),
  /privado/,
);

await assert.rejects(
  () => assertPublicPlaylistTarget(publicTarget, async () => []),
  /DNS público/,
);

const outboundSource = await readFile(
  new URL('../supabase/functions/_shared/outboundFetch.ts', import.meta.url),
  'utf8',
);
assert.ok(!outboundSource.includes('raw.slice('), 'O corpo do provedor não pode ser incluído em mensagens de erro.');

console.log('Outbound playlist security checks passed.');
