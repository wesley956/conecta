import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeFetchPlaylistText } from '../_shared/outboundFetch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await request.json();
    return payload && typeof payload === 'object'
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function textOrNull(value: unknown) {
  const valueText = String(value ?? '').trim();
  return valueText || null;
}

function readDeviceCredential(request: Request, payload: Record<string, unknown>) {
  const header = textOrNull(request.headers.get('x-device-credential'));
  if (header) return header;

  const authorization = textOrNull(request.headers.get('authorization'));
  const match = authorization?.match(/^Device\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();

  return textOrNull(payload.deviceCredential) || textOrNull(payload.device_credential);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

interface XtreamSource {
  origin: string;
  username: string;
  password: string;
}

function parseXtreamSource(rawUrl: string): XtreamSource | null {
  try {
    const url = new URL(rawUrl.trim());
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';
    const path = url.pathname.toLowerCase();

    if (!username || !password) return null;
    if (!path.endsWith('/get.php') && !path.endsWith('/player_api.php')) return null;

    return { origin: url.origin, username, password };
  } catch {
    return null;
  }
}

function buildXtreamApiUrl(source: XtreamSource, seriesId: string) {
  const params = new URLSearchParams({
    username: source.username,
    password: source.password,
    action: 'get_series_info',
    series_id: seriesId,
  });
  return `${source.origin}/player_api.php?${params.toString()}`;
}

function episodeStreamUrl(
  source: XtreamSource,
  episodeId: string | number,
  extensionValue: unknown,
) {
  const extension = String(extensionValue || 'mp4')
    .replace('.', '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .trim() || 'mp4';

  return `${source.origin}/series/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${episodeId}.${extension}`;
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function label(value: unknown, fallback: string) {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function normalizeEpisodeGroups(info: any): Array<[string, any[]]> {
  const rawEpisodes = info?.episodes ?? {};

  if (Array.isArray(rawEpisodes)) return [['1', rawEpisodes]];

  if (rawEpisodes && typeof rawEpisodes === 'object') {
    return Object.entries(rawEpisodes).flatMap(([seasonKey, value]) => {
      if (Array.isArray(value)) return [[seasonKey, value] as [string, any[]]];
      if (value && typeof value === 'object') {
        const nested = Object.values(value).filter(Array.isArray).flat() as any[];
        return nested.length > 0 ? [[seasonKey, nested] as [string, any[]]] : [];
      }
      return [];
    });
  }

  return [];
}

function mapSeasons(info: any, source: XtreamSource, seriesId: string) {
  const seasons: Array<{ number: number; episodes: any[] }> = [];

  for (const [seasonKey, rawEpisodes] of normalizeEpisodeGroups(info)) {
    const seasonMetadata = Array.isArray(info?.seasons) ? info.seasons : [];
    const episodeWithSeason = rawEpisodes.find(raw => raw?.season || raw?.season_number || raw?.seasonNumber);
    const seasonNumber = positiveNumber(
      episodeWithSeason?.season ??
        episodeWithSeason?.season_number ??
        episodeWithSeason?.seasonNumber ??
        seasonMetadata.find((item: any) => (
          String(item?.season_number ?? item?.seasonNumber ?? item?.number ?? '') === String(seasonKey)
        ))?.season_number ??
        seasonKey,
      seasons.length + 1,
    );

    const episodes = rawEpisodes.flatMap((raw: any, index: number) => {
      const episodeId = raw?.id ?? raw?.episode_id ?? raw?.stream_id;
      if (!episodeId) return [];

      const episodeNumber = positiveNumber(
        raw?.episode_num ?? raw?.episode_number ?? raw?.number,
        index + 1,
      );
      const url = episodeStreamUrl(
        source,
        episodeId,
        raw?.container_extension ?? raw?.containerExtension ?? raw?.info?.container_extension,
      );

      return [{
        id: `xtream-sr-${seriesId}-s${seasonNumber}-e${episodeNumber}`,
        number: episodeNumber,
        name: label(raw?.title || raw?.name, `Episódio ${episodeNumber}`),
        duration: label(
          raw?.info?.duration ||
            raw?.info?.duration_secs ||
            raw?.duration ||
            raw?.duration_secs ||
            raw?.durationSec,
          '—',
        ),
        url,
        playbackUrls: [url],
      }];
    });

    if (episodes.length > 0) {
      seasons.push({
        number: seasonNumber,
        episodes: episodes.sort((left, right) => left.number - right.number),
      });
    }
  }

  return seasons.sort((left, right) => left.number - right.number);
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ message: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ message: 'Servidor não configurado.' }, 500);
  }

  const payload = await readPayload(request);
  const deviceCode = textOrNull(payload.deviceCode) || textOrNull(payload.device_code);
  const deviceUuid = textOrNull(payload.deviceUuid) || textOrNull(payload.device_uuid);
  const deviceCredential = readDeviceCredential(request, payload);
  const seriesId = textOrNull(payload.seriesId) || textOrNull(payload.series_id);

  if (!deviceCode || !deviceUuid || !deviceCredential || !seriesId) {
    return json({ message: 'Identificação do aparelho e da série incompleta.' }, 400);
  }

  if (
    deviceCode.length > 80 ||
    deviceUuid.length > 160 ||
    deviceCredential.length > 256 ||
    !/^\d{1,20}$/.test(seriesId)
  ) {
    return json({ message: 'Parâmetros inválidos.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: device, error } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      device_uuid,
      device_credential_hash,
      status,
      subscription_expires_at,
      playlist:panel_playlists (
        id,
        playlist_url,
        active
      )
    `)
    .eq('device_code', deviceCode)
    .maybeSingle();

  if (error) return json({ message: 'Não foi possível validar o aparelho.' }, 500);
  if (!device) return json({ message: 'Aparelho não encontrado.' }, 404);

  const credentialHash = await sha256Hex(deviceCredential);
  if (
    !device.device_credential_hash ||
    !constantTimeEqual(credentialHash, device.device_credential_hash) ||
    device.device_uuid !== deviceUuid
  ) {
    return json({ message: 'Credencial do aparelho inválida.' }, 403);
  }

  const expiresAt = device.subscription_expires_at;
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
  if (device.status !== 'active' || expired) {
    return json({ message: expired ? 'Assinatura expirada.' : 'Aparelho não ativo.' }, 403);
  }

  const playlist = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;
  if (!playlist?.active || !playlist.playlist_url) {
    return json({ message: 'Lista ativa não encontrada.' }, 404);
  }

  const source = parseXtreamSource(playlist.playlist_url);
  if (!source) {
    return json({ message: 'Esta série não utiliza uma fonte Xtream sob demanda.' }, 422);
  }

  try {
    const raw = await safeFetchPlaylistText(buildXtreamApiUrl(source, seriesId), {
      label: 'Episódios da série',
      timeoutMs: 45_000,
      maxBytes: 30 * 1024 * 1024,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
      },
    });

    const info = JSON.parse(raw);
    const seasons = mapSeasons(info, source, seriesId);

    return json({
      seriesId,
      seasons,
      message: seasons.length > 0 ? null : 'O provedor não retornou episódios para esta série.',
    });
  } catch (fetchError) {
    console.error('series-detail failed', {
      deviceId: device.id,
      playlistId: playlist.id,
      seriesId,
      error: fetchError instanceof Error ? fetchError.message : String(fetchError),
    });
    return json({ message: 'Não foi possível carregar os episódios desta série.' }, 502);
  }
});
