export type SupportedPlaylistType = 'm3u' | 'xtream' | 'stalker';

const SENSITIVE_QUERY_KEYS = new Set([
  'username', 'user', 'login', 'password', 'pass', 'passwd', 'pwd',
  'token', 'key', 'secret', 'auth', 'authorization',
]);

export function textOrNull(value: unknown, maxLength = 500) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error('Texto excede o tamanho permitido.');
  return text;
}

export function requiredText(value: unknown, label: string, maxLength = 500) {
  const text = textOrNull(value, maxLength);
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
}

export function normalizePlaylistType(value: unknown): SupportedPlaylistType {
  const type = String(value ?? 'm3u').trim().toLowerCase();
  if (type === 'm3u' || type === 'xtream' || type === 'stalker') return type;
  throw new Error('Tipo de lista inválido.');
}

export function inferPlaylistType(playlistUrl: string, requestedType: unknown): SupportedPlaylistType {
  const parsed = new URL(playlistUrl);
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
  const hasXtreamCredentials = Boolean(
    parsed.searchParams.get('username') && parsed.searchParams.get('password'),
  );
  const isXtreamEndpoint = path.endsWith('/get.php') || path.endsWith('/player_api.php');
  return hasXtreamCredentials && isXtreamEndpoint
    ? 'xtream'
    : normalizePlaylistType(requestedType);
}

export function validatePlaylistUrl(value: unknown) {
  const raw = requiredText(value, 'URL da lista', 4096);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('URL da lista inválida.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('A URL da lista precisa usar HTTP ou HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Não informe credenciais antes do domínio. Use os parâmetros do provedor.');
  }
  parsed.hash = '';
  return parsed.toString();
}

export function normalizedPlaylistSource(value: string) {
  const parsed = new URL(value);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  const entries = [...parsed.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder || leftValue.localeCompare(rightValue);
    });
  parsed.search = '';
  for (const [key, entryValue] of entries) parsed.searchParams.append(key, entryValue);
  return parsed.toString();
}

export async function hmacSha256Hex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function playlistSourceFingerprint(secret: string, playlistUrl: string) {
  return hmacSha256Hex(secret, normalizedPlaylistSource(playlistUrl));
}

function maskPath(pathname: string) {
  const parts = pathname.split('/');
  return parts.map((part, index) => {
    const previous = String(parts[index - 1] || '').toLowerCase();
    const beforePrevious = String(parts[index - 2] || '').toLowerCase();
    if (['live', 'movie', 'series'].includes(previous)) return '••••';
    if (index > 1 && ['live', 'movie', 'series'].includes(beforePrevious)) return '••••';
    if (part.length > 28) return `${part.slice(0, 5)}…${part.slice(-3)}`;
    return part;
  }).join('/');
}

export function inspectPlaylistSource(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const parameterNames = [...new Set([...parsed.searchParams.keys()])];
    const previewQuery = parameterNames.length
      ? `?${parameterNames.map(key => `${encodeURIComponent(key)}=••••`).join('&')}`
      : '';
    return {
      preview: `${parsed.protocol}//${parsed.host}${maskPath(parsed.pathname)}${previewQuery}`,
      protocol: parsed.protocol.replace(':', '').toUpperCase(),
      host: parsed.host,
      path: maskPath(parsed.pathname),
      parameterNames,
      hasSensitiveParameters: parameterNames.some(name => SENSITIVE_QUERY_KEYS.has(name.toLowerCase())),
    };
  } catch {
    return null;
  }
}

export function redactPlaylistSecrets(value: unknown, maxLength = 500) {
  let message = String(value ?? '').slice(0, Math.max(maxLength * 2, 600));
  message = message.replace(
    /([?&](?:username|user|login|password|pass|passwd|pwd|token|key|secret|auth)=)[^&\s|)]+/gi,
    '$1••••',
  );
  message = message.replace(/(https?:\/\/[^\s?#]+)\?[^\s|)]+/gi, '$1?••••');
  return message.slice(0, maxLength);
}
