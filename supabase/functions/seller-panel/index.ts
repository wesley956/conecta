import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';
import {
  isPlaylistUsable,
  resolvePlaylistAccessMode,
} from '../_shared/playlistAccessMode.ts';

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

function normalizeWhatsapp(value: unknown) {
  return String(value ?? '')
    .replace(/[^\d+]/g, '')
    .trim();
}

function normalizeDeviceStatus(value: unknown) {
  const status = String(value ?? '').trim();
  if (['pending', 'active', 'blocked', 'expired', 'inactive'].includes(status)) return status;
  return 'pending';
}

function normalizePlaylistType(value: unknown) {
  const type = String(value ?? 'm3u').trim().toLowerCase();
  if (['m3u', 'xtream', 'stalker'].includes(type)) return type;
  return 'm3u';
}

function inferPlaylistType(playlistUrl: string, requestedType: unknown) {
  try {
    const url = new URL(playlistUrl);
    const path = url.pathname.toLowerCase().replace(/\/+$/, '');
    const hasXtreamCredentials = Boolean(
      url.searchParams.get('username') && url.searchParams.get('password'),
    );
    const isXtreamEndpoint = path.endsWith('/get.php') || path.endsWith('/player_api.php');

    if (hasXtreamCredentials && isXtreamEndpoint) return 'xtream';
  } catch {
    // A validação do cache exibirá a mensagem apropriada para URLs inválidas.
  }

  return normalizePlaylistType(requestedType);
}

function daysLeft(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function addDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(1, Math.floor(days)));
  return date.toISOString();
}

async function getActivePlanForCharge(supabase: any, planId: string | null) {
  if (!planId) {
    throw new Error('Escolha um plano para ativar ou renovar o aparelho.');
  }

  const { data: plan, error } = await supabase
    .from('panel_plans')
    .select('id, name, duration_days, credit_cost, status')
    .eq('id', planId)
    .single();

  if (error || !plan) {
    throw new Error(`Plano não encontrado: ${error?.message || 'não encontrado'}`);
  }

  if (plan.status !== 'active') {
    throw new Error('Plano inativo. Escolha um plano ativo.');
  }

  return {
    id: plan.id,
    name: plan.name,
    durationDays: Math.max(1, Number(plan.duration_days || 30)),
    creditCost: Math.max(1, Number(plan.credit_cost || 1)),
  };
}

async function getSellerPlaylistIds(supabase: any, sellerId: string) {
  const { data, error } = await supabase
    .from('panel_seller_playlists')
    .select('playlist_id')
    .eq('seller_id', sellerId)
    .eq('active', true);

  if (error) {
    throw new Error(`Falha ao carregar listas do vendedor: ${error.message}`);
  }

  return (data ?? [])
    .map((row: any) => row.playlist_id)
    .filter(Boolean);
}

