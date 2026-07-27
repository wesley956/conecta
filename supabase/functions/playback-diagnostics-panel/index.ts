import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
  type PanelPrincipal,
} from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedStatuses = new Set(['open', 'investigating', 'resolved', 'ignored']);
const allowedSeverities = new Set(['low', 'medium', 'high', 'critical']);
const allowedSources = new Set(['content', 'network', 'playlist', 'app', 'device', 'unknown']);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function text(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value: unknown) {
  return text(value, 500)
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    content: 'Conteúdo com problema',
    network: 'Conexão instável',
    playlist: 'Lista indisponível',
    app: 'Falha do aplicativo',
    device: 'Aparelho ou decodificador',
    unknown: 'Falha de carregamento',
  };
  return labels[source] || labels.unknown;
}

function simpleMessage(row: any) {
  if (row.recovered) return 'A reprodução apresentou instabilidade, mas foi recuperada automaticamente.';
  if (row.player_exited) return 'A reprodução foi interrompida e voltou para a tela anterior.';
  if (row.backup_available) return 'A reprodução falhou e o sistema tentou usar a lista reserva.';
  return 'A reprodução apresentou uma falha e precisa ser verificada.';
}

function contentLabel(row: any) {
  const title = text(row.content_title, 180) || 'Conteúdo não identificado';
  if (row.content_type === 'episode') {
    const season = numberValue(row.season_number, 0);
    const episode = numberValue(row.episode_number, 0);
    const suffix = [season > 0 ? `T${season}` : '', episode > 0 ? `E${episode}` : '']
      .filter(Boolean)
      .join(' ');
    return suffix ? `${title} · ${suffix}` : title;
  }
  return title;
}

function groupTop(rows: any[], key: (row: any) => string, limit = 8) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const label = key(row);
    if (!label || label === '—') continue;
    grouped.set(label, (grouped.get(label) || 0) + 1);
  }
  return [...grouped.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'pt-BR'))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function summary(rows: any[]) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = rows.filter(row => new Date(row.occurred_at).getTime() >= dayAgo);
  return {
    last24Hours: recent.length,
    affectedDevices: new Set(recent.map(row => row.device_id).filter(Boolean)).size,
    affectedContents: new Set(
      recent
        .map(row => text(row.content_title, 180))
        .filter(value => value && !value.toLocaleLowerCase('pt-BR').includes('não identificado')),
    ).size,
    affectedPlaylists: new Set(recent.map(row => row.playlist_id).filter(Boolean)).size,
    recovered: recent.filter(row => row.recovered === true).length,
    playerExited: recent.filter(row => row.player_exited === true).length,
    withoutBackup: recent.filter(row => row.backup_available !== true).length,
    open: rows.filter(row => row.status === 'open' || row.status === 'investigating').length,
  };
}

function matchesFilters(row: any, body: Record<string, unknown>) {
  const search = normalize(body.search);
  const severity = text(body.severity, 30);
  const probableSource = text(body.probableSource, 30);
  const status = text(body.status, 30);
  const platform = normalize(body.platform);
  const sellerId = text(body.sellerId, 80);
  const playlistId = text(body.playlistId, 80);
  const dateFrom = text(body.dateFrom, 40);
  const dateTo = text(body.dateTo, 40);

  if (search) {
    const haystack = normalize([
      row.device_code_snapshot,
      row.client_name_snapshot,
      row.seller_name_snapshot,
      row.playlist_name_snapshot,
      row.content_title,
      row.error_code,
      row.error_message,
      row.platform,
      row.app_version,
    ].join(' '));
    if (!haystack.includes(search)) return false;
  }
  if (severity && row.severity !== severity) return false;
  if (probableSource && row.probable_source !== probableSource) return false;
  if (status && row.status !== status) return false;
  if (platform && !normalize(row.platform).includes(platform)) return false;
  if (sellerId && row.seller_id !== sellerId) return false;
  if (playlistId && row.playlist_id !== playlistId) return false;

  const occurredAt = new Date(row.occurred_at).getTime();
  if (dateFrom) {
    const start = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
    if (Number.isFinite(start) && occurredAt < start) return false;
  }
  if (dateTo) {
    const end = new Date(`${dateTo}T23:59:59.999Z`).getTime();
    if (Number.isFinite(end) && occurredAt > end) return false;
  }

  return true;
}

