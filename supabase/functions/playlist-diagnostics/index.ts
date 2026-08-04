import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';
import {
  runProgressivePlaylistDiagnostic,
  type ProgressiveDiagnosticResult,
  type ProgressiveDiagnosticStep,
} from '../_shared/progressivePlaylistDiagnostic.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JsonBody = Record<string, unknown>;

type DiagnosticRow = {
  id: string;
  playlist_id: string;
  requested_by_user_id: string | null;
  requested_by_role: 'owner' | 'admin' | 'seller';
  requested_by_seller_id: string | null;
  status: 'running' | 'waiting_device' | 'completed' | 'expired' | 'failed';
  classification: string | null;
  strategy: string | null;
  server_steps: unknown;
  device_steps: unknown;
  comparison: unknown;
  summary: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readBody(request: Request): Promise<JsonBody> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 64 * 1024) throw new Error('Payload muito grande.');
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as JsonBody : {};
  } catch {
    return {};
  }
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  if (text.length > 180) throw new Error(`${label} é inválido.`);
  return text;
}

function safeText(value: unknown, max = 300) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[endereço omitido]')
    .replace(/(?:username|user|password|pass|token)=([^&\s]+)/gi, '$1=[omitido]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || null;
}

function normalizeSteps(value: unknown): ProgressiveDiagnosticStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object')
    .slice(0, 24)
    .map(item => {
      const raw = item as Record<string, unknown>;
      const number = Number(raw.step);
      const httpStatus = Number(raw.httpStatus);
      const latencyMs = Number(raw.latencyMs);
      const count = Number(raw.count);
      return {
        step: Number.isInteger(number) ? Math.min(14, Math.max(5, number)) : 5,
        key: String(raw.key || 'head') as ProgressiveDiagnosticStep['key'],
        origin: ['server', 'device', 'system'].includes(String(raw.origin))
          ? String(raw.origin) as ProgressiveDiagnosticStep['origin']
          : 'system',
        status: ['ok', 'failed', 'skipped', 'timeout', 'waiting'].includes(String(raw.status))
          ? String(raw.status) as ProgressiveDiagnosticStep['status']
          : 'failed',
        httpStatus: Number.isInteger(httpStatus) && httpStatus >= 0 && httpStatus <= 599 ? httpStatus : null,
        latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? Math.min(120_000, Math.round(latencyMs)) : null,
        code: safeText(raw.code, 80),
        count: Number.isFinite(count) && count >= 0 ? Math.min(1_000_000, Math.round(count)) : null,
        detail: safeText(raw.detail, 180),
      };
    });
}

function closingSteps(result: ProgressiveDiagnosticResult, waitingForDevice: boolean): ProgressiveDiagnosticStep[] {
  return [
    {
      step: 12,
      key: 'comparison',
      origin: 'system',
      status: waitingForDevice ? 'waiting' : 'ok',
      httpStatus: null,
      latencyMs: null,
      code: waitingForDevice ? 'WAITING_DEVICE' : 'SERVER_ONLY',
      count: null,
      detail: waitingForDevice
        ? 'Aguardando comparação pela rede de um Android oficial.'
        : 'O servidor reuniu evidência suficiente sem acordar o aparelho.',
    },
    {
      step: 13,
      key: 'classification',
      origin: 'system',
      status: 'ok',
      httpStatus: null,
      latencyMs: null,
      code: result.classification,
      count: null,
      detail: result.summary,
    },
    {
      step: 14,
      key: 'strategy',
      origin: 'system',
      status: 'ok',
      httpStatus: null,
      latencyMs: null,
      code: result.strategy,
      count: null,
      detail: `Estratégia sugerida: ${result.strategy}.`,
    },
  ];
}

