import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';
import {
  assertAllowedPlaylistUrl,
  assertPublicPlaylistTarget,
} from './outboundFetch.ts';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_REDIRECTS = 4;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const UPSTREAM_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

function copyNodeHeaders(raw: Record<string, string | string[] | undefined>) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else headers.set(name, value);
  }
  return headers;
}

export async function fetchWebMediaUpstream(
  rawUrl: string,
  browserRequest: Request,
  redirectsLeft = DEFAULT_REDIRECTS,
): Promise<Response> {
  const target = assertAllowedPlaylistUrl(rawUrl);
  await assertPublicPlaylistTarget(target);

  return await new Promise<Response>((resolve, reject) => {
    const isHttps = target.protocol === 'https:';
    const requester = isHttps ? httpsRequest : httpRequest;
    const headers: Record<string, string> = { ...UPSTREAM_HEADERS };
    const range = browserRequest.headers.get('range');
    if (range && /^bytes=\d*-\d*$/i.test(range)) headers.Range = range;

    const upstreamRequest = requester(target, {
      method: browserRequest.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      rejectUnauthorized: isHttps ? true : undefined,
      servername: isHttps ? target.hostname : undefined,
    }, response => {
      const status = Number(response.statusCode || 502);
      const responseHeaders = copyNodeHeaders(
        response.headers as Record<string, string | string[] | undefined>,
      );
      const location = responseHeaders.get('location');

      if (REDIRECTS.has(status)) {
        response.resume();
        if (!location || redirectsLeft <= 0) {
          reject(new Error('WEB_MEDIA_REDIRECT_INVALID'));
          return;
        }
        const redirected = new URL(location, target).toString();
        void fetchWebMediaUpstream(redirected, browserRequest, redirectsLeft - 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      const body = browserRequest.method === 'HEAD'
        ? null
        : Readable.toWeb(response as unknown as Readable) as ReadableStream<Uint8Array>;
      resolve(new Response(body, { status, headers: responseHeaders }));
    });

    upstreamRequest.setTimeout(DEFAULT_TIMEOUT_MS, () => {
      upstreamRequest.destroy(new Error('WEB_MEDIA_UPSTREAM_TIMEOUT'));
    });
    upstreamRequest.on('error', error => {
      const code = error instanceof Error && error.message.startsWith('WEB_MEDIA_')
        ? error.message
        : 'WEB_MEDIA_UPSTREAM_CONNECT';
      reject(new Error(code));
    });
    upstreamRequest.end();
  });
}
