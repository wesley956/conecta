import {
  assertAllowedOutboundOrigin,
  assertAllowedPlaylistUrl,
  assertPublicPlaylistTarget,
} from './outboundFetch.ts';

export type ProgressiveDiagnosticStrategy = 'server_cache' | 'direct' | 'hybrid' | 'retry' | 'blocked';
export type ProgressiveDiagnosticClassification =
  | 'SERVER_COMPATIBLE'
  | 'DEVICE_ONLY'
  | 'HYBRID'
  | 'INVALID_CREDENTIALS'
  | 'SERVER_UNAVAILABLE'
  | 'DATACENTER_BLOCKED'
  | 'IP_SESSION_BOUND'
  | 'RATE_LIMITED'
  | 'NONSTANDARD_XTREAM'
  | 'M3U_OK_API_FAIL'
  | 'API_OK_M3U_FAIL'
  | 'CERTIFICATE_INVALID'
  | 'RESPONSE_INVALID'
  | 'INCONCLUSIVE';

export type ProgressiveDiagnosticStep = {
  step: number;
  key: 'head' | 'redirects' | 'auth' | 'account' | 'category' | 'content' | 'playback' | 'comparison' | 'classification' | 'strategy';
  origin: 'server' | 'device' | 'system';
  status: 'ok' | 'failed' | 'skipped' | 'timeout' | 'waiting';
  httpStatus?: number | null;
  latencyMs?: number | null;
  code?: string | null;
  count?: number | null;
  detail?: string | null;
};

export type DeviceDiagnosticCheck = {
  kind: 'head' | 'auth' | 'playback';
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  code: string | null;
};

export type ProgressiveDiagnosticResult = {
  classification: ProgressiveDiagnosticClassification;
  strategy: ProgressiveDiagnosticStrategy;
  summary: string;
  needsDevice: boolean;
  steps: ProgressiveDiagnosticStep[];
};

type RequestResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  text: string;
  contentType: string;
  redirectHops: number;
  finalUrl: URL;
  code: string | null;
};

type XtreamSource = {
  origin: string;
  basePath: string;
  username: string;
  password: string;
  extraParams: URLSearchParams;
  playerApiUrl: URL;
  m3uUrl: URL;
};

const USER_AGENTS = [
  'VLC/3.0.20 LibVLC/3.0.20',
  'Mozilla/5.0 (Linux; Android 11; Android TV) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'IPTVSmartersPlayer',
];

function safeText(value: unknown, max = 180) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[endereco omitido]')
    .replace(/(?:username|user|password|pass|token)=([^&\s]+)/gi, '$1=[omitido]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || null;
}

function elapsed(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function normalizeBasePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '');
  const withoutEndpoint = normalized.replace(/\/(?:get|player_api)\.php$/i, '');
  return withoutEndpoint === '/' ? '' : withoutEndpoint;
}

export function parseXtreamDiagnosticSource(rawUrl: string): XtreamSource | null {
  const source = assertAllowedPlaylistUrl(rawUrl);
  const username = source.searchParams.get('username')?.trim() || '';
  const password = source.searchParams.get('password')?.trim() || '';
  const endpoint = source.pathname.toLowerCase().replace(/\/+$/, '');
  const endpointLooksXtream = endpoint.endsWith('/get.php') || endpoint.endsWith('/player_api.php');
  if (!username || !password || !endpointLooksXtream) return null;

  const basePath = normalizeBasePath(source.pathname);
  const extraParams = new URLSearchParams(source.searchParams);
  extraParams.delete('username');
  extraParams.delete('password');
  extraParams.delete('action');

  const build = (file: string) => {
    const url = new URL(`${basePath}/${file}`.replace(/\/+/g, '/'), source.origin);
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    extraParams.forEach((value, key) => url.searchParams.append(key, value));
    return url;
  };

  return {
    origin: source.origin,
    basePath,
    username,
    password,
    extraParams,
    playerApiUrl: build('player_api.php'),
    m3uUrl: build('get.php'),
  };
}

async function readBoundedText(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) return { text: '', truncated: true };
  if (!response.body) return { text: '', truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      const allowed = Math.max(0, maxBytes - total);
      if (allowed) chunks.push(value.slice(0, allowed));
      total += allowed;
      truncated = true;
      await reader.cancel('diagnostic sample complete');
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, ''),
    truncated,
  };
}

