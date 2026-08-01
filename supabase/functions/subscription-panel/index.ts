import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  PanelPrincipal,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';

type JsonBody = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://wesley956.github.io',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];

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
  const selectedOrigin = origin && allowed.has(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': selectedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
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

async function readBody(request: Request): Promise<JsonBody> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 64 * 1024) throw new Error('Requisição excede o limite permitido.');
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as JsonBody : {};
  } catch {
    return {};
  }
}

function textOrNull(value: unknown, maxLength = 500) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error('Texto excede o tamanho permitido.');
  return text;
}

function requiredText(value: unknown, label: string, maxLength = 500) {
  const text = textOrNull(value, maxLength);
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
}

function uuidOrNull(value: unknown) {
  const text = textOrNull(value, 80);
  if (!text) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error('Identificador inválido.');
  }
  return text;
}

function requiredUuid(value: unknown, label: string) {
  const id = uuidOrNull(value);
  if (!id) throw new Error(`${label} é obrigatório.`);
  return id;
}

function integerInRange(value: unknown, label: string, minimum: number, maximum: number) {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < minimum || numberValue > maximum) {
    throw new Error(`${label} deve estar entre ${minimum} e ${maximum}.`);
  }
  return numberValue;
}

function bigintOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
    throw new Error('Valor financeiro inválido.');
  }
  return numberValue;
}

function normalizeDate(value: unknown, label: string) {
  const text = textOrNull(value, 10);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`${label} inválida.`);
  }
  return text;
}

function normalizeTimestamp(value: unknown, label: string) {
  const text = textOrNull(value, 80);
  if (!text) return null;
  const timestamp = new Date(text);
  if (Number.isNaN(timestamp.getTime())) throw new Error(`${label} inválida.`);
  return timestamp.toISOString();
}

function operationKey(value: unknown, prefix: string) {
  const key = requiredText(value, 'Chave de idempotência', 200);
  return key.startsWith(`${prefix}:`) ? key : `${prefix}:${key}`;
}

function principalSeller(principal: PanelPrincipal, requestedSellerId: string | null) {
  if (principal.role === 'seller') {
    if (requestedSellerId && requestedSellerId !== principal.sellerId) {
      throw new PanelAuthError('Vendedor não pode operar outra carteira.', 403);
    }
    return principal.sellerId;
  }
  return requestedSellerId;
}

function requireOwner(principal: PanelPrincipal) {
  if (principal.role !== 'owner') {
    throw new PanelAuthError('Ferramenta disponível somente para o proprietário.', 403);
  }
}

function safeHost(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return null;
  }
}

function cleanDatabaseError(error: any, fallback: string) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const knownMessages = [
    'Plano atingiu o limite de aparelhos',
    'lista já pertence',
    'Lista principal',
    'Lista reserva',
    'saldo insuficiente',
    'Saldo insuficiente',
    'Aparelho já pertence',
    'Cliente não pertence',
    'assinatura',
    'Assinatura',
    'conexões simultâneas',
    'Chave de idempotência',
  ];
  const safe = knownMessages.find(fragment => message.includes(fragment));
  if (safe || ['22023', '23505', 'P0001', 'P0002'].includes(code)) {
    return message.replace(/^.*?:\s*/, '').slice(0, 300) || fallback;
  }
  console.error(fallback, { code: error?.code || null });
  return fallback;
}

async function expireLabSessions(supabase: any) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('panel_lab_sessions')
    .update({ status: 'expired', updated_at: now })
    .eq('status', 'active')
    .lte('expires_at', now);
  if (error) console.error('Falha ao expirar sessões de laboratório.', { code: error.code || null });
}

function subscriptionSelect() {
  return `
    id,
    customer_id,
    seller_id,
    plan_id,
    scheduled_plan_id,
    status,
    starts_at,
    expires_at,
    plan_name_snapshot,
    duration_days_snapshot,
    max_devices_snapshot,
    simultaneous_connections_snapshot,
    credit_cost_snapshot,
    created_at,
    updated_at,
    metadata,
    customer:panel_customers(id, name, whatsapp, seller_id, status),
    seller:panel_sellers(id, name, status, credit_balance),
    plan:panel_plans(id, name, duration_days, credit_cost, max_devices, simultaneous_connections, billing_cycle, status),
    scheduled_plan:panel_plans!panel_subscriptions_scheduled_plan_id_fkey(id, name, duration_days, credit_cost, max_devices, simultaneous_connections, billing_cycle, status),
    subscription_devices:panel_subscription_devices(
      id,
      device_id,
      status,
      assigned_at,
      revoked_at,
      reason,
      replaced_by_device_id,
      device:panel_devices(id, device_code, client_name, status, subscription_expires_at, last_seen_at, is_lab_device)
    ),
    subscription_playlists:panel_subscription_playlists(
      id,
      playlist_id,
      priority,
      active,
      assigned_at,
      archived_at,
      playlist:panel_playlists(
        id,
        name,
        playlist_url,
        playlist_type,
        active,
        max_connections,
        playlist_cache_status,
        playlist_cache_updated_at,
        playlist_cache_item_count,
        playlist_cache_size_bytes,
        playlist_cache_error
      )
    )
  `;
}