async function getSellerPlaylists(supabase: any, sellerId: string) {
  const playlistIds = await getSellerPlaylistIds(supabase, sellerId);

  if (!playlistIds.length) return [];

  const { data: playlists, error } = await supabase
    .from('panel_playlists')
    .select(`
      id,
      name,
      playlist_type,
      active,
      playlist_updated_at,
      created_at,
      playlist_cache_status,
      playlist_cache_error,
      playlist_cache_error_code,
      playlist_cache_attempts,
      playlist_access_mode,
      playlist_cache_updated_at,
      playlist_cache_item_count,
      playlist_cache_size_bytes
    `)
    .in('id', playlistIds)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar listas permitidas: ${error.message}`);
  }

  return (playlists ?? []).map((playlist: any) => {
    const accessMode = resolvePlaylistAccessMode(
      playlist.playlist_cache_status,
      playlist.playlist_access_mode,
      playlist.playlist_cache_error_code,
      playlist.playlist_cache_error,
      playlist.playlist_type,
    );

    return {
      id: playlist.id,
      name: playlist.name,
      playlistType: playlist.playlist_type,
      active: playlist.active,
      playlistUpdatedAt: playlist.playlist_updated_at,
      cacheStatus: playlist.playlist_cache_status || 'pending',
      cacheError: playlist.playlist_cache_error || null,
      cacheErrorCode: playlist.playlist_cache_error_code || null,
      cacheAttempts: playlist.playlist_cache_attempts || [],
      accessMode,
      usable: playlist.playlist_cache_status === 'ready' || accessMode === 'direct',
      cacheUpdatedAt: playlist.playlist_cache_updated_at || null,
      cacheItemCount: playlist.playlist_cache_item_count || 0,
      cacheSizeBytes: playlist.playlist_cache_size_bytes || 0,
    };
  });
}

async function getAllowedSellerPlaylist(supabase: any, sellerId: string, playlistId: string | null) {
  if (!playlistId) {
    throw new Error('Escolha uma lista para ativar o aparelho.');
  }

  const { data: permission, error: permissionError } = await supabase
    .from('panel_seller_playlists')
    .select('id, active')
    .eq('seller_id', sellerId)
    .eq('playlist_id', playlistId)
    .eq('active', true)
    .maybeSingle();

  if (permissionError) {
    throw new Error(`Falha ao validar lista do vendedor: ${permissionError.message}`);
  }

  if (!permission) {
    throw new Error('Esta lista não está liberada para este vendedor.');
  }

  const { data: playlist, error } = await supabase
    .from('panel_playlists')
    .select('id, name, active, playlist_type, playlist_cache_status, playlist_cache_error, playlist_cache_error_code, playlist_access_mode')
    .eq('id', playlistId)
    .single();

  if (error || !playlist) {
    throw new Error(`Lista não encontrada: ${error?.message || 'não encontrada'}`);
  }

  if (playlist.active === false) {
    throw new Error('Lista inativa. Escolha uma lista ativa.');
  }

  if (!isPlaylistUsable(
    playlist.playlist_cache_status,
    playlist.playlist_access_mode,
    playlist.playlist_cache_error_code,
    playlist.playlist_cache_error,
    playlist.playlist_type,
  )) {
    const suffix = playlist.playlist_cache_error ? ` Erro: ${playlist.playlist_cache_error}` : '';
    throw new Error(`Esta lista não pôde ser validada para uso no aparelho.${suffix}`);
  }

  return {
    ...playlist,
    playlist_access_mode: resolvePlaylistAccessMode(
      playlist.playlist_cache_status,
      playlist.playlist_access_mode,
      playlist.playlist_cache_error_code,
      playlist.playlist_cache_error,
      playlist.playlist_type,
    ),
  };
}

async function setSellerDeviceBackupPlaylist(
  supabase: any,
  sellerId: string,
  deviceId: string,
  primaryPlaylistId: string,
  backupPlaylistId: string | null,
) {
  if (backupPlaylistId === primaryPlaylistId) {
    throw new Error('A lista reserva deve ser diferente da lista principal.');
  }

  if (backupPlaylistId) {
    await getAllowedSellerPlaylist(supabase, sellerId, backupPlaylistId);
  }

  const { error: deleteError } = await supabase
    .from('panel_device_playlists')
    .delete()
    .eq('device_id', deviceId)
    .eq('priority', 2);

  if (deleteError) throw new Error(`Falha ao atualizar lista reserva: ${deleteError.message}`);
  if (!backupPlaylistId) return;

  const { error: insertError } = await supabase
    .from('panel_device_playlists')
    .insert({ device_id: deviceId, playlist_id: backupPlaylistId, priority: 2, active: true });

  if (insertError) throw new Error(`Falha ao salvar lista reserva: ${insertError.message}`);
}

async function triggerPlaylistCache(playlistId: string) {
  const adminToken = Deno.env.get('ADMIN_PANEL_TOKEN') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';

  if (!adminToken) {
    return { ok: false, skipped: true, error: 'ADMIN_PANEL_TOKEN não configurado para gerar cache automaticamente.' };
  }

  if (!supabaseUrl) {
    return { ok: false, skipped: true, error: 'SUPABASE_URL não configurado para gerar cache automaticamente.' };
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

async function applySellerDeviceSubscription(
  supabase: any,
  seller: any,
  payload: {
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
    p_seller_id: seller.id,
    p_device_id: payload.deviceId,
    p_plan_id: payload.planId,
    p_playlist_id: payload.playlistId,
    p_expires_at: payload.expiresAt,
    p_operation_type: payload.type,
    p_performed_by: `seller:${seller.id}`,
    p_idempotency_key: payload.idempotencyKey,
    p_customer_id: payload.customerId || null,
    p_client_name: payload.customerName || null,
    p_enforce_seller_ownership: true,
  });

  if (error) {
    throw new Error(`Falha na operação comercial: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('A operação comercial não retornou resultado.');

  const balanceBefore = Number(result.balance_before ?? result.balanceBefore ?? 0);
  const balanceAfter = Number(result.balance_after ?? result.balanceAfter ?? balanceBefore);

  return {
    sellerId: seller.id,
    sellerName: seller.name,
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

async function upsertSellerCustomer(
  supabase: any,
  sellerId: string,
  name: string,
  whatsapp: string,
) {
  const { data: existing, error: lookupError } = await supabase
    .from('panel_customers')
    .select('id, name, whatsapp, seller_id')
    .eq('seller_id', sellerId)
    .eq('whatsapp', whatsapp)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Falha ao procurar cliente: ${lookupError.message}`);
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('panel_customers')
      .update({
        name,
        whatsapp,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateError) {
      throw new Error(`Falha ao atualizar cliente: ${updateError.message}`);
    }

    return existing.id;
  }

  const { data, error } = await supabase
    .from('panel_customers')
    .insert({
      name,
      whatsapp,
      status: 'active',
      seller_id: sellerId,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Falha ao criar cliente: ${error?.message || 'sem retorno'}`);
  }

  return data.id;
}

