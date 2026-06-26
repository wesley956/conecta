import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'\;
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'\;

const BUCKET = 'playlist-cache';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function requireAdmin(req: Request) {
  const expected = Deno.env.get('ADMIN_PANEL_TOKEN') || '';
  const provided = req.headers.get('x-admin-token') || '';

  if (!expected) return json({ error: 'ADMIN_PANEL_TOKEN não configurado.' }, 500);
  if (!provided || provided !== expected) return json({ error: 'Token de administrador inválido.' }, 401);

  return null;
}

async function readBody(req: Request) {
  if (req.method !== 'POST') return {};

  try {
    return await req.json();
  } catch {
    return {};
  }
}

function text(value: unknown, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function normalizeType(value: unknown) {
  const type = String(value ?? 'm3u').trim().toLowerCase();
  return ['m3u', 'xtream', 'stalker', 'local'].includes(type) ? type : 'm3u';
}

function parseXtreamSource(rawUrl: string) {
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

function buildXtreamApiUrl(source: ReturnType<typeof parseXtreamSource>, action?: string, extra: Record<string, string | number> = {}) {
  if (!source) throw new Error('Fonte Xtream inválida.');

  const params = new URLSearchParams({
    username: source.username,
    password: source.password,
  });

  if (action) params.set('action', action);

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, String(value));
  }

  return `${source.origin}/player_api.php?${params.toString()}`;
}

async function fetchJson(url: string, label: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
  });

  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status}`);
  }

  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label}: resposta não é JSON. Início: ${raw.slice(0, 120)}`);
  }
}

async function fetchText(url: string, label: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: '*/*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
  });

  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status}`);
  }

  return await response.text();
}

async function sha256Short(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(hash)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 20);
}

function buildCategoryMap(items: any[]) {
  const map = new Map<string, string>();

  for (const item of Array.isArray(items) ? items : []) {
    const id = text(item.category_id);
    const name = text(item.category_name);

    if (id && name) map.set(id, name);
  }

  return map;
}

function cleanGroup(value: unknown, fallback = 'outros') {
  return text(value, fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function liveExtension(source: ReturnType<typeof parseXtreamSource>) {
  return source?.output?.toLowerCase() === 'm3u8' ? 'm3u8' : 'ts';
}

function liveUrl(source: ReturnType<typeof parseXtreamSource>, streamId: string | number) {
  if (!source) throw new Error('Fonte Xtream inválida.');

  return `${source.origin}/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${streamId}.${liveExtension(source)}`;
}

function movieUrl(source: ReturnType<typeof parseXtreamSource>, streamId: string | number, extension?: string) {
  if (!source) throw new Error('Fonte Xtream inválida.');

  const ext = text(extension, 'mp4').replace('.', '') || 'mp4';
  return `${source.origin}/movie/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${streamId}.${ext}`;
}

function yearFromName(name: string) {
  const match = name.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

async function buildXtreamSnapshot(playlist: any) {
  const source = parseXtreamSource(playlist.playlist_url);
  if (!source) return null;

  const profile = await fetchJson(buildXtreamApiUrl(source), 'Login Xtream');
  const userInfo = profile?.user_info ?? {};

  if (String(userInfo.auth) !== '1') {
    throw new Error('A conta Xtream não autorizou o acesso.');
  }

  const [
    liveCategories,
    vodCategories,
    seriesCategories,
    liveStreams,
    vodStreams,
    seriesItems,
  ] = await Promise.all([
    fetchJson(buildXtreamApiUrl(source, 'get_live_categories'), 'Categorias de canais').catch(() => []),
    fetchJson(buildXtreamApiUrl(source, 'get_vod_categories'), 'Categorias de filmes').catch(() => []),
    fetchJson(buildXtreamApiUrl(source, 'get_series_categories'), 'Categorias de séries').catch(() => []),
    fetchJson(buildXtreamApiUrl(source, 'get_live_streams'), 'Canais').catch(() => []),
    fetchJson(buildXtreamApiUrl(source, 'get_vod_streams'), 'Filmes').catch(() => []),
    fetchJson(buildXtreamApiUrl(source, 'get_series'), 'Séries').catch(() => []),
  ]);

  const liveCategoryMap = buildCategoryMap(liveCategories);
  const vodCategoryMap = buildCategoryMap(vodCategories);
  const seriesCategoryMap = buildCategoryMap(seriesCategories);

  const channels = (Array.isArray(liveStreams) ? liveStreams : [])
    .filter(item => item.stream_id)
    .map(item => {
      const groupName = liveCategoryMap.get(String(item.category_id ?? '')) || 'Canais';

      return {
        id: `${playlist.id}-ch-${item.stream_id}`,
        name: text(item.name, `Canal ${item.stream_id}`),
        logo: text(item.stream_icon) || undefined,
        groupTitle: groupName,
        group: cleanGroup(groupName, 'canais'),
        url: liveUrl(source, item.stream_id),
        isFavorite: false,
        playbackUrls: [liveUrl(source, item.stream_id)],
      };
    });

  const movies = (Array.isArray(vodStreams) ? vodStreams : [])
    .filter(item => item.stream_id)
    .map(item => {
      const name = text(item.name, `Filme ${item.stream_id}`);
      const category = vodCategoryMap.get(String(item.category_id ?? '')) || 'Filmes';
      const url = movieUrl(source, item.stream_id, item.container_extension);

      return {
        id: `${playlist.id}-mv-${item.stream_id}`,
        name,
        year: yearFromName(name),
        duration: text(item.duration, '—'),
        synopsis: text(item.plot, 'Filme autorizado pelo painel.'),
        cover: text(item.stream_icon) || undefined,
        category,
        url,
        isFavorite: false,
        progress: 0,
        playbackUrls: [url],
      };
    });

  const series = (Array.isArray(seriesItems) ? seriesItems : [])
    .filter(item => item.series_id)
    .map(item => {
      const seriesId = item.series_id;
      const category = seriesCategoryMap.get(String(item.category_id ?? '')) || 'Séries';

      return {
        id: `xtream-sr-${seriesId}`,
        name: text(item.name || item.title, `Série ${seriesId}`),
        cover: text(item.cover) || undefined,
        category,
        synopsis: text(item.plot, 'Série autorizada pelo painel.'),
        seasons: [],
        isFavorite: false,
        progress: 0,
        xtreamSeriesId: seriesId,
      };
    });

  return {
    channels,
    movies,
    series,
  };
}

function attr(line: string, name: string) {
  const regex = new RegExp(`${name}="([^"]*)"`, 'i');
  return line.match(regex)?.[1]?.trim() || '';
}

