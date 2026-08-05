import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const OUTPUT_DIR = process.env.DIAGNOSTIC_OUTPUT_DIR || 'artifacts';
const USER_AGENT = 'RonecaPlayTV-Terminal-Diagnostic/1.0 (GitHub Actions)';
const SAMPLE_LIMIT = 128 * 1024;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function classifyError(error) {
  const code = String(error?.cause?.code || error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  if (error?.name === 'AbortError' || message.includes('timed out') || message.includes('timeout')) return 'timeout';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code) || message.includes('getaddrinfo')) return 'dns_error';
  if (['ECONNREFUSED'].includes(code)) return 'connection_refused';
  if (['ECONNRESET', 'UND_ERR_SOCKET'].includes(code)) return 'connection_reset';
  if (code.includes('CERT') || code.includes('SSL') || message.includes('certificate')) return 'tls_error';
  return 'network_error';
}

function decodeSample(chunks, total) {
  const body = Buffer.concat(chunks, total);
  return body.subarray(0, Math.min(body.length, 4096)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
}

async function probe(url, timeoutMs, sampleLimit = SAMPLE_LIMIT) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: '*/*',
        'User-Agent': USER_AGENT,
        Connection: 'close',
      },
    });
    const headersMs = elapsedMs(startedAt);
    const chunks = [];
    let total = 0;
    let ttfbMs = null;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (total < sampleLimit) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value?.length) continue;
          if (ttfbMs === null) ttfbMs = elapsedMs(startedAt);
          const remaining = sampleLimit - total;
          const part = Buffer.from(value.subarray(0, remaining));
          chunks.push(part);
          total += part.length;
          if (part.length < value.length || total >= sampleLimit) break;
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
    return {
      transportOk: response.status >= 200 && response.status < 400,
      status: response.status,
      headersMs,
      ttfbMs: ttfbMs ?? headersMs,
      elapsedMs: elapsedMs(startedAt),
      bytesSampled: total,
      contentType: String(response.headers.get('content-type') || '').slice(0, 100),
      redirected: response.redirected,
      finalScheme: new URL(response.url).protocol.replace(':', ''),
      sample: decodeSample(chunks, total),
    };
  } catch (error) {
    return {
      transportOk: false,
      error: classifyError(error),
      elapsedMs: elapsedMs(startedAt),
      sample: '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(sample) {
  if (!sample) return null;
  try {
    return JSON.parse(sample);
  } catch {
    return null;
  }
}

function classifyM3u(result) {
  if (!result.transportOk) return result.error || 'transport_error';
  if (!(result.status >= 200 && result.status < 400)) return `http_${result.status}`;
  const sample = result.sample.trimStart();
  if (sample.startsWith('#EXTM3U')) return 'm3u_ok';
  if (!sample) return 'empty';
  if (/^<!doctype|^<html/i.test(sample)) return 'html';
  if (sample.startsWith('{') || sample.startsWith('[')) return 'json_instead_of_m3u';
  return 'unexpected_body';
}

function classifyAuth(result) {
  if (!result.transportOk) return result.error || 'transport_error';
  if (!(result.status >= 200 && result.status < 400)) return `http_${result.status}`;
  const parsed = parseJson(result.sample);
  if (parsed && typeof parsed === 'object') {
    const auth = parsed?.user_info?.auth ?? parsed?.auth;
    if (auth === 1 || auth === '1' || auth === true) return 'auth_ok';
    if (auth === 0 || auth === '0' || auth === false) return 'auth_rejected';
    return 'json_without_auth';
  }
  if (!result.sample) return 'empty';
  if (/^<!doctype|^<html/i.test(result.sample)) return 'html';
  return 'invalid_json';
}

function classifyCatalog(result) {
  if (!result.transportOk) return result.error || 'transport_error';
  if (!(result.status >= 200 && result.status < 400)) return `http_${result.status}`;
  const sample = result.sample.trimStart();
  const parsed = parseJson(sample);
  if (Array.isArray(parsed)) return parsed.length ? 'json_nonempty' : 'json_empty';
  if (parsed && typeof parsed === 'object') return 'json_object';
  if (sample.startsWith('[')) {
    if (/^\[\s*\]/.test(sample)) return 'json_empty';
    return 'json_nonempty_sample';
  }
  if (!sample) return 'empty';
  if (/^<!doctype|^<html/i.test(sample)) return 'html';
  return 'invalid_json';
}

function deriveXtream(url) {
  const parsed = new URL(url);
  const username = parsed.searchParams.get('username') || parsed.searchParams.get('user');
  const password = parsed.searchParams.get('password') || parsed.searchParams.get('pass');
  if (!username || !password) return null;
  const lowerPath = parsed.pathname.toLowerCase();
  let basePath;
  if (lowerPath.endsWith('/get.php')) basePath = parsed.pathname.slice(0, -'/get.php'.length);
  else if (lowerPath.endsWith('/player_api.php')) basePath = parsed.pathname.slice(0, -'/player_api.php'.length);
  else return null;
  const api = new URL(parsed.toString());
  api.pathname = `${basePath.replace(/\/$/, '')}/player_api.php`;
  api.hash = '';
  api.search = '';
  return { api, username, password };
}

function apiUrl(derived, action = null) {
  const url = new URL(derived.api.toString());
  url.searchParams.set('username', derived.username);
  url.searchParams.set('password', derived.password);
  if (action) url.searchParams.set('action', action);
  return url;
}

function publicProbe(result, classification) {
  return {
    class: classification,
    status: result.status ?? null,
    headersMs: result.headersMs ?? null,
    ttfbMs: result.ttfbMs ?? null,
    elapsedMs: result.elapsedMs ?? null,
    bytesSampled: result.bytesSampled ?? 0,
    error: result.error ?? null,
    redirected: result.redirected ?? false,
    finalScheme: result.finalScheme ?? null,
  };
}

function catalogSuccess(value) {
  return ['json_nonempty', 'json_nonempty_sample', 'json_object'].includes(value?.class);
}

function overall(result) {
  const auth = result.auth?.class;
  const content = [result.channels, result.movies, result.series];
  const successes = content.filter(catalogSuccess).length;
  if (auth === 'auth_ok' && successes === 3) return 'api_full_ok';
  if (auth === 'auth_ok' && successes > 0) return 'api_partial_ok';
  if (auth === 'auth_ok') return 'auth_ok_content_failed';
  if (auth === 'auth_rejected') return 'auth_rejected';
  if (result.m3u?.class === 'm3u_ok') return result.apiSupported ? 'm3u_ok_api_failed' : 'm3u_ok';
  if ([result.auth, result.channels, result.movies, result.series, result.m3u]
      .filter(Boolean)
      .some(item => item.class === 'timeout')) return 'timeout';
  if ([result.auth, result.channels, result.movies, result.series, result.m3u]
      .filter(Boolean)
      .some(item => ['dns_error', 'connection_refused', 'connection_reset', 'tls_error', 'network_error'].includes(item.class))) {
    return 'transport_failed';
  }
  return 'failed';
}

async function testOrigin(url, playlistType) {
  const originKey = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12);
  const m3uRaw = await probe(url, 20000, 128 * 1024);
  const result = {
    originKey,
    playlistType,
    m3u: publicProbe(m3uRaw, classifyM3u(m3uRaw)),
  };
  const derived = deriveXtream(url);
  result.apiSupported = Boolean(derived);
  if (!derived) {
    result.overall = overall(result);
    return result;
  }
  const authRaw = await probe(apiUrl(derived), 12000, 64 * 1024);
  result.auth = publicProbe(authRaw, classifyAuth(authRaw));
  const endpoints = [
    ['channels', 'get_live_streams'],
    ['movies', 'get_vod_streams'],
    ['series', 'get_series'],
  ];
  for (const [key, action] of endpoints) {
    const raw = await probe(apiUrl(derived, action), 20000, 128 * 1024);
    result[key] = publicProbe(raw, classifyCatalog(raw));
  }
  result.overall = overall(result);
  return result;
}

