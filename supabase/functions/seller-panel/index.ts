import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

type JsonBody = Record<string, unknown>;
declare const EdgeRuntime: undefined | { waitUntil(promise: Promise<unknown>): void };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const MAX_BODY_BYTES = 64 * 1024;
const QUALIFICATION_FIELDS = `
  playlist_qualification_status,
  playlist_qualification_code,
  playlist_qualification_message,
  playlist_qualification_updated_at,
  playlist_qualified_at,
  playlist_direct_confirmed_at
`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function readBody(req: Request): Promise<JsonBody> {
  if (req.method !== 'POST') return {};
  const raw = await req.text();
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES
      || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error('Requisição excede o limite permitido.');
  }
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed as JsonBody : {};
  } catch {
    return {};
  }
}

function textOrNull(value: unknown, max = 500) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > max) throw new Error('Texto excede o limite permitido.');
  return text;
}

function requiredText(value: unknown, label: string, max = 500) {
  const text = textOrNull(value, max);
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
}

function one(value: any) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function redact(value: unknown, max = 500) {
  let message = String(value ?? '').slice(0, Math.max(max * 2, 600));
  message = message.replace(
    /([?&](?:username|user|login|password|pass|passwd|pwd|token|key|secret|auth)=)[^&\s|)]+/gi,
    '$1••••',
  );
  message = message.replace(/(https?:\/\/[^\s?#]+)\?[^\s|)]+/gi, '$1?••••');
  return message.slice(0, max);
}

function normalizeWhatsapp(value: unknown) {
  return String(value ?? '').replace(/[^\d+]/g, '').trim();
}

function normalizeDeviceStatus(value: unknown) {
  const status = String(value ?? '').trim();
  return ['pending', 'active', 'blocked', 'expired', 'inactive'].includes(status)
    ? status
    : 'pending';
}

function validatePlaylistUrl(value: unknown) {
  const raw = requiredText(value, 'URL da lista', 4096);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('URL da lista inválida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('A URL da lista precisa usar HTTP ou HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Não informe credenciais antes do domínio.');
  }
  parsed.hash = '';
  return parsed.toString();
}

function inferPlaylistType(playlistUrl: string, requestedType: unknown) {
  const parsed = new URL(playlistUrl);
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
  if (parsed.searchParams.get('username')
      && parsed.searchParams.get('password')
      && (path.endsWith('/get.php') || path.endsWith('/player_api.php'))) {
    return 'xtream';
  }
  const type = String(requestedType ?? 'm3u').trim().toLowerCase();
  if (!['m3u', 'xtream', 'stalker'].includes(type)) throw new Error('Tipo de lista inválido.');
  return type;
}

function normalizedPlaylistSource(value: string) {
  const parsed = new URL(value);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  const entries = [...parsed.searchParams.entries()]
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv));
  parsed.search = '';
  for (const [key, entryValue] of entries) parsed.searchParams.append(key, entryValue);
  return parsed.toString();
}

