import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import {
  assertAllowedOutboundOrigin,
  assertAllowedPlaylistUrl,
  assertPublicPlaylistTarget,
} from './outboundFetch.ts';

export type TlsMode = 'strict' | 'custom_ca' | 'insecure';

export type ProbeOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  followRedirects?: boolean;
  redirectsLeft?: number;
  allowedOrigins?: string[];
  tlsMode?: TlsMode;
  customCaPem?: string | null;
  allowedTlsHosts?: string[];
  allowSubdomains?: boolean;
  allowRedirectHosts?: boolean;
};

export type ProbeResult = {
  ok: boolean;
  status: number;
  durationMs: number;
  bytes: number;
  contentType: string | null;
  server: string | null;
  finalUrl: string;
  redirectChain: string[];
  sample: string;
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function hostAllowed(hostname: string, allowed: string[], allowSubdomains: boolean) {
  const host = normalizeHost(hostname);
  return allowed.some(raw => {
    const candidate = normalizeHost(raw.split(':')[0]);
    return host === candidate || (allowSubdomains && host.endsWith(`.${candidate}`));
  });
}

function assertTlsExceptionAllowed(target: URL, options: ProbeOptions) {
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

function sanitizedLocation(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '';
  }
}

function requestNode(target: URL, options: ProbeOptions) {
  return new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    bytes: Uint8Array;
  }>((resolve, reject) => {
    const maxBytes = Math.max(1024, Math.min(5 * 1024 * 1024, options.maxBytes || 256 * 1024));
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
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Tempo limite de ${Math.round(timeoutMs / 1000)} segundos excedido.`)));
    request.on('error', reject);
    if (options.body && (options.method || 'GET') === 'POST') request.write(options.body);
    request.end();
  });
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || null : value || null;
}

export async function probeUniversalEndpoint(
  rawUrl: string,
  options: ProbeOptions = {},
  redirectChain: string[] = [],
): Promise<ProbeResult> {
  const startedAt = Date.now();
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
    return await probeUniversalEndpoint(redirected.toString(), {
      ...options,
      redirectsLeft: redirectsLeft - 1,
    }, [...redirectChain, sanitizedLocation(target.toString())]);
  }

  const contentType = headerValue(response.headers, 'content-type');
  let sample = '';
  try {
    sample = new TextDecoder('utf-8').decode(response.bytes.slice(0, 4096)).replace(/^\uFEFF/, '');
  } catch {
    sample = '';
  }

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    durationMs: Date.now() - startedAt,
    bytes: response.bytes.byteLength,
    contentType,
    server: headerValue(response.headers, 'server'),
    finalUrl: target.toString(),
    redirectChain: [...redirectChain, sanitizedLocation(target.toString())],
    sample,
  };
}

export function classifyProbeError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || 'Falha desconhecida.');
  const lower = message.toLowerCase();
  if (/certificate|certificado|self signed|unknown issuer|hostname|tls|ssl/.test(lower)) {
    return { code: 'TLS_CERTIFICATE_ERROR', message: 'O servidor apresentou um erro de certificado HTTPS.' };
  }
  if (/dns|resolve|nome.*host|not known/.test(lower)) {
    return { code: 'DNS_FAILED', message: 'O domínio não pôde ser encontrado no DNS público.' };
  }
  if (/tempo limite|timed out|timeout/.test(lower)) {
    return { code: 'TIMEOUT', message: 'O servidor não respondeu dentro do tempo permitido.' };
  }
  if (/redirecionamento/.test(lower)) {
    return { code: 'REDIRECT_BLOCKED', message };
  }
  if (/private|privado|local|reservado/.test(lower)) {
    return { code: 'SSRF_BLOCKED', message: 'O endereço informado não pode apontar para redes privadas ou locais.' };
  }
  return { code: 'CONNECTION_FAILED', message: message.slice(0, 500) };
}
