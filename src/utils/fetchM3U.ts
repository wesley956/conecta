import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { parseCapacitorJsonOrThrow, parseJsonOrThrow, SeriesApiError } from '@/utils/safeFetchJson';

const REQUEST_HEADERS = {
  Accept: '*/*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};

interface XtreamSourceInfo {
  origin: string;
  username: string;
  password: string;
  output: string;
}

function isNativeRuntime() {
  if (typeof window === 'undefined') return false;

  const runtime = Capacitor?.getPlatform?.();
  const capacitor = (window as any).Capacitor;

  return (
    runtime === 'android' ||
    runtime === 'ios' ||
    Boolean(Capacitor?.isNativePlatform?.()) ||
    Boolean(capacitor?.isNativePlatform?.())
  );
}

function looksLikeM3U(content: string) {
  return content.includes('#EXTM3U') || content.includes('#EXTINF');
}

function previewText(content: string) {
  return content
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function parseXtreamSource(rawUrl: string): XtreamSourceInfo | null {
  try {
    const url = new URL(rawUrl.trim());
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';
    const output = url.searchParams.get('output') || 'mpegts';

    if (!username || !password) return null;

    return {
      origin: url.origin,
      username,
      password,
      output,
    };
  } catch {
    return null;
  }
}

function isXtreamGetUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.trim());
    const pathname = url.pathname.toLowerCase();
    const isXtreamEndpoint =
      pathname.endsWith('/get.php') ||
      pathname.endsWith('/player_api.php');

    return Boolean(
      isXtreamEndpoint &&
      url.searchParams.get('username') &&
      url.searchParams.get('password')
    );
  } catch {
    return false;
  }
}

function buildXtreamApiUrl(source: XtreamSourceInfo, action?: string, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({
    username: source.username,
    password: source.password,
  });

  if (action) {
    params.set('action', action);
  }

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, String(value));
  }

  return `${source.origin}/player_api.php?${params.toString()}`;
}

function liveExtension(source: XtreamSourceInfo) {
  return source.output.toLowerCase() === 'm3u8' ? 'm3u8' : 'ts';
}

function liveUrl(source: XtreamSourceInfo, streamId: string | number) {
  // A M3U real desse painel usa formato legado:
  // http://host/user/pass/id.ts
  return `${source.origin}/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${streamId}.${liveExtension(source)}`;
}

function movieUrl(source: XtreamSourceInfo, streamId: string | number, extension?: string) {
  const ext = String(extension || 'mp4').replace('.', '').trim() || 'mp4';

  return `${source.origin}/movie/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${streamId}.${ext}`;
}

function escapeM3UAttr(value: unknown) {
  return String(value ?? '')
    .replace(/"/g, "'")
    .replace(/\r?\n/g, ' ')
    .trim();
}

function m3uEntry(name: unknown, group: unknown, logo: unknown, url: string) {
  const safeName = escapeM3UAttr(name) || 'Sem nome';
  const safeGroup = escapeM3UAttr(group) || 'Outros';
  const safeLogo = escapeM3UAttr(logo);

  return `#EXTINF:-1 tvg-name="${safeName}" tvg-logo="${safeLogo}" group-title="${safeGroup}",${safeName}\n${url}`;
}

async function fetchJsonWithCapacitor<T>(url: string, context: string): Promise<T | null> {
  if (!isNativeRuntime()) return null;

  const response = await CapacitorHttp.get({
    url,
    // Texto, não 'json': se a API Xtream responder HTML (login expirado,
    // bloqueio, manutenção), deixamos o parseCapacitorJsonOrThrow detectar
    // isso e gerar uma mensagem clara em vez de um SyntaxError cru.
    responseType: 'text' as any,
    headers: REQUEST_HEADERS,
  });

  const status = Number(response.status ?? 0);

  if (status < 200 || status >= 300) {
    throw new SeriesApiError(`${context}: a API respondeu HTTP ${status}.`);
  }

  return parseCapacitorJsonOrThrow<T>(response.data, context);
}

async function fetchJsonDirect<T>(url: string, context: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new SeriesApiError(`${context}: a API respondeu HTTP ${response.status}.`);
  }

  const text = await response.text();
  return parseJsonOrThrow<T>(text, context);
}

async function fetchJson<T>(url: string, context = 'API Xtream'): Promise<T> {
  const nativeData = await fetchJsonWithCapacitor<T>(url, context);

  if (nativeData) {
    return nativeData;
  }

  return await fetchJsonDirect<T>(url, context);
}

function buildCategoryMap(categories: any[]) {
  const map = new Map<string, string>();

  for (const category of Array.isArray(categories) ? categories : []) {
    const id = String(category.category_id ?? '').trim();
    const name = String(category.category_name ?? '').trim();

    if (id && name) {
      map.set(id, name);
    }
  }

  return map;
}