async function mapLimit(entries, limit, worker) {
  const results = new Array(entries.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= entries.length) return;
      results[index] = await worker(entries[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, run));
  return results;
}

function md(value) {
  return String(value ?? '').replace(/[\r\n|]+/g, ' ').slice(0, 120);
}

const restUrl = new URL(`${SUPABASE_URL}/rest/v1/panel_playlists`);
restUrl.searchParams.set('select', 'id,name,playlist_type,playlist_url,playlist_access_mode,playlist_cache_status,playlist_qualification_status,created_at');
restUrl.searchParams.set('active', 'eq.true');
restUrl.searchParams.set('order', 'created_at.asc');

const dbResponse = await fetch(restUrl, {
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json',
  },
});
if (!dbResponse.ok) throw new Error(`Falha ao consultar listas: HTTP ${dbResponse.status}.`);
const rows = await dbResponse.json();

const unique = new Map();
for (const row of rows) {
  const url = String(row.playlist_url || '').trim();
  if (!url) continue;
  if (!unique.has(url)) unique.set(url, { url, playlistType: row.playlist_type, rows: [] });
  unique.get(url).rows.push(row);
}

const origins = [...unique.values()];
const tested = await mapLimit(origins, 6, entry => testOrigin(entry.url, entry.playlistType));
const byUrl = new Map(origins.map((entry, index) => [entry.url, tested[index]]));

