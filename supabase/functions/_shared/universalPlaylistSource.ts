import {
  inspectPlaylistSource,
  playlistSourceFingerprint,
  redactPlaylistSecrets,
  validatePlaylistUrl,
} from './playlistSource.ts';

export type UniversalSourceKind =
  | 'auto'
  | 'provider_message'
  | 'm3u'
  | 'xtream'
  | 'stalker'
  | 'api'
  | 'direct'
  | 'manual'
  | 'file';

export type UniversalEndpointType =
  | 'xtream'
  | 'm3u'
  | 'hls'
  | 'ssiptv'
  | 'dash'
  | 'rtmp'
  | 'rtsp'
  | 'direct'
  | 'api'
  | 'stalker'
  | 'file'
  | 'manual'
  | 'unknown';

export type ParsedProvider = {
  name: string | null;
  planName: string | null;
  price: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  createdAtLabel: string | null;
  expiresAtLabel: string | null;
  maxConnections: number | null;
  usernameMasked: string | null;
  passwordConfigured: boolean;
};

export type ParsedExternalLink = {
  type: 'renewal' | 'download' | 'application' | 'other';
  label: string;
  preview: string;
  host: string;
};

export type ParsedEndpoint = {
  type: UniversalEndpointType;
  label: string;
  url: string;
  preview: string;
  protocol: string | null;
  host: string;
  port: number | null;
  path: string;
  outputFormat: string | null;
  priority: number;
  primary: boolean;
  active: boolean;
  fingerprint: string;
  metadata: Record<string, unknown>;
};

export type ParsedUniversalSource = {
  sourceKind: UniversalSourceKind;
  provider: ParsedProvider;
  credentials: {
    username: string | null;
    password: string | null;
  };
  endpoints: ParsedEndpoint[];
  externalLinks: ParsedExternalLink[];
  ignoredUrlCount: number;
  warnings: string[];
  recommendation: {
    primaryIndex: number;
    reason: string;
  };
  redactedSummary: Record<string, unknown>;
  inputSha256: string;
};

const URL_PATTERN = /(?:https?|rtmp|rtsp):\/\/[^\s<>"'`]+/gi;
const SENSITIVE_PATH_MARKERS = new Set(['p', 'live', 'movie', 'series']);
const APP_HOST_MARKERS = [
  'mediafire.com',
  'aftv.news',
  'dl.explouddev.com',
  'dl.ntdev.in',
  'play.google.com',
  'apps.apple.com',
];
const DOWNLOAD_LABEL = /\b(download|downloader|baixar|aplicativo|aplicativos|apps?|windows|android|apk|exe|ipk|wgt)\b/i;
const PAYMENT_LABEL = /\b(assinar|renovar|checkout|pagamento|plano)\b/i;
const STREAM_LABEL = /\b(m3u|m3u8|hls|ssiptv|xtream|xc|dns|portal|stalker|mag|stream|mpegts|ts|dash|mpd|rtmp|rtsp)\b/i;

function cleanText(value: unknown, max = 500) {
  const result = String(value ?? '').replace(/\u0000/g, '').trim();
  return result.slice(0, max);
}


function validateUniversalEndpointUrl(value: unknown) {
  const raw = cleanText(value, 4096);
  if (!raw) throw new Error('URL da origem é obrigatória.');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('URL da origem inválida.');
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'http:' || protocol === 'https:') return validatePlaylistUrl(raw);
  if (protocol !== 'rtmp:' && protocol !== 'rtsp:') {
    throw new Error('A origem precisa usar HTTP, HTTPS, RTMP ou RTSP.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Não informe credenciais antes do domínio. Use os campos ou parâmetros do provedor.');
  }
  if (!parsed.hostname) throw new Error('A origem precisa informar um domínio válido.');
  parsed.hash = '';
  return parsed.toString();
}

