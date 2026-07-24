import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  server.close();
  await once(server, 'close');
  return port;
}

const port = await freePort();
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    RONECA_PROXY_ALLOWED_HOSTS: '',
    RONECA_ALLOW_PRIVATE_PROXY: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await Promise.race([
    once(child.stdout, 'data'),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('Servidor não iniciou no prazo.')),
      5_000,
    )),
  ]);

  const response = await fetch(
    `http://127.0.0.1:${port}/api/media-proxy?url=${encodeURIComponent('https://example.com/video.m3u8')}`,
  );
  const body = await response.text();

  assert.equal(response.status, 403);
  assert.match(body, /Host não permitido/i);
  console.log('✅ Proxy sem allowlist falha de forma segura.');
} finally {
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 2_000)),
  ]);
}
