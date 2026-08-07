import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = Record<string, unknown>;

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

function requiredText(value: unknown, label: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} é obrigatório.`);
  return normalized;
}

function optionalText(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

async function readBody(request: Request): Promise<Body> {
  if (request.method !== 'POST') return {};
  return await request.json().catch(() => ({} as Body));
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Servidor não configurado.' }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin']);
    const body = await readBody(request);
    const action = String(body.action || '').trim();

    if (action === 'listIntegrity') {
      const { data: pending, error: pendingError } = await supabase
        .from('panel_active_devices_without_playlist')
        .select('id, device_code, client_name, customer_id, seller_id, plan_id, subscription_expires_at, updated_at')
        .order('subscription_expires_at', { ascending: true });
      if (pendingError) throw new Error(`Falha ao consultar aparelhos sem lista: ${pendingError.message}`);

      const rows = pending ?? [];
      const sellerIds = [...new Set(rows.map(row => row.seller_id).filter(Boolean))];
      const customerIds = [...new Set(rows.map(row => row.customer_id).filter(Boolean))];
      const planIds = [...new Set(rows.map(row => row.plan_id).filter(Boolean))];

      const [sellerResult, customerResult, planResult] = await Promise.all([
        sellerIds.length
          ? supabase.from('panel_sellers').select('id, name').in('id', sellerIds)
          : Promise.resolve({ data: [], error: null }),
        customerIds.length
          ? supabase.from('panel_customers').select('id, name, whatsapp').in('id', customerIds)
          : Promise.resolve({ data: [], error: null }),
        planIds.length
          ? supabase.from('panel_plans').select('id, name').in('id', planIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (sellerResult.error || customerResult.error || planResult.error) {
        throw new Error('Falha ao completar os dados das pendências.');
      }

      const sellers = new Map((sellerResult.data ?? []).map(item => [item.id, item]));
      const customers = new Map((customerResult.data ?? []).map(item => [item.id, item]));
      const plans = new Map((planResult.data ?? []).map(item => [item.id, item]));

      return json({
        ok: true,
        activeWithoutPlaylist: rows.map(row => ({
          id: row.id,
          deviceCode: row.device_code,
          clientName: row.client_name,
          customerId: row.customer_id,
          customerName: customers.get(row.customer_id)?.name || null,
          customerWhatsapp: customers.get(row.customer_id)?.whatsapp || null,
          sellerId: row.seller_id,
          sellerName: sellers.get(row.seller_id)?.name || null,
          planId: row.plan_id,
          planName: plans.get(row.plan_id)?.name || null,
          expiresAt: row.subscription_expires_at,
          updatedAt: row.updated_at,
        })),
      });
    }

    if (action === 'inspectPlaylistArchive') {
      const playlistId = requiredText(body.playlistId, 'ID da lista');
      const { data, error } = await supabase.rpc('inspect_playlist_archive', {
        p_playlist_id: playlistId,
      });
      if (error) throw new Error(error.message);
      return json({ ok: true, impact: data });
    }

    if (action === 'archivePlaylist') {
      const playlistId = requiredText(body.playlistId, 'ID da lista');
      const confirmed = body.confirmed === true;
      const { data, error } = await supabase.rpc('archive_playlist_safe_transaction', {
        p_playlist_id: playlistId,
        p_confirm: confirmed,
      });
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] : data;

      if (result?.requires_confirmation) {
        return json({ ok: false, requiresConfirmation: true, result }, 409);
      }

      const { error: auditError } = await supabase.from('panel_audit_logs').insert({
        action: 'playlist.archived_safely',
        entity_type: 'playlist',
        entity_id: playlistId,
        description: 'Lista arquivada com verificação de impacto',
        performed_by: `${principal.role}:${principal.userId}`,
        metadata: {
          primaryDevicesPromoted: Number(result?.primary_devices_promoted || 0),
          reserveAssignmentsRemoved: Number(result?.reserve_assignments_removed || 0),
          sellerLinksDisabled: Number(result?.seller_links_disabled || 0),
          validationSessionsRevoked: Number(result?.validation_sessions_revoked || 0),
        },
      });
      if (auditError) throw new Error(`Lista arquivada, mas a auditoria falhou: ${auditError.message}`);

      return json({ ok: true, result });
    }

    if (action === 'repairDevicePlaylists') {
      const deviceId = requiredText(body.deviceId, 'ID do aparelho');
      const primaryPlaylistId = requiredText(body.primaryPlaylistId, 'Lista principal');
      const backupPlaylistId = optionalText(body.backupPlaylistId);

      const { data, error } = await supabase.rpc('set_device_playlists_transaction', {
        p_device_id: deviceId,
        p_primary_playlist_id: primaryPlaylistId,
        p_backup_playlist_id: backupPlaylistId,
        p_seller_id: null,
        p_enforce_seller_ownership: false,
      });
      if (error) throw new Error(error.message);

      const { error: auditError } = await supabase.from('panel_audit_logs').insert({
        action: 'device.playlist_integrity_repaired',
        entity_type: 'device',
        entity_id: deviceId,
        description: 'Vínculos de listas corrigidos sem renovar ou consumir crédito',
        performed_by: `${principal.role}:${principal.userId}`,
        metadata: {
          primaryPlaylistId,
          backupPlaylistId,
          creditConsumed: false,
          validityChanged: false,
        },
      });
      if (auditError) throw new Error(`Listas corrigidas, mas a auditoria falhou: ${auditError.message}`);

      return json({ ok: true, result: Array.isArray(data) ? data[0] : data });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    return json({ error: error instanceof Error ? error.message : 'Falha inesperada de integridade.' }, 500);
  }
});
