import assert from 'node:assert/strict';
import {
  parseProviderMessage,
  parseStructuredSource,
  safeEndpointPreview,
} from '../supabase/functions/_shared/universalPlaylistSource.ts';

const message = `⚡ BEM VINDO A NETPLAY ⚡

✅ Usuário: 23671391979
✅ Senha: 48181525422
📦 Plano: TESTE C/ ADULTO 12 HORAS
💵 Preço do Plano: R$ 0,00
🗓️ Criado em: 04/08/2026 20:09:47
🗓️ Vencimento: 05/08/2026 08:09:47
📶 Conexões: 2

💳 Assinar/Renovar Plano: https://netplay.mplll.com/#/checkout/EXAMPLE
ID GPC Pro Windows
Link para Download: https://www.mediafire.com/file/example/player.exe/file
Código Downloader: 9468503
Link para Download: https://dl.ntdev.in/64767
NETPLAY 2.0 APP PRÓPRIO
Link Curto: http://aftv.news/8454237
Link Direto: https://dl.explouddev.com/netplay

🌎 Links DNS
URL XC: http://netuno.live
URL: http://spd.blc-atena.com
Link (M3U): http://speed.blc-atena.com/get.php?username=23671391979&password=48181525422&type=m3u_plus&output=mpegts
Link Curto (M3U): http://e.speed.blc-atena.com/p/23671391979/48181525422/m3u
Link (HLS): http://speed.blc-atena.com/get.php?username=23671391979&password=48181525422&type=m3u_plus&output=hls
Link Curto (HLS): http://e.speed.blc-atena.com/p/23671391979/48181525422/hls
Link (SSIPTV): http://e.speed.blc-atena.com/p/23671391979/48181525422/ssiptv`;

const parsed = await parseProviderMessage(message, 'test-secret');
assert.equal(parsed.provider.name, 'NETPLAY');
assert.equal(parsed.provider.planName, 'TESTE C/ ADULTO 12 HORAS');
assert.equal(parsed.provider.maxConnections, 2);
assert.equal(parsed.provider.passwordConfigured, true);
assert.ok(parsed.provider.expiresAt);
assert.ok(parsed.warnings.some(item => item.includes('vencida')));
assert.equal(parsed.endpoints.length, 7);
assert.equal(parsed.endpoints.filter(item => item.type === 'xtream').length, 2);
assert.equal(parsed.endpoints.filter(item => item.type === 'm3u').length, 2);
assert.equal(parsed.endpoints.filter(item => item.type === 'hls').length, 2);
assert.equal(parsed.endpoints.filter(item => item.type === 'ssiptv').length, 1);
assert.equal(parsed.endpoints.filter(item => item.primary).length, 1);
assert.ok(parsed.externalLinks.length >= 4);
assert.ok(parsed.endpoints.every(item => !item.preview.includes('48181525422')));
assert.ok(!JSON.stringify(parsed.redactedSummary).includes('48181525422'));
assert.ok(!safeEndpointPreview(parsed.endpoints[0].url).includes('48181525422'));
assert.ok(parsed.endpoints.some(item => item.host === 'spd.blc-atena.com'));

const special = await parseStructuredSource({
  sourceKind: 'direct',
  endpoints: [
    { type: 'rtmp', label: 'RTMP principal', url: 'rtmp://stream.example.com:1935/live/channel', primary: true },
    { type: 'rtsp', label: 'RTSP reserva', url: 'rtsp://stream.example.com:554/channel' },
  ],
}, 'test-secret');
assert.equal(special.endpoints[0].protocol, 'rtmp');
assert.equal(special.endpoints[1].protocol, 'rtsp');
assert.equal(special.endpoints.filter(item => item.primary).length, 1);

console.log('Cadastro universal: parser da mensagem Netplay e origens especiais aprovados.');