function adminRecord(row: any) {
  return {
    id: row.id,
    deviceId: row.device_id,
    sellerId: row.seller_id,
    playlistId: row.playlist_id,
    deviceCode: row.device_code_snapshot,
    clientName: row.client_name_snapshot,
    sellerName: row.seller_name_snapshot,
    playlistName: row.playlist_name_snapshot,
    platform: row.platform,
    appVersion: row.app_version,
    contentType: row.content_type,
    contentTitle: row.content_title,
    contentLabel: contentLabel(row),
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    positionMs: row.position_ms,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    severity: row.severity,
    probableSource: row.probable_source,
    probableSourceLabel: sourceLabel(row.probable_source),
    recoveryAction: row.recovery_action,
    recovered: row.recovered,
    playerExited: row.player_exited,
    backupAvailable: row.backup_available,
    retryCount: row.retry_count,
    status: row.status,
    adminNotes: row.admin_notes,
    sellerAcknowledgedAt: row.seller_acknowledged_at,
    occurredAt: row.occurred_at,
    resolvedAt: row.resolved_at,
    source: row.source,
  };
}

function sellerRecord(row: any) {
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceCode: row.device_code_snapshot,
    clientName: row.client_name_snapshot,
    platform: row.platform,
    contentType: row.content_type,
    contentLabel: contentLabel(row),
    category: sourceLabel(row.probable_source),
    message: simpleMessage(row),
    recovered: row.recovered,
    playerExited: row.player_exited,
    backupAvailable: row.backup_available,
    status: row.status,
    acknowledgedAt: row.seller_acknowledged_at,
    occurredAt: row.occurred_at,
  };
}

async function loadRows(supabase: any, principal: PanelPrincipal) {
  let query = supabase
    .from('panel_playback_diagnostics')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(1000);

  if (principal.role === 'seller') {
    query = query.eq('seller_id', principal.sellerId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao consultar diagnósticos: ${error.message}`);
  return data ?? [];
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']);
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const action = text((body as Record<string, unknown>).action || 'list', 40);

    if (action === 'acknowledge') {
      const id = text((body as Record<string, unknown>).id, 80);
      if (!id) return json({ error: 'Diagnóstico não informado.' }, 400);

      let update = supabase
        .from('panel_playback_diagnostics')
        .update({ seller_acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (principal.role === 'seller') update = update.eq('seller_id', principal.sellerId);
      const { data, error } = await update.select('id').maybeSingle();
      if (error) throw new Error(`Falha ao confirmar diagnóstico: ${error.message}`);
      if (!data) return json({ error: 'Diagnóstico não encontrado.' }, 404);
      return json({ ok: true, id });
    }

    if (action === 'updateStatus') {
      if (principal.role === 'seller') return json({ error: 'Ação restrita ao administrador.' }, 403);
      const id = text((body as Record<string, unknown>).id, 80);
      const status = text((body as Record<string, unknown>).status, 30);
      const notes = text((body as Record<string, unknown>).notes, 2000) || null;
      if (!id || !allowedStatuses.has(status)) return json({ error: 'Status inválido.' }, 400);

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('panel_playback_diagnostics')
        .update({
          status,
          admin_notes: notes,
          resolved_at: status === 'resolved' ? now : null,
          resolved_by: status === 'resolved' ? principal.userId : null,
          updated_at: now,
        })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(`Falha ao atualizar diagnóstico: ${error.message}`);
      if (!data) return json({ error: 'Diagnóstico não encontrado.' }, 404);
      return json({ ok: true, id, status });
    }

    if (action !== 'list') return json({ error: 'Ação inválida.' }, 400);

    const rows = await loadRows(supabase, principal);
    const filtered = rows.filter(row => matchesFilters(row, body as Record<string, unknown>));
    const page = Math.max(1, Math.trunc(numberValue((body as Record<string, unknown>).page, 1)));
    const pageSize = Math.min(100, Math.max(10, Math.trunc(numberValue((body as Record<string, unknown>).pageSize, 25))));
    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    if (principal.role === 'seller') {
      return json({
        audience: 'seller',
        summary: summary(filtered),
        records: pageRows.map(sellerRecord),
        pagination: {
          page,
          pageSize,
          total: filtered.length,
          pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
        },
      });
    }

    const sellerOptions = [...new Map(rows
      .filter(row => row.seller_id)
      .map(row => [row.seller_id, row.seller_name_snapshot || 'Vendedor']))]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name), 'pt-BR'));
    const playlistOptions = [...new Map(rows
      .filter(row => row.playlist_id)
      .map(row => [row.playlist_id, row.playlist_name_snapshot || 'Lista']))]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name), 'pt-BR'));

    return json({
      audience: 'admin',
      summary: summary(filtered),
      records: pageRows.map(adminRecord),
      topContents: groupTop(filtered, row => contentLabel(row)),
      topDevices: groupTop(filtered, row => row.device_code_snapshot || '—'),
      topPlaylists: groupTop(filtered, row => row.playlist_name_snapshot || '—'),
      filters: { sellers: sellerOptions, playlists: playlistOptions },
      pagination: {
        page,
        pageSize,
        total: filtered.length,
        pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
    });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('playback-diagnostics-panel:', error);
    return json({ error: error instanceof Error ? error.message : 'Erro interno.' }, 500);
  }
});