function normalizeDevice(device: any) {
  const assignments = (device.device_playlists ?? [])
    .filter((assignment: any) => assignment.active !== false)
    .sort((a: any, b: any) => Number(a.priority) - Number(b.priority));
  const primary = assignments.find((assignment: any) => Number(assignment.priority) === 1)?.playlist;
  const backup = assignments.find((assignment: any) => Number(assignment.priority) === 2)?.playlist;

  return {
    id: device.id,
    deviceCode: device.device_code,
    deviceUuid: device.device_uuid,
    status: device.status,
    expiresAt: device.subscription_expires_at,
    daysLeft: daysLeft(device.subscription_expires_at),
    lastSeenAt: device.last_seen_at,
    createdAt: device.created_at,
    updatedAt: device.updated_at,
    deviceType: device.device_type || 'androidtv',
    appVersion: device.app_version || '',
    customerId: device.customer_id,
    customerName: device.customer?.name || device.client_name || null,
    customerWhatsapp: device.customer?.whatsapp || null,
    planId: device.plan?.id || device.plan_id || null,
    planName: device.plan?.name || null,
    planDurationDays: device.plan?.duration_days ?? null,
    planCreditCost: device.plan?.credit_cost ?? null,
    playlistId: primary?.id || device.playlist?.id || device.playlist_id || null,
    playlistName: primary?.name || device.playlist?.name || null,
    backupPlaylistId: backup?.id || null,
    backupPlaylistName: backup?.name || null,
  };
}

