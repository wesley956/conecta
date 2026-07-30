import assert from 'node:assert/strict';
import {
  assertAllowedPlaylistUrl,
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

console.log('Outbound playlist security checks passed.');
