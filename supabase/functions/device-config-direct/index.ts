import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { safeDiagnosticText } from '../_shared/diagnosticSafety.ts';
import {
  combineServerAndDeviceDiagnostics,
  normalizeDeviceDiagnosticChecks,
  type ProgressiveDiagnosticClassification,
  type ProgressiveDiagnosticResult,
  type ProgressiveDiagnosticStep,
  type ProgressiveDiagnosticStrategy,
} from '../_shared/progressivePlaylistDiagnostic.ts';

const DIRECT_MARKER = '#roneca-direct-m3u';
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

function text(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

function safeSteps(value: unknown): ProgressiveDiagnosticStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object')
    .slice(0, 24)
    .map(item => item as ProgressiveDiagnosticStep)
    .filter(item => Number(item.step) >= 5 && Number(item.step) <= 14);
}

function validClassification(value: unknown): ProgressiveDiagnosticClassification {
  const allowed: ProgressiveDiagnosticClassification[] = [
    'SERVER_COMPATIBLE', 'DEVICE_ONLY', 'HYBRID', 'INVALID_CREDENTIALS',
    'SERVER_UNAVAILABLE', 'DATACENTER_BLOCKED', 'IP_SESSION_BOUND', 'RATE_LIMITED',
    'NONSTANDARD_XTREAM', 'M3U_OK_API_FAIL', 'API_OK_M3U_FAIL',
    'CERTIFICATE_INVALID', 'RESPONSE_INVALID', 'INCONCLUSIVE',
  ];
  const normalized = String(value || 'INCONCLUSIVE') as ProgressiveDiagnosticClassification;
  return allowed.includes(normalized) ? normalized : 'INCONCLUSIVE';
}

function validStrategy(value: unknown): ProgressiveDiagnosticStrategy {
  const allowed: ProgressiveDiagnosticStrategy[] = ['server_cache', 'direct', 'hybrid', 'retry', 'blocked'];
  const normalized = String(value || 'retry') as ProgressiveDiagnosticStrategy;
  return allowed.includes(normalized) ? normalized : 'retry';
}