function classifyFetchError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (/abort|tempo limite|timeout/.test(message)) return 'TIMEOUT';
  if (/cert|tls|ssl/.test(message)) return 'CERTIFICATE_INVALID';
  if (/dns|resolve/.test(message)) return 'DNS_FAILED';
  if (/privad|reservad|local|protocolo|url externa/.test(message)) return 'BLOCKED_TARGET';
  return 'NETWORK_ERROR';
}

async function requestSample(
  target: URL,
  options: {
    method?: 'GET' | 'HEAD';
    timeoutMs: number;
    maxBytes: number;
    headers?: HeadersInit;
    allowedOrigins: string[];
    redirectsLeft?: number;
  },
): Promise<RequestResult> {
  assertAllowedOutboundOrigin(target, options.allowedOrigins);
  await assertPublicPlaylistTarget(target);

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(target, {
      method: options.method || 'GET',
      headers: options.headers,
      redirect: 'manual',
      signal: controller.signal,
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      const redirectsLeft = options.redirectsLeft ?? 4;
      if (!location || redirectsLeft <= 0) {
        return {
          ok: false,
          status: response.status,
          latencyMs: elapsed(startedAt),
          text: '',
          contentType: response.headers.get('content-type') || '',
          redirectHops: 1,
          finalUrl: target,
          code: location ? 'REDIRECT_LIMIT' : 'REDIRECT_WITHOUT_LOCATION',
        };
      }

      const redirected = new URL(location, target);
      assertAllowedOutboundOrigin(redirected, options.allowedOrigins);
      const nested = await requestSample(redirected, {
        ...options,
        redirectsLeft: redirectsLeft - 1,
      });
      return { ...nested, redirectHops: nested.redirectHops + 1 };
    }

    const sample = options.method === 'HEAD'
      ? { text: '', truncated: false }
      : await readBoundedText(response, options.maxBytes);

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: elapsed(startedAt),
      text: sample.text,
      contentType: response.headers.get('content-type') || '',
      redirectHops: 0,
      finalUrl: target,
      code: sample.truncated ? 'SAMPLE_TRUNCATED' : null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: elapsed(startedAt),
      text: '',
      contentType: '',
      redirectHops: 0,
      finalUrl: target,
      code: classifyFetchError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function serialRequest(
  target: URL,
  options: Omit<Parameters<typeof requestSample>[1], 'headers'> & { retries: number; accept?: string },
) {
  let last: RequestResult | null = null;
  const attempts = Math.max(1, options.retries + 1);

  for (let index = 0; index < attempts; index += 1) {
    const userAgent = USER_AGENTS[index % USER_AGENTS.length];
    const headers: Record<string, string> = {
      Accept: options.accept || 'application/json, text/plain, */*',
      'User-Agent': userAgent,
    };
    if (options.method === 'GET') headers.Range = 'bytes=0-524287';
    last = await requestSample(target, {
      ...options,
      headers,
    });
    if (last.ok || [401, 403, 404, 429].includes(last.status)) break;
    if (index + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 250));
  }

  return last!;
}

function step(
  number: number,
  key: ProgressiveDiagnosticStep['key'],
  result: Partial<ProgressiveDiagnosticStep>,
): ProgressiveDiagnosticStep {
  return {
    step: number,
    key,
    origin: result.origin || 'server',
    status: result.status || 'failed',
    httpStatus: result.httpStatus ?? null,
    latencyMs: result.latencyMs ?? null,
    code: safeText(result.code, 80),
    count: result.count ?? null,
    detail: safeText(result.detail),
  };
}

function jsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || /^\s*</.test(trimmed)) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function jsonArrayCount(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || /^\s*</.test(trimmed)) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

function firstXtreamStream(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    const item = Array.isArray(parsed) ? parsed[0] : null;
    if (!item || typeof item !== 'object') return null;
    const id = Number((item as Record<string, unknown>).stream_id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const extension = safeText((item as Record<string, unknown>).container_extension, 12) || 'ts';
    return { id: Math.floor(id), extension: /^[a-z0-9]+$/i.test(extension) ? extension : 'ts' };
  } catch {
    const id = /"stream_id"\s*:\s*"?(\d+)/.exec(raw)?.[1];
    return id ? { id: Number(id), extension: 'ts' } : null;
  }
}

