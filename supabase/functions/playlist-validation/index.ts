import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';
import { getPlaylistCommercialDecision } from '../_shared/playlistQualification.ts';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://wesley956.github.io',
  'https://conecta-five-iota.vercel.app',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];
const MAX_BODY_BYTES = 32 * 1024;

function allowedOrigins() {
  const configured = String(Deno.env.get('PANEL_ALLOWED_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(request: Request) {
  const origin = String(request.headers.get('origin') || '').trim();
  const allowed = allowedOrigins();
  const selected = origin && allowed.has(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': selected,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('Requisição excede o limite permitido.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error('Requisição excede o limite permitido.');
  }
  try {
    const body = JSON.parse(raw || '{}');
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function requiredUuid(value: unknown, label: string) {
  const id = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${label} inválido.`);
  }
  return id;
}

function durationMinutes(value: unknown) {
  const parsed = Number(value ?? 15);
  if (!Number.isSafeInteger(parsed) || parsed < 2 || parsed > 60) {
    throw new Error('A duração precisa estar entre 2 e 60 minutos.');
  }
  return parsed;
}

async function listState(supabase: any, playlistId: string | null = null) {
  const { data: devices, error: devicesError } = await supabase
    .from('panel_devices')
    .select('id, device_code, client_name, status, app_version, last_seen_at, is_playlist_validation_device')
    .eq('is_playlist_validation_device', true)
    .order('last_seen_at', { ascending: false, nullsFirst: false });
  if (devicesError) throw new Error('Não foi possível carregar os aparelhos de validação.');

  let sessionsQuery = supabase
    .from('panel_playlist_validation_sessions')
    .select(`
      id,
      playlist_id,
      device_id,
      status,
      starts_at,
      expires_at,
      succeeded_at,
      failed_at,
      revoked_at,
      last_error_code,
      last_error_message,
      created_at,
      playlist:panel_playlists(id, name, playlist_qualification_status),
      device:panel_devices(id, device_code, client_name, last_seen_at)
    `)
    .order('created_at', { ascending: false })
    .limit(100);
  if (playlistId) sessionsQuery = sessionsQuery.eq('playlist_id', playlistId);
  const { data: sessions, error: sessionsError } = await sessionsQuery;
  if (sessionsError) throw new Error('Não foi possível carregar o histórico de validação.');

  return {
    devices: (devices || []).map((device: any) => ({
      id: device.id,
      deviceCode: device.device_code,
      clientName: device.client_name || null,
      status: device.status,
      appVersion: device.app_version || null,
      lastSeenAt: device.last_seen_at || null,
    })),
    sessions: (sessions || []).map((session: any) => {
      const playlist = Array.isArray(session.playlist) ? session.playlist[0] : session.playlist;
      const device = Array.isArray(session.device) ? session.device[0] : session.device;
      return {
        id: session.id,
        playlistId: session.playlist_id,
        playlistName: playlist?.name || null,
        qualificationStatus: playlist?.playlist_qualification_status || null,
        deviceId: session.device_id,
        deviceCode: device?.device_code || null,
        deviceName: device?.client_name || null,
        status: session.status,
        startsAt: session.starts_at,
        expiresAt: session.expires_at,
        succeededAt: session.succeeded_at || null,
        failedAt: session.failed_at || null,
        revokedAt: session.revoked_at || null,
        errorCode: session.last_error_code || null,
        errorMessage: session.last_error_message || null,
        createdAt: session.created_at,
      };
    }),
  };
}

async function requireDedicatedValidationDevice(
  supabase: any,
  deviceId: string,
  playlistId: string | null = null,
) {
  const { data, error } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      client_name,
      status,
      seller_id,
      customer_id,
      playlist_id,
      plan_id,
      subscription_expires_at,
      device_credential_hash,
      is_playlist_validation_device,
      device_type
    `)
    .eq('id', deviceId)
    .maybeSingle();
  if (error || !data) throw new Error('Aparelho não encontrado.');
  if (data.status !== 'pending'
      || data.customer_id
      || data.playlist_id
      || data.plan_id
      || data.subscription_expires_at) {
    throw new Error('Use um aparelho pendente e sem cliente, plano, lista ou validade comercial para a validação.');
  }
  if (!data.device_credential_hash) {
    throw new Error('Abra o aplicativo nesse aparelho antes de marcá-lo para validação.');
  }
  if (!['android', 'androidtv'].includes(String(data.device_type || '').toLowerCase())) {
    throw new Error('A homologação direta exige um aparelho Android nesta etapa.');
  }
  if (playlistId && data.seller_id) {
    const { data: permission, error: permissionError } = await supabase
      .from('panel_seller_playlists')
      .select('id')
      .eq('seller_id', data.seller_id)
      .eq('playlist_id', playlistId)
      .eq('active', true)
      .maybeSingle();
    if (permissionError || !permission) {
      throw new Error('A lista não pertence ao vendedor vinculado ao aparelho.');
    }
  }
  return data;
}

serve(async request => {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin']);
    const body = await readBody(request);
    const action = String(body.action || 'list').trim();

    if (action === 'list') {
      const playlistId = body.playlistId ? requiredUuid(body.playlistId, 'Lista') : null;
      return json(request, { ok: true, data: await listState(supabase, playlistId) });
    }

    if (action === 'markDevice') {
      const deviceId = requiredUuid(body.deviceId, 'Aparelho');
      const enabled = body.enabled !== false;
      if (enabled) await requireDedicatedValidationDevice(supabase, deviceId);
      if (!enabled) {
        await supabase
          .from('panel_playlist_validation_sessions')
          .update({
            status: 'revoked',
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('device_id', deviceId)
          .eq('status', 'active');
      }
      const { data, error } = await supabase
        .from('panel_devices')
        .update({ is_playlist_validation_device: enabled, updated_at: new Date().toISOString() })
        .eq('id', deviceId)
        .select('id, device_code, client_name, is_playlist_validation_device')
        .maybeSingle();
      if (error || !data) throw new Error('Não foi possível alterar o aparelho de validação.');
      return json(request, {
        ok: true,
        data: {
          id: data.id,
          deviceCode: data.device_code,
          clientName: data.client_name || null,
          enabled: data.is_playlist_validation_device === true,
        },
      });
    }

    if (action === 'start') {
      const playlistId = requiredUuid(body.playlistId, 'Lista');
      const deviceId = requiredUuid(body.deviceId, 'Aparelho');
      await requireDedicatedValidationDevice(supabase, deviceId, playlistId);
      const decision = await getPlaylistCommercialDecision(supabase, playlistId);
      if (!decision.requiresDeviceTest && decision.status !== 'retryable_error') {
        throw new Error(`Esta lista não precisa de teste direto. Estado atual: ${decision.label}.`);
      }
      const { data, error } = await supabase.rpc('start_playlist_validation_session', {
        p_playlist_id: playlistId,
        p_device_id: deviceId,
        p_duration_minutes: durationMinutes(body.durationMinutes),
        p_created_by_user_id: principal.userId,
      });
      if (error) throw new Error(error.message || 'Não foi possível iniciar a validação.');
      const session = Array.isArray(data) ? data[0] : data;
      return json(request, {
        ok: true,
        data: {
          session,
          message: 'Teste iniciado. Atualize o aplicativo no aparelho de validação.',
        },
      });
    }

    if (action === 'revoke') {
      const sessionId = requiredUuid(body.sessionId, 'Sessão');
      const { data, error } = await supabase.rpc('revoke_playlist_validation_session', {
        p_session_id: sessionId,
      });
      if (error) throw new Error('Não foi possível revogar a sessão.');
      return json(request, { ok: true, data: { revoked: data === true } });
    }

    if (action === 'status') {
      const playlistId = requiredUuid(body.playlistId, 'Lista');
      return json(request, {
        ok: true,
        data: {
          decision: await getPlaylistCommercialDecision(supabase, playlistId),
          ...(await listState(supabase, playlistId)),
        },
      });
    }

    return json(request, { error: 'Ação não suportada.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, headers);
    const message = error instanceof Error ? error.message : 'Falha ao controlar a validação.';
    return json(request, { error: message.slice(0, 500) }, 400);
  }
});