function mapPlaylistAssignment(assignment: any) {
  const playlist = Array.isArray(assignment.playlist) ? assignment.playlist[0] : assignment.playlist;
  return {
    id: assignment.id,
    playlistId: assignment.playlist_id,
    priority: Number(assignment.priority),
    active: assignment.active === true,
    assignedAt: assignment.assigned_at,
    archivedAt: assignment.archived_at || null,
    playlist: playlist ? {
      id: playlist.id,
      name: playlist.name,
      host: safeHost(playlist.playlist_url),
      type: playlist.playlist_type,
      active: playlist.active === true,
      maxConnections: Number(playlist.max_connections || 1),
      cacheStatus: playlist.playlist_cache_status || 'missing',
      cacheUpdatedAt: playlist.playlist_cache_updated_at || null,
      cacheItemCount: Number(playlist.playlist_cache_item_count || 0),
      cacheSizeBytes: Number(playlist.playlist_cache_size_bytes || 0),
      cacheError: playlist.playlist_cache_error ? String(playlist.playlist_cache_error).slice(0, 300) : null,
    } : null,
  };
}

function mapSubscription(record: any) {
  const customer = Array.isArray(record.customer) ? record.customer[0] : record.customer;
  const seller = Array.isArray(record.seller) ? record.seller[0] : record.seller;
  const plan = Array.isArray(record.plan) ? record.plan[0] : record.plan;
  const scheduledPlan = Array.isArray(record.scheduled_plan) ? record.scheduled_plan[0] : record.scheduled_plan;
  const devices = (record.subscription_devices || []).map((assignment: any) => {
    const device = Array.isArray(assignment.device) ? assignment.device[0] : assignment.device;
    return {
      id: assignment.id,
      deviceId: assignment.device_id,
      status: assignment.status,
      assignedAt: assignment.assigned_at,
      revokedAt: assignment.revoked_at || null,
      reason: assignment.reason || null,
      replacedByDeviceId: assignment.replaced_by_device_id || null,
      device: device ? {
        id: device.id,
        deviceCode: device.device_code,
        clientName: device.client_name || null,
        status: device.status,
        expiresAt: device.subscription_expires_at || null,
        lastSeenAt: device.last_seen_at || null,
        isLabDevice: device.is_lab_device === true,
      } : null,
    };
  });
  const activeDevices = devices.filter((assignment: any) => assignment.status === 'active');
  return {
    id: record.id,
    customerId: record.customer_id,
    sellerId: record.seller_id,
    planId: record.plan_id,
    scheduledPlanId: record.scheduled_plan_id || null,
    status: record.status,
    startsAt: record.starts_at,
    expiresAt: record.expires_at,
    planName: record.plan_name_snapshot,
    durationDays: Number(record.duration_days_snapshot),
    maxDevices: Number(record.max_devices_snapshot),
    simultaneousConnections: Number(record.simultaneous_connections_snapshot),
    creditCost: Number(record.credit_cost_snapshot),
    activeDeviceCount: activeDevices.length,
    availableDeviceSlots: Math.max(0, Number(record.max_devices_snapshot) - activeDevices.length),
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      whatsapp: customer.whatsapp,
      status: customer.status,
    } : null,
    seller: seller ? {
      id: seller.id,
      name: seller.name,
      status: seller.status,
      creditBalance: Number(seller.credit_balance || 0),
    } : null,
    plan: plan ? {
      id: plan.id,
      name: plan.name,
      durationDays: Number(plan.duration_days),
      creditCost: Number(plan.credit_cost),
      maxDevices: Number(plan.max_devices),
      simultaneousConnections: Number(plan.simultaneous_connections || 1),
      billingCycle: plan.billing_cycle,
      status: plan.status,
    } : null,
    scheduledPlan: scheduledPlan ? {
      id: scheduledPlan.id,
      name: scheduledPlan.name,
      durationDays: Number(scheduledPlan.duration_days),
      creditCost: Number(scheduledPlan.credit_cost),
      maxDevices: Number(scheduledPlan.max_devices),
      simultaneousConnections: Number(scheduledPlan.simultaneous_connections || 1),
      billingCycle: scheduledPlan.billing_cycle,
      status: scheduledPlan.status,
    } : null,
    devices,
    playlists: (record.subscription_playlists || []).map(mapPlaylistAssignment),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    metadata: record.metadata || {},
  };
}