async function playlistFingerprint(url: string) {
  const secret = String(Deno.env.get('PLAYLIST_FINGERPRINT_SECRET') || '').trim()
    || getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(normalizedPlaylistSource(url)),
  );
  return [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function daysLeft(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? null
    : Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function qualification(row: any) {
  const status = String(row?.playlist_qualification_status || 'validating');
  const usable = row?.active !== false && ['ready_cache', 'ready_direct'].includes(status);
  const labels: Record<string, string> = {
    validating: 'Validando lista',
    ready_cache: 'Cache pronto',
    awaiting_device_test: 'Aguardando teste no aparelho',
    ready_direct: 'Acesso direto homologado',
    retryable_error: 'Falha temporária',
    blocked: 'Lista bloqueada',
  };
  return {
    qualificationStatus: status,
    qualificationLabel: labels[status] || 'Validando lista',
    qualificationMessage: redact(
      row?.playlist_qualification_message || 'A lista ainda não está homologada.',
      500,
    ),
    usable,
    commerciallyUsable: usable,
    requiresDeviceTest: status === 'awaiting_device_test',
    canRetryCache: ['validating', 'retryable_error'].includes(status),
    qualifiedAt: row?.playlist_qualified_at || null,
    directConfirmedAt: row?.playlist_direct_confirmed_at || null,
  };
}

async function triggerPlaylistCache(playlistId: string) {
  const response = await fetch(`${getEnv('SUPABASE_URL')}/functions/v1/playlist-cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getEnv('ADMIN_PANEL_TOKEN'),
    },
    body: JSON.stringify({ action: 'refresh', playlistId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || data?.message || `Falha HTTP ${response.status}.`);
  return data;
}

function scheduleCache(playlistId: string) {
  const promise = triggerPlaylistCache(playlistId).catch(error => {
    console.error('Falha sanitizada ao validar lista do vendedor.', {
      message: redact(error instanceof Error ? error.message : error, 240),
    });
  });
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(promise);
  }
}

async function getActivePlanForCharge(supabase: any, planId: string | null) {
  if (!planId) throw new Error('Escolha um plano para ativar ou renovar o aparelho.');
  const { data: plan, error } = await supabase
    .from('panel_plans')
    .select('id,name,duration_days,credit_cost,status')
    .eq('id', planId)
    .single();
  if (error || !plan) throw new Error('Plano não encontrado.');
  if (plan.status !== 'active') throw new Error('Plano inativo. Escolha um plano ativo.');
  return {
    id: plan.id,
    name: plan.name,
    durationDays: Math.max(1, Number(plan.duration_days || 30)),
    creditCost: Math.max(1, Number(plan.credit_cost || 1)),
  };
}

async function getSellerPlaylists(supabase: any, sellerId: string) {
  const { data, error } = await supabase
    .from('panel_seller_playlists')
    .select(`
      playlist:panel_playlists!panel_seller_playlists_playlist_id_fkey(
        id,name,playlist_type,active,playlist_updated_at,created_at,
        playlist_cache_status,playlist_cache_error,playlist_cache_error_code,
        playlist_cache_attempts,playlist_access_mode,playlist_cache_updated_at,
        playlist_cache_item_count,playlist_cache_size_bytes,${QUALIFICATION_FIELDS}
      )
    `)
    .eq('seller_id', sellerId)
    .eq('active', true)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Falha ao carregar listas permitidas: ${error.message}`);

  return (data || []).flatMap((link: any) => {
    const playlist = one(link.playlist);
    if (!playlist || playlist.active === false) return [];
    return [{
      id: playlist.id,
      name: playlist.name,
      playlistType: playlist.playlist_type,
      active: playlist.active,
      playlistUpdatedAt: playlist.playlist_updated_at,
      cacheStatus: playlist.playlist_cache_status || 'missing',
      cacheError: playlist.playlist_cache_error ? redact(playlist.playlist_cache_error, 300) : null,
      cacheErrorCode: playlist.playlist_cache_error_code || null,
      cacheAttempts: playlist.playlist_cache_attempts || [],
      accessMode: playlist.playlist_access_mode || 'server_cache',
      cacheUpdatedAt: playlist.playlist_cache_updated_at || null,
      cacheItemCount: Number(playlist.playlist_cache_item_count || 0),
      cacheSizeBytes: Number(playlist.playlist_cache_size_bytes || 0),
      ...qualification(playlist),
    }];
  });
}

async function getAllowedSellerPlaylist(supabase: any, sellerId: string, playlistId: string | null) {
  if (!playlistId) throw new Error('Escolha uma lista para ativar o aparelho.');
  const { data: permission, error: permissionError } = await supabase
    .from('panel_seller_playlists')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('playlist_id', playlistId)
    .eq('active', true)
    .maybeSingle();
  if (permissionError) throw new Error('Falha ao validar a lista do vendedor.');
  if (!permission) throw new Error('Esta lista não está liberada para este vendedor.');

  const { data: playlist, error } = await supabase
    .from('panel_playlists')
    .select(`id,name,active,playlist_type,playlist_access_mode,${QUALIFICATION_FIELDS}`)
    .eq('id', playlistId)
    .maybeSingle();
  if (error || !playlist) throw new Error('Lista não encontrada.');
  const decision = qualification(playlist);
  if (!decision.usable) {
    throw new Error(`Esta lista ainda não está homologada. ${decision.qualificationMessage}`);
  }
  return {
    ...playlist,
    playlist_access_mode: playlist.playlist_access_mode || 'server_cache',
    ...decision,
  };
}

async function registerSellerPlaylist(supabase: any, sellerId: string, body: JsonBody) {
  const name = requiredText(body.name, 'Nome da lista', 180);
  const playlistUrl = validatePlaylistUrl(body.playlistUrl);
  const playlistType = inferPlaylistType(playlistUrl, body.playlistType);
  const fingerprint = await playlistFingerprint(playlistUrl);
  const { data, error } = await supabase.rpc('register_playlist_source_transaction', {
    p_name: name,
    p_playlist_url: playlistUrl,
    p_playlist_type: playlistType,
    p_max_connections: 1,
    p_source_fingerprint: fingerprint,
    p_seller_id: sellerId,
  });
  if (error) throw new Error(redact(error.message || 'Falha ao salvar a lista.', 300));
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.playlist_id) throw new Error('O cadastro não retornou a lista salva.');
  scheduleCache(String(result.playlist_id));
  return {
    ok: true,
    playlistId: String(result.playlist_id),
    created: result.created === true,
    cache: { ok: false, processing: true },
    message: result.created === true
      ? 'Lista salva e em validação. Não cadastre novamente.'
      : 'Esta origem já estava cadastrada e foi reutilizada. Não cadastre novamente.',
  };
}

async function applySellerDeviceSubscription(supabase: any, seller: any, payload: any) {
  const { data, error } = await supabase.rpc('apply_device_subscription_complete_transaction', {
    p_seller_id: seller.id,
    p_device_id: payload.deviceId,
    p_plan_id: payload.planId,
    p_playlist_id: payload.playlistId,
    p_backup_playlist_id: payload.backupPlaylistId || null,
    p_expires_at: payload.expiresAt,
    p_operation_type: payload.type,
    p_performed_by: `seller:${seller.id}`,
    p_idempotency_key: payload.idempotencyKey,
    p_customer_id: payload.customerId || null,
    p_client_name: payload.customerName || null,
    p_enforce_seller_ownership: true,
  });
  if (error) throw new Error(`Falha na operação comercial: ${redact(error.message, 300)}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('A operação comercial não retornou resultado.');
  const before = Number(result.balance_before ?? result.balanceBefore ?? 0);
  const after = Number(result.balance_after ?? result.balanceAfter ?? before);
  return {
    sellerId: seller.id,
    sellerName: seller.name,
    amount: after - before,
    balanceBefore: before,
    balanceAfter: after,
    type: payload.type,
    applied: result.applied !== false,
    ledgerId: result.ledger_id ?? result.ledgerId ?? null,
    description: `${payload.type === 'activation' ? 'Ativação' : 'Renovação'} do aparelho ${payload.deviceCode || payload.deviceId}`,
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
    .select('id')
    .eq('seller_id', sellerId)
    .eq('whatsapp', whatsapp)
    .maybeSingle();
  if (lookupError) throw new Error('Falha ao procurar cliente.');
  if (existing) {
    const { error } = await supabase
      .from('panel_customers')
      .update({ name, whatsapp, status: 'active', updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw new Error('Falha ao atualizar cliente.');
    return existing.id;
  }
  const { data, error } = await supabase
    .from('panel_customers')
    .insert({ name, whatsapp, status: 'active', seller_id: sellerId, updated_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error || !data) throw new Error('Falha ao criar cliente.');
  return data.id;
}

function normalizeDevice(device: any) {
  const customer = one(device.customer);
  const plan = one(device.plan);
  const legacyPlaylist = one(device.playlist);
  const assignments = (device.device_playlists || [])
    .filter((item: any) => item.active !== false)
    .sort((a: any, b: any) => Number(a.priority) - Number(b.priority));
  const primary = one(assignments.find((item: any) => Number(item.priority) === 1)?.playlist)
    || legacyPlaylist;
  const backup = one(assignments.find((item: any) => Number(item.priority) === 2)?.playlist);
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
    isPlaylistValidationDevice: device.is_playlist_validation_device === true,
    customerId: device.customer_id,
    customerName: customer?.name || device.client_name || null,
    customerWhatsapp: customer?.whatsapp || null,
    planId: plan?.id || device.plan_id || null,
    planName: plan?.name || null,
    planDurationDays: plan?.duration_days ?? null,
    planCreditCost: plan?.credit_cost ?? null,
    playlistId: primary?.id || device.playlist_id || null,
    playlistName: primary?.name || null,
    backupPlaylistId: backup?.id || null,
    backupPlaylistName: backup?.name || null,
  };
}

const DEVICE_SELECT = `
  id,device_code,device_uuid,client_name,seller_id,customer_id,plan_id,playlist_id,status,
  subscription_expires_at,last_seen_at,created_at,updated_at,device_type,app_version,is_playlist_validation_device,
  customer:panel_customers!panel_devices_customer_id_fkey(id,name,whatsapp),
  plan:panel_plans!panel_devices_plan_id_fkey(id,name,duration_days,credit_cost,max_devices,status),
  playlist:panel_playlists!panel_devices_playlist_id_fkey(id,name,active),
  device_playlists:panel_device_playlists!panel_device_playlists_device_id_fkey(
    priority,active,
    playlist:panel_playlists!panel_device_playlists_playlist_id_fkey(
      id,name,active,playlist_cache_status,playlist_qualification_status
    )
  )
`;

async function getDashboard(supabase: any, seller: any) {
  const { data: devices, error: devicesError } = await supabase
    .from('panel_devices')
    .select(DEVICE_SELECT)
    .eq('seller_id', seller.id)
    .order('created_at', { ascending: false });
  if (devicesError) throw new Error(`Falha ao carregar aparelhos: ${devicesError.message}`);

  const { data: ledger, error: ledgerError } = await supabase
    .from('panel_credit_ledger')
    .select('id,amount,type,reference_id,description,balance_after,created_at')
    .eq('seller_id', seller.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (ledgerError) throw new Error('Falha ao carregar extrato de créditos.');

  const { data: plans, error: plansError } = await supabase
    .from('panel_plans')
    .select('id,name,duration_days,credit_cost,max_devices,status')
    .eq('status', 'active')
    .order('duration_days', { ascending: true });
  if (plansError) throw new Error('Falha ao carregar planos.');

  const normalized = (devices || []).map(normalizeDevice);
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
      totalDevices: normalized.length,
      activeDevices: normalized.filter((d: any) => d.status === 'active').length,
      pendingDevices: normalized.filter((d: any) => d.status === 'pending').length,
      blockedDevices: normalized.filter((d: any) => d.status === 'blocked').length,
      expiredDevices: normalized.filter((d: any) => d.status === 'expired' || Number(d.daysLeft) < 0).length,
      expiringSoon: normalized.filter((d: any) => d.status === 'active'
        && Number(d.daysLeft) >= 0
        && Number(d.daysLeft) <= 7).length,
      creditsAdded: (ledger || [])
        .filter((entry: any) => Number(entry.amount || 0) > 0)
        .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0),
      creditsConsumed: Math.abs((ledger || [])
        .filter((entry: any) => Number(entry.amount || 0) < 0)
        .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0)),
    },
    devices: normalized,
    plans: (plans || []).map((plan: any) => ({
      id: plan.id,
      name: plan.name,
      durationDays: plan.duration_days,
      creditCost: plan.credit_cost,
      maxDevices: plan.max_devices,
      status: plan.status,
    })),
    playlists: await getSellerPlaylists(supabase, seller.id),
    creditLedger: (ledger || []).map((entry: any) => ({
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

async function getDeviceByCode(supabase: any, code: string) {
  const { data, error } = await supabase
    .from('panel_devices')
    .select(DEVICE_SELECT)
    .eq('device_code', code)
    .maybeSingle();
  if (error) throw new Error(`Falha ao consultar aparelho: ${error.message}`);
  return data || null;
}

async function getOwnedDevice(supabase: any, sellerId: string, deviceId: string) {
  const { data, error } = await supabase
    .from('panel_devices')
    .select(DEVICE_SELECT)
    .eq('id', deviceId)
    .maybeSingle();
  if (error || !data) throw new Error('Aparelho não encontrado.');
  if (data.seller_id !== sellerId) throw new Error('Este aparelho não pertence a este vendedor.');
  return data;
}

async function writeAudit(
  supabase: any,
  action: string,
  entityType: string,
  entityId: string,
  description: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase
    .from('panel_audit_logs')
    .insert({ action, entity_type: entityType, entity_id: entityId, description, metadata });
  if (error) throw new Error('Falha ao registrar auditoria.');
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const supabase = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const principal = await requirePanelPrincipal(req, supabase, ['seller']);
    const { data: seller, error: sellerError } = await supabase
      .from('panel_sellers')
      .select('id,name,whatsapp,email,status,credit_balance,can_go_negative,created_at,updated_at')
      .eq('id', principal.sellerId)
      .maybeSingle();
    if (sellerError || !seller) return json({ error: 'Vendedor autenticado não encontrado.' }, 403);
    if (seller.status !== 'active') return json({ error: 'Vendedor bloqueado ou inativo.' }, 403);

    const url = new URL(req.url);
    const body = await readBody(req);
    const action = String(body.action || url.searchParams.get('action') || 'dashboard').trim();

    if (action === 'dashboard' || action === 'list') {
      return json(await getDashboard(supabase, seller));
    }
    if (action === 'createSellerPlaylist') {
      return json(await registerSellerPlaylist(supabase, seller.id, body), 202);
    }

    if (action === 'refreshSellerPlaylistCache') {
      const playlistId = requiredText(body.playlistId, 'ID da lista', 80);
      const { data: permission, error } = await supabase
        .from('panel_seller_playlists')
        .select('id')
        .eq('seller_id', seller.id)
        .eq('playlist_id', playlistId)
        .eq('active', true)
        .maybeSingle();
      if (error) return json({ error: 'Falha ao validar a lista.' }, 500);
      if (!permission) return json({ error: 'Esta lista não pertence a este vendedor.' }, 403);
      const cache = await triggerPlaylistCache(playlistId);
      return json({
        ok: Boolean(cache?.ok),
        cache,
        accessMode: cache?.accessMode || null,
        message: cache?.ok
          ? 'Cache atualizado com sucesso.'
          : (cache?.message || cache?.error || 'A validação foi iniciada.'),
      });
    }

    if (action === 'deleteSellerPlaylist') {
      const playlistId = requiredText(body.playlistId, 'ID da lista', 80);
      const { data, error } = await supabase.rpc('remove_seller_playlist_transaction', {
        p_seller_id: seller.id,
        p_playlist_id: playlistId,
      });
      if (error) return json({ error: redact(error.message, 300) }, 500);
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.removed) {
        return json({
          error: 'Esta lista está em uso. Troque a lista dos aparelhos antes de excluí-la.',
          devicesCount: Number(result?.devices_count || 0),
          deviceCodes: Array.isArray(result?.device_codes) ? result.device_codes : [],
        }, 409);
      }
      await writeAudit(
        supabase,
        'playlist.removed_by_seller',
        'playlist',
        playlistId,
        'Lista removida da conta pelo vendedor',
        { sellerId: seller.id },
      );
      return json({ ok: true, playlistId, message: 'Lista excluída da sua conta com sucesso.' });
    }

    if (action === 'lookupDeviceCode') {
      const code = requiredText(body.deviceCode, 'Código do aparelho', 80).toUpperCase();
      const device = await getDeviceByCode(supabase, code);
      if (!device) {
        return json({ ok: false, found: false, deviceCode: code, message: 'Aparelho não encontrado.' }, 404);
      }
      const belongsToCurrentSeller = device.seller_id === seller.id;
      const belongsToAnotherSeller = Boolean(device.seller_id && device.seller_id !== seller.id);
      const validationDevice = device.is_playlist_validation_device === true;
      return json({
        ok: true,
        found: true,
        device: {
          ...normalizeDevice(device),
          belongsToCurrentSeller,
          belongsToAnotherSeller,
          canClaim: device.status === 'pending' && !belongsToAnotherSeller && !validationDevice,
          canActivate: !belongsToAnotherSeller && device.status !== 'active' && !validationDevice,
        },
        message: validationDevice
          ? 'Este aparelho está reservado para homologação de listas.'
          : 'Código encontrado.',
      });
    }

    if (action === 'claimPendingDevice') {
      const code = requiredText(body.deviceCode, 'Código do aparelho', 80).toUpperCase();
      const device = await getDeviceByCode(supabase, code);
      if (!device) return json({ error: 'Aparelho não encontrado.' }, 404);
      if (device.is_playlist_validation_device === true) {
        return json({ error: 'Este aparelho está reservado para homologação de listas.' }, 409);
      }
      if (device.seller_id && device.seller_id !== seller.id) {
        return json({ error: 'Este aparelho já está vinculado a outro vendedor.' }, 409);
      }
      if (device.status !== 'pending' && device.seller_id !== seller.id) {
        return json({ error: `Aparelho não está pendente. Status atual: ${device.status}.` }, 400);
      }
      const { error } = await supabase
        .from('panel_devices')
        .update({ seller_id: seller.id, updated_at: new Date().toISOString() })
        .eq('id', device.id);
      if (error) return json({ error: 'Não foi possível vincular o aparelho.' }, 500);
      return json({
        ok: true,
        deviceId: device.id,
        deviceCode: device.device_code,
        status: device.status,
        message: 'Aparelho vinculado ao vendedor.',
      });
    }

    if (action === 'activateDeviceByCode') {
      const code = requiredText(body.deviceCode, 'Código do aparelho', 80).toUpperCase();
      const device = await getDeviceByCode(supabase, code);
      if (!device) return json({ error: 'Aparelho não encontrado.' }, 404);
      if (device.is_playlist_validation_device === true) {
        return json({ error: 'Este aparelho está reservado para homologação de listas.' }, 409);
      }
      if (device.seller_id && device.seller_id !== seller.id) {
        return json({ error: 'Este aparelho já está vinculado a outro vendedor.' }, 409);
      }

      const customerName = requiredText(body.customerName, 'Nome do cliente', 180);
      const whatsapp = normalizeWhatsapp(body.customerWhatsapp);
      if (!whatsapp) return json({ error: 'WhatsApp do cliente é obrigatório.' }, 400);
      const plan = await getActivePlanForCharge(supabase, textOrNull(body.planId, 80));
      const playlist = await getAllowedSellerPlaylist(
        supabase,
        seller.id,
        textOrNull(body.playlistId, 80),
      );
      const backupId = textOrNull(body.backupPlaylistId, 80);
      if (backupId === playlist.id) {
        return json({ error: 'A lista reserva deve ser diferente da principal.' }, 400);
      }
      if (backupId) await getAllowedSellerPlaylist(supabase, seller.id, backupId);

      const customerId = await upsertSellerCustomer(supabase, seller.id, customerName, whatsapp);
      const expiresAt = requiredText(body.expiresAt, 'Data de expiração', 80);
      const creditConsumption = await applySellerDeviceSubscription(supabase, seller, {
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId,
        customerName,
        planId: plan.id,
        playlistId: playlist.id,
        backupPlaylistId: backupId,
        expiresAt,
        type: 'activation',
        idempotencyKey: requiredText(body.idempotencyKey, 'Chave de idempotência', 200),
      });
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
        backupPlaylistId: backupId,
        expiresAt,
        creditConsumption,
        message: creditConsumption.applied
          ? 'Aparelho ativado com sucesso.'
          : 'Esta ativação já havia sido processada.',
      });
    }

    if (action === 'renewDevice') {
      const deviceId = requiredText(body.deviceId, 'ID do aparelho', 80);
      const device = await getOwnedDevice(supabase, seller.id, deviceId);
      if (device.is_playlist_validation_device === true) {
        return json({ error: 'Este aparelho está reservado para homologação de listas.' }, 409);
      }
      const plan = await getActivePlanForCharge(
        supabase,
        textOrNull(body.planId, 80) || device.plan_id || null,
      );
      const playlist = await getAllowedSellerPlaylist(
        supabase,
        seller.id,
        textOrNull(body.playlistId, 80) || device.playlist_id || null,
      );
      const currentBackup = (device.device_playlists || [])
        .find((item: any) => Number(item.priority) === 2 && item.active !== false);
      const backupId = Object.prototype.hasOwnProperty.call(body, 'backupPlaylistId')
        ? textOrNull(body.backupPlaylistId, 80)
        : one(currentBackup?.playlist)?.id || null;
      if (backupId === playlist.id) {
        return json({ error: 'A lista reserva deve ser diferente da principal.' }, 400);
      }
      if (backupId) await getAllowedSellerPlaylist(supabase, seller.id, backupId);
      const customer = one(device.customer);
      const expiresAt = requiredText(body.expiresAt, 'Data de expiração', 80);
      const creditConsumption = await applySellerDeviceSubscription(supabase, seller, {
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId: device.customer_id || null,
        customerName: customer?.name || null,
        planId: plan.id,
        playlistId: playlist.id,
        backupPlaylistId: backupId,
        expiresAt,
        type: 'renewal',
        idempotencyKey: requiredText(body.idempotencyKey, 'Chave de idempotência', 200),
      });
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
      const deviceId = requiredText(body.deviceId, 'ID do aparelho', 80);
      const device = await getOwnedDevice(supabase, seller.id, deviceId);
      const status = normalizeDeviceStatus(body.status || 'blocked');
      if (!['blocked', 'inactive', 'expired', 'active'].includes(status)) {
        return json({ error: 'Status não permitido.' }, 400);
      }
      const { error } = await supabase
        .from('panel_devices')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', device.id);
      if (error) return json({ error: 'Não foi possível atualizar o aparelho.' }, 500);
      return json({ ok: true, deviceId, status, message: 'Status do aparelho atualizado.' });
    }

    if (action === 'deleteDevice') {
      const deviceId = requiredText(body.deviceId, 'ID do aparelho', 80);
      const device = await getOwnedDevice(supabase, seller.id, deviceId);
      const { error } = await supabase
        .from('panel_devices')
        .delete()
        .eq('id', device.id)
        .eq('seller_id', seller.id);
      if (error) return json({ error: 'Não foi possível excluir o aparelho.' }, 500);
      await writeAudit(
        supabase,
        'device.deleted_by_seller',
        'device',
        device.id,
        `Aparelho ${device.device_code} excluído pelo vendedor`,
        { sellerId: seller.id, deviceCode: device.device_code },
      );
      return json({ ok: true, deviceId, message: 'Aparelho excluído com sucesso.' });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, CORS);
    const message = redact(
      error instanceof Error ? error.message : 'Erro inesperado no portal do vendedor.',
      500,
    );
    console.error('seller-panel falhou.', {
      name: error instanceof Error ? error.name : 'unknown',
      message,
    });
    return json({ error: message || 'Erro inesperado no portal do vendedor.' }, 500);
  }
});