function stripDecorations(value: string) {
  return value
    .replace(/[*`]/g, '')
    .replace(/[✅⚡📦💵🗓️📶💳📲🌐🔢🟠⚫🟢🟡🔴🤝👇🏻]+/gu, ' ')
    .replace(/[═_]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedLines(input: string) {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw, index) => ({ raw, clean: stripDecorations(raw), index }));
}

function labelValue(lines: ReturnType<typeof normalizedLines>, names: RegExp[]) {
  for (const line of lines) {
    for (const name of names) {
      const match = line.clean.match(name);
      const value = cleanText(match?.[1], 300);
      if (value) return value;
    }
  }
  return null;
}

function parseInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9]/g, ''));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBrazilianDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
  const iso = `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:${second}-03:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sha256Hex(value: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then(buffer =>
    [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  );
}

function maskValue(value: string | null) {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  if (value.length <= 8) return `${value.slice(0, 1)}•••${value.slice(-1)}`;
  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}

function trimUrlToken(raw: string) {
  let value = raw.trim();
  while (/[),.;!\]}*_]+$/.test(value)) value = value.slice(0, -1);
  return value;
}

function safePathPreview(parsed: URL) {
  const parts = parsed.pathname.split('/');
  return parts.map((part, index) => {
    const previous = String(parts[index - 1] || '').toLowerCase();
    const beforePrevious = String(parts[index - 2] || '').toLowerCase();
    if (SENSITIVE_PATH_MARKERS.has(previous)) return '••••';
    if (beforePrevious === 'p') return '••••';
    if (part.length >= 9 && /^\d+$/.test(part)) return `${part.slice(0, 2)}•••${part.slice(-2)}`;
    if (part.length > 32) return `${part.slice(0, 5)}…${part.slice(-3)}`;
    return part;
  }).join('/');
}

export function safeEndpointPreview(value: string) {
  try {
    const parsed = new URL(value);
    const query = [...new Set(parsed.searchParams.keys())]
      .map(key => `${encodeURIComponent(key)}=••••`)
      .join('&');
    return `${parsed.protocol}//${parsed.host}${safePathPreview(parsed)}${query ? `?${query}` : ''}`;
  } catch {
    return redactPlaylistSecrets(value, 400);
  }
}

function lineLabel(lines: ReturnType<typeof normalizedLines>, url: string) {
  const found = lines.find(line => line.raw.includes(url) || line.clean.includes(url));
  if (!found) return 'Endpoint detectado';
  const before = found.clean.split(url)[0].replace(/[:\-]+$/g, '').trim();
  return cleanText(before || 'Endpoint detectado', 180);
}

function isExternalNonStreaming(url: URL, label: string) {
  const host = url.hostname.toLowerCase();
  if (APP_HOST_MARKERS.some(marker => host === marker || host.endsWith(`.${marker}`))) return true;
  if (PAYMENT_LABEL.test(label) && !STREAM_LABEL.test(label)) return true;
  if (DOWNLOAD_LABEL.test(label) && !STREAM_LABEL.test(label)) return true;
  return false;
}

function externalType(label: string): ParsedExternalLink['type'] {
  if (PAYMENT_LABEL.test(label)) return 'renewal';
  if (DOWNLOAD_LABEL.test(label)) return 'download';
  if (/\b(id|app|aplicativo)\b/i.test(label)) return 'application';
  return 'other';
}

function endpointType(parsed: URL, label: string): UniversalEndpointType {
  const protocol = parsed.protocol.toLowerCase();
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
  const output = String(parsed.searchParams.get('output') || '').toLowerCase();
  const type = String(parsed.searchParams.get('type') || '').toLowerCase();
  if (protocol === 'rtmp:') return 'rtmp';
  if (protocol === 'rtsp:') return 'rtsp';
  if (path.endsWith('.mpd') || /\bdash\b/i.test(label)) return 'dash';
  if (path.includes('stalker_portal') || /\b(stalker|mag|portal)\b/i.test(label)) return 'stalker';
  if (path.endsWith('/ssiptv') || /\bssiptv\b/i.test(label)) return 'ssiptv';
  if (path.endsWith('/player_api.php')) return 'xtream';
  if (path.endsWith('/get.php')) {
    if (output === 'hls' || output === 'm3u8' || /\bhls\b/i.test(label)) return 'hls';
    return 'm3u';
  }
  if (/\/hls$/i.test(path) || path.endsWith('.m3u8') || output === 'hls' || output === 'm3u8') return 'hls';
  if (/\/m3u$/i.test(path) || path.endsWith('.m3u') || type.includes('m3u')) return 'm3u';
  if (/\b(xc|xtream|dns)\b/i.test(label) && (path === '' || path === '/')) return 'xtream';
  if (/\/api\b/i.test(path) || /\b(api|json|rest)\b/i.test(label)) return 'api';
  if (/\b(m3u|mpegts|playlist)\b/i.test(label)) return 'm3u';
  if (/\b(hls)\b/i.test(label)) return 'hls';
  return 'direct';
}

function outputFormat(parsed: URL, type: UniversalEndpointType) {
  const output = cleanText(parsed.searchParams.get('output'), 40).toLowerCase();
  if (output) return output;
  if (type === 'hls') return 'hls';
  if (type === 'dash') return 'dash';
  if (type === 'ssiptv') return 'ssiptv';
  const extension = parsed.pathname.split('.').at(-1)?.toLowerCase();
  if (extension && ['m3u', 'm3u8', 'mpd', 'ts'].includes(extension)) return extension;
  return null;
}

function endpointScore(type: UniversalEndpointType, label: string, parsed: URL) {
  let score = 0;
  if (type === 'xtream') score += parsed.pathname.toLowerCase().endsWith('/player_api.php') ? 100 : 75;
  if (type === 'm3u') score += 90;
  if (type === 'hls') score += 70;
  if (type === 'ssiptv') score += 35;
  if (type === 'api') score += 45;
  if (type === 'direct') score += 40;
  if (/completo|link \(m3u\)|principal/i.test(label)) score += 15;
  if (/curto/i.test(label)) score -= 5;
  if (parsed.protocol === 'https:') score += 3;
  return score;
}

export function resolveSafePrimaryIndex(
  endpoints: ParsedEndpoint[],
  requestedIndex: number,
  fallbackIndex = 0,
) {
  const fallback = Number.isSafeInteger(fallbackIndex)
    && fallbackIndex >= 0
    && fallbackIndex < endpoints.length
    ? fallbackIndex
    : 0;
  const requested = Number.isSafeInteger(requestedIndex)
    && requestedIndex >= 0
    && requestedIndex < endpoints.length
    ? requestedIndex
    : fallback;
  const selected = endpoints[requested];
  const selectedPath = String(selected?.path || '/').replace(/\/+$/, '') || '/';
  const genericRoot = selected?.type === 'direct' && selectedPath === '/';
  if (!genericRoot) return requested;

  const richerIndex = endpoints.findIndex(endpoint => {
    if (endpoint.active === false) return false;
    const path = String(endpoint.path || '/').replace(/\/+$/, '') || '/';
    return ['xtream', 'm3u', 'hls', 'api', 'stalker'].includes(endpoint.type)
      && path !== '/';
  });
  return richerIndex >= 0 ? richerIndex : requested;
}

function credentialsFromUrl(url: URL) {
  const username = url.searchParams.get('username') || url.searchParams.get('user');
  const password = url.searchParams.get('password') || url.searchParams.get('pass');
  const path = url.pathname.split('/').filter(Boolean);
  if ((!username || !password) && path[0]?.toLowerCase() === 'p' && path.length >= 3) {
    return { username: username || decodeURIComponent(path[1]), password: password || decodeURIComponent(path[2]) };
  }
  return { username, password };
}

function buildXtreamCandidates(
  bareServers: Array<{ url: string; label: string }>,
  username: string | null,
  password: string | null,
) {
  if (!username || !password) return bareServers;
  return bareServers.map(item => {
    const parsed = new URL(item.url);
    const basePath = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = `${basePath}/player_api.php`.replace(/\/{2,}/g, '/');
    parsed.search = '';
    parsed.searchParams.set('username', username);
    parsed.searchParams.set('password', password);
    return { url: parsed.toString(), label: `${item.label || 'Servidor Xtream'} · API` };
  });
}

function publicSummary(
  provider: ParsedProvider,
  endpoints: ParsedEndpoint[],
  externalLinks: ParsedExternalLink[],
  warnings: string[],
) {
  return {
    provider: {
      name: provider.name,
      planName: provider.planName,
      price: provider.price,
      createdAt: provider.createdAt,
      expiresAt: provider.expiresAt,
      maxConnections: provider.maxConnections,
      usernameMasked: provider.usernameMasked,
      passwordConfigured: provider.passwordConfigured,
    },
    endpoints: endpoints.map(endpoint => ({
      type: endpoint.type,
      label: endpoint.label,
      preview: endpoint.preview,
      protocol: endpoint.protocol,
      host: endpoint.host,
      port: endpoint.port,
      path: (() => { try { return safePathPreview(new URL(endpoint.url)); } catch { return endpoint.path; } })(),
      outputFormat: endpoint.outputFormat,
      priority: endpoint.priority,
      primary: endpoint.primary,
    })),
    externalLinks,
    warnings,
  };
}

export async function parseProviderMessage(
  inputValue: unknown,
  fingerprintSecret: string,
): Promise<ParsedUniversalSource> {
  const input = cleanText(inputValue, 64 * 1024);
  if (!input) throw new Error('Cole a mensagem ou os dados fornecidos pelo servidor.');
  const lines = normalizedLines(input);

  const providerName = labelValue(lines, [
    /(?:bem\s*-?\s*vindo(?:\s+a|\s+ao)?|equipe)\s+(.{2,120})$/i,
  ]);
  const planName = labelValue(lines, [/\bplano\s*:\s*(.+)$/i]);
  const price = labelValue(lines, [/\bpre[cç]o(?:\s+do\s+plano)?\s*:\s*(.+)$/i]);
  const createdLabel = labelValue(lines, [/\bcriado\s+em\s*:\s*(.+)$/i, /\bcria[cç][aã]o\s*:\s*(.+)$/i]);
  const expiresLabel = labelValue(lines, [/\bvencimento\s*:\s*(.+)$/i, /\bvence\s*:\s*(.+)$/i]);
  const connectionLabel = labelValue(lines, [/\bconex(?:ão|ões|oes)\s*:\s*(\d+)/i]);
  let username = labelValue(lines, [/\busu[aá]rio\s*:\s*([^\s]+)/i, /\blogin\s*:\s*([^\s]+)/i]);
  let password = labelValue(lines, [/\bsenha\s*:\s*([^\s]+)/i, /\bpassword\s*:\s*([^\s]+)/i]);

  const rawUrls = [...input.matchAll(URL_PATTERN)].map(match => trimUrlToken(match[0]));
  const uniqueRawUrls = [...new Set(rawUrls)];
  const streamCandidates: Array<{ url: string; label: string }> = [];
  const bareXtreamServers: Array<{ url: string; label: string }> = [];
  const externalLinks: ParsedExternalLink[] = [];
  let ignoredUrlCount = 0;

  for (const rawUrl of uniqueRawUrls) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      ignoredUrlCount += 1;
      continue;
    }
    const label = lineLabel(lines, rawUrl);
    if (isExternalNonStreaming(parsed, label)) {
      externalLinks.push({
        type: externalType(label),
        label,
        preview: `${parsed.protocol}//${parsed.host}${parsed.pathname}`,
        host: parsed.host,
      });
      continue;
    }
    const type = endpointType(parsed, label);
    const isBareServer = parsed.pathname === '' || parsed.pathname === '/';
    if (isBareServer && (type === 'xtream' || /^(?:url|servidor|dns)(?:\s|:|$)/i.test(label))) {
      bareXtreamServers.push({ url: rawUrl, label });
      continue;
    }
    streamCandidates.push({ url: rawUrl, label });
    const urlCredentials = credentialsFromUrl(parsed);
    username = username || urlCredentials.username;
    password = password || urlCredentials.password;
  }

  streamCandidates.push(...buildXtreamCandidates(bareXtreamServers, username, password));
  if (streamCandidates.length === 0 && bareXtreamServers.length > 0) {
    streamCandidates.push(...bareXtreamServers);
  }

  const endpointDrafts: Array<ParsedEndpoint & { score: number }> = [];
  const seenFingerprints = new Set<string>();

  for (const [index, candidate] of streamCandidates.entries()) {
    let exactUrl: string;
    let parsed: URL;
    try {
      if (/^https?:/i.test(candidate.url)) exactUrl = validatePlaylistUrl(candidate.url);
      else exactUrl = candidate.url;
      parsed = new URL(exactUrl);
    } catch {
      ignoredUrlCount += 1;
      continue;
    }
    const fingerprint = await playlistSourceFingerprint(fingerprintSecret, exactUrl);
    if (seenFingerprints.has(fingerprint)) continue;
    seenFingerprints.add(fingerprint);
    const type = endpointType(parsed, candidate.label);
    const inspect = inspectPlaylistSource(exactUrl);
    endpointDrafts.push({
      type,
      label: cleanText(candidate.label || `${type.toUpperCase()} ${index + 1}`, 180),
      url: exactUrl,
      preview: safeEndpointPreview(exactUrl),
      protocol: parsed.protocol.replace(':', '').toLowerCase() || null,
      host: parsed.hostname.toLowerCase(),
      port: parsed.port ? Number(parsed.port) : null,
      path: cleanText(parsed.pathname || '/', 2048),
      outputFormat: outputFormat(parsed, type),
      priority: index + 1,
      primary: false,
      active: true,
      fingerprint,
      metadata: {
        parameterNames: inspect?.parameterNames || [],
        originalLabel: candidate.label,
        exactSourcePreserved: true,
      },
      score: endpointScore(type, candidate.label, parsed),
    });
  }

  if (endpointDrafts.length === 0) {
    throw new Error('Nenhuma fonte de streaming reconhecida foi encontrada na mensagem.');
  }

  endpointDrafts.sort((left, right) => right.score - left.score || left.priority - right.priority);
  const endpoints = endpointDrafts.map((endpoint, index) => {
    const { score: _score, ...clean } = endpoint;
    return { ...clean, priority: index + 1, primary: index === 0 };
  });

  const warnings: string[] = [];
  if (!username || !password) warnings.push('As credenciais não foram encontradas de forma completa.');
  if (bareXtreamServers.some(item => !new URL(item.url).port)) {
    warnings.push('Um ou mais servidores Xtream não informaram porta explícita.');
  }
  const expiresAt = parseBrazilianDate(expiresLabel);
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    warnings.push('A data informada indica que a conta está vencida.');
  }
  if (ignoredUrlCount > 0) warnings.push(`${ignoredUrlCount} endereço(s) não puderam ser interpretados.`);

  const provider: ParsedProvider = {
    name: providerName ? providerName.replace(/\s+(?:att|equipe).*$/i, '').trim() : null,
    planName,
    price,
    createdAt: parseBrazilianDate(createdLabel),
    expiresAt,
    createdAtLabel: createdLabel,
    expiresAtLabel: expiresLabel,
    maxConnections: parseInteger(connectionLabel),
    usernameMasked: maskValue(username),
    passwordConfigured: Boolean(password),
  };
  const redactedSummary = publicSummary(provider, endpoints, externalLinks, warnings);

  return {
    sourceKind: 'provider_message',
    provider,
    credentials: { username, password },
    endpoints,
    externalLinks,
    ignoredUrlCount,
    warnings,
    recommendation: {
      primaryIndex: 0,
      reason: `A prioridade inicial favoreceu ${endpoints[0].type.toUpperCase()}; o teste poderá escolher outra alternativa.`,
    },
    redactedSummary,
    inputSha256: await sha256Hex(input),
  };
}

