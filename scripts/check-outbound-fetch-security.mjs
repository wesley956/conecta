import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertAllowedPlaylistUrl,
  assertAllowedOutboundOrigin,
  assertPublicPlaylistTarget,
  isPrivateIpAddress,
  safeFetchPlaylistText,
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
const publicDns = async (_hostname, type) => type === 'A' ? ['8.8.8.8'] : [];
await assertPublicPlaylistTarget(publicTarget, publicDns);

await assert.rejects(
  () => assertPublicPlaylistTarget(publicTarget, async (_hostname, type) => type === 'A' ? ['10.0.0.10'] : []),
  /privado/,
);

await assert.rejects(
  () => assertPublicPlaylistTarget(publicTarget, async () => []),
  /DNS público/,
);

const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();

try {
  globalThis.fetch = async (_target, init = {}) => {
    const signal = init.signal;
    const chunks = ['{"', 'ok"', ':true', '}'];

    return new Response(new ReadableStream({
      start(controller) {
        let index = 0;
        const timer = setInterval(() => {
          controller.enqueue(encoder.encode(chunks[index]));
          index += 1;
          if (index >= chunks.length) {
            clearInterval(timer);
            controller.close();
          }
        }, 400);

        signal?.addEventListener('abort', () => {
          clearInterval(timer);
          controller.error(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const startedAt = Date.now();
  const slowPayload = await safeFetchPlaylistText(
    'https://new-provider.example/catalog.json',
    {
      label: 'Catálogo lento',
      timeoutMs: 1_000,
      maxTotalMs: 5_000,
      maxBytes: 1_024,
      resolveDns: publicDns,
    },
  );

  assert.equal(slowPayload, '{"ok":true}');
  assert.ok(
    Date.now() - startedAt >= 1_200,
    'O teste precisa ultrapassar o timeout antigo absoluto sem interromper um download ativo.',
  );

  globalThis.fetch = async (_target, init = {}) => {
    const signal = init.signal;

    return new Response(new ReadableStream({
      start(controller) {
        signal?.addEventListener('abort', () => {
          controller.error(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      },
    }), { status: 200 });
  };

  await assert.rejects(
    () => safeFetchPlaylistText(
      'https://new-provider.example/stalled.json',
      {
        label: 'Catálogo parado',
        timeoutMs: 1_000,
        maxTotalMs: 5_000,
        maxBytes: 1_024,
        resolveDns: publicDns,
      },
    ),
    /tempo limite sem progresso/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

const outboundSource = await readFile(
  new URL('../supabase/functions/_shared/outboundFetch.ts', import.meta.url),
  'utf8',
);
assert.ok(!outboundSource.includes('raw.slice('), 'O corpo do provedor não pode ser incluído em mensagens de erro.');
assert.ok(outboundSource.includes('MAX_TOTAL_TIMEOUT_MS'), 'Downloads lentos precisam manter limite total de segurança.');
assert.ok(outboundSource.includes('resetInactivityTimer'), 'O timeout deve ser renovado quando novos dados chegam.');

console.log('Outbound playlist security and slow-provider checks passed.');
