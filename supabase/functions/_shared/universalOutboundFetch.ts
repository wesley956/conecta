import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import {
  assertAllowedOutboundOrigin,
  assertAllowedPlaylistUrl,
  assertPublicPlaylistTarget,
} from './outboundFetch.ts';

export type UniversalTlsMode = 'strict' | 'custom_ca' | 'insecure';

export type UniversalFetchOptions = {
  label?: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  followRedirects?: boolean;
  redirectsLeft?: number;
  allowedOrigins?: string[];
  tlsMode?: UniversalTlsMode;
  customCaPem?: string | null;
  allowedTlsHosts?: string[];
  allowSubdomains?: boolean;
  allowRedirectHosts?: boolean;
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function hostAllowed(hostname: string, allowed: string[], allowSubdomains: boolean) {
  const host = normalizeHost(hostname);
  return allowed.some(raw => {
    const candidate = normalizeHost(raw.split(':')[0]);
    return candidate.length > 0 && (
      host === candidate || (allowSubdomains && host.endsWith(`.${candidate}`))
    );
  });
}

function assertTlsExceptionAllowed(target: URL, options: UniversalFetchOptions) {
  const mode = options.tlsMode || 'strict';
  if (mode === 'strict' || target.protocol !== 'https:') return;
  const allowed = options.allowedTlsHosts || [];
  if (!hostAllowed(target.hostname, allowed, options.allowSubdomains === true)) {
    throw new Error('A exceção TLS não está autorizada para este domínio.');
  }
  if (mode === 'custom_ca' && !String(options.customCaPem || '').includes('BEGIN CERTIFICATE')) {
    throw new Error('O certificado personalizado não foi informado corretamente.');
  }
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || null : value || null;
}

function requestNode(target: URL, options: UniversalFetchOptions) {
  return new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    bytes: Uint8Array;
  }>((resolve, reject) => {
    const maxBytes = Math.max(1024, Math.min(MAX_RESPONSE_BYTES, options.maxBytes || 256 * 1024));
    const timeoutMs = Math.max(1000, Math.min(180000, options.timeoutMs || 45000));
    const mode = options.tlsMode || 'strict';
    const isHttps = target.protocol === 'https:';
    const requester = isHttps ? httpsRequest : httpRequest;
    const request = requester(target, {
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: isHttps ? mode !== 'insecure' : undefined,
      ca: isHttps && mode === 'custom_ca' ? options.customCaPem || undefined : undefined,
      servername: isHttps ? target.hostname : undefined,
    }, response => {
      const declared = Number(headerValue(
        response.headers as Record<string, string | string[] | undefined>,
        'content-length',
      ) || 0);
      if (declared > maxBytes) {
        request.destroy(new Error(`Resposta excedeu o limite de ${maxBytes} bytes.`));
        return;
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      response.on('data', chunk => {
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        total += bytes.byteLength;
        if (total > maxBytes) {
          request.destroy(new Error(`Resposta excedeu o limite de ${maxBytes} bytes.`));
          return;
        }
        chunks.push(bytes);
      });
      response.on('end', () => {
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve({
          status: Number(response.statusCode || 0),
          headers: response.headers as Record<string, string | string[] | undefined>,
          bytes: combined,
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Tempo limite de ${Math.round(timeoutMs / 1000)} segundos excedido.`));
    });
    request.on('error', reject);
    if (options.body && (options.method || 'GET') === 'POST') request.write(options.body);
    request.end();
  });
}

export async function fetchUniversalPlaylistText(
  rawUrl: string,
  options: UniversalFetchOptions = {},
): Promise<string> {
  const target = assertAllowedPlaylistUrl(rawUrl);
  assertAllowedOutboundOrigin(target, options.allowedOrigins);
  await assertPublicPlaylistTarget(target);
  assertTlsExceptionAllowed(target, options);

  const response = await requestNode(target, options);
  const location = headerValue(response.headers, 'location');
  const redirectsLeft = Math.max(0, options.redirectsLeft ?? 5);

  if (REDIRECTS.has(response.status) && location && options.followRedirects !== false) {
    if (redirectsLeft <= 0) throw new Error('Limite de redirecionamentos excedido.');
    const redirected = new URL(location, target);
    const sameOrigin = redirected.origin === target.origin;
    if (!sameOrigin && !options.allowRedirectHosts) {
      throw new Error(`Redirecionamento para outro domínio bloqueado: ${redirected.hostname}.`);
    }
    if (!sameOrigin && options.allowRedirectHosts) {
      const allowed = options.allowedTlsHosts || [];
      if (!hostAllowed(redirected.hostname, allowed, options.allowSubdomains === true)) {
        throw new Error(`O domínio de redirecionamento ${redirected.hostname} ainda não foi autorizado.`);
      }
    }
    return await fetchUniversalPlaylistText(redirected.toString(), {
      ...options,
      redirectsLeft: redirectsLeft - 1,
    });
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${options.label || 'Origem'}: servidor respondeu HTTP ${response.status}.`);
  }

  try {
    return new TextDecoder('utf-8').decode(response.bytes).replace(/^\uFEFF/, '');
  } catch {
    throw new Error(`${options.label || 'Origem'}: resposta não pôde ser interpretada como texto UTF-8.`);
  }
}
