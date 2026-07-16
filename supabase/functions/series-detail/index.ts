import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CACHE_BUCKET = 'playlist-cache';
const PROVIDER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
};
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type EpisodeResult = {
  id: string;
  number: number;
  name: string;
  duration: string;
  url: string;
  playbackUrls: string[];
};

type SeasonResult = { number: number; episodes: EpisodeResult[] };
type XtreamSource = { origin: string; username: string; password: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': status >= 400 ? 'no-store' : 'private, max-age=300',
    },
  });
}

function text(value: unknown) {
  return String(value ?? '').trim() || null;
}

async function payload(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function credential(req: Request, body: Record<string, unknown>) {
  const header = text(req.headers.get('x-device-credential'));
  if (header) return header;
  const auth = text(req.headers.get('authorization'));
  const match = auth?.match(/^Device\s+(.+)$/i);
  return match?.[1]?.trim() || text(body.deviceCredential) || text(body.device_credential);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function parseSource(raw: string): XtreamSource | null {
  try {
    const url = new URL(raw);
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';
    if (!username || !password) return null;
    return { origin: url.origin, username, password };
  } catch {
    return null;
  }
}

function apiUrl(source: XtreamSource, action: string, params: Record<string, string>) {
  const query = new URLSearchParams({
    username: source.username,
    password: source.password,
    action,
    ...params,
  });
  return `${source.origin}/player_api.php?${query.toString()}`;
}

function streamUrl(source: XtreamSource, id: string, extension: unknown) {
  const ext = String(extension || 'mp4').replace('.', '').replace(/[^a-z0-9]/gi, '') || 'mp4';
  return `${source.origin}/series/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${id}.${ext}`;
}

function normalizedHost(value: string) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function privateHost(host: string) {
  const normalized = normalizedHost(host).split('%')[0];
  if (
    normalized === 'localhost' || normalized.endsWith('.local') || normalized === '::1' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
  ) return true;
  const parts = normalized.split('.').map(Number);
  if (parts.length !== 4 || parts.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function boundedText(response: Response, limit: number) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new Error('UPSTREAM_TOO_LARGE');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel('too large');
      throw new Error('UPSTREAM_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
}

async function providerText(
  rawUrl: string,
  allowedOrigin: string,
  redirects = 4,
): Promise<string> {
  const target = new URL(rawUrl);
  const allowed = new URL(allowedOrigin);
  if (!['http:', 'https:'].includes(target.protocol) || privateHost(target.hostname)) {
    throw new Error('UPSTREAM_BLOCKED');
  }
  if (normalizedHost(target.hostname) !== normalizedHost(allowed.hostname)) {
    throw new Error('UPSTREAM_HOST_MISMATCH');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(target, {
      redirect: 'manual',
      signal: controller.signal,
      headers: PROVIDER_HEADERS,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects <= 0) throw new Error('UPSTREAM_REDIRECT');
      return await providerText(new URL(location, target).toString(), allowedOrigin, redirects - 1);
    }
    const raw = await boundedText(response, 40 * 1024 * 1024);
    if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
    return raw;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('UPSTREAM_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function number(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function episodeRecord(value: any) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (
    value.id != null || value.episode_id != null || value.stream_id != null || value.info?.id != null
  ));
}

function collect(value: unknown, depth = 0): any[] {
  if (value == null || depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap(item => collect(item, depth + 1));
  if (typeof value !== 'object') return [];
  if (episodeRecord(value)) return [value];
  return Object.values(value as Record<string, unknown>).flatMap(item => collect(item, depth + 1));
}

function groups(info: any): Array<[string, any[]]> {
  const raw = info?.episodes ?? info?.series_data?.episodes ?? info?.data?.episodes ?? {};
  if (Array.isArray(raw)) {
    const grouped = new Map<string, any[]>();
    for (const item of raw) {
      const season = String(item?.season ?? item?.season_number ?? item?.info?.season ?? 1);
      const entries = grouped.get(season) ?? [];
      entries.push(item);
      grouped.set(season, entries);
    }
    return [...grouped.entries()];
  }
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw).flatMap(([season, value]) => {
    const entries = collect(value);
    return entries.length ? [[season, entries] as [string, any[]]] : [];
  });
}

function mapSeasons(info: any, source: XtreamSource, seriesId: string): SeasonResult[] {
  const result: SeasonResult[] = [];
  for (const [seasonKey, rawEpisodes] of groups(info)) {
    const first = rawEpisodes[0] || {};
    const seasonNumber = number(
      first.season ?? first.season_number ?? first.seasonNumber ?? first.info?.season ?? seasonKey,
      result.length + 1,
    );
    const seen = new Set<string>();
    const episodes = rawEpisodes.flatMap((raw: any, index: number) => {
      const episodeId = raw?.id ?? raw?.episode_id ?? raw?.stream_id ?? raw?.info?.id;
      if (episodeId == null) return [];
      const id = String(episodeId);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const episodeNumber = number(
        raw?.episode_num ?? raw?.episode_number ?? raw?.episodeNumber ?? raw?.number ??
          raw?.info?.episode_num ?? raw?.info?.episode_number,
        index + 1,
      );
      const url = streamUrl(
        source,
        id,
        raw?.container_extension ?? raw?.containerExtension ??
          raw?.info?.container_extension ?? raw?.info?.containerExtension,
      );
      return [{
        id: `xtream-sr-${seriesId}-s${seasonNumber}-e${episodeNumber}-${id}`,
        number: episodeNumber,
        name: String(raw?.title ?? raw?.name ?? raw?.info?.name ?? `Episódio ${episodeNumber}`),
        duration: String(raw?.info?.duration ?? raw?.duration ?? raw?.duration_secs ?? '—'),
        url,
        playbackUrls: [url],
      }];
    });
    if (episodes.length) result.push({
      number: seasonNumber,
      episodes: episodes.sort((a, b) => a.number - b.number),
    });
  }
  return result.sort((a, b) => a.number - b.number);
}

function cachePath(playlistId: string, seriesId: string) {
  return `${playlistId}/series-details/${seriesId}.json`;
}

async function loadCache(supabase: any, playlistId: string, seriesId: string, version: string | null) {
  try {
    const download = await supabase.storage.from(CACHE_BUCKET).download(cachePath(playlistId, seriesId));
    if (download.error || !download.data) return null;
    const data = JSON.parse(await download.data.text());
    if (String(data?.cacheVersion ?? '') !== String(version ?? '')) return null;
    return Array.isArray(data?.seasons) && data.seasons.length ? data.seasons as SeasonResult[] : null;
  } catch {
    return null;
  }
}

async function saveCache(
  supabase: any,
  playlistId: string,
  seriesId: string,
  version: string | null,
  seasons: SeasonResult[],
) {
  await supabase.storage.from(CACHE_BUCKET).upload(
    cachePath(playlistId, seriesId),
    JSON.stringify({ schemaVersion: 3, seriesId, cacheVersion: version, seasons }),
    { contentType: 'application/json', cacheControl: '3600', upsert: true },
  );
}

function reason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('UPSTREAM_')) return message;
  if (/JSON|Unexpected token/i.test(message)) return 'UPSTREAM_INVALID_JSON';
  return 'UPSTREAM_UNAVAILABLE';
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ message: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ message: 'Servidor não configurado.' }, 500);

  const body = await payload(req);
  const deviceCode = text(body.deviceCode) || text(body.device_code);
  const deviceUuid = text(body.deviceUuid) || text(body.device_uuid);
  const deviceCredential = credential(req, body);
  const seriesId = text(body.seriesId) || text(body.series_id);
  if (!deviceCode || !deviceUuid || !deviceCredential || !seriesId) {
    return json({ message: 'Identificação do aparelho e da série incompleta.' }, 400);
  }
  if (!/^\d{1,20}$/.test(seriesId)) return json({ message: 'Série inválida.' }, 400);

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: device, error } = await supabase.from('panel_devices').select(`
    id, device_uuid, device_credential_hash, status, subscription_expires_at,
    playlist:panel_playlists (id, playlist_url, playlist_cache_version, active)
  `).eq('device_code', deviceCode).maybeSingle();

  if (error) return json({ message: 'Não foi possível validar o aparelho.' }, 500);
  if (!device) return json({ message: 'Aparelho não encontrado.' }, 404);
  const credentialHash = await sha256(deviceCredential);
  if (
    !device.device_credential_hash ||
    !timingSafeEqual(credentialHash, device.device_credential_hash) ||
    device.device_uuid !== deviceUuid
  ) return json({ message: 'Credencial do aparelho inválida.' }, 403);

  const expired = device.subscription_expires_at
    ? new Date(device.subscription_expires_at).getTime() <= Date.now()
    : false;
  if (device.status !== 'active' || expired) {
    return json({ message: expired ? 'Assinatura expirada.' : 'Aparelho não ativo.' }, 403);
  }

  const playlist = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;
  if (!playlist?.active || !playlist.playlist_url) return json({ message: 'Lista ativa não encontrada.' }, 404);
  const source = parseSource(playlist.playlist_url);
  if (!source) return json({ message: 'Fonte de séries inválida.' }, 422);

  const stored = await loadCache(supabase, playlist.id, seriesId, playlist.playlist_cache_version);
  if (stored) return json({ seriesId, seasons: stored, source: 'storage-cache', message: null });

  let failure: unknown = new Error('UPSTREAM_EMPTY_EPISODES');
  const attempts = [
    apiUrl(source, 'get_series_info', { series_id: seriesId }),
    apiUrl(source, 'get_series_info', { id: seriesId }),
  ];

  for (const target of attempts) {
    try {
      const raw = await providerText(target, source.origin);
      const seasons = mapSeasons(JSON.parse(raw), source, seriesId);
      if (seasons.length) {
        await saveCache(supabase, playlist.id, seriesId, playlist.playlist_cache_version, seasons);
        return json({ seriesId, seasons, source: 'xtream', message: null });
      }
      failure = new Error('UPSTREAM_EMPTY_EPISODES');
    } catch (error) {
      failure = error;
    }
  }

  const reasonCode = reason(failure);
  console.error('series-detail provider failed', {
    deviceId: device.id,
    playlistId: playlist.id,
    seriesId,
    reasonCode,
  });
  return json({
    message: 'Não foi possível carregar os episódios desta série.',
    reasonCode,
  }, 502);
});