const report = rows.map(row => {
  const result = byUrl.get(String(row.playlist_url || '').trim()) || {
    originKey: null,
    apiSupported: false,
    overall: 'missing_url',
  };
  return {
    id: row.id,
    name: row.name,
    playlistType: row.playlist_type,
    accessModeBefore: row.playlist_access_mode,
    cacheStatusBefore: row.playlist_cache_status,
    qualificationBefore: row.playlist_qualification_status,
    originKey: result.originKey,
    overall: result.overall,
    apiSupported: result.apiSupported,
    auth: result.auth || null,
    channels: result.channels || null,
    movies: result.movies || null,
    series: result.series || null,
    m3u: result.m3u || null,
  };
});

const counts = {};
for (const item of report) counts[item.overall] = (counts[item.overall] || 0) + 1;
const generatedAt = new Date().toISOString();
const payload = {
  generatedAt,
  runner: 'github-actions-terminal',
  activeRows: rows.length,
  uniqueOrigins: origins.length,
  counts,
  report,
};

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(`${OUTPUT_DIR}/playlist-terminal-diagnostics.json`, JSON.stringify(payload, null, 2));

const lines = [
  '# Diagnóstico de listas pelo terminal',
  '',
  `Gerado em: ${generatedAt}`,
  '',
  `- Listas ativas: **${rows.length}**`,
  `- Origens únicas testadas: **${origins.length}**`,
  '',
  '## Resumo',
  '',
  '| Resultado | Quantidade |',
  '|---|---:|',
  ...Object.entries(counts).sort().map(([key, value]) => `| ${md(key)} | ${value} |`),
  '',
  '## Resultado por lista',
  '',
  '| Lista | Tipo | Resultado | Login | Canais | Filmes | Séries | M3U | Origem |',
  '|---|---|---|---|---|---|---|---|---|',
  ...report.map(item => `| ${md(item.name)} | ${md(item.playlistType)} | ${md(item.overall)} | ${md(item.auth?.class || 'n/a')} | ${md(item.channels?.class || 'n/a')} | ${md(item.movies?.class || 'n/a')} | ${md(item.series?.class || 'n/a')} | ${md(item.m3u?.class || 'n/a')} | ${md(item.originKey || 'n/a')} |`),
  '',
  '> O relatório não contém URL, domínio, usuário, senha ou token.',
  '',
];
await fs.writeFile(`${OUTPUT_DIR}/playlist-terminal-diagnostics.md`, lines.join('\n'));

console.log(JSON.stringify({
  activeRows: rows.length,
  uniqueOrigins: origins.length,
  counts,
  output: OUTPUT_DIR,
}));