async function assertPlaylistAccess(
  supabase: any,
  principal: Awaited<ReturnType<typeof requirePanelPrincipal>>,
  playlistId: string,
) {
  const { data: playlist, error } = await supabase
    .from('panel_playlists')
    .select('id, name, playlist_url, playlist_type, active')
    .eq('id', playlistId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao localizar a lista: ${error.message}`);
  if (!playlist) throw new Error('Lista não encontrada.');
  if (playlist.active === false) throw new Error('A lista está inativa.');

  if (principal.role === 'seller') {
    const { data: permission, error: permissionError } = await supabase
      .from('panel_seller_playlists')
      .select('id')
      .eq('seller_id', principal.sellerId)
      .eq('playlist_id', playlistId)
      .eq('active', true)
      .maybeSingle();
    if (permissionError) throw new Error(`Falha ao validar a lista do vendedor: ${permissionError.message}`);
    if (!permission) throw new PanelAuthError('Esta lista não pertence ao vendedor autenticado.', 403);
  }

  return playlist;
}

function activeAndroid(device: any) {
  const type = String(device?.device_type || '').toLowerCase();
  const expiresAt = device?.subscription_expires_at ? new Date(device.subscription_expires_at).getTime() : null;
  return device?.status === 'active'
    && ['android', 'androidtv'].includes(type)
    && Boolean(String(device?.app_version || '').trim())
    && (!expiresAt || expiresAt > Date.now());
}

async function findOfficialAndroid(supabase: any, playlistId: string) {
  const { data: assignments, error: assignmentError } = await supabase
    .from('panel_device_playlists')
    .select('device_id')
    .eq('playlist_id', playlistId)
    .eq('active', true);
  if (assignmentError) throw new Error(`Falha ao localizar aparelhos da lista: ${assignmentError.message}`);

  const ids = [...new Set((assignments ?? []).map((item: any) => item.device_id).filter(Boolean))];
  const { data: legacy, error: legacyError } = await supabase
    .from('panel_devices')
    .select('id')
    .eq('playlist_id', playlistId);
  if (legacyError) throw new Error(`Falha ao localizar aparelhos legados: ${legacyError.message}`);
  for (const item of legacy ?? []) if (item.id && !ids.includes(item.id)) ids.push(item.id);
  if (!ids.length) return null;

  const { data: devices, error: deviceError } = await supabase
    .from('panel_devices')
    .select('id, status, device_type, app_version, last_seen_at, subscription_expires_at')
    .in('id', ids);
  if (deviceError) throw new Error(`Falha ao validar aparelhos da lista: ${deviceError.message}`);

  return (devices ?? [])
    .filter(activeAndroid)
    .sort((left: any, right: any) => {
      const leftSeen = left.last_seen_at ? new Date(left.last_seen_at).getTime() : 0;
      const rightSeen = right.last_seen_at ? new Date(right.last_seen_at).getTime() : 0;
      return rightSeen - leftSeen;
    })[0] || null;
}

async function expireStale(supabase: any) {
  const nowIso = new Date().toISOString();
  await supabase
    .from('panel_playlist_diagnostic_tasks')
    .update({ status: 'expired', updated_at: nowIso })
    .in('status', ['waiting_device', 'claimed'])
    .lt('expires_at', nowIso);
  await supabase
    .from('panel_playlist_diagnostics')
    .update({ status: 'expired', updated_at: nowIso, completed_at: nowIso })
    .eq('status', 'waiting_device')
    .lt('expires_at', nowIso);
}

function serializeDiagnostic(row: DiagnosticRow, playlistName: string | null = null) {
  return {
    id: row.id,
    playlistId: row.playlist_id,
    playlistName,
    status: row.status,
    classification: row.classification,
    strategy: row.strategy,
    serverSteps: normalizeSteps(row.server_steps),
    deviceSteps: normalizeSteps(row.device_steps),
    comparison: row.comparison && typeof row.comparison === 'object' ? row.comparison : {},
    summary: safeText(row.summary, 300),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  };
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Servidor não configurado.' }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']);
    const body = await readBody(request);
    const action = String(body.action || 'list').trim();
    await expireStale(supabase);

    if (action === 'start') {
      const playlistId = requiredText(body.playlistId, 'ID da lista');
      const playlist = await assertPlaylistAccess(supabase, principal, playlistId);
      const nowIso = new Date().toISOString();

      const { data: diagnostic, error: insertError } = await supabase
        .from('panel_playlist_diagnostics')
        .insert({
          playlist_id: playlist.id,
          requested_by_user_id: principal.userId,
          requested_by_role: principal.role,
          requested_by_seller_id: principal.sellerId,
          status: 'running',
          updated_at: nowIso,
        })
        .select('*')
        .single();
      if (insertError || !diagnostic) {
        throw new Error(`Falha ao iniciar o diagnóstico: ${insertError?.message || 'sem resposta'}`);
      }

      try {
        const result = await runProgressivePlaylistDiagnostic(
          String(playlist.playlist_url),
          playlist.playlist_type,
        );
        const device = result.needsDevice ? await findOfficialAndroid(supabase, playlist.id) : null;
        const waitingForDevice = Boolean(device);
        const completeWithoutDevice = result.needsDevice && !device;
        const summary = completeWithoutDevice
          ? `${result.summary} Nenhum Android oficial ativo está disponível para a comparação.`
          : result.summary;
        const finalSteps = [...result.steps, ...closingSteps({ ...result, summary }, waitingForDevice)];
        const completedAt = waitingForDevice ? null : new Date().toISOString();
        const diagnosticStatus = waitingForDevice ? 'waiting_device' : 'completed';

        const { data: updated, error: updateError } = await supabase
          .from('panel_playlist_diagnostics')
          .update({
            status: diagnosticStatus,
            classification: result.classification,
            strategy: result.strategy,
            server_steps: finalSteps,
            summary,
            updated_at: new Date().toISOString(),
            completed_at: completedAt,
          })
          .eq('id', diagnostic.id)
          .select('*')
          .single();
        if (updateError || !updated) throw new Error(`Falha ao salvar o diagnóstico: ${updateError?.message || 'sem resposta'}`);

        if (waitingForDevice) {
          const { error: taskError } = await supabase
            .from('panel_playlist_diagnostic_tasks')
            .insert({
              diagnostic_id: diagnostic.id,
              playlist_id: playlist.id,
              device_id: device.id,
              status: 'waiting_device',
              requested_checks: ['head', 'auth', 'playback'],
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            });
          if (taskError) throw new Error(`Falha ao criar a tarefa do aparelho: ${taskError.message}`);
        }

        return json({
          ok: true,
          diagnostic: serializeDiagnostic(updated as DiagnosticRow, playlist.name),
          deviceRequested: waitingForDevice,
        });
      } catch (error) {
        const message = safeText(error instanceof Error ? error.message : error, 300) || 'Falha inesperada no diagnóstico.';
        await supabase
          .from('panel_playlist_diagnostics')
          .update({
            status: 'failed',
            classification: 'INCONCLUSIVE',
            strategy: 'retry',
            summary: message,
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq('id', diagnostic.id);
        throw new Error(message);
      }
    }

    if (action === 'get') {
      const diagnosticId = requiredText(body.diagnosticId, 'ID do diagnóstico');
      const { data: row, error } = await supabase
        .from('panel_playlist_diagnostics')
        .select('*')
        .eq('id', diagnosticId)
        .maybeSingle();
      if (error) throw new Error(`Falha ao consultar o diagnóstico: ${error.message}`);
      if (!row) return json({ error: 'Diagnóstico não encontrado.' }, 404);
      const playlist = await assertPlaylistAccess(supabase, principal, row.playlist_id);
      return json({ diagnostic: serializeDiagnostic(row as DiagnosticRow, playlist.name) });
    }

    if (action === 'list') {
      const playlistId = String(body.playlistId || '').trim();
      if (playlistId) await assertPlaylistAccess(supabase, principal, playlistId);
      const limitValue = Number(body.limit || 20);
      const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(50, Math.floor(limitValue))) : 20;

      let query = supabase
        .from('panel_playlist_diagnostics')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (playlistId) query = query.eq('playlist_id', playlistId);
      if (principal.role === 'seller') query = query.eq('requested_by_seller_id', principal.sellerId);

      const { data: rows, error } = await query;
      if (error) throw new Error(`Falha ao listar diagnósticos: ${error.message}`);
      const playlistIds = [...new Set((rows ?? []).map((row: any) => row.playlist_id).filter(Boolean))];
      const names = new Map<string, string>();
      if (playlistIds.length) {
        const { data: playlists } = await supabase.from('panel_playlists').select('id, name').in('id', playlistIds);
        for (const item of playlists ?? []) names.set(item.id, item.name);
      }

      return json({
        diagnostics: (rows ?? []).map((row: any) => serializeDiagnostic(row as DiagnosticRow, names.get(row.playlist_id) || null)),
      });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('playlist-diagnostics falhou.', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json({ error: safeText(error instanceof Error ? error.message : error, 300) || 'Falha no diagnóstico.' }, 500);
  }
});
