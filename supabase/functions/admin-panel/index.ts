import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const ADMIN_PANEL_AUDIT_BUILD = '2026-06-22T03:42:21.651747Z';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type JsonBody = Record<string, unknown>;

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

async function readBody(req: Request): Promise<JsonBody> {
  if (req.method !== 'POST') return {};

  try {
    return await req.json();
  } catch {
    return {};
  }
}

function textOrNull(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function requiredText(value: unknown, label: string) {
  const text = textOrNull(value);
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? '').trim();

  if (['pending', 'active', 'blocked', 'expired', 'inactive'].includes(status)) {
    return status;
  }

  return 'pending';
}

function normalizePlaylistType(value: unknown) {
  const type = String(value ?? 'm3u').trim().toLowerCase();

  if (['m3u', 'xtream', 'stalker'].includes(type)) {
    return type;
  }

  return 'm3u';
}

function normalizeWhatsapp(value: unknown) {
  return String(value ?? '')
    .replace(/[^\d+]/g, '')
    .trim();
}


function normalizeSellerStatus(value: unknown) {
  const status = String(value ?? 'active').trim();

  if (['active', 'blocked', 'inactive'].includes(status)) {
    return status;
  }

  return 'active';
}

function normalizePlanStatus(value: unknown) {
  const status = String(value ?? 'active').trim();

  if (['active', 'inactive'].includes(status)) {
    return status;
  }

  return 'active';
}

function intOrDefault(value: unknown, fallback: number, min = 0) {
  const num = Number(value);

  if (!Number.isFinite(num)) return fallback;

  return Math.max(min, Math.floor(num));
}


function createSellerAccessToken() {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
}