async function listSubscriptions(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  let query = supabase
    .from('panel_subscriptions')
    .select(subscriptionSelect())
    .order('created_at', { ascending: false })
    .limit(Math.min(500, Math.max(1, Number(body.limit || 250))));

  if (principal.role === 'seller') {
    query = query.eq('seller_id', principal.sellerId);
  } else if (body.sellerId) {
    query = query.eq('seller_id', requiredUuid(body.sellerId, 'Vendedor'));
  }
  if (body.status) query = query.eq('status', requiredText(body.status, 'Status', 30));

  const { data, error } = await query;
  if (error) throw new Error(cleanDatabaseError(error, 'Falha ao carregar assinaturas.'));
  return (data || []).map(mapSubscription);
}

async function loadOptions(supabase: any, principal: PanelPrincipal) {
  let customerQuery = supabase
    .from('panel_customers')
    .select('id, name, whatsapp, seller_id, status')
    .eq('status', 'active')
    .order('name');
  let deviceQuery = supabase
    .from('panel_devices')
    .select('id, device_code, client_name, seller_id, customer_id, status, subscription_id, is_lab_device, last_seen_at')
    .order('created_at', { ascending: false });
  let playlistQuery = supabase
    .from('panel_playlists')
    .select('id, name, playlist_url, playlist_type, active, max_connections, playlist_cache_status, playlist_cache_updated_at')
    .eq('active', true)
    .order('name');

  if (principal.role === 'seller') {
    customerQuery = customerQuery.eq('seller_id', principal.sellerId);
    deviceQuery = deviceQuery.or(`seller_id.eq.${principal.sellerId},seller_id.is.null`);
    const { data: permissions, error: permissionError } = await supabase
      .from('panel_seller_playlists')
      .select('playlist_id')
      .eq('seller_id', principal.sellerId)
      .eq('active', true);
    if (permissionError) throw new Error('Falha ao carregar listas liberadas.');
    const ids = (permissions || []).map((permission: any) => permission.playlist_id);
    if (ids.length) playlistQuery = playlistQuery.in('id', ids);
    else playlistQuery = playlistQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
  }

  const [customersResult, devicesResult, playlistsResult, plansResult, sellersResult] = await Promise.all([
    customerQuery,
    deviceQuery,
    playlistQuery,
    supabase
      .from('panel_plans')
      .select('id, name, duration_days, credit_cost, max_devices, simultaneous_connections, billing_cycle, status')
      .eq('status', 'active')
      .order('duration_days')
      .order('max_devices'),
    principal.role === 'seller'
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('panel_sellers').select('id, name, status, credit_balance').eq('status', 'active').order('name'),
  ]);

  const error = customersResult.error || devicesResult.error || playlistsResult.error || plansResult.error || sellersResult.error;
  if (error) throw new Error('Falha ao carregar opções comerciais.');

  return {
    customers: customersResult.data || [],
    devices: (devicesResult.data || []).map((device: any) => ({
      id: device.id,
      deviceCode: device.device_code,
      clientName: device.client_name || null,
      sellerId: device.seller_id || null,
      customerId: device.customer_id || null,
      status: device.status,
      subscriptionId: device.subscription_id || null,
      isLabDevice: device.is_lab_device === true,
      lastSeenAt: device.last_seen_at || null,
    })),
    playlists: (playlistsResult.data || []).map((playlist: any) => ({
      id: playlist.id,
      name: playlist.name,
      host: safeHost(playlist.playlist_url),
      type: playlist.playlist_type,
      active: playlist.active === true,
      maxConnections: Number(playlist.max_connections || 1),
      cacheStatus: playlist.playlist_cache_status || 'missing',
      cacheUpdatedAt: playlist.playlist_cache_updated_at || null,
    })),
    plans: (plansResult.data || []).map((plan: any) => ({
      id: plan.id,
      name: plan.name,
      durationDays: Number(plan.duration_days),
      creditCost: Number(plan.credit_cost),
      maxDevices: Number(plan.max_devices),
      simultaneousConnections: Number(plan.simultaneous_connections || 1),
      billingCycle: plan.billing_cycle,
      status: plan.status,
    })),
    sellers: (sellersResult.data || []).map((seller: any) => ({
      id: seller.id,
      name: seller.name,
      status: seller.status,
      creditBalance: Number(seller.credit_balance || 0),
    })),
  };
}

