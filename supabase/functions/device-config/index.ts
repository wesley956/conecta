import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveActiveLabSession } from '../_shared/labSession.ts';
import { resolvePlaylistAccessMode } from '../_shared/playlistAccessMode.ts';

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
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 64 * 1024) throw new Error('Payload muito grande.');
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
  const text = String(value ?? '').trim();
  return text || null;
}

function readDeviceCredential(request: Request, payload: Record<string, unknown>) {
  const explicitHeader = textOrNull(request.headers.get('x-device-credential'));
  if (explicitHeader) return explicitHeader;

  const authorization = textOrNull(request.headers.get('authorization'));
  const authorizationMatch = authorization?.match(/^Device\s+(.+)$/i);
  if (authorizationMatch?.[1]) return authorizationMatch[1].trim();

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

function allowDirectPlaylistFallback() {
  return /^(1|true|yes|sim)$/i.test(
    String(Deno.env.get('ALLOW_DIRECT_PLAYLIST_FALLBACK') || ''),
  );
}

const PLAYLIST_FIELDS = `
  id,
  name,
  playlist_url,
  playlist_type,
  active,
  playlist_updated_at,
  playlist_cache_status,
  playlist_cache_path,
  playlist_cache_manifest_path,
  playlist_cache_channels_path,
  playlist_cache_movies_path,
  playlist_cache_series_path,
  playlist_cache_version,
  playlist_cache_updated_at,
  playlist_cache_item_count,
  playlist_cache_size_bytes,
  playlist_cache_manifest_sha256,
  playlist_cache_manifest_size_bytes,
  playlist_cache_error,
  playlist_cache_error_code,
  playlist_access_mode
`;

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') {
    return json({ active: false, message: 'Método não permitido.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ active: false, message: 'Servidor não configurado.' }, 500);
    }

    const payload = await readPayload(request);
    const code = textOrNull(payload.deviceCode)
      || textOrNull(payload.device_code)
      || textOrNull(payload.code)
      || textOrNull(payload.deviceId)
      || textOrNull(payload.device_id);
    const deviceUuid = textOrNull(payload.deviceUuid) || textOrNull(payload.device_uuid);
    const deviceCredential = readDeviceCredential(request, payload);

    if (!code) {
      return json({ active: false, status: 'pending', message: 'Código do aparelho não informado.' }, 400);
    }
    if (!deviceUuid) {
      return json({
        active: false,
        status: 'blocked',
        deviceCode: code,
        message: 'Identificador seguro do aparelho não informado.',
      }, 400);
    }
    if (!deviceCredential) {
      return json({
        active: false,
        status: 'blocked',
        deviceCode: code,
        credentialRequired: true,
        message: 'Credencial da instalação não informada. Gere um novo código no aplicativo.',
      }, 401);
    }
    if (code.length > 80 || deviceUuid.length > 160 || deviceCredential.length > 256) {
      return json({
        active: false,
        status: 'blocked',
        deviceCode: code,
        message: 'Identificação do aparelho inválida.',
      }, 400);
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
        client_name,
        status,
        subscription_expires_at,
        playlist:panel_playlists(${PLAYLIST_FIELDS}),
        device_playlists:panel_device_playlists(
          playlist_id,
          priority,
          active,
          consecutive_failures,
          last_success_at,
          last_failure_at,
          cooldown_until,
          last_error,
          playlist:panel_playlists(${PLAYLIST_FIELDS})
        )
      `)
      .eq('device_code', code)
      .maybeSingle();

    if (error) {
      console.error('Falha ao localizar aparelho.', { code: error.code || null });
      return json({ active: false, status: 'pending', message: 'Falha ao consultar o aparelho.' }, 500);
    }
    if (!device) {
      return json({
        active: false,
        status: 'pending',
        deviceCode: code,
        message: 'Aparelho aguardando cadastro no painel.',
      });
    }
    if (!device.device_credential_hash) {
      return json({
        active: false,
        status: 'blocked',
        deviceCode: device.device_code,
        credentialRequired: true,
        message: 'Este aparelho ainda não possui credencial segura. Atualize a ativação no aplicativo.',
      }, 428);
    }

    const providedCredentialHash = await sha256Hex(deviceCredential);
    if (!constantTimeEqual(providedCredentialHash, device.device_credential_hash)) {
      return json({
        active: false,
        status: 'blocked',
        deviceCode: device.device_code,
        message: 'Credencial da instalação inválida ou revogada.',
      }, 403);
    }
    if (!device.device_uuid || device.device_uuid !== deviceUuid) {
      return json({
        active: false,
        status: 'blocked',
        deviceCode: device.device_code,
        message: 'Este código e credencial pertencem a outro aparelho.',
      }, 403);
    }

    const nowIso = new Date().toISOString();
    const { data: updatedDevice, error: updateError } = await supabase
      .from('panel_devices')
      .update({ last_seen_at: nowIso, updated_at: nowIso })
      .eq('id', device.id)
      .eq('device_uuid', deviceUuid)
      .eq('device_credential_hash', device.device_credential_hash)
      .select('id')
      .maybeSingle();

    if (updateError || !updatedDevice) {
      return json({
        active: false,
        status: 'blocked',
        deviceCode: device.device_code,
        message: 'Não foi possível confirmar a identidade deste aparelho.',
      }, 409);
    }

    const labContext = await resolveActiveLabSession(supabase, device.id);
    const playlistHealth = payload.playlistHealth && typeof payload.playlistHealth === 'object'
      ? payload.playlistHealth as Record<string, unknown>
      : null;

    // A sessão de laboratório é somente leitura. O diagnóstico não altera a
    // saúde comercial da lista do cliente original.
    if (playlistHealth && !labContext) {
      const playlistId = textOrNull(playlistHealth.playlistId);
      const healthStatus = textOrNull(playlistHealth.status);
      if (playlistId && ['success', 'failure'].includes(healthStatus || '')) {
        const { data: assignment } = await supabase
          .from('panel_device_playlists')
          .select('id, consecutive_failures')
          .eq('device_id', device.id)
          .eq('playlist_id', playlistId)
          .maybeSingle();

        if (assignment) {
          const now = new Date();
          const isSuccess = healthStatus === 'success';
          const failures = isSuccess ? 0 : Number(assignment.consecutive_failures || 0) + 1;
          const healthUpdate = isSuccess
            ? {
                consecutive_failures: 0,
                last_success_at: now.toISOString(),
                cooldown_until: null,
                last_error: null,
                updated_at: now.toISOString(),
              }
            : {
                consecutive_failures: failures,
                last_failure_at: now.toISOString(),
                cooldown_until: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
                last_error: textOrNull(playlistHealth.error)?.slice(0, 500) || 'Falha ao carregar a lista.',
                updated_at: now.toISOString(),
              };
          await supabase.from('panel_device_playlists').update(healthUpdate).eq('id', assignment.id);
        }
      }
    }

    const expiresAt = labContext?.expiresAt || device.subscription_expires_at;
    const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
    const legacyPlaylist = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;

    if (!labContext && (device.status !== 'active' || expired)) {
      return json({
        active: false,
        status: expired ? 'expired' : device.status,
        deviceCode: device.device_code,
        clientName: device.client_name,
        expiresAt,
        message: expired ? 'Assinatura expirada.' : 'Aparelho não ativo.',
      });
    }

    let assignments: any[] = labContext
      ? labContext.assignments.map(assignment => ({
          ...assignment,
          playlist: Array.isArray(assignment.playlist) ? assignment.playlist[0] : assignment.playlist,
        }))
      : (device.device_playlists ?? [])
          .map((assignment: any) => ({
            ...assignment,
            playlist: Array.isArray(assignment.playlist) ? assignment.playlist[0] : assignment.playlist,
          }))
          .filter((assignment: any) => assignment.active !== false && assignment.playlist?.active !== false)
          .sort((left: any, right: any) => Number(left.priority) - Number(right.priority));

    if (!labContext && !assignments.length && legacyPlaylist?.active) {
      assignments.push({
        playlist_id: legacyPlaylist.id,
        priority: 1,
        active: true,
        consecutive_failures: 0,
        last_success_at: null,
        last_failure_at: null,
        cooldown_until: null,
        last_error: null,
        playlist: legacyPlaylist,
      });
    }

    if (!assignments.length) {
      return json({
        active: true,
        status: 'active',
        deviceCode: device.device_code,
        clientName: device.client_name,
        expiresAt,
        labMode: Boolean(labContext),
        labSessionId: labContext?.sessionId || null,
        labSessionExpiresAt: labContext?.expiresAt || null,
        sourceSubscriptionId: labContext?.sourceSubscriptionId || null,
        message: labContext
          ? 'Sessão de laboratório ativa, mas a origem não possui cache disponível.'
          : 'Aparelho ativo, mas sem lista ativa vinculada.',
      });
    }

    async function signedCacheUrl(path: string | null | undefined) {
      if (!path) return null;
      const { data, error: signedUrlError } = await supabase.storage
        .from('playlist-cache')
        .createSignedUrl(path, 15 * 60);
      if (signedUrlError) return null;
      return data?.signedUrl ?? null;
    }

    // Laboratório nunca recebe a URL real da origem, mesmo quando o fallback
    // direto está habilitado para aparelhos comerciais.
    const directFallbackAllowed = allowDirectPlaylistFallback() && !labContext;
    const playlistConfigs = await Promise.all(assignments.map(async (assignment: any) => {
      const playlist = assignment.playlist;
      let cacheSnapshotUrl: string | null = null;
      let cacheParts: Record<string, string | null> | null = null;
      const accessMode = resolvePlaylistAccessMode(
        playlist.playlist_cache_status,
        playlist.playlist_access_mode,
        playlist.playlist_cache_error_code,
        playlist.playlist_cache_error,
        playlist.playlist_type,
      );

      if (playlist.playlist_cache_status === 'ready') {
        const [snapshotUrl, manifestUrl, channelsUrl, moviesUrl, seriesUrl] = await Promise.all([
          signedCacheUrl(playlist.playlist_cache_path),
          signedCacheUrl(playlist.playlist_cache_manifest_path),
          signedCacheUrl(playlist.playlist_cache_channels_path),
          signedCacheUrl(playlist.playlist_cache_movies_path),
          signedCacheUrl(playlist.playlist_cache_series_path),
        ]);
        cacheSnapshotUrl = snapshotUrl;
        cacheParts = { manifestUrl, channelsUrl, moviesUrl, seriesUrl };
      }

      const cacheReady = Boolean(cacheSnapshotUrl || cacheParts?.channelsUrl);
      return {
        id: playlist.id,
        priority: Number(assignment.priority || 1),
        role: Number(assignment.priority || 1) === 1 ? 'primary' : 'backup',
        name: playlist.name,
        url: directFallbackAllowed && accessMode === 'direct' ? playlist.playlist_url : null,
        type: playlist.playlist_type,
        accessMode,
        updatedAt: playlist.playlist_updated_at,
        cacheStatus: playlist.playlist_cache_status,
        cacheVersion: playlist.playlist_cache_version,
        cacheUpdatedAt: playlist.playlist_cache_updated_at,
        cacheItemCount: playlist.playlist_cache_item_count,
        cacheSizeBytes: playlist.playlist_cache_size_bytes,
        cacheManifestSha256: playlist.playlist_cache_manifest_sha256,
        cacheManifestSizeBytes: playlist.playlist_cache_manifest_size_bytes,
        cacheError: playlist.playlist_cache_error,
        cacheErrorCode: playlist.playlist_cache_error_code,
        cacheSnapshotUrl,
        cacheParts,
        cacheReady,
        consecutiveFailures: Number(assignment.consecutive_failures || 0),
        lastSuccessAt: assignment.last_success_at,
        lastFailureAt: assignment.last_failure_at,
        cooldownUntil: assignment.cooldown_until,
        lastError: assignment.last_error,
      };
    }));

    const now = Date.now();
    const selected = playlistConfigs.find(config => {
      const cooldown = config.cooldownUntil ? new Date(config.cooldownUntil).getTime() : 0;
      return cooldown <= now && (config.cacheReady || Boolean(config.url));
    }) || playlistConfigs.find(config => config.cacheReady || Boolean(config.url)) || playlistConfigs[0];

    return json({
      active: true,
      status: 'active',
      deviceCode: device.device_code,
      clientName: device.client_name,
      expiresAt,
      labMode: Boolean(labContext),
      labSessionId: labContext?.sessionId || null,
      labSessionExpiresAt: labContext?.expiresAt || null,
      sourceSubscriptionId: labContext?.sourceSubscriptionId || null,
      selectedPlaylistId: selected.id,
      playlistName: selected.name,
      playlistUrl: selected.url,
      playlistType: selected.type,
      playlistAccessMode: selected.accessMode,
      playlistUpdatedAt: selected.updatedAt,
      cacheStatus: selected.cacheStatus,
      cacheVersion: selected.cacheVersion,
      cacheUpdatedAt: selected.cacheUpdatedAt,
      cacheItemCount: selected.cacheItemCount,
      cacheSizeBytes: selected.cacheSizeBytes,
      cacheManifestSha256: selected.cacheManifestSha256,
      cacheManifestSizeBytes: selected.cacheManifestSizeBytes,
      cacheError: selected.cacheError,
      cacheSnapshotUrl: selected.cacheSnapshotUrl,
      cacheParts: selected.cacheParts,
      playlists: playlistConfigs,
      directPlaylistFallbackAllowed: directFallbackAllowed,
      message: !playlistConfigs.some(config => config.cacheReady || Boolean(config.url))
        ? labContext
          ? 'A sessão de laboratório está ativa, mas nenhum cache seguro está pronto.'
          : 'As listas estão vinculadas, mas nenhum cache seguro está pronto.'
        : labContext
          ? `Modo laboratório ativo até ${new Date(labContext.expiresAt).toLocaleString('pt-BR')}.`
          : null,
    });
  } catch (error) {
    console.error('device-config falhou.', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json({ active: false, status: 'pending', message: 'Falha temporária ao carregar a configuração.' }, 500);
  }
});