async function getDashboard(supabase: any, seller: any) {
  const { data: devices, error: devicesError } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      device_uuid,
      client_name,
      customer_id,
      status,
      subscription_expires_at,
      last_seen_at,
      created_at,
      updated_at,
      device_type,
      app_version,
      plan_id,
      playlist_id,
      customer:panel_customers (
        id,
        name,
        whatsapp
      ),
      plan:panel_plans (
        id,
        name,
        duration_days,
        credit_cost,
        max_devices,
        status
      ),
      playlist:panel_playlists (
        id,
        name,
        active
      ),
      device_playlists:panel_device_playlists (
        priority,
        active,
        playlist:panel_playlists (
          id,
          name,
          active,
          playlist_cache_status
        )
      )
    `)
    .eq('seller_id', seller.id)
    .order('created_at', { ascending: false });

  if (devicesError) throw new Error(devicesError.message);

  const { data: ledger, error: ledgerError } = await supabase
    .from('panel_credit_ledger')
    .select('id, amount, type, reference_id, description, balance_after, created_at')
    .eq('seller_id', seller.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (ledgerError) throw new Error(ledgerError.message);

  const { data: plans, error: plansError } = await supabase
    .from('panel_plans')
    .select('id, name, duration_days, credit_cost, max_devices, status')
    .eq('status', 'active')
    .order('duration_days', { ascending: true });

  if (plansError) throw new Error(plansError.message);

  const sellerPlaylists = await getSellerPlaylists(supabase, seller.id);
  const normalizedDevices = (devices ?? []).map(normalizeDevice);

  return {
    seller: {
      id: seller.id,
      name: seller.name,
      whatsapp: seller.whatsapp,
      email: seller.email,
      status: seller.status,
      creditBalance: seller.credit_balance,
      canGoNegative: seller.can_go_negative,
      createdAt: seller.created_at,
      updatedAt: seller.updated_at,
    },
    stats: {
      totalDevices: normalizedDevices.length,
      activeDevices: normalizedDevices.filter((d: any) => d.status === 'active').length,
      pendingDevices: normalizedDevices.filter((d: any) => d.status === 'pending').length,
      blockedDevices: normalizedDevices.filter((d: any) => d.status === 'blocked').length,
      expiredDevices: normalizedDevices.filter((d: any) => d.status === 'expired' || Number(d.daysLeft) < 0).length,
      expiringSoon: normalizedDevices.filter((d: any) => d.status === 'active' && Number(d.daysLeft) >= 0 && Number(d.daysLeft) <= 7).length,
      creditsAdded: (ledger ?? [])
        .filter((entry: any) => Number(entry.amount || 0) > 0)
        .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0),
      creditsConsumed: Math.abs((ledger ?? [])
        .filter((entry: any) => Number(entry.amount || 0) < 0)
        .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0)),
    },
    devices: normalizedDevices,
    plans: (plans ?? []).map((plan: any) => ({
      id: plan.id,
      name: plan.name,
      durationDays: plan.duration_days,
      creditCost: plan.credit_cost,
      maxDevices: plan.max_devices,
      status: plan.status,
    })),
    playlists: sellerPlaylists,
    creditLedger: (ledger ?? []).map((entry: any) => ({
      id: entry.id,
      amount: entry.amount,
      type: entry.type,
      referenceId: entry.reference_id,
      description: entry.description,
      balanceAfter: entry.balance_after,
      createdAt: entry.created_at,
    })),
  };
}

async function getSellerDeviceByCode(supabase: any, seller: any, deviceCode: string) {
  const { data: device, error: deviceError } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      device_uuid,
      client_name,
      seller_id,
      customer_id,
      plan_id,
      playlist_id,
      status,
      subscription_expires_at,
      last_seen_at,
      created_at,
      updated_at,
      device_type,
      app_version,
      customer:panel_customers (
        id,
        name,
        whatsapp
      ),
      plan:panel_plans (
        id,
        name,
        duration_days,
        credit_cost
      ),
      playlist:panel_playlists (
        id,
        name,
        active
      ),
      device_playlists:panel_device_playlists (
        priority,
        active,
        playlist:panel_playlists (id, name, active, playlist_cache_status)
      )
    `)
    .eq('device_code', deviceCode)
    .maybeSingle();

  if (deviceError) throw new Error(deviceError.message);
  return device;
}

