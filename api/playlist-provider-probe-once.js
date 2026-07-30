const ONE_TIME_TOKEN = 'VACWqdq57HWbcAmpWgO-3tbHlNldPQ2OrVJIVDA3p-o';
const ALLOWED_HOST = 'melhorplayer.com';

function send(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { ok: false, error: 'method_not_allowed' });
  if (request.headers['x-one-time-token'] !== ONE_TIME_TOKEN) {
    return send(response, 401, { ok: false, error: 'unauthorized' });
  }

  try {
    const rawUrl = String(request.body?.url || '').trim();
    const target = new URL(rawUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.hostname.toLowerCase() !== ALLOWED_HOST) {
      return send(response, 400, { ok: false, error: 'target_not_allowed' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const upstream = await fetch(target, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: '*/*',
          Range: 'bytes=0-2047',
          'User-Agent': 'RonecaPlayTV-Native',
          'Cache-Control': 'no-cache',
        },
      });
      const text = await upstream.text();
      return send(response, 200, {
        ok: upstream.ok,
        status: upstream.status,
        contentType: upstream.headers.get('content-type'),
        contentLength: upstream.headers.get('content-length'),
        beginsWithM3u: text.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U'),
        receivedCharacters: text.length,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return send(response, 200, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
