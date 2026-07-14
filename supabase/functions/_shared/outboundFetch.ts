const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_BYTES = 80 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string) {
  const normalized = normalizeHostname(hostname).split('%')[0];

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}

function isPrivateLiteralHost(hostname: string) {
  const normalized = normalizeHostname(hostname);

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized)
  );
}

function readAllowedHosts() {
  return String(Deno.env.get('PLAYLIST_ALLOWED_HOSTS') || '')
    .split(',')
    .map(normalizeHostname)
    .filter(Boolean);
}

function hostnameMatchesRule(hostname: string, rule: string) {
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(2);
    return hostname.endsWith(`.${suffix}`) && hostname !== suffix;
  }

  return hostname === rule;
}

export function assertAllowedPlaylistUrl(rawUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL externa inválida.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Somente URLs HTTP e HTTPS são permitidas.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Credenciais na autoridade da URL não são permitidas. Use query string do provedor.');
  }

  if (isPrivateLiteralHost(parsed.hostname)) {
    throw new Error('Endereços privados, locais ou reservados não são permitidos.');
  }

  const allowedHosts = readAllowedHosts();

  if (allowedHosts.length === 0) {
    throw new Error('PLAYLIST_ALLOWED_HOSTS não configurado. O acesso externo foi bloqueado por segurança.');
  }

  const hostname = normalizeHostname(parsed.hostname);
  const allowed = allowedHosts.some(rule => hostnameMatchesRule(hostname, rule));

  if (!allowed) {
    throw new Error(`Host não permitido para listas: ${hostname}.`);
  }

  return parsed;
}

interface SafeFetchTextOptions {
  label: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: HeadersInit;
  redirectsLeft?: number;
}

async function readBoundedResponse(
  response: Response,
  label: string,
  maxBytes: number,
) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    throw new Error(`${label}: resposta excede o limite de ${maxBytes} bytes.`);
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('response too large');
      throw new Error(`${label}: resposta excede o limite de ${maxBytes} bytes.`);
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function decodeResponse(bytes: Uint8Array, contentType: string) {
  const charset = /charset\s*=\s*([^;\s]+)/i
    .exec(contentType)?.[1]
    ?.replace(/["']/g, '')
    .toLowerCase();
  const encoding = charset === 'iso-8859-1' ? 'windows-1252' : charset || 'utf-8';

  try {
    return new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  }
}

export async function safeFetchPlaylistText(
  rawUrl: string,
  options: SafeFetchTextOptions,
) {
  const target = assertAllowedPlaylistUrl(rawUrl);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxBytes = Math.max(1_024, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const redirectsLeft = Math.max(0, options.redirectsLeft ?? DEFAULT_MAX_REDIRECTS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: options.headers,
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`${options.label}: redirecionamento sem destino.`);
      if (redirectsLeft <= 0) {
        throw new Error(`${options.label}: limite de redirecionamentos excedido.`);
      }

      const redirected = new URL(location, target).toString();
      return await safeFetchPlaylistText(redirected, {
        ...options,
        timeoutMs,
        maxBytes,
        redirectsLeft: redirectsLeft - 1,
      });
    }

    const bytes = await readBoundedResponse(response, options.label, maxBytes);
    const raw = decodeResponse(bytes, response.headers.get('content-type') || '');

    if (!response.ok) {
      throw new Error(`${options.label}: HTTP ${response.status}. ${raw.slice(0, 160)}`.trim());
    }

    return raw;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`${options.label}: tempo limite de ${Math.round(timeoutMs / 1000)} segundos excedido.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