async function triggerPlaylistCache(playlistId: string) {
  const adminToken = Deno.env.get('ADMIN_PANEL_TOKEN') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';

  if (!adminToken || !supabaseUrl) {
    return { ok: false, skipped: true, error: 'Geração automática de cache não configurada.' };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/playlist-cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({ action: 'refresh', playlistId }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { ok: false, error: data.error || data.message || `Falha HTTP ${response.status} ao gerar cache.` };
  }

  return data;
}

async function setDeviceBackupPlaylist(
  supabase: any,
  deviceId: string,
  primaryPlaylistId: string | null,
  backupPlaylistId: string | null,
) {
  if (primaryPlaylistId && backupPlaylistId && primaryPlaylistId === backupPlaylistId) {
    throw new Error('A lista reserva precisa ser diferente da lista principal.');
  }

  const { error: clearError } = await supabase
    .from('panel_device_playlists')
    .delete()
    .eq('device_id', deviceId)
    .eq('priority', 2);
  if (clearError) throw new Error(`Falha ao atualizar a lista reserva: ${clearError.message}`);

  if (!backupPlaylistId) return;

  const { data: backup, error: playlistError } = await supabase
    .from('panel_playlists')
    .select('id, active')
    .eq('id', backupPlaylistId)
    .maybeSingle();
  if (playlistError || !backup) throw new Error(`Lista reserva não encontrada: ${playlistError?.message || 'não encontrada'}`);
  if (!backup.active) throw new Error('A lista reserva está inativa.');

  const { error: insertError } = await supabase
    .from('panel_device_playlists')
    .insert({
      device_id: deviceId,
      playlist_id: backupPlaylistId,
      priority: 2,
      active: true,
      consecutive_failures: 0,
      cooldown_until: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    });
  if (insertError) throw new Error(`Falha ao vincular a lista reserva: ${insertError.message}`);
}


function timestampOrZero(value: unknown) {
  if (!value) return 0;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function getActivePlanForCharge(supabase: any, planId: string | null) {
  if (!planId) {
    throw new Error('Escolha um plano para cobrar créditos.');
  }

  const { data: plan, error } = await supabase
    .from('panel_plans')
    .select('id, name, credit_cost, status')
    .eq('id', planId)
    .single();

  if (error) {
    throw new Error(`Plano não encontrado: ${error.message}`);
  }

  if (plan.status !== 'active') {
    throw new Error('Plano inativo. Escolha um plano ativo.');
  }

  return {
    id: plan.id,
    name: plan.name,
    creditCost: Math.max(1, Number(plan.credit_cost || 1)),
  };
}

async function applyAdminDeviceSubscription(
  supabase: any,
  payload: {
    sellerId: string;
    deviceId: string;
    deviceCode?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    planId: string;
    planName?: string | null;
    playlistId: string;
    expiresAt: string;
    type: 'activation' | 'renewal';
    idempotencyKey: string;
  },
) {
  const { data, error } = await supabase.rpc('apply_device_subscription_transaction', {
    p_seller_id: payload.sellerId,
    p_device_id: payload.deviceId,
    p_plan_id: payload.planId,
    p_playlist_id: payload.playlistId,
    p_expires_at: payload.expiresAt,
    p_operation_type: payload.type,
    p_performed_by: 'admin',
    p_idempotency_key: payload.idempotencyKey,
    p_customer_id: payload.customerId || null,
    p_client_name: payload.customerName || null,
    p_enforce_seller_ownership: false,
  });

  if (error) {
    throw new Error(`Falha na operação comercial: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('A operação comercial não retornou resultado.');

  const balanceBefore = Number(result.balance_before ?? result.balanceBefore ?? 0);
  const balanceAfter = Number(result.balance_after ?? result.balanceAfter ?? balanceBefore);

  return {
    sellerId: payload.sellerId,
    amount: balanceAfter - balanceBefore,
    balanceBefore,
    balanceAfter,
    type: payload.type,
    applied: result.applied !== false,
    ledgerId: result.ledger_id ?? result.ledgerId ?? null,
    description:
      `${payload.type === 'activation' ? 'Ativação' : 'Renovação'} do aparelho ` +
      `${payload.deviceCode || payload.deviceId}${payload.planName ? ` — plano ${payload.planName}` : ''}`,
  };
}



async function writeAudit(
  supabase: any,
  payload: {
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase
    .from('panel_audit_logs')
    .insert({
      action: payload.action,
      entity_type: payload.entityType ?? null,
      entity_id: payload.entityId ?? null,
      description: payload.description ?? null,
      metadata: payload.metadata ?? {},
    });
  if (error) {
    throw new Error(`Falha ao registrar auditoria: ${error.message}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    await requirePanelPrincipal(req, supabase, ['owner', 'admin']);

    const url = new URL(req.url);
    const body = await readBody(req);
    const action = String(body.action || url.searchParams.get('action') || '').trim();



    if (action === 'listCommercialData') {
      const { data: sellers, error: sellersError } = await supabase
        .from('panel_sellers')
        .select('id, name, whatsapp, email, status, credit_balance, can_go_negative, access_token, created_at, updated_at, public_code')
        .order('created_at', { ascending: false });

      if (sellersError) return json({ error: sellersError.message }, 500);

      const { data: plans, error: plansError } = await supabase
        .from('panel_plans')
        .select('id, name, duration_days, credit_cost, max_devices, status, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (plansError) return json({ error: plansError.message }, 500);

      const { data: ledger, error: ledgerError } = await supabase
        .from('panel_credit_ledger')
        .select(`
          id,
          seller_id,
          amount,
          type,
          reference_id,
          description,
          balance_after,
          seller_name_snapshot,
          performed_by,
          created_at,
          seller:panel_sellers (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (ledgerError) return json({ error: ledgerError.message }, 500);

      return json({
        sellers: (sellers ?? []).map((seller: any) => ({
          id: seller.id,
          name: seller.name,
          whatsapp: seller.whatsapp,
          email: seller.email,
          status: seller.status,
          creditBalance: seller.credit_balance,
          canGoNegative: seller.can_go_negative,
          accessToken: seller.access_token || null,
          publicCode: seller.public_code || null,
          createdAt: seller.created_at,
          updatedAt: seller.updated_at,
        })),
        plans: (plans ?? []).map((plan: any) => ({
          id: plan.id,
          name: plan.name,
          durationDays: plan.duration_days,
          creditCost: plan.credit_cost,
          maxDevices: plan.max_devices,
          status: plan.status,
          createdAt: plan.created_at,
          updatedAt: plan.updated_at,
        })),
        creditLedger: (ledger ?? []).map((entry: any) => ({
          id: entry.id,
          sellerId: entry.seller_id,
          sellerName: entry.seller?.name || entry.seller_name_snapshot || 'Vendedor excluído',
          amount: entry.amount,
          type: entry.type,
          referenceId: entry.reference_id,
          description: entry.description,
          balanceAfter: entry.balance_after,
          performedBy: entry.performed_by,
          createdAt: entry.created_at,
        })),
      });
    }

    if (action === 'createSeller') {
      const name = requiredText(body.name, 'Nome do vendedor');
      const whatsapp = normalizeWhatsapp(body.whatsapp);
      const email = textOrNull(body.email);
      const accessToken = textOrNull(body.accessToken) || createSellerAccessToken();
      const publicCode = textOrNull(body.publicCode);
      const initialCredits = intOrDefault(body.initialCredits, 0, 0);

      if (!whatsapp) {
        return json({ error: 'WhatsApp do vendedor é obrigatório.' }, 400);
      }

      const { data, error } = await supabase
        .from('panel_sellers')
        .insert({
          name,
          whatsapp,
          email,
          status: normalizeSellerStatus(body.status),
          credit_balance: initialCredits,
          can_go_negative: body.canGoNegative === true,
          access_token: accessToken,
          public_code: publicCode,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) return json({ error: error.message }, 500);

      if (initialCredits > 0) {
        await supabase.from('panel_credit_ledger').insert({
          seller_id: data.id,
          amount: initialCredits,
          type: 'manual_add',
          description: 'Créditos iniciais do vendedor',
          balance_after: initialCredits,
          performed_by: 'admin',
        });
      }

      await writeAudit(supabase, {
        action: 'seller.created',
        entityType: 'seller',
        entityId: data?.id ?? null,
        description: `Vendedor criado: ${name}`,
        metadata: { name, whatsapp, email, initialCredits },
      });

      return json({ ok: true, id: data?.id });
    }

    if (action === 'updateSeller') {
      const id = requiredText(body.id, 'ID do vendedor');

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ('name' in body) updates.name = requiredText(body.name, 'Nome do vendedor');
      if ('whatsapp' in body) {
        const whatsapp = normalizeWhatsapp(body.whatsapp);
        if (!whatsapp) return json({ error: 'WhatsApp do vendedor é obrigatório.' }, 400);
        updates.whatsapp = whatsapp;
      }
      if ('email' in body) updates.email = textOrNull(body.email);
      if ('accessToken' in body) {
        const accessToken = textOrNull(body.accessToken);
        if (!accessToken) return json({ error: 'Token do vendedor é obrigatório.' }, 400);
        updates.access_token = accessToken;
      }
      if ('publicCode' in body) {
        const publicCode = textOrNull(body.publicCode);
        if (!publicCode) return json({ error: 'Código público do vendedor é obrigatório.' }, 400);
        updates.public_code = publicCode;
      }
      if ('status' in body) updates.status = normalizeSellerStatus(body.status);
      if ('canGoNegative' in body) updates.can_go_negative = body.canGoNegative === true;

      const { error } = await supabase
        .from('panel_sellers')
        .update(updates)
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      await writeAudit(supabase, {
        action: 'seller.updated',
        entityType: 'seller',
        entityId: id,
        description: 'Vendedor atualizado',
        metadata: { updates },
      });

      return json({ ok: true });
    }

    if (action === 'refreshPlaylistCache') {
      const id = requiredText(body.id || body.playlistId, 'ID da lista');
      const { error: stateError } = await supabase
        .from('panel_playlists')
        .update({ playlist_cache_status: 'processing', playlist_cache_error: null })
        .eq('id', id)
        .eq('active', true);
      if (stateError) return json({ error: stateError.message }, 500);

      const cache = await triggerPlaylistCache(id);
      return json({
        ok: cache.ok === true,
        cache,
        message: cache.ok ? 'Cache atualizado com sucesso.' : (cache.error || 'Não foi possível gerar o cache.'),
      }, cache.ok ? 200 : 502);
    }

    if (action === 'addSellerCredits') {
      const sellerId = requiredText(body.sellerId, 'ID do vendedor');
      const amount = intOrDefault(body.amount, 0, 1);
      const description = textOrNull(body.description) || 'Crédito adicionado manualmente';

      const { data: seller, error: sellerError } = await supabase
        .from('panel_sellers')
        .select('id, name, credit_balance, public_code')
        .eq('id', sellerId)
        .single();

      if (sellerError) return json({ error: sellerError.message }, 500);

      const balanceAfter = Number(seller.credit_balance || 0) + amount;

      const { error: updateError } = await supabase
        .from('panel_sellers')
        .update({
          credit_balance: balanceAfter,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sellerId);

      if (updateError) return json({ error: updateError.message }, 500);

      const { error: ledgerError } = await supabase
        .from('panel_credit_ledger')
        .insert({
          seller_id: sellerId,
          amount,
          type: 'manual_add',
          description,
          balance_after: balanceAfter,
          performed_by: 'admin',
        });

      if (ledgerError) return json({ error: ledgerError.message }, 500);

      await writeAudit(supabase, {
        action: 'credit.added',
        entityType: 'seller',
        entityId: sellerId,
        description: `${amount} crédito(s) adicionados para ${seller.name}`,
        metadata: { amount, balanceAfter, description },
      });

      return json({ ok: true, balanceAfter });
    }

    if (action === 'createPlan') {
      const name = requiredText(body.name, 'Nome do plano');
      const durationDays = intOrDefault(body.durationDays, 30, 1);
      const creditCost = intOrDefault(body.creditCost, 1, 1);
      const maxDevices = intOrDefault(body.maxDevices, 1, 1);

      const { data, error } = await supabase
        .from('panel_plans')
        .insert({
          name,
          duration_days: durationDays,
          credit_cost: creditCost,
          max_devices: maxDevices,
          status: normalizePlanStatus(body.status),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) return json({ error: error.message }, 500);

      await writeAudit(supabase, {
        action: 'plan.created',
        entityType: 'plan',
        entityId: data?.id ?? null,
        description: `Plano criado: ${name}`,
        metadata: { name, durationDays, creditCost, maxDevices },
      });

      return json({ ok: true, id: data?.id });
    }

    if (action === 'updatePlan') {
      const id = requiredText(body.id, 'ID do plano');

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ('name' in body) updates.name = requiredText(body.name, 'Nome do plano');
      if ('durationDays' in body) updates.duration_days = intOrDefault(body.durationDays, 30, 1);
      if ('creditCost' in body) updates.credit_cost = intOrDefault(body.creditCost, 1, 1);
      if ('maxDevices' in body) updates.max_devices = intOrDefault(body.maxDevices, 1, 1);
      if ('status' in body) updates.status = normalizePlanStatus(body.status);

      const { error } = await supabase
        .from('panel_plans')
        .update(updates)
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      await writeAudit(supabase, {
        action: 'plan.updated',
        entityType: 'plan',
        entityId: id,
        description: 'Plano atualizado',
        metadata: { updates },
      });

      return json({ ok: true });
    }

    if (action === 'listAuditLogs') {
      const rawLimit = Number(body.limit ?? 100);
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(200, Math.floor(rawLimit)))
        : 100;

      const { data, error } = await supabase
        .from('panel_audit_logs')
        .select('id, action, entity_type, entity_id, description, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return json({ error: error.message }, 500);

      return json({
        logs: (data ?? []).map((log: any) => ({
          id: log.id,
          action: log.action,
          entityType: log.entity_type,
          entityId: log.entity_id,
          description: log.description,
          metadata: log.metadata ?? {},
          createdAt: log.created_at,
        })),
      });
    }

    if (action === 'auditPing') {
      await writeAudit(supabase, {
        action: 'audit.ping',
        entityType: 'system',
        entityId: null,
        description: 'Teste manual de auditoria',
        metadata: { source: 'manual-test' },
      });

      return json({ ok: true });
    }

    if (action === 'listCustomers') {
      const { data: customers, error } = await supabase
        .from('panel_customers')
        .select(`
          id,
          name,
          whatsapp,
          status,
          seller_id,
          created_at,
          updated_at,
          seller:panel_sellers (
            id,
            name,
            status,
            credit_balance
          )
        `)
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);

      const { data: devices, error: devicesError } = await supabase
        .from('panel_devices')
        .select('id, customer_id');

      if (devicesError) return json({ error: devicesError.message }, 500);

      const counts = new Map<string, number>();
      for (const device of devices ?? []) {
        if (!device.customer_id) continue;
        counts.set(device.customer_id, (counts.get(device.customer_id) ?? 0) + 1);
      }

      return json({
        customers: (customers ?? []).map((customer: any) => ({
          id: customer.id,
          name: customer.name,
          whatsapp: customer.whatsapp,
          status: customer.status || 'active',
          sellerId: customer.seller_id || null,
          sellerName: customer.seller?.name || null,
          sellerStatus: customer.seller?.status || null,
          sellerCreditBalance: customer.seller?.credit_balance ?? null,
          createdAt: customer.created_at,
          updatedAt: customer.updated_at,
          devicesCount: counts.get(customer.id) ?? 0,
        })),
      });
    }

    if (action === 'createCustomer') {
      const name = requiredText(body.name, 'Nome do cliente');
      const whatsapp = normalizeWhatsapp(body.whatsapp);

      if (!whatsapp) {
        return json({ error: 'WhatsApp é obrigatório.' }, 400);
      }

      const { data, error } = await supabase
        .from('panel_customers')
        .insert({
          name,
          whatsapp,
          status: normalizeSellerStatus(body.status),
          seller_id: textOrNull(body.sellerId),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) return json({ error: error.message }, 500);

      await writeAudit(supabase, {
        action: 'customer.created',
        entityType: 'customer',
        entityId: data?.id ?? null,
        description: `Cliente criado: ${name}`,
        metadata: { name, whatsapp },
      });

      return json({ ok: true, id: data?.id });
    }

    if (action === 'updateCustomer') {
      const id = requiredText(body.id, 'ID do cliente');

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ('name' in body) updates.name = requiredText(body.name, 'Nome do cliente');
      if ('whatsapp' in body) {
        const whatsapp = normalizeWhatsapp(body.whatsapp);
        if (!whatsapp) return json({ error: 'WhatsApp é obrigatório.' }, 400);
        updates.whatsapp = whatsapp;
      }
      if ('status' in body) updates.status = normalizeSellerStatus(body.status);
      if ('sellerId' in body) updates.seller_id = textOrNull(body.sellerId);

      const { error } = await supabase
        .from('panel_customers')
        .update(updates)
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      await writeAudit(supabase, {
        action: 'customer.updated',
        entityType: 'customer',
        entityId: id,
        description: 'Cliente atualizado',
        metadata: { updates },
      });

      return json({ ok: true });
    }

    if (action === 'deleteCustomer') {
      const id = requiredText(body.id, 'ID do cliente');

      await supabase
        .from('panel_devices')
        .update({ customer_id: null, updated_at: new Date().toISOString() })
        .eq('customer_id', id);

      const { error } = await supabase
        .from('panel_customers')
        .delete()
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      await writeAudit(supabase, {
        action: 'customer.deleted',
        entityType: 'customer',
        entityId: id,
        description: 'Cliente excluído',
        metadata: {},
      });

      return json({ ok: true });
    }

    if (action === 'listDevices') {
      const { data, error } = await supabase
        .from('panel_devices')
        .select(`
          id,
          device_code,
          device_uuid,
          client_name,
          customer_id,
          seller_id,
          plan_id,
          status,
          playlist_id,
          subscription_expires_at,
          last_seen_at,
          created_at,
          updated_at,
          device_type,
          app_version,
          last_ip,
          customer:panel_customers (
            id,
            name,
            whatsapp
          ),
          seller:panel_sellers (
            id,
            name,
            status,
            credit_balance
          ),
          plan:panel_plans (
            id,
            name,
            duration_days,
            credit_cost,
            status
          ),
          playlist:panel_playlists (
            id,
            name,
            playlist_url,
            playlist_type,
            active,
            playlist_updated_at
          ),
          device_playlists:panel_device_playlists (
            priority,
            active,
            consecutive_failures,
            last_success_at,
            last_failure_at,
            cooldown_until,
            last_error,
            playlist:panel_playlists (
              id,
              name,
              active,
              playlist_cache_status,
              playlist_cache_updated_at,
              playlist_cache_error
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);

      return json({
        devices: (data ?? []).map((device: any) => {
          const assignments = (device.device_playlists ?? [])
            .filter((assignment: any) => assignment.active !== false && assignment.playlist)
            .sort((left: any, right: any) => Number(left.priority) - Number(right.priority));
          const primary = assignments.find((assignment: any) => Number(assignment.priority) === 1);
          const backup = assignments.find((assignment: any) => Number(assignment.priority) === 2);

          return ({
          id: device.id,
          deviceCode: device.device_code,
          deviceUuid: device.device_uuid,
          clientName: device.client_name,
          customerId: device.customer_id,
          customerName: device.customer?.name || null,
          customerWhatsapp: device.customer?.whatsapp || null,
          sellerId: device.seller_id || null,
          sellerName: device.seller?.name || null,
          sellerCreditBalance: device.seller?.credit_balance ?? null,
          planId: device.plan_id || null,
          planName: device.plan?.name || null,
          planDurationDays: device.plan?.duration_days ?? null,
          planCreditCost: device.plan?.credit_cost ?? null,
          status: device.status,
          playlistId: primary?.playlist?.id || device.playlist_id,
          backupPlaylistId: backup?.playlist?.id || null,
          expiresAt: device.subscription_expires_at,
          lastSeenAt: device.last_seen_at,
          createdAt: device.created_at,
          updatedAt: device.updated_at,
          deviceType: device.device_type || 'androidtv',
          appVersion: device.app_version || '',
          ip: device.last_ip || '',
          playlistName: primary?.playlist?.name || device.playlist?.name || null,
          playlistCacheStatus: primary?.playlist?.playlist_cache_status || null,
          backupPlaylistName: backup?.playlist?.name || null,
          backupPlaylistCacheStatus: backup?.playlist?.playlist_cache_status || null,
          backupPlaylistCooldownUntil: backup?.cooldown_until || null,
          backupPlaylistLastError: backup?.last_error || null,
        });
        }),
      });
    }

    if (action === 'listPlaylists') {
      const { data: playlists, error } = await supabase
        .from('panel_playlists')
        .select(`
          id,
          name,
          playlist_url,
          playlist_type,
          active,
          playlist_updated_at,
          playlist_cache_status,
          playlist_cache_updated_at,
          playlist_cache_item_count,
          playlist_cache_size_bytes,
          playlist_cache_error,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);

      const { data: assignments, error: devicesError } = await supabase
        .from('panel_device_playlists')
        .select('device_id, playlist_id')
        .eq('active', true);

      if (devicesError) return json({ error: devicesError.message }, 500);

      const counts = new Map<string, number>();
      for (const assignment of assignments ?? []) {
        if (!assignment.playlist_id) continue;
        counts.set(assignment.playlist_id, (counts.get(assignment.playlist_id) ?? 0) + 1);
      }

      return json({
        playlists: (playlists ?? []).map((playlist: any) => ({
          id: playlist.id,
          name: playlist.name,
          playlistUrl: playlist.playlist_url,
          playlistType: playlist.playlist_type,
          active: playlist.active,
          playlistUpdatedAt: playlist.playlist_updated_at,
          cacheStatus: playlist.playlist_cache_status || 'missing',
          cacheUpdatedAt: playlist.playlist_cache_updated_at,
          cacheItemCount: playlist.playlist_cache_item_count || 0,
          cacheSizeBytes: playlist.playlist_cache_size_bytes || 0,
          cacheError: playlist.playlist_cache_error || null,
          createdAt: playlist.created_at,
          devicesCount: counts.get(playlist.id) ?? 0,
        })),
      });
    }

    if (action === 'updateDevice') {
      const id = requiredText(body.id, 'ID do aparelho');

      const { data: currentDevice, error: currentError } = await supabase
        .from('panel_devices')
        .select(`
          id,
          device_code,
          client_name,
          customer_id,
          status,
          seller_id,
          plan_id,
          playlist_id,
          subscription_expires_at,
          device_playlists:panel_device_playlists (
            playlist_id,
            priority,
            active
          ),
          customer:panel_customers (
            id,
            name
          )
        `)
        .eq('id', id)
        .single();

      if (currentError || !currentDevice) {
        return json({ error: currentError?.message || 'Aparelho não encontrado.' }, 404);
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ('status' in body) updates.status = normalizeStatus(body.status);
      if ('clientName' in body) updates.client_name = textOrNull(body.clientName);
      if ('customerId' in body) updates.customer_id = textOrNull(body.customerId);
      if ('sellerId' in body) updates.seller_id = textOrNull(body.sellerId);
      if ('planId' in body) updates.plan_id = textOrNull(body.planId);
      if ('playlistId' in body) updates.playlist_id = textOrNull(body.playlistId);
      if ('expiresAt' in body) updates.subscription_expires_at = textOrNull(body.expiresAt);

      const previousStatus = String(currentDevice.status || 'pending');
      const nextStatus = 'status' in body ? String(updates.status) : previousStatus;
      const nextSellerId = 'sellerId' in body ? textOrNull(body.sellerId) : (currentDevice.seller_id || null);
      const nextPlanId = 'planId' in body ? textOrNull(body.planId) : (currentDevice.plan_id || null);
      const nextPlaylistId = 'playlistId' in body ? textOrNull(body.playlistId) : (currentDevice.playlist_id || null);
      const currentBackup = (currentDevice.device_playlists ?? []).find(
        (assignment: any) => Number(assignment.priority) === 2 && assignment.active !== false,
      );
      const nextBackupPlaylistId = 'backupPlaylistId' in body
        ? textOrNull(body.backupPlaylistId)
        : (currentBackup?.playlist_id || null);
      const nextCustomerId = 'customerId' in body ? textOrNull(body.customerId) : (currentDevice.customer_id || null);
      const previousExpiresAt = currentDevice.subscription_expires_at || null;
      const nextExpiresAt = 'expiresAt' in body ? textOrNull(body.expiresAt) : previousExpiresAt;
      const requestedOperation = textOrNull(body.operationType);

      if (requestedOperation && !['activation', 'renewal'].includes(requestedOperation)) {
        return json({ error: 'Tipo de operação comercial inválido.' }, 400);
      }

      if (nextPlaylistId && nextBackupPlaylistId && nextPlaylistId === nextBackupPlaylistId) {
        return json({ error: 'A lista reserva precisa ser diferente da lista principal.' }, 400);
      }

      if (nextBackupPlaylistId) {
        const { data: backupPlaylist, error: backupError } = await supabase
          .from('panel_playlists')
          .select('id, active')
          .eq('id', nextBackupPlaylistId)
          .maybeSingle();
        if (backupError || !backupPlaylist) {
          return json({ error: `Lista reserva não encontrada: ${backupError?.message || 'não encontrada'}` }, 400);
        }
        if (!backupPlaylist.active) return json({ error: 'A lista reserva está inativa.' }, 400);
      }

      if (
        previousStatus === 'active' &&
        nextStatus === 'active' &&
        'expiresAt' in body &&
        timestampOrZero(nextExpiresAt) < timestampOrZero(previousExpiresAt)
      ) {
        return json({ error: 'A validade de um aparelho ativo não pode ser reduzida.' }, 400);
      }

      const inferredActivation = previousStatus !== 'active' && nextStatus === 'active';
      const inferredRenewal =
        previousStatus === 'active' &&
        nextStatus === 'active' &&
        'expiresAt' in body &&
        timestampOrZero(nextExpiresAt) > timestampOrZero(previousExpiresAt);
      const operationType = requestedOperation || (inferredActivation ? 'activation' : (inferredRenewal ? 'renewal' : null));
      const currentCustomer = Array.isArray(currentDevice.customer)
        ? currentDevice.customer[0] ?? null
        : currentDevice.customer;
      const nextClientName = 'clientName' in body
        ? textOrNull(body.clientName)
        : (currentDevice.client_name || currentCustomer?.name || null);

      let creditConsumption = null;

      if (operationType) {
        if (nextStatus !== 'active') {
          return json({ error: 'Ativação e renovação exigem status ativo.' }, 400);
        }

        if (!nextSellerId) return json({ error: 'Escolha um vendedor para consumir crédito.' }, 400);
        if (!nextPlanId) return json({ error: 'Escolha um plano para consumir crédito.' }, 400);
        if (!nextPlaylistId) return json({ error: 'Escolha uma lista para ativar ou renovar.' }, 400);
        if (!nextExpiresAt) return json({ error: 'Informe a validade da assinatura.' }, 400);

        const idempotencyKey = requiredText(body.idempotencyKey, 'Chave de idempotência');
        const plan = await getActivePlanForCharge(supabase, nextPlanId);

        creditConsumption = await applyAdminDeviceSubscription(supabase, {
          sellerId: nextSellerId,
          deviceId: id,
          deviceCode: currentDevice.device_code,
          customerId: nextCustomerId,
          customerName: nextClientName,
          planId: plan.id,
          planName: plan.name,
          playlistId: nextPlaylistId,
          expiresAt: nextExpiresAt,
          type: operationType as 'activation' | 'renewal',
          idempotencyKey,
        });
      } else {
        const { error } = await supabase
          .from('panel_devices')
          .update(updates)
          .eq('id', id);

        if (error) return json({ error: error.message }, 500);
      }

      if ('backupPlaylistId' in body || 'playlistId' in body) {
        await setDeviceBackupPlaylist(supabase, id, nextPlaylistId, nextBackupPlaylistId);
      }

      const auditAction = operationType === 'activation'
        ? 'device.activated'
        : (operationType === 'renewal' ? 'device.renewed' : 'device.updated');
      const auditDescription = operationType === 'activation'
        ? 'Aparelho ativado com consumo atômico de crédito'
        : (operationType === 'renewal'
          ? 'Aparelho renovado com consumo atômico de crédito'
          : 'Aparelho atualizado');

      await writeAudit(supabase, {
        action: auditAction,
        entityType: 'device',
        entityId: id,
        description: auditDescription,
        metadata: { updates, backupPlaylistId: nextBackupPlaylistId, operationType, creditConsumption },
      });

      return json({
        ok: true,
        operationType,
        creditConsumption,
        message: creditConsumption?.applied === false
          ? 'Esta operação comercial já havia sido processada.'
          : undefined,
      });
    }

    if (action === 'deleteDevice') {
      const id = requiredText(body.id, 'ID do aparelho');

      const { error } = await supabase
        .from('panel_devices')
        .delete()
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      await writeAudit(supabase, {
        action: 'device.deleted',
        entityType: 'device',
        entityId: id,
        description: 'Aparelho excluído',
        metadata: {},
      });

      return json({ ok: true });
    }

    if (action === 'createPlaylist') {
      const name = requiredText(body.name, 'Nome da lista');
      const playlistUrl = requiredText(body.playlistUrl, 'URL da lista');
      const playlistType = normalizePlaylistType(body.playlistType);

      const { data, error } = await supabase
        .from('panel_playlists')
        .insert({
          name,
          playlist_url: playlistUrl,
          playlist_type: playlistType,
          active: body.active !== false,
          playlist_updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) return json({ error: error.message }, 500);

      const cache = body.active === false
        ? { ok: false, skipped: true, error: 'Lista inativa.' }
        : await triggerPlaylistCache(data.id);

      await writeAudit(supabase, {
        action: 'playlist.created',
        entityType: 'playlist',
        entityId: data?.id ?? null,
        description: `Lista criada: ${name}`,
        metadata: { name, playlistUrl, playlistType },
      });

      return json({
        ok: true,
        id: data?.id,
        cache,
        message: cache.ok
          ? 'Lista criada e cache gerado.'
          : `Lista criada, mas o cache ainda não ficou pronto. ${cache.error || ''}`.trim(),
      });
    }

    if (action === 'updatePlaylist') {
      const id = requiredText(body.id, 'ID da lista');

      const updates: Record<string, unknown> = {
        playlist_updated_at: new Date().toISOString(),
      };

      if ('name' in body) updates.name = requiredText(body.name, 'Nome da lista');
      if ('playlistUrl' in body) updates.playlist_url = requiredText(body.playlistUrl, 'URL da lista');
      if ('playlistType' in body) updates.playlist_type = normalizePlaylistType(body.playlistType);
      if ('active' in body) updates.active = body.active !== false;

      const { error } = await supabase
        .from('panel_playlists')
        .update(updates)
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      const cache = updates.active === false
        ? { ok: false, skipped: true, error: 'Lista inativa.' }
        : await triggerPlaylistCache(id);

      await writeAudit(supabase, {
        action: 'playlist.updated',
        entityType: 'playlist',
        entityId: id,
        description: 'Lista atualizada',
        metadata: { updates },
      });

      return json({
        ok: true,
        cache,
        message: cache.ok
          ? 'Lista atualizada e cache renovado.'
          : `Lista atualizada, mas o cache ainda não ficou pronto. ${cache.error || ''}`.trim(),
      });
    }

    if (action === 'deletePlaylist') {
      const id = requiredText(body.id, 'ID da lista');

      const { data: primaryAssignments, error: assignmentError } = await supabase
        .from('panel_device_playlists')
        .select('device_id')
        .eq('playlist_id', id)
        .eq('priority', 1);
      if (assignmentError) return json({ error: assignmentError.message }, 500);

      for (const assignment of primaryAssignments ?? []) {
        const { data: backup } = await supabase
          .from('panel_device_playlists')
          .select('playlist_id')
          .eq('device_id', assignment.device_id)
          .eq('priority', 2)
          .eq('active', true)
          .maybeSingle();

        const { error: promoteError } = await supabase
          .from('panel_devices')
          .update({
            playlist_id: backup?.playlist_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', assignment.device_id);
        if (promoteError) return json({ error: promoteError.message }, 500);
      }

      const { error } = await supabase
        .from('panel_playlists')
        .delete()
        .eq('id', id);

      if (error) return json({ error: error.message }, 500);

      await writeAudit(supabase, {
        action: 'playlist.deleted',
        entityType: 'playlist',
        entityId: id,
        description: 'Lista excluída',
        metadata: {},
      });

      return json({ ok: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) {
      return panelAuthErrorResponse(error, corsHeaders);
    }

    return json({
      error: error instanceof Error ? error.message : 'Erro inesperado no painel.',
    }, 500);
  }
});