function firstM3uItem(raw: string) {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const headerValid = lines.some(line => line.startsWith('#EXTM3U'));
  const itemUrl = lines.find(line => !line.startsWith('#') && /^https?:\/\//i.test(line)) || null;
  return { headerValid, itemUrl };
}

function classificationForServer(steps: ProgressiveDiagnosticStep[]): ProgressiveDiagnosticResult {
  const find = (key: ProgressiveDiagnosticStep['key']) => steps.find(item => item.key === key);
  const head = find('head');
  const auth = find('auth');
  const category = find('category');
  const content = find('content');
  const playback = find('playback');
  const statuses = [head?.httpStatus, auth?.httpStatus, category?.httpStatus, content?.httpStatus, playback?.httpStatus];
  const codes = steps.map(item => item.code || '');

  let classification: ProgressiveDiagnosticClassification = 'INCONCLUSIVE';
  let strategy: ProgressiveDiagnosticStrategy = 'retry';
  let summary = 'O servidor não reuniu evidência suficiente. Compare com um aparelho autorizado.';
  let needsDevice = true;

  if (auth?.httpStatus === 401 || auth?.code === 'AUTH_INVALID') {
    classification = 'INVALID_CREDENTIALS';
    strategy = 'blocked';
    summary = 'O provedor rejeitou as credenciais.';
    needsDevice = false;
  } else if (statuses.includes(429)) {
    classification = 'RATE_LIMITED';
    strategy = 'retry';
    summary = 'O provedor limitou as requisições do servidor.';
  } else if (codes.includes('CERTIFICATE_INVALID')) {
    classification = 'CERTIFICATE_INVALID';
    strategy = 'blocked';
    summary = 'A conexão TLS do provedor não é confiável.';
    needsDevice = false;
  } else if (codes.includes('RESPONSE_INVALID')) {
    classification = 'RESPONSE_INVALID';
    strategy = 'blocked';
    summary = 'O provedor respondeu em formato incompatível.';
    needsDevice = false;
  } else if (head?.status === 'ok' && auth?.status !== 'failed' && category?.status === 'ok' && content?.status === 'ok' && playback?.status === 'ok') {
    classification = 'SERVER_COMPATIBLE';
    strategy = 'server_cache';
    summary = 'Autenticação, amostra do catálogo e reprodução responderam pelo servidor.';
    needsDevice = false;
  } else if (auth?.status === 'ok' && (category?.status === 'ok' || content?.status === 'ok')) {
    classification = 'HYBRID';
    strategy = 'hybrid';
    summary = 'A API respondeu parcialmente no servidor; o aparelho deve confirmar a reprodução.';
  } else if (statuses.some(status => status === 403 || (status != null && status >= 500))) {
    classification = 'DATACENTER_BLOCKED';
    strategy = 'direct';
    summary = 'O provedor recusou ou bloqueou a origem do servidor.';
  } else if (codes.some(code => ['TIMEOUT', 'DNS_FAILED', 'NETWORK_ERROR'].includes(code))) {
    classification = 'SERVER_UNAVAILABLE';
    strategy = 'retry';
    summary = 'O servidor não conseguiu alcançar o provedor.';
  } else if (head?.httpStatus === 404 || auth?.httpStatus === 404) {
    classification = 'NONSTANDARD_XTREAM';
    strategy = 'direct';
    summary = 'O endpoint do provedor não segue o formato esperado.';
  }

  return { classification, strategy, summary, needsDevice, steps };
}

async function diagnoseXtream(source: XtreamSource) {
  const steps: ProgressiveDiagnosticStep[] = [];
  const allowedOrigins = [source.origin];

  const head = await serialRequest(source.playerApiUrl, {
    method: 'HEAD', timeoutMs: 2_000, maxBytes: 1_024, retries: 1, allowedOrigins,
  });
  steps.push(step(5, 'head', {
    status: head.ok || head.status === 405 ? 'ok' : head.code === 'TIMEOUT' ? 'timeout' : 'failed',
    httpStatus: head.status || null,
    latencyMs: head.latencyMs,
    code: head.code,
    detail: head.status === 405 ? 'HEAD não suportado; autenticação será testada com GET curto.' : null,
  }));
  steps.push(step(6, 'redirects', {
    status: 'ok',
    count: head.redirectHops,
    detail: head.redirectHops ? `${head.redirectHops} redirecionamento(s) no mesmo domínio.` : 'Sem redirecionamento.',
  }));

  const auth = await serialRequest(source.playerApiUrl, {
    method: 'GET', timeoutMs: 5_000, maxBytes: 128 * 1024, retries: 1, allowedOrigins,
  });
  const authJson = jsonObject(auth.text);
  const userInfo = authJson?.user_info && typeof authJson.user_info === 'object'
    ? authJson.user_info as Record<string, unknown>
    : null;
  const authValid = auth.ok && Boolean(userInfo) && !['0', 'false', 'disabled', 'banned'].includes(String(userInfo?.auth ?? '1').toLowerCase());
  const authInvalid = auth.status === 401 || (auth.ok && Boolean(userInfo) && !authValid);
  steps.push(step(7, 'auth', {
    status: authValid ? 'ok' : auth.code === 'TIMEOUT' ? 'timeout' : 'failed',
    httpStatus: auth.status || null,
    latencyMs: auth.latencyMs,
    code: authInvalid ? 'AUTH_INVALID' : (!authJson && auth.ok ? 'RESPONSE_INVALID' : auth.code),
    detail: authValid ? 'Credenciais aceitas.' : 'Autenticação não confirmada.',
  }));
  steps.push(step(8, 'account', {
    status: authValid ? 'ok' : 'skipped',
    code: authValid ? 'ACCOUNT_READ' : 'AUTH_REQUIRED',
    detail: authValid
      ? `Conta ${safeText(userInfo?.status, 40) || 'ativa'}; expiração ${safeText(userInfo?.exp_date, 40) || 'não informada'}.`
      : 'Informações da conta não consultadas.',
  }));

  if (!authValid) return classificationForServer(steps);

  const categoryUrl = new URL(source.playerApiUrl);
  categoryUrl.searchParams.set('action', 'get_live_categories');
  const category = await serialRequest(categoryUrl, {
    method: 'GET', timeoutMs: 5_000, maxBytes: 256 * 1024, retries: 0, allowedOrigins,
  });
  const categoryCount = jsonArrayCount(category.text);
  steps.push(step(9, 'category', {
    status: category.ok && categoryCount !== null ? 'ok' : category.code === 'TIMEOUT' ? 'timeout' : 'failed',
    httpStatus: category.status || null,
    latencyMs: category.latencyMs,
    count: categoryCount,
    code: category.ok && categoryCount === null ? 'RESPONSE_INVALID' : category.code,
    detail: categoryCount !== null ? `${categoryCount} categoria(s) informada(s).` : 'Amostra de categorias inválida.',
  }));

  const contentUrl = new URL(source.playerApiUrl);
  contentUrl.searchParams.set('action', 'get_live_streams');
  contentUrl.searchParams.set('start', '0');
  contentUrl.searchParams.set('limit', '1');
  const content = await serialRequest(contentUrl, {
    method: 'GET', timeoutMs: 5_000, maxBytes: 512 * 1024, retries: 0, allowedOrigins,
  });
  const sample = firstXtreamStream(content.text);
  steps.push(step(10, 'content', {
    status: content.ok && sample ? 'ok' : content.code === 'TIMEOUT' ? 'timeout' : 'failed',
    httpStatus: content.status || null,
    latencyMs: content.latencyMs,
    count: sample ? 1 : 0,
    code: content.ok && !sample ? 'RESPONSE_INVALID' : content.code,
    detail: sample ? 'Um item técnico foi identificado sem armazenar catálogo.' : 'Nenhum item técnico foi identificado.',
  }));

  if (!sample) {
    steps.push(step(11, 'playback', {
      status: 'skipped', code: 'CONTENT_REQUIRED', detail: 'Playback não testado sem amostra de conteúdo.',
    }));
    return classificationForServer(steps);
  }

  const playbackUrl = new URL(`${source.basePath}/live/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${sample.id}.${sample.extension}`.replace(/\/+/g, '/'), source.origin);
  const playback = await serialRequest(playbackUrl, {
    method: 'HEAD', timeoutMs: 3_000, maxBytes: 1_024, retries: 0, allowedOrigins, accept: '*/*',
  });
  steps.push(step(11, 'playback', {
    status: playback.ok || playback.status === 405 ? 'ok' : playback.code === 'TIMEOUT' ? 'timeout' : 'failed',
    httpStatus: playback.status || null,
    latencyMs: playback.latencyMs,
    code: playback.code,
    detail: playback.ok || playback.status === 405 ? 'Endpoint de reprodução respondeu.' : 'Endpoint de reprodução não confirmou disponibilidade.',
  }));

  return classificationForServer(steps);
}

async function diagnoseM3u(rawUrl: string) {
  const target = assertAllowedPlaylistUrl(rawUrl);
  const allowedOrigins = [target.origin];
  const steps: ProgressiveDiagnosticStep[] = [];

  const head = await serialRequest(target, {
    method: 'HEAD', timeoutMs: 2_000, maxBytes: 1_024, retries: 1, allowedOrigins, accept: '*/*',
  });
  steps.push(step(5, 'head', {
    status: head.ok || head.status === 405 ? 'ok' : head.code === 'TIMEOUT' ? 'timeout' : 'failed',
    httpStatus: head.status || null,
    latencyMs: head.latencyMs,
    code: head.code,
  }));
  steps.push(step(6, 'redirects', {
    status: 'ok', count: head.redirectHops,
    detail: head.redirectHops ? `${head.redirectHops} redirecionamento(s) no mesmo domínio.` : 'Sem redirecionamento.',
  }));
  steps.push(step(7, 'auth', {
    status: 'skipped', code: 'M3U_EMBEDDED_ACCESS', detail: 'M3U não possui autenticação separada.',
  }));
  steps.push(step(8, 'account', {
    status: 'skipped', code: 'M3U_NO_ACCOUNT_ENDPOINT', detail: 'M3U não oferece endpoint de conta.',
  }));

  const sampleResult = await serialRequest(target, {
    method: 'GET', timeoutMs: 5_000, maxBytes: 512 * 1024, retries: 0, allowedOrigins, accept: 'audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain, */*',
  });
  const sample = firstM3uItem(sampleResult.text);
  steps.push(step(9, 'category', {
    status: sampleResult.ok && sample.headerValid ? 'ok' : sampleResult.code === 'TIMEOUT' ? 'timeout' : 'failed',
    httpStatus: sampleResult.status || null,
    latencyMs: sampleResult.latencyMs,
    count: sample.headerValid ? 1 : 0,
    code: sampleResult.ok && !sample.headerValid ? 'RESPONSE_INVALID' : sampleResult.code,
    detail: sample.headerValid ? 'Cabeçalho M3U confirmado.' : 'Resposta não parece uma lista M3U.',
  }));
  steps.push(step(10, 'content', {
    status: sample.itemUrl ? 'ok' : 'failed',
    count: sample.itemUrl ? 1 : 0,
    code: sample.itemUrl ? 'CONTENT_SAMPLE_FOUND' : 'CONTENT_SAMPLE_MISSING',
    detail: sample.itemUrl ? 'Um item técnico foi identificado sem armazenar a lista.' : 'Nenhum item foi identificado na amostra.',
  }));

  if (!sample.itemUrl) {
    steps.push(step(11, 'playback', {
      status: 'skipped', code: 'CONTENT_REQUIRED', detail: 'Playback não testado sem amostra de conteúdo.',
    }));
    return classificationForServer(steps);
  }

  let playback: RequestResult;
  try {
    const playbackTarget = assertAllowedPlaylistUrl(sample.itemUrl);
    playback = await serialRequest(playbackTarget, {
      method: 'HEAD', timeoutMs: 3_000, maxBytes: 1_024, retries: 0,
      allowedOrigins: [playbackTarget.origin], accept: '*/*',
    });
  } catch (error) {
    playback = {
      ok: false, status: 0, latencyMs: 0, text: '', contentType: '', redirectHops: 0,
      finalUrl: target, code: classifyFetchError(error),
    };
  }
  steps.push(step(11, 'playback', {
    status: playback.ok || playback.status === 405 ? 'ok' : playback.code === 'TIMEOUT' ? 'timeout' : 'failed',
    httpStatus: playback.status || null,
    latencyMs: playback.latencyMs,
    code: playback.code,
    detail: playback.ok || playback.status === 405 ? 'Endpoint de reprodução respondeu.' : 'Endpoint de reprodução não confirmou disponibilidade.',
  }));

  return classificationForServer(steps);
}

export async function runProgressivePlaylistDiagnostic(rawUrl: string, playlistType: unknown) {
  const detectedXtream = parseXtreamDiagnosticSource(rawUrl);
  const normalizedType = String(playlistType ?? '').trim().toLowerCase();
  return detectedXtream || normalizedType === 'xtream'
    ? detectedXtream
      ? await diagnoseXtream(detectedXtream)
      : {
          classification: 'NONSTANDARD_XTREAM' as const,
          strategy: 'direct' as const,
          summary: 'A lista foi marcada como Xtream, mas a URL não contém o contrato esperado.',
          needsDevice: true,
          steps: [step(5, 'head', { status: 'failed', code: 'NONSTANDARD_XTREAM' })],
        }
    : await diagnoseM3u(rawUrl);
}

export function normalizeDeviceDiagnosticChecks(value: unknown): DeviceDiagnosticCheck[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(['head', 'auth', 'playback']);
  const used = new Set<string>();
  const checks: DeviceDiagnosticCheck[] = [];

  for (const item of value.slice(0, 3)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const kind = String(raw.kind || '').trim().toLowerCase();
    if (!allowed.has(kind) || used.has(kind)) continue;
    used.add(kind);
    const httpStatusValue = Number(raw.httpStatus);
    const latencyValue = Number(raw.latencyMs);
    checks.push({
      kind: kind as DeviceDiagnosticCheck['kind'],
      ok: raw.ok === true,
      httpStatus: Number.isInteger(httpStatusValue) && httpStatusValue >= 0 && httpStatusValue <= 599
        ? httpStatusValue
        : null,
      latencyMs: Number.isFinite(latencyValue) && latencyValue >= 0
        ? Math.min(120_000, Math.round(latencyValue))
        : null,
      code: safeText(raw.code, 80),
    });
  }

  return checks;
}

export function combineServerAndDeviceDiagnostics(
  server: ProgressiveDiagnosticResult,
  deviceChecks: DeviceDiagnosticCheck[],
): ProgressiveDiagnosticResult & { comparison: Record<string, unknown> } {
  const deviceByKind = new Map(deviceChecks.map(check => [check.kind, check]));
  const deviceHead = deviceByKind.get('head');
  const deviceAuth = deviceByKind.get('auth');
  const devicePlayback = deviceByKind.get('playback');
  const deviceWorks = Boolean(deviceHead?.ok && (deviceAuth?.ok || deviceAuth?.code === 'NOT_APPLICABLE') && devicePlayback?.ok);
  const serverWorks = server.classification === 'SERVER_COMPATIBLE';
  const serverPartial = server.classification === 'HYBRID' || server.strategy === 'hybrid';

  let classification = server.classification;
  let strategy = server.strategy;
  let summary = server.summary;

  if (!serverWorks && deviceWorks) {
    classification = serverPartial ? 'HYBRID' : 'DEVICE_ONLY';
    strategy = serverPartial ? 'hybrid' : 'direct';
    summary = serverPartial
      ? 'O servidor acessa parte da API e o Android confirmou a reprodução pela rede do cliente.'
      : 'A lista funciona no Android autorizado, mas não no servidor.';
  } else if (serverWorks && !deviceWorks) {
    classification = 'IP_SESSION_BOUND';
    strategy = 'server_cache';
    summary = 'O servidor respondeu, mas o aparelho não confirmou o mesmo acesso.';
  } else if (!serverWorks && !deviceWorks && server.classification === 'INCONCLUSIVE') {
    classification = 'SERVER_UNAVAILABLE';
    strategy = 'retry';
    summary = 'Servidor e aparelho não confirmaram acesso; uma nova tentativa é necessária.';
  }

  const deviceSteps = deviceChecks.map(check => step(
    check.kind === 'head' ? 5 : check.kind === 'auth' ? 7 : 11,
    check.kind,
    {
      origin: 'device',
      status: check.ok ? 'ok' : check.code === 'TIMEOUT' ? 'timeout' : 'failed',
      httpStatus: check.httpStatus,
      latencyMs: check.latencyMs,
      code: check.code,
    },
  ));

  return {
    classification,
    strategy,
    summary,
    needsDevice: false,
    steps: [...server.steps, ...deviceSteps],
    comparison: {
      serverClassification: server.classification,
      serverStrategy: server.strategy,
      deviceConfirmed: deviceWorks,
      divergent: serverWorks !== deviceWorks,
    },
  };
}