export async function parseStructuredSource(
  body: Record<string, unknown>,
  fingerprintSecret: string,
): Promise<ParsedUniversalSource> {
  const sourceKind = cleanText(body.sourceKind || 'auto', 40) as UniversalSourceKind;
  const endpointsInput = Array.isArray(body.endpoints) ? body.endpoints : [];
  const endpoints: ParsedEndpoint[] = [];
  const seen = new Set<string>();

  for (const [index, raw] of endpointsInput.entries()) {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const exactUrl = validateUniversalEndpointUrl(item.url);
    const parsed = new URL(exactUrl);
    const fingerprint = await playlistSourceFingerprint(fingerprintSecret, exactUrl);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const type = (cleanText(item.type, 30) || endpointType(parsed, cleanText(item.label, 180))) as UniversalEndpointType;
    endpoints.push({
      type,
      label: cleanText(item.label || `${type.toUpperCase()} ${index + 1}`, 180),
      url: exactUrl,
      preview: safeEndpointPreview(exactUrl),
      protocol: parsed.protocol.replace(':', '').toLowerCase(),
      host: parsed.hostname.toLowerCase(),
      port: parsed.port ? Number(parsed.port) : null,
      path: cleanText(parsed.pathname || '/', 2048),
      outputFormat: cleanText(item.outputFormat, 80) || outputFormat(parsed, type),
      priority: index + 1,
      primary: item.primary === true,
      active: item.active !== false,
      fingerprint,
      metadata: { exactSourcePreserved: true },
    });
  }

  if (endpoints.length === 0 && body.playlistUrl) {
    const exactUrl = validateUniversalEndpointUrl(body.playlistUrl);
    const parsed = new URL(exactUrl);
    const type = endpointType(parsed, cleanText(body.label, 180));
    endpoints.push({
      type,
      label: cleanText(body.label || 'Origem principal', 180),
      url: exactUrl,
      preview: safeEndpointPreview(exactUrl),
      protocol: parsed.protocol.replace(':', '').toLowerCase(),
      host: parsed.hostname.toLowerCase(),
      port: parsed.port ? Number(parsed.port) : null,
      path: cleanText(parsed.pathname || '/', 2048),
      outputFormat: outputFormat(parsed, type),
      priority: 1,
      primary: true,
      active: true,
      fingerprint: await playlistSourceFingerprint(fingerprintSecret, exactUrl),
      metadata: { exactSourcePreserved: true },
    });
  }
  if (endpoints.length === 0) throw new Error('Adicione ao menos uma URL de origem.');

  const primaryIndex = Math.max(0, endpoints.findIndex(endpoint => endpoint.primary));
  endpoints.forEach((endpoint, index) => {
    endpoint.primary = index === primaryIndex;
    endpoint.priority = index + 1;
  });
  const provider: ParsedProvider = {
    name: cleanText(body.providerName, 180) || null,
    planName: cleanText(body.planName, 240) || null,
    price: null,
    createdAt: cleanText(body.providerCreatedAt, 60) || null,
    expiresAt: cleanText(body.providerExpiresAt, 60) || null,
    createdAtLabel: null,
    expiresAtLabel: null,
    maxConnections: Number(body.maxConnections || 1),
    usernameMasked: null,
    passwordConfigured: false,
  };
  const warnings: string[] = [];
  const redactedSummary = publicSummary(provider, endpoints, [], warnings);
  return {
    sourceKind,
    provider,
    credentials: { username: null, password: null },
    endpoints,
    externalLinks: [],
    ignoredUrlCount: 0,
    warnings,
    recommendation: { primaryIndex, reason: 'Endpoint principal selecionado no cadastro.' },
    redactedSummary,
    inputSha256: await sha256Hex(JSON.stringify(redactedSummary)),
  };
}