async function fetchXtreamAsM3U(rawUrl: string): Promise<string | null> {
  if (!isXtreamGetUrl(rawUrl)) return null;

  const source = parseXtreamSource(rawUrl);

  if (!source) return null;

  const profile = await fetchJson<any>(buildXtreamApiUrl(source), 'Login Xtream');
  const userInfo = profile?.user_info ?? {};

  if (String(userInfo.auth) !== '1') {
    throw new Error('A conta Xtream não autorizou o acesso.');
  }

  const [liveCategories, vodCategories, liveStreams, vodStreams] = await Promise.all([
    fetchJson<any[]>(buildXtreamApiUrl(source, 'get_live_categories'), 'Categorias de TV').catch(() => []),
    fetchJson<any[]>(buildXtreamApiUrl(source, 'get_vod_categories'), 'Categorias de filmes').catch(() => []),
    fetchJson<any[]>(buildXtreamApiUrl(source, 'get_live_streams'), 'Lista de canais').catch(() => []),
    fetchJson<any[]>(buildXtreamApiUrl(source, 'get_vod_streams'), 'Lista de filmes').catch(() => []),
  ]);

  const liveCategoryMap = buildCategoryMap(liveCategories);
  const vodCategoryMap = buildCategoryMap(vodCategories);
  const output: string[] = ['#EXTM3U'];

  for (const item of Array.isArray(liveStreams) ? liveStreams : []) {
    const streamId = item.stream_id;

    if (!streamId) continue;

    const group = liveCategoryMap.get(String(item.category_id ?? '')) || 'Canais';
    const url = liveUrl(source, streamId);

    output.push(m3uEntry(item.name, group, item.stream_icon, url));
  }

  for (const item of Array.isArray(vodStreams) ? vodStreams : []) {
    const streamId = item.stream_id;

    if (!streamId) continue;

    const category = vodCategoryMap.get(String(item.category_id ?? '')) || 'Filmes';
    const group = `Filmes | ${category}`;
    const url = movieUrl(source, streamId, item.container_extension);

    output.push(m3uEntry(item.name, group, item.stream_icon, url));
  }


  if (output.length <= 1) {
    throw new Error('A API Xtream respondeu, mas não retornou canais ou filmes.');
  }

  // Séries serão carregadas em fase separada.
  // Não buscar get_series no salvamento para não travar APK com listas gigantes.
  return output.join('\n');
}

async function fetchM3UWithCapacitorHttp(url: string) {
  if (!isNativeRuntime()) return null;

  const response = await CapacitorHttp.get({
    url,
    responseType: 'text' as any,
    headers: REQUEST_HEADERS,
  });

  const status = Number(response.status ?? 0);
  const content =
    typeof response.data === 'string'
      ? response.data
      : typeof response.data === 'object'
        ? JSON.stringify(response.data)
        : String(response.data ?? '');

  if (status < 200 || status >= 300) {
    throw new Error(`A URL respondeu HTTP ${status}. O servidor não entregou a lista M3U no APK.`);
  }

  if (!looksLikeM3U(content)) {
    throw new Error(
      `A URL respondeu, mas não parece uma lista M3U. Início da resposta: "${previewText(content)}"`
    );
  }

  return content;
}

function buildCandidateUrls(rawUrl: string): string[] {
  const cleanUrl = rawUrl.trim();

  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error('A URL precisa começar com http:// ou https://');
  }

  const candidates = new Set<string>();
  candidates.add(cleanUrl);

  try {
    const parsed = new URL(cleanUrl);

    if (parsed.protocol === 'https:' && parsed.port === '80') {
      parsed.protocol = 'http:';
      candidates.add(parsed.toString());
    }

    if (parsed.protocol === 'http:' && parsed.port === '443') {
      parsed.protocol = 'https:';
      candidates.add(parsed.toString());
    }
  } catch {
    throw new Error('URL inválida.');
  }

  return [...candidates];
}

async function fetchDirect(url: string): Promise<string | null> {
  if (window.location.protocol === 'https:' && url.startsWith('http://')) {
    return null;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    });

    if (response.ok) return await response.text();
    return null;
  } catch {
    return null;
  }
}

async function fetchViaDevProxy(url: string): Promise<string> {
  const response = await fetch(`/api/dev-m3u-proxy?url=${encodeURIComponent(url)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Não foi possível buscar a lista. HTTP ${response.status}`);
  }

  return await response.text();
}

export async function fetchM3UContent(url: string): Promise<string> {
  const xtreamContent = await fetchXtreamAsM3U(url);

  if (xtreamContent) {
    return xtreamContent;
  }

  const nativeContent = await fetchM3UWithCapacitorHttp(url);

  if (nativeContent) {
    return nativeContent;
  }

  const candidates = buildCandidateUrls(url);
  const errors: string[] = [];

  for (const candidate of candidates) {
    const directContent = await fetchDirect(candidate);
    if (directContent) return directContent;

    try {
      return await fetchViaDevProxy(candidate);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Falha desconhecida.');
    }
  }

  throw new Error(
    [
      'Não foi possível buscar a lista.',
      'Se a URL usa porta 80, tente HTTP em vez de HTTPS.',
      'Exemplo: http://servidor:80/get.php?...',
      errors.length ? `Detalhe: ${errors[errors.length - 1]}` : '',
    ].filter(Boolean).join(' ')
  );
}
