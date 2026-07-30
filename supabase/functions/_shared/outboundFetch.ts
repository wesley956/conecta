const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_BYTES = 80 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

type DnsRecordType = 'A' | 'AAAA';
type DnsResolver = (hostname: string, recordType: DnsRecordType) => Promise<string[]>;

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string) {
  const normalized = normalizeHostname(hostname).split('%')[0];
  if (!normalized.includes(':')) return false;
  if (normalized.startsWith('::ffff:') && isPrivateIpv4(normalized.slice('::ffff:'.length))) {
    return true;
  }

  const [head = '', tail = ''] = normalized.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = 8 - left.length - right.length;
  const words = [
    ...left,
    ...Array.from({ length: Math.max(0, missing) }, () => '0'),
    ...right,
  ].map(part => Number.parseInt(part || '0', 16));

  if (
    words.length !== 8 ||
    words.some(word => !Number.isInteger(word) || word < 0 || word > 0xffff)
  ) {
    return false;
  }

  const allZero = words.every(word => word === 0);
  const loopback = words.slice(0, 7).every(word => word === 0) && words[7] === 1;
  const ipv4Mapped = words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff;

  if (ipv4Mapped) {
    const mapped = [
      words[6] >> 8,
      words[6] & 0xff,
      words[7] >> 8,
      words[7] & 0xff,
    ].join('.');
    return isPrivateIpv4(mapped);
  }

  return (
    allZero ||
    loopback ||
    (words[0] & 0xfe00) === 0xfc00 ||
    (words[0] & 0xffc0) === 0xfe80 ||
    (words[0] & 0xff00) === 0xff00 ||
    (words[0] === 0x0100 && words.slice(1, 4).every(word => word === 0)) ||
    (words[0] === 0x2001 && words[1] === 0x0db8)
  );
}

export function isPrivateIpAddress(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return isPrivateIpv4(normalized) || isPrivateIpv6(normalized);
}

function isPrivateLiteralHost(hostname: string) {
  const normalized = normalizeHostname(hostname);

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized === 'metadata.google.internal' ||
    isPrivateIpAddress(normalized)
  );
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

  return parsed;
}

async function defaultDnsResolver(hostname: string, recordType: DnsRecordType) {
  return await Deno.resolveDns(hostname, recordType) as string[];
}

export async function assertPublicPlaylistTarget(
  target: URL,
  resolveDns: DnsResolver = defaultDnsResolver,
) {
  if (isPrivateLiteralHost(target.hostname)) {
    throw new Error('Endereços privados, locais ou reservados não são permitidos.');
  }

  const results = await Promise.allSettled([
    resolveDns(target.hostname, 'A'),
    resolveDns(target.hostname, 'AAAA'),
  ]);
  const addresses = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);

  if (addresses.length === 0) {
    throw new Error(`Não foi possível validar o DNS público do host: ${normalizeHostname(target.hostname)}.`);
  }

  if (addresses.some(isPrivateIpAddress)) {
    throw new Error('O domínio informado aponta para um endereço privado, local ou reservado.');
  }
}

interface SafeFetchTextOptions {
  label: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: HeadersInit;
  redirectsLeft?: number;
  resolveDns?: DnsResolver;
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
  await assertPublicPlaylistTarget(target, options.resolveDns);

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
