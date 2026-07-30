const ALLOWED_HOST = 'melhorplayer.com';
const CALLBACK_URL = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/playlist-provider-probe-result-once';
const CALLBACK_TOKEN = 'OBujVzw1eRCRgem98jm155DuL_ArJYtO7C6JBcsA5P0';

function send(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function report(result) {
  try {
    await fetch(CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-callback-token': CALLBACK_TOKEN,
      },
      body: JSON.stringify(result),
    });
  } catch {
    // O resultado principal ainda é devolvido caso o callback falhe.
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { ok: false, error: 'method_not_allowed' });

  let result;
  try {
    const rawUrl = String(request.body?.url || '').trim();
    const target = new URL(rawUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.hostname.toLowerCase() !== ALLOWED_HOST) {
      result = { ok: false, error: 'target_not_allowed' };
      await report(result);
      return send(response, 400, result);
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
      result = {
        ok: upstream.ok,
        status: upstream.status,
        contentType: upstream.headers.get('content-type'),
        contentLength: upstream.headers.get('content-length'),
        beginsWithM3u: text.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U'),
        receivedCharacters: text.length,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  await report(result);
  return send(response, 200, result);
}