async function listConflicts(supabase: any, principal: PanelPrincipal) {
  if (principal.role === 'seller') return [];
  const { data, error } = await supabase
    .from('panel_subscription_conflicts')
    .select(`
      id,
      subscription_id,
      device_id,
      playlist_id,
      conflict_type,
      details,
      status,
      resolved_at,
      created_at,
      device:panel_devices(id, device_code),
      playlist:panel_playlists(id, name, playlist_url)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new Error('Falha ao carregar conflitos de migração.');
  return (data || []).map((record: any) => {
    const device = Array.isArray(record.device) ? record.device[0] : record.device;
    const playlist = Array.isArray(record.playlist) ? record.playlist[0] : record.playlist;
    return {
      id: record.id,
      subscriptionId: record.subscription_id || null,
      deviceId: record.device_id || null,
      playlistId: record.playlist_id || null,
      type: record.conflict_type,
      status: record.status,
      details: record.details || {},
      createdAt: record.created_at,
      deviceCode: device?.device_code || null,
      playlistName: playlist?.name || null,
      playlistHost: safeHost(playlist?.playlist_url),
    };
  });
}

async function listLabSessions(supabase: any, principal: PanelPrincipal) {
  if (principal.role !== 'owner') return [];
  await expireLabSessions(supabase);
  const { data, error } = await supabase
    .from('panel_lab_sessions')
    .select(`
      id,
      source_subscription_id,
      source_device_id,
      lab_device_id,
      status,
      duration_minutes,
      reason,
      starts_at,
      expires_at,
      revoked_at,
      created_at,
      source_device:panel_devices!panel_lab_sessions_source_device_id_fkey(id, device_code, client_name),
      lab_device:panel_devices!panel_lab_sessions_lab_device_id_fkey(id, device_code, client_name, is_lab_device),
      subscription:panel_subscriptions(id, plan_name_snapshot, customer:panel_customers(id, name))
    `)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error('Falha ao carregar sessões de laboratório.');
  return (data || []).map((record: any) => {
    const sourceDevice = Array.isArray(record.source_device) ? record.source_device[0] : record.source_device;
    const labDevice = Array.isArray(record.lab_device) ? record.lab_device[0] : record.lab_device;
    const subscription = Array.isArray(record.subscription) ? record.subscription[0] : record.subscription;
    const customer = Array.isArray(subscription?.customer) ? subscription.customer[0] : subscription?.customer;
    return {
      id: record.id,
      sourceSubscriptionId: record.source_subscription_id,
      sourceDeviceId: record.source_device_id || null,
      labDeviceId: record.lab_device_id,
      status: record.status,
      durationMinutes: Number(record.duration_minutes),
      reason: record.reason,
      startsAt: record.starts_at,
      expiresAt: record.expires_at,
      revokedAt: record.revoked_at || null,
      createdAt: record.created_at,
      sourceDeviceCode: sourceDevice?.device_code || null,
      labDeviceCode: labDevice?.device_code || null,
      customerName: customer?.name || null,
      planName: subscription?.plan_name_snapshot || null,
    };
  });
}

async function bootstrap(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const [subscriptions, options, conflicts, labSessions] = await Promise.all([
    listSubscriptions(supabase, principal, body),
    loadOptions(supabase, principal),
    listConflicts(supabase, principal),
    listLabSessions(supabase, principal),
  ]);
  return {
    principal: {
      role: principal.role,
      sellerId: principal.sellerId,
      isOwner: principal.role === 'owner',
    },
    subscriptions,
    options,
    conflicts,
    labSessions,
  };
}

async function createSubscription(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const requestedSellerId = uuidOrNull(body.sellerId);
  const sellerId = principalSeller(principal, requestedSellerId);
  if (!sellerId) throw new Error('Vendedor é obrigatório.');
  const expiresAt = normalizeTimestamp(body.expiresAt, 'Validade');
  const financeAmount = bigintOrNull(body.financeAmountCents);
  const { data, error } = await supabase.rpc('create_customer_subscription_transaction', {
    p_seller_id: sellerId,
    p_customer_id: requiredUuid(body.customerId, 'Cliente'),
    p_plan_id: requiredUuid(body.planId, 'Plano'),
    p_device_id: requiredUuid(body.deviceId, 'Aparelho'),
    p_primary_playlist_id: requiredUuid(body.primaryPlaylistId, 'Lista principal'),
    p_backup_playlist_id: uuidOrNull(body.backupPlaylistId),
    p_performed_by: principal.email || principal.userId,
    p_idempotency_key: operationKey(body.idempotencyKey, 'subscription-create'),
    p_expires_at: expiresAt,
    p_finance_amount_cents: financeAmount,
    p_finance_status: financeAmount ? textOrNull(body.financeStatus, 30) || 'pending' : null,
    p_payment_method: financeAmount ? textOrNull(body.paymentMethod, 30) || 'pix' : null,
    p_due_date: financeAmount ? normalizeDate(body.dueDate, 'Vencimento') : null,
    p_paid_at: financeAmount ? normalizeTimestamp(body.paidAt, 'Data do pagamento') : null,
    p_finance_notes: financeAmount ? textOrNull(body.financeNotes, 1000) : null,
    p_finance_description: financeAmount ? textOrNull(body.financeDescription, 500) : null,
    p_created_by_user_id: principal.userId,
    p_created_by_role: principal.role,
  });
  if (error) throw new Error(cleanDatabaseError(error, 'Não foi possível criar a assinatura.'));
  return Array.isArray(data) ? data[0] : data;
}

async function addDevice(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const subscriptionId = requiredUuid(body.subscriptionId, 'Assinatura');
  await assertSubscriptionAccess(supabase, principal, subscriptionId);
  const { data, error } = await supabase.rpc('add_subscription_device_transaction', {
    p_subscription_id: subscriptionId,
    p_device_id: requiredUuid(body.deviceId, 'Aparelho'),
    p_performed_by: principal.email || principal.userId,
    p_idempotency_key: operationKey(body.idempotencyKey, 'subscription-add-device'),
  });
  if (error) throw new Error(cleanDatabaseError(error, 'Não foi possível adicionar o aparelho.'));
  return Array.isArray(data) ? data[0] : data;
}

async function replaceDevice(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const subscriptionId = requiredUuid(body.subscriptionId, 'Assinatura');
  await assertSubscriptionAccess(supabase, principal, subscriptionId);
  const { data, error } = await supabase.rpc('replace_subscription_device_transaction', {
    p_subscription_id: subscriptionId,
    p_old_device_id: requiredUuid(body.oldDeviceId, 'Aparelho antigo'),
    p_new_device_id: requiredUuid(body.newDeviceId, 'Aparelho novo'),
    p_reason: requiredText(body.reason, 'Motivo', 500),
    p_performed_by: principal.email || principal.userId,
    p_idempotency_key: operationKey(body.idempotencyKey, 'subscription-replace-device'),
  });
  if (error) throw new Error(cleanDatabaseError(error, 'Não foi possível substituir o aparelho.'));
  return Array.isArray(data) ? data[0] : data;
}

async function changePlan(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const subscriptionId = requiredUuid(body.subscriptionId, 'Assinatura');
  await assertSubscriptionAccess(supabase, principal, subscriptionId);
  const mode = requiredText(body.mode, 'Modo da alteração', 30);
  if (!['upgrade', 'schedule_downgrade'].includes(mode)) throw new Error('Modo da alteração inválido.');
  const { data, error } = await supabase.rpc('change_subscription_plan_transaction', {
    p_subscription_id: subscriptionId,
    p_new_plan_id: requiredUuid(body.planId, 'Novo plano'),
    p_mode: mode,
    p_performed_by: principal.email || principal.userId,
    p_idempotency_key: operationKey(body.idempotencyKey, 'subscription-change-plan'),
  });
  if (error) throw new Error(cleanDatabaseError(error, 'Não foi possível alterar o plano.'));
  return Array.isArray(data) ? data[0] : data;
}

async function renew(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  const subscriptionId = requiredUuid(body.subscriptionId, 'Assinatura');
  await assertSubscriptionAccess(supabase, principal, subscriptionId);
  const financeAmount = bigintOrNull(body.financeAmountCents);
  const { data, error } = await supabase.rpc('renew_customer_subscription_transaction', {
    p_subscription_id: subscriptionId,
    p_performed_by: principal.email || principal.userId,
    p_idempotency_key: operationKey(body.idempotencyKey, 'subscription-renew'),
    p_finance_amount_cents: financeAmount,
    p_finance_status: financeAmount ? textOrNull(body.financeStatus, 30) || 'pending' : null,
    p_payment_method: financeAmount ? textOrNull(body.paymentMethod, 30) || 'pix' : null,
    p_due_date: financeAmount ? normalizeDate(body.dueDate, 'Vencimento') : null,
    p_paid_at: financeAmount ? normalizeTimestamp(body.paidAt, 'Data do pagamento') : null,
    p_finance_notes: financeAmount ? textOrNull(body.financeNotes, 1000) : null,
    p_created_by_user_id: principal.userId,
    p_created_by_role: principal.role,
  });
  if (error) throw new Error(cleanDatabaseError(error, 'Não foi possível renovar a assinatura.'));
  return Array.isArray(data) ? data[0] : data;
}

async function assertSubscriptionAccess(supabase: any, principal: PanelPrincipal, subscriptionId: string) {
  const { data, error } = await supabase
    .from('panel_subscriptions')
    .select('id, seller_id')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (error || !data) throw new Error('Assinatura não encontrada.');
  if (principal.role === 'seller' && data.seller_id !== principal.sellerId) {
    throw new PanelAuthError('Vendedor não pode operar esta assinatura.', 403);
  }
  return data;
}

async function savePlan(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  if (principal.role === 'seller') throw new PanelAuthError('Vendedor não pode alterar planos.', 403);
  const maxDevices = integerInRange(body.maxDevices, 'Máximo de aparelhos', 1, 5);
  const simultaneousConnections = integerInRange(
    body.simultaneousConnections,
    'Conexões simultâneas',
    1,
    maxDevices,
  );
  const billingCycle = requiredText(body.billingCycle || 'custom', 'Ciclo', 30);
  if (!['monthly', 'quarterly', 'semiannual', 'annual', 'custom'].includes(billingCycle)) {
    throw new Error('Ciclo de cobrança inválido.');
  }
  const record = {
    name: requiredText(body.name, 'Nome do plano', 150),
    duration_days: integerInRange(body.durationDays, 'Duração', 1, 3660),
    credit_cost: integerInRange(body.creditCost, 'Custo em créditos', 1, 100000),
    max_devices: maxDevices,
    simultaneous_connections: simultaneousConnections,
    billing_cycle: billingCycle,
    status: textOrNull(body.status, 20) || 'active',
    updated_at: new Date().toISOString(),
  };
  const planId = uuidOrNull(body.planId);
  const result = planId
    ? await supabase.from('panel_plans').update(record).eq('id', planId).select('*').single()
    : await supabase.from('panel_plans').insert(record).select('*').single();
  if (result.error) throw new Error(cleanDatabaseError(result.error, 'Não foi possível salvar o plano.'));
  return result.data;
}

async function markLabDevice(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  requireOwner(principal);
  const deviceId = requiredUuid(body.deviceId, 'Aparelho');
  const enabled = body.enabled !== false;
  if (!enabled) {
    await supabase
      .from('panel_lab_sessions')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('lab_device_id', deviceId)
      .eq('status', 'active');
  }
  const { data, error } = await supabase
    .from('panel_devices')
    .update({ is_lab_device: enabled, updated_at: new Date().toISOString() })
    .eq('id', deviceId)
    .select('id, device_code, is_lab_device')
    .single();
  if (error) throw new Error('Não foi possível alterar o aparelho de laboratório.');
  return data;
}

async function createLabSession(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  requireOwner(principal);
  await expireLabSessions(supabase);
  const labDeviceId = requiredUuid(body.labDeviceId, 'Aparelho de laboratório');
  const sourceSubscriptionId = requiredUuid(body.sourceSubscriptionId, 'Assinatura de origem');
  const requestedSourceDeviceId = uuidOrNull(body.sourceDeviceId);
  const durationMinutes = integerInRange(body.durationMinutes, 'Duração', 1, 43200);
  const reason = requiredText(body.reason, 'Motivo', 500);

  const { data: labDevice, error: labError } = await supabase
    .from('panel_devices')
    .select('id, is_lab_device')
    .eq('id', labDeviceId)
    .maybeSingle();
  if (labError || !labDevice?.is_lab_device) {
    throw new Error('O destino precisa estar marcado como aparelho de laboratório.');
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('panel_subscriptions')
    .select('id, status, expires_at')
    .eq('id', sourceSubscriptionId)
    .maybeSingle();
  if (subscriptionError || !subscription) throw new Error('Assinatura de origem não encontrada.');
  if (subscription.status === 'cancelled') throw new Error('Assinatura cancelada não pode ser usada no laboratório.');

  let sourceDeviceId = requestedSourceDeviceId;
  if (sourceDeviceId) {
    const { data: sourceAssignment } = await supabase
      .from('panel_subscription_devices')
      .select('device_id')
      .eq('subscription_id', sourceSubscriptionId)
      .eq('device_id', sourceDeviceId)
      .maybeSingle();
    if (!sourceAssignment) throw new Error('Aparelho de origem não pertence à assinatura escolhida.');
  } else {
    const { data: sourceAssignment } = await supabase
      .from('panel_subscription_devices')
      .select('device_id')
      .eq('subscription_id', sourceSubscriptionId)
      .order('assigned_at')
      .limit(1)
      .maybeSingle();
    sourceDeviceId = sourceAssignment?.device_id || null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
  const { data, error } = await supabase
    .from('panel_lab_sessions')
    .insert({
      source_subscription_id: sourceSubscriptionId,
      source_device_id: sourceDeviceId,
      lab_device_id: labDeviceId,
      status: 'active',
      duration_minutes: durationMinutes,
      reason,
      starts_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      created_by_user_id: principal.userId,
    })
    .select('id, source_subscription_id, source_device_id, lab_device_id, status, duration_minutes, reason, starts_at, expires_at')
    .single();
  if (error) throw new Error(cleanDatabaseError(error, 'Não foi possível criar a sessão de laboratório.'));
  return data;
}

async function revokeLabSession(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  requireOwner(principal);
  const sessionId = requiredUuid(body.sessionId, 'Sessão');
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('panel_lab_sessions')
    .update({ status: 'revoked', revoked_at: now, updated_at: now })
    .eq('id', sessionId)
    .eq('status', 'active')
    .select('id, status, revoked_at')
    .maybeSingle();
  if (error) throw new Error('Não foi possível revogar a sessão.');
  return data || { id: sessionId, status: 'revoked' };
}

async function diagnoseCache(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  requireOwner(principal);
  const subscriptionId = requiredUuid(body.subscriptionId, 'Assinatura');
  const { data, error } = await supabase
    .from('panel_subscription_playlists')
    .select(`
      priority,
      active,
      playlist:panel_playlists(
        id,
        name,
        playlist_url,
        playlist_type,
        active,
        max_connections,
        playlist_updated_at,
        playlist_cache_status,
        playlist_cache_updated_at,
        playlist_cache_item_count,
        playlist_cache_size_bytes,
        playlist_cache_version,
        playlist_cache_manifest_sha256,
        playlist_cache_manifest_size_bytes,
        playlist_cache_error,
        playlist_cache_path,
        playlist_cache_manifest_path,
        playlist_cache_channels_path,
        playlist_cache_movies_path,
        playlist_cache_series_path
      )
    `)
    .eq('subscription_id', subscriptionId)
    .eq('active', true)
    .order('priority');
  if (error) throw new Error('Não foi possível diagnosticar o cache.');

  let assignments = data || [];
  if (!assignments.length && body.sourceDeviceId) {
    const { data: legacy, error: legacyError } = await supabase
      .from('panel_device_playlists')
      .select(`
        priority,
        active,
        playlist:panel_playlists(
          id,
          name,
          playlist_url,
          playlist_type,
          active,
          max_connections,
          playlist_updated_at,
          playlist_cache_status,
          playlist_cache_updated_at,
          playlist_cache_item_count,
          playlist_cache_size_bytes,
          playlist_cache_version,
          playlist_cache_manifest_sha256,
          playlist_cache_manifest_size_bytes,
          playlist_cache_error,
          playlist_cache_path,
          playlist_cache_manifest_path,
          playlist_cache_channels_path,
          playlist_cache_movies_path,
          playlist_cache_series_path
        )
      `)
      .eq('device_id', requiredUuid(body.sourceDeviceId, 'Aparelho de origem'))
      .eq('active', true)
      .order('priority');
    if (legacyError) throw new Error('Não foi possível diagnosticar o vínculo antigo.');
    assignments = legacy || [];
  }

  return assignments.map((assignment: any) => {
    const playlist = Array.isArray(assignment.playlist) ? assignment.playlist[0] : assignment.playlist;
    const partsPresent = [
      playlist?.playlist_cache_manifest_path,
      playlist?.playlist_cache_channels_path,
      playlist?.playlist_cache_movies_path,
      playlist?.playlist_cache_series_path,
    ].filter(Boolean).length;
    return {
      priority: Number(assignment.priority),
      playlistId: playlist?.id || null,
      name: playlist?.name || null,
      host: safeHost(playlist?.playlist_url),
      type: playlist?.playlist_type || null,
      active: playlist?.active === true,
      maxConnections: Number(playlist?.max_connections || 1),
      sourceUpdatedAt: playlist?.playlist_updated_at || null,
      cacheStatus: playlist?.playlist_cache_status || 'missing',
      cacheUpdatedAt: playlist?.playlist_cache_updated_at || null,
      cacheItemCount: Number(playlist?.playlist_cache_item_count || 0),
      cacheSizeBytes: Number(playlist?.playlist_cache_size_bytes || 0),
      cacheVersion: playlist?.playlist_cache_version || null,
      cacheManifestSha256: playlist?.playlist_cache_manifest_sha256 || null,
      cacheManifestSizeBytes: Number(playlist?.playlist_cache_manifest_size_bytes || 0),
      cacheError: playlist?.playlist_cache_error ? String(playlist.playlist_cache_error).slice(0, 300) : null,
      snapshotPresent: Boolean(playlist?.playlist_cache_path),
      partsPresent,
      healthy: playlist?.active === true && playlist?.playlist_cache_status === 'ready' &&
        (Boolean(playlist?.playlist_cache_path) || partsPresent >= 3),
    };
  });
}

async function resolveConflict(supabase: any, principal: PanelPrincipal, body: JsonBody) {
  if (principal.role === 'seller') throw new PanelAuthError('Vendedor não pode resolver conflitos globais.', 403);
  const conflictId = requiredUuid(body.conflictId, 'Conflito');
  const status = requiredText(body.status || 'resolved', 'Status', 20);
  if (!['resolved', 'ignored'].includes(status)) throw new Error('Status de resolução inválido.');
  const { data, error } = await supabase
    .from('panel_subscription_conflicts')
    .update({ status, resolved_at: new Date().toISOString(), resolved_by_user_id: principal.userId })
    .eq('id', conflictId)
    .eq('status', 'open')
    .select('id, status, resolved_at')
    .maybeSingle();
  if (error) throw new Error('Não foi possível resolver o conflito.');
  return data || { id: conflictId, status };
}

serve(async request => {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']);
    const body = await readBody(request);
    const action = requiredText(body.action || 'bootstrap', 'Ação', 80);

    let result: unknown;
    switch (action) {
      case 'bootstrap':
        result = await bootstrap(supabase, principal, body);
        break;
      case 'list':
        result = { subscriptions: await listSubscriptions(supabase, principal, body) };
        break;
      case 'create':
        result = await createSubscription(supabase, principal, body);
        break;
      case 'addDevice':
        result = await addDevice(supabase, principal, body);
        break;
      case 'replaceDevice':
        result = await replaceDevice(supabase, principal, body);
        break;
      case 'changePlan':
        result = await changePlan(supabase, principal, body);
        break;
      case 'renew':
        result = await renew(supabase, principal, body);
        break;
      case 'savePlan':
        result = await savePlan(supabase, principal, body);
        break;
      case 'markLabDevice':
        result = await markLabDevice(supabase, principal, body);
        break;
      case 'createLabSession':
        result = await createLabSession(supabase, principal, body);
        break;
      case 'revokeLabSession':
        result = await revokeLabSession(supabase, principal, body);
        break;
      case 'diagnoseCache':
        result = await diagnoseCache(supabase, principal, body);
        break;
      case 'resolveConflict':
        result = await resolveConflict(supabase, principal, body);
        break;
      default:
        return json(request, { error: 'Ação não suportada.' }, 400);
    }

    return json(request, { ok: true, data: result });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, headers);
    const message = error instanceof Error ? error.message : 'Falha ao processar a operação.';
    const safeMessage = message.length <= 350 && !/relation |column |syntax |postgres|stack/i.test(message)
      ? message
      : 'Falha ao processar a operação.';
    console.error('subscription-panel falhou.', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return json(request, { error: safeMessage }, 400);
  }
});