function itemName(line: string) {
  const comma = line.lastIndexOf(',');
  return comma >= 0 ? line.slice(comma + 1).trim() : 'Sem nome';
}

async function buildM3USnapshot(playlist: any) {
  const raw = await fetchText(playlist.playlist_url, 'Lista M3U');

  if (!raw.includes('#EXTINF')) {
    throw new Error('A URL não retornou uma lista M3U válida.');
  }

  const channels: any[] = [];
  const movies: any[] = [];
  const seriesMap = new Map<string, any>();
  const lines = raw.split(/\r?\n/);
  let pending: string | null = null;
  let index = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed.startsWith('#EXTINF')) {
      pending = trimmed;
      continue;
    }

    if (!pending || !/^https?:\/\//i.test(trimmed)) continue;

    index += 1;

    const name = itemName(pending);
    const group = attr(pending, 'group-title') || 'Outros';
    const logo = attr(pending, 'tvg-logo') || undefined;
    const lower = `${name} ${group} ${trimmed}`.toLowerCase();

    if (lower.includes('/series/') || lower.includes('série') || lower.includes('series')) {
      const key = `${playlist.id}-sr-${cleanGroup(name, String(index))}`;

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          id: key,
          name,
          cover: logo,
          category: group,
          synopsis: 'Série autorizada pelo painel.',
          seasons: [],
          isFavorite: false,
          progress: 0,
        });
      }
    } else if (
      lower.includes('/movie/') ||
      lower.includes('filme') ||
      lower.includes('movie') ||
      lower.includes('vod') ||
      lower.includes('cinema')
    ) {
      movies.push({
        id: `${playlist.id}-mv-${index}`,
        name,
        year: yearFromName(name),
        duration: '—',
        synopsis: 'Filme autorizado pelo painel.',
        cover: logo,
        category: group,
        url: trimmed,
        isFavorite: false,
        progress: 0,
        playbackUrls: [trimmed],
      });
    } else {
      channels.push({
        id: `${playlist.id}-ch-${index}`,
        name,
        logo,
        groupTitle: group,
        group: cleanGroup(group, 'canais'),
        url: trimmed,
        isFavorite: false,
        playbackUrls: [trimmed],
      });
    }

    pending = null;
  }

  return {
    channels,
    movies,
    series: [...seriesMap.values()],
  };
}