export function legacyPlaylistType(endpoint: ParsedEndpoint) {
  if (endpoint.type === 'xtream') return 'xtream';
  if (endpoint.type === 'stalker') return 'stalker';
  return 'm3u';
}

export function sanitizeConnectionHeaders(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: Record<string, string> = {};
  const allowed = new Set([
    'user-agent', 'referer', 'origin', 'cookie', 'authorization', 'accept',
    'x-requested-with', 'x-api-key', 'api-key',
  ]);
  for (const [rawName, rawValue] of Object.entries(source)) {
    const name = rawName.trim().toLowerCase();
    const headerValue = cleanText(rawValue, 4096);
    if (!name || !headerValue || !allowed.has(name)) continue;
    if (/[^a-z0-9-]/.test(name)) continue;
    result[name] = headerValue;
  }
  return result;
}

export function safeConnectionProfileSummary(value: Record<string, unknown>) {
  const headers = sanitizeConnectionHeaders(value.headers);
  return {
    method: cleanText(value.method || 'GET', 10).toUpperCase(),
    headerNames: Object.keys(headers),
    hasSensitiveHeaders: Object.keys(headers).some(name =>
      ['cookie', 'authorization', 'x-api-key', 'api-key'].includes(name)
    ),
    timeoutMs: Number(value.timeoutMs || 45000),
    retryCount: Number(value.retryCount || 1),
    followRedirects: value.followRedirects !== false,
    customCaConfigured: Boolean(cleanText(value.customCaPem, 65535)),
  };
}