async function getOwnedDevice(supabase: any, seller: any, deviceId: string) {
  const { data: device, error } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      seller_id,
      customer_id,
      plan_id,
      playlist_id,
      status,
      subscription_expires_at,
      customer:panel_customers (
        id,
        name,
        whatsapp
      ),
      plan:panel_plans (
        id,
        name,
        duration_days,
        credit_cost
      ),
      device_playlists:panel_device_playlists (
        priority,
        active,
        playlist:panel_playlists (id, name, active, playlist_cache_status)
      )
    `)
    .eq('id', deviceId)
    .single();

  if (error || !device) throw new Error(`Aparelho não encontrado: ${error?.message || 'não encontrado'}`);
  if (device.seller_id !== seller.id) throw new Error('Este aparelho não pertence a este vendedor.');

  return device;
}

async function writeSellerAudit(
  supabase: any,
  payload: {
    action: string;
    entityId: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase
    .from('panel_audit_logs')
    .insert({
      action: payload.action,
      entity_type: 'device',
      entity_id: payload.entityId,
      description: payload.description,
      metadata: payload.metadata ?? {},
    });

  if (error) throw new Error(`Falha ao registrar auditoria: ${error.message}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );
    const principal = await requirePanelPrincipal(req, supabase, ['seller']);

    const { data: seller, error: sellerError } = await supabase
      .from('panel_sellers')
      .select('id, name, whatsapp, email, status, credit_balance, can_go_negative, created_at, updated_at')
      .eq('id', principal.sellerId)
      .single();

    if (sellerError || !seller) return json({ error: 'Vendedor autenticado não encontrado.' }, 403);
    if (seller.status !== 'active') return json({ error: 'Vendedor bloqueado ou inativo.' }, 403);

    const url = new URL(req.url);
    const body = await readBody(req);
    const action = String(body.action || url.searchParams.get('action') || 'dashboard').trim();

    if (action === 'dashboard' || action === 'list') {
      return json(await getDashboard(supabase, seller));
    }

    if (action === 'createSellerPlaylist') {
      const name = requiredText(body.name, 'Nome da lista');
      const playlistUrl = requiredText(body.playlistUrl, 'URL da lista');
      const playlistType = inferPlaylistType(playlistUrl, body.playlistType);
      const now = new Date().toISOString();

      const { data: playlist, error: playlistError } = await supabase
        .from('panel_playlists')
        .insert({
          name,
          playlist_url: playlistUrl,
          playlist_type: playlistType,
          active: true,
          playlist_updated_at: now,
          playlist_cache_status: 'processing',
          playlist_cache_error: null,
          playlist_cache_error_code: null,
          playlist_cache_attempts: [],
          playlist_access_mode: 'server_cache',
        })
        .select('id, name')
        .single();

      if (playlistError || !playlist) {
        return json({ error: playlistError?.message || 'Falha ao criar lista.' }, 500);
      }

      const { error: linkError } = await supabase
        .from('panel_seller_playlists')
        .insert({
          seller_id: seller.id,
          playlist_id: playlist.id,
          active: true,
          updated_at: now,
        });

      if (linkError) {
        await supabase.from('panel_playlists').delete().eq('id', playlist.id);
        return json({ error: `Falha ao vincular lista ao vendedor: ${linkError.message}` }, 500);
      }

      const cache = await triggerPlaylistCache(playlist.id);

      return json({
        ok: true,
        playlistId: playlist.id,
        playlistName: playlist.name,
        cache,
        message: cache?.ok
          ? 'Lista cadastrada e cache gerado com sucesso.'
          : (cache?.accessMode === 'direct'
            ? 'Lista cadastrada em acesso direto porque o provedor bloqueia o servidor.'
            : 'Lista cadastrada, mas não foi possível validá-la para uso.'),
      });
    }

    if (action === 'refreshSellerPlaylistCache') {
      const playlistId = requiredText(body.playlistId, 'ID da lista');
      const { data: permission, error: permissionError } = await supabase
        .from('panel_seller_playlists')
        .select('id')
        .eq('seller_id', seller.id)
        .eq('playlist_id', playlistId)
        .eq('active', true)
        .maybeSingle();

      if (permissionError) return json({ error: permissionError.message }, 500);
      if (!permission) return json({ error: 'Esta lista não pertence a este vendedor.' }, 403);

      await supabase
        .from('panel_playlists')
        .update({
          playlist_cache_status: 'processing',
          playlist_cache_error: null,
          playlist_cache_error_code: null,
          playlist_cache_attempts: [],
          playlist_access_mode: 'server_cache',
        })
        .eq('id', playlistId);

      const cache = await triggerPlaylistCache(playlistId);
      return json({
        ok: Boolean(cache?.ok),
        cache,
        accessMode: cache?.accessMode || null,
        message: cache?.ok
          ? 'Cache atualizado com sucesso.'
          : (cache?.accessMode === 'direct'
            ? 'O provedor bloqueia o servidor. A lista foi colocada em acesso direto.'
            : (cache?.message || cache?.error || 'Não foi possível validar a lista.')),
      });
    }

    if (action === 'lookupDeviceCode') {
      const deviceCode = requiredText(body.deviceCode, 'Código do aparelho').toUpperCase();
      const device = await getSellerDeviceByCode(supabase, seller, deviceCode);

      if (!device) {
        return json({ ok: false, found: false, deviceCode, message: 'Aparelho não encontrado. Confira o código enviado pelo cliente.' }, 404);
      }

      const belongsToCurrentSeller = device.seller_id === seller.id;
      const belongsToAnotherSeller = Boolean(device.seller_id && device.seller_id !== seller.id);
      const canClaim = device.status === 'pending' && !belongsToAnotherSeller;
      const canActivate = !belongsToAnotherSeller && device.status !== 'active';

      return json({
        ok: true,
        found: true,
        device: { ...normalizeDevice(device), belongsToCurrentSeller, belongsToAnotherSeller, canClaim, canActivate },
        message: canClaim
          ? 'Código encontrado. Aparelho pendente e disponível para ativação.'
          : belongsToCurrentSeller
            ? 'Código encontrado. Este aparelho já está vinculado a este vendedor.'
            : belongsToAnotherSeller
              ? 'Código encontrado, mas já pertence a outro vendedor.'
              : `Código encontrado. Status atual: ${device.status}.`,
      });
    }

    if (action === 'claimPendingDevice') {
      const deviceCode = requiredText(body.deviceCode, 'Código do aparelho').toUpperCase();
      const device = await getSellerDeviceByCode(supabase, seller, deviceCode);

      if (!device) return json({ error: 'Aparelho não encontrado. Confira o código enviado pelo cliente.' }, 404);
      if (device.seller_id && device.seller_id !== seller.id) return json({ error: 'Este aparelho já está vinculado a outro vendedor.' }, 409);
      if (device.status !== 'pending' && device.seller_id !== seller.id) return json({ error: `Aparelho não está pendente. Status atual: ${device.status}.` }, 400);

      const { error: updateError } = await supabase
        .from('panel_devices')
        .update({ seller_id: seller.id, updated_at: new Date().toISOString() })
        .eq('id', device.id);

      if (updateError) return json({ error: updateError.message }, 500);
      return json({ ok: true, deviceId: device.id, deviceCode: device.device_code, status: device.status, message: 'Aparelho vinculado ao vendedor. Agora ele pode ser ativado.' });
    }

    if (action === 'activateDeviceByCode') {
      const deviceCode = requiredText(body.deviceCode, 'Código do aparelho').toUpperCase();
      const customerName = requiredText(body.customerName, 'Nome do cliente');
      const customerWhatsapp = normalizeWhatsapp(body.customerWhatsapp);
      if (!customerWhatsapp) return json({ error: 'WhatsApp do cliente é obrigatório.' }, 400);

      const plan = await getActivePlanForCharge(supabase, textOrNull(body.planId));
      const playlist = await getAllowedSellerPlaylist(supabase, seller.id, textOrNull(body.playlistId));
      const backupPlaylistId = textOrNull(body.backupPlaylistId);
      if (backupPlaylistId === playlist.id) return json({ error: 'A lista reserva deve ser diferente da lista principal.' }, 400);
      if (backupPlaylistId) await getAllowedSellerPlaylist(supabase, seller.id, backupPlaylistId);
      const device = await getSellerDeviceByCode(supabase, seller, deviceCode);

      if (!device) return json({ error: 'Aparelho não encontrado. Confira o código enviado pelo cliente.' }, 404);
      if (device.seller_id && device.seller_id !== seller.id) return json({ error: 'Este aparelho já está vinculado a outro vendedor.' }, 409);

      const expiresAt = requiredText(body.expiresAt, 'Data de expiração');
      const idempotencyKey = requiredText(body.idempotencyKey, 'Chave de idempotência');
      const customerId = await upsertSellerCustomer(supabase, seller.id, customerName, customerWhatsapp);
      const creditConsumption = await applySellerDeviceSubscription(supabase, seller, {
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId,
        customerName,
        planId: plan.id,
        planName: plan.name,
        playlistId: playlist.id,
        expiresAt,
        type: 'activation',
        idempotencyKey,
      });
      await setSellerDeviceBackupPlaylist(supabase, seller.id, device.id, playlist.id, backupPlaylistId);

      return json({
        ok: true,
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId,
        planId: plan.id,
        planName: plan.name,
        playlistId: playlist.id,
        playlistName: playlist.name,
        playlistAccessMode: playlist.playlist_access_mode,
        backupPlaylistId,
        expiresAt,
        creditConsumption,
        message: creditConsumption.applied
          ? (playlist.playlist_access_mode === 'direct'
            ? 'Aparelho ativado com sucesso em acesso direto.'
            : 'Aparelho ativado com sucesso.')
          : 'Esta ativação já havia sido processada.',
      });
    }

    if (action === 'renewDevice') {
      const deviceId = requiredText(body.deviceId, 'ID do aparelho');
      const device = await getOwnedDevice(supabase, seller, deviceId);
      const plan = await getActivePlanForCharge(supabase, textOrNull(body.planId) || device.plan_id || null);
      const playlistId = textOrNull(body.playlistId) || device.playlist_id || null;
      const playlist = await getAllowedSellerPlaylist(supabase, seller.id, playlistId);
      const currentBackup = (device.device_playlists ?? []).find(
        (assignment: any) => Number(assignment.priority) === 2 && assignment.active !== false,
      );
      const backupPlaylistId = 'backupPlaylistId' in body
        ? textOrNull(body.backupPlaylistId)
        : (currentBackup?.playlist?.id || null);
      if (backupPlaylistId === playlist.id) return json({ error: 'A lista reserva deve ser diferente da lista principal.' }, 400);
      if (backupPlaylistId) await getAllowedSellerPlaylist(supabase, seller.id, backupPlaylistId);
      const customer = Array.isArray(device.customer) ? device.customer[0] ?? null : device.customer;
      const customerName = customer?.name || null;
      const expiresAt = requiredText(body.expiresAt, 'Data de expiração');
      const idempotencyKey = requiredText(body.idempotencyKey, 'Chave de idempotência');

      const creditConsumption = await applySellerDeviceSubscription(supabase, seller, {
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId: device.customer_id || null,
        customerName,
        planId: plan.id,
        planName: plan.name,
        playlistId: playlist.id,
        expiresAt,
        type: 'renewal',
        idempotencyKey,
      });
      await setSellerDeviceBackupPlaylist(supabase, seller.id, device.id, playlist.id, backupPlaylistId);

      return json({
        ok: true,
        deviceId,
        expiresAt,
        creditConsumption,
        message: creditConsumption.applied
          ? 'Aparelho renovado com sucesso.'
          : 'Esta renovação já havia sido processada.',
      });
    }

    if (action === 'blockDevice') {
      const deviceId = requiredText(body.deviceId, 'ID do aparelho');
      const device = await getOwnedDevice(supabase, seller, deviceId);
      const nextStatus = normalizeDeviceStatus(body.status || 'blocked');

      if (!['blocked', 'inactive', 'expired', 'active'].includes(nextStatus)) return json({ error: 'Status não permitido para o vendedor.' }, 400);

      const { error: updateError } = await supabase
        .from('panel_devices')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', device.id);

      if (updateError) return json({ error: updateError.message }, 500);
      return json({ ok: true, deviceId, status: nextStatus, message: 'Status do aparelho atualizado.' });
    }

    if (action === 'deleteDevice') {
      const deviceId = requiredText(body.deviceId, 'ID do aparelho');
      const device = await getOwnedDevice(supabase, seller, deviceId);

      const { error: deleteError } = await supabase
        .from('panel_devices')
        .delete()
        .eq('id', device.id)
        .eq('seller_id', seller.id);

      if (deleteError) return json({ error: deleteError.message }, 500);

      await writeSellerAudit(supabase, {
        action: 'device.deleted_by_seller',
        entityId: device.id,
        description: `Aparelho ${device.device_code} excluído pelo vendedor`,
        metadata: {
          sellerId: seller.id,
          sellerName: seller.name || null,
          deviceCode: device.device_code,
        },
      });

      return json({ ok: true, deviceId, message: 'Aparelho excluído com sucesso.' });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) {
      return panelAuthErrorResponse(error, corsHeaders);
    }

    return json({ error: error instanceof Error ? error.message : 'Erro inesperado no portal do vendedor.' }, 500);
  }
});