async function buildSnapshot(playlist: any) {
  const xtream = await buildXtreamSnapshot(playlist).catch(() => null);
  const content = xtream ?? await buildM3USnapshot(playlist);
  const generatedAt = new Date().toISOString();

  const playlistItem = {
    id: playlist.id,
    name: playlist.name,
    type: normalizeType(playlist.playlist_type),
    url: playlist.playlist_url,
    status: 'active',
    channelCount: content.channels.length,
    movieCount: content.movies.length,
    seriesCount: content.series.length,
    lastSync: generatedAt,
  };

  return {
    schemaVersion: 1,
    generatedAt,
    playlistId: playlist.id,
    playlistName: playlist.name,
    playlistUrl: playlist.playlist_url,
    channels: content.channels,
    movies: content.movies,
    series: content.series,
    playlists: [playlistItem],
  };
}

async function refreshPlaylistCache(supabase: any, playlist: any) {
  const startedAt = Date.now();

  await supabase
    .from('panel_playlists')
    .update({
      playlist_cache_status: 'building',
      playlist_cache_error: null,
    })
    .eq('id', playlist.id);

  try {
    const snapshot = await buildSnapshot(playlist);
    const snapshotText = JSON.stringify(snapshot);
    const hash = await sha256Short(snapshotText);
    const version = `${snapshot.generatedAt}-${hash}`;
    const storagePath = `${playlist.id}/snapshot-${hash}.json`;

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, snapshotText, {
        contentType: 'application/json; charset=utf-8',
        upsert: true,
        cacheControl: '3600',
      });

    if (upload.error) {
      throw new Error(upload.error.message);
    }

    const itemCount = snapshot.channels.length + snapshot.movies.length + snapshot.series.length;
    const sizeBytes = new TextEncoder().encode(snapshotText).byteLength;

    await supabase
      .from('panel_playlists')
      .update({
        playlist_cache_status: 'ready',
        playlist_cache_path: storagePath,
        playlist_cache_version: version,
        playlist_cache_updated_at: snapshot.generatedAt,
        playlist_cache_item_count: itemCount,
        playlist_cache_size_bytes: sizeBytes,
        playlist_cache_error: null,
      })
      .eq('id', playlist.id);

    return {
      ok: true,
      playlistId: playlist.id,
      playlistName: playlist.name,
      itemCount,
      channels: snapshot.channels.length,
      movies: snapshot.movies.length,
      series: snapshot.series.length,
      sizeBytes,
      elapsedMs: Date.now() - startedAt,
      version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida.';

    await supabase
      .from('panel_playlists')
      .update({
        playlist_cache_status: 'error',
        playlist_cache_error: message,
      })
      .eq('id', playlist.id);

    return {
      ok: false,
      playlistId: playlist.id,
      playlistName: playlist.name,
      error: message,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await readBody(req);
    const action = text(body.action, 'refreshAll');
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });

    if (action === 'refresh') {
      const playlistId = text(body.playlistId || body.id);

      if (!playlistId) return json({ error: 'playlistId é obrigatório.' }, 400);

      const { data: playlist, error } = await supabase
        .from('panel_playlists')
        .select('id, name, playlist_url, playlist_type, active, playlist_updated_at')
        .eq('id', playlistId)
        .single();

      if (error) return json({ error: error.message }, 500);
      if (!playlist?.active) return json({ error: 'Lista inativa.' }, 400);

      return json(await refreshPlaylistCache(supabase, playlist));
    }

    if (action === 'refreshAll') {
      const limit = Math.max(1, Math.min(20, Number(body.limit || 20)));

      const { data: playlists, error } = await supabase
        .from('panel_playlists')
        .select('id, name, playlist_url, playlist_type, active, playlist_updated_at')
        .eq('active', true)
        .limit(limit);

      if (error) return json({ error: error.message }, 500);

      const results = [];

      for (const playlist of playlists ?? []) {
        results.push(await refreshPlaylistCache(supabase, playlist));
      }

      return json({
        ok: results.every(result => result.ok),
        results,
      });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Falha desconhecida.',
    }, 500);
  }
});