function finalSystemSteps(result: ProgressiveDiagnosticResult): ProgressiveDiagnosticStep[] {
  return [
    {
      step: 12,
      key: 'comparison',
      origin: 'system',
      status: 'ok',
      httpStatus: null,
      latencyMs: null,
      code: result.classification === 'DEVICE_ONLY' ? 'DEVICE_CONFIRMED' : 'COMPARISON_COMPLETE',
      count: null,
      detail: 'Comparação entre servidor e Android concluída.',
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

async function acceptDiagnosticResult(
  supabase: any,
  deviceId: string,
  submission: unknown,
) {
  if (!submission || typeof submission !== 'object') return;
  const raw = submission as Record<string, unknown>;
  const taskId = text(raw.taskId);
  if (!taskId) return;

  const checks = normalizeDeviceDiagnosticChecks(raw.checks);
  if (!checks.length) return;
  const nowIso = new Date().toISOString();

  const { data: task, error: taskError } = await supabase
    .from('panel_playlist_diagnostic_tasks')
    .select('id, diagnostic_id, playlist_id, status, expires_at')
    .eq('id', taskId)
    .eq('device_id', deviceId)
    .in('status', ['waiting_device', 'claimed'])
    .maybeSingle();
  if (taskError || !task) return;

  if (new Date(task.expires_at).getTime() <= Date.now()) {
    await supabase
      .from('panel_playlist_diagnostic_tasks')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('id', task.id);
    await supabase
      .from('panel_playlist_diagnostics')
      .update({ status: 'expired', updated_at: nowIso, completed_at: nowIso })
      .eq('id', task.diagnostic_id)
      .eq('status', 'waiting_device');
    return;
  }

  const { data: diagnostic, error: diagnosticError } = await supabase
    .from('panel_playlist_diagnostics')
    .select('id, status, classification, strategy, summary, server_steps')
    .eq('id', task.diagnostic_id)
    .eq('playlist_id', task.playlist_id)
    .maybeSingle();
  if (diagnosticError || !diagnostic || diagnostic.status !== 'waiting_device') return;

  const baseSteps = safeSteps(diagnostic.server_steps).filter(item => Number(item.step) < 12);
  const server: ProgressiveDiagnosticResult = {
    classification: validClassification(diagnostic.classification),
    strategy: validStrategy(diagnostic.strategy),
    summary: safeDiagnosticText(diagnostic.summary, 300) || 'Diagnóstico do servidor sem resumo.',
    needsDevice: true,
    steps: baseSteps,
  };
  const combined = combineServerAndDeviceDiagnostics(server, checks);
  const deviceSteps = combined.steps.filter(item => item.origin === 'device');
  const serverSteps = [...baseSteps, ...finalSystemSteps(combined)];

  const { error: completeTaskError } = await supabase
    .from('panel_playlist_diagnostic_tasks')
    .update({
      status: 'completed',
      result: checks,
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', task.id)
    .eq('device_id', deviceId);
  if (completeTaskError) return;

  await supabase
    .from('panel_playlist_diagnostics')
    .update({
      status: 'completed',
      classification: combined.classification,
      strategy: combined.strategy,
      server_steps: serverSteps,
      device_steps: deviceSteps,
      comparison: combined.comparison,
      summary: safeDiagnosticText(combined.summary, 300),
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', diagnostic.id)
    .eq('status', 'waiting_device');
}

async function nextDiagnosticTask(
  supabase: any,
  deviceId: string,
  sourceById: Map<string, { url: string; type: string }>,
) {
  const nowIso = new Date().toISOString();
  const { data: task, error } = await supabase
    .from('panel_playlist_diagnostic_tasks')
    .select('id, diagnostic_id, playlist_id, status, requested_checks, expires_at')
    .eq('device_id', deviceId)
    .in('status', ['waiting_device', 'claimed'])
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !task) return null;

  const source = sourceById.get(String(task.playlist_id));
  if (!source) {
    await supabase
      .from('panel_playlist_diagnostic_tasks')
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('id', task.id)
      .eq('device_id', deviceId);
    return null;
  }

  if (task.status === 'waiting_device') {
    const { data: claimed } = await supabase
      .from('panel_playlist_diagnostic_tasks')
      .update({ status: 'claimed', claimed_at: nowIso, updated_at: nowIso })
      .eq('id', task.id)
      .eq('device_id', deviceId)
      .eq('status', 'waiting_device')
      .select('id')
      .maybeSingle();
    if (!claimed) return null;
  }

  return {
    id: String(task.id),
    diagnosticId: String(task.diagnostic_id),
    playlistId: String(task.playlist_id),
    playlistType: source.type,
    sourceUrl: source.url,
    checks: Array.isArray(task.requested_checks)
      ? task.requested_checks.filter((item: unknown) => ['head', 'auth', 'playback'].includes(String(item))).slice(0, 3)
      : ['head', 'auth', 'playback'],
    expiresAt: task.expires_at,
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ active: false, message: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceRoleKey) return json({ active: false, message: 'Servidor não configurado.' }, 500);

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 64 * 1024) {
      return json({ active: false, message: 'Payload muito grande.' }, 413);
    }
    let requestPayload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(rawBody || '{}');
      if (parsed && typeof parsed === 'object') requestPayload = parsed as Record<string, unknown>;
    } catch {
      return json({ active: false, status: 'pending', message: 'Payload inválido.' }, 400);
    }

    const upstreamHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const deviceCredential = request.headers.get('x-device-credential');
    const authorization = request.headers.get('authorization');
    const apikey = request.headers.get('apikey');
    if (deviceCredential) upstreamHeaders['x-device-credential'] = deviceCredential;
    if (authorization) upstreamHeaders.authorization = authorization;
    if (apikey) upstreamHeaders.apikey = apikey;

    const upstream = await fetch(`${supabaseUrl}/functions/v1/device-config`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: rawBody || '{}',
    });

    const upstreamText = await upstream.text();
    let payload: any;
    try {
      payload = JSON.parse(upstreamText || '{}');
    } catch {
      return json({ active: false, status: 'pending', message: 'Resposta inválida do servidor.' }, 502);
    }

    if (!upstream.ok || payload?.active !== true || payload?.status !== 'active') {
      return json(payload, upstream.status);
    }

    const deviceCode = text(payload.deviceCode);
    if (!deviceCode) return json(payload, upstream.status);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: device, error } = await supabase
      .from('panel_devices')
      .select(`
        id,
        playlist:panel_playlists(id, playlist_url, playlist_type, active),
        device_playlists:panel_device_playlists(
          playlist_id,
          priority,
          active,
          playlist:panel_playlists(id, playlist_url, playlist_type, active)
        )
      `)
      .eq('device_code', deviceCode)
      .maybeSingle();

    if (error || !device) return json(payload, upstream.status);

    const sourceById = new Map<string, { url: string; type: string }>();
    const legacy = Array.isArray(device.playlist) ? device.playlist[0] : device.playlist;
    if (legacy?.id && legacy?.active !== false && text(legacy.playlist_url)) {
      sourceById.set(String(legacy.id), {
        url: String(legacy.playlist_url),
        type: text(legacy.playlist_type) || 'm3u',
      });
    }

    for (const assignment of device.device_playlists ?? []) {
      if (assignment?.active === false) continue;
      const playlist = Array.isArray(assignment?.playlist) ? assignment.playlist[0] : assignment?.playlist;
      if (!playlist?.id || playlist?.active === false || !text(playlist.playlist_url)) continue;
      sourceById.set(String(playlist.id), {
        url: String(playlist.playlist_url),
        type: text(playlist.playlist_type) || 'm3u',
      });
    }

    await acceptDiagnosticResult(
      supabase,
      String(device.id),
      requestPayload.playlistDiagnosticResult,
    );

    const playlists = Array.isArray(payload.playlists)
      ? payload.playlists.map((item: any) => {
          const id = text(item?.id);
          const source = id ? sourceById.get(id) : null;
          const cacheReady = item?.cacheReady === true || Boolean(item?.cacheParts?.channelsUrl || item?.cacheSnapshotUrl);
          if (!source || cacheReady || item?.accessMode !== 'direct') return item;

          const markedUrl = `${source.url}${DIRECT_MARKER}`;
          return {
            ...item,
            type: source.type,
            cacheParts: {
              manifestUrl: null,
              channelsUrl: markedUrl,
              moviesUrl: markedUrl,
              seriesUrl: markedUrl,
            },
            cacheReady: true,
            directFallback: true,
          };
        })
      : [];

    const selectedId = text(payload.selectedPlaylistId);
    const selected = selectedId ? playlists.find((item: any) => String(item?.id) === selectedId) : null;
    const usingDirectFallback = playlists.some((item: any) => Boolean(item?.directFallback));
    const playlistDiagnosticTask = await nextDiagnosticTask(supabase, String(device.id), sourceById);

    return json({
      ...payload,
      playlists,
      cacheParts: selected?.cacheParts || payload.cacheParts || null,
      directPlaylistFallbackAllowed: usingDirectFallback,
      playlistDiagnosticTask,
      message: usingDirectFallback
        ? 'Cache indisponível neste provedor. O aplicativo usará a conexão direta do aparelho.'
        : payload.message,
    }, upstream.status);
  } catch (error) {
    return json({
      active: false,
      status: 'pending',
      message: safeDiagnosticText(
        error instanceof Error ? error.message : 'Falha temporária ao carregar a configuração.',
        500,
      ) || 'Falha temporária ao carregar a configuração.',
    }, 500);
  }
});
