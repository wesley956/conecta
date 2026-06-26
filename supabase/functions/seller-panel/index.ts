import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seller-token',
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
    throw new Error('Escolha um plano para ativar o aparelho.');
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

async function getActivePlaylist(supabase: any, playlistId: string | null) {
  if (!playlistId) {
    throw new Error('Escolha uma lista para ativar o aparelho.');
  }

  const { data: playlist, error } = await supabase
    .from('panel_playlists')
    .select('id, name, active')
    .eq('id', playlistId)
    .single();

  if (error || !playlist) {
    throw new Error(`Lista não encontrada: ${error?.message || 'não encontrada'}`);
  }

  if (playlist.active === false) {
    throw new Error('Lista inativa. Escolha uma lista ativa.');
  }

  return playlist;
}

async function consumeSellerCredits(
  supabase: any,
  seller: any,
  payload: {
    deviceId: string;
    deviceCode?: string | null;
    type: 'activation' | 'renewal';
    creditCost: number;
    planName?: string | null;
    customerName?: string | null;
  },
) {
  const cost = Math.max(1, Math.floor(Number(payload.creditCost || 1)));

  const { data: freshSeller, error: sellerError } = await supabase
    .from('panel_sellers')
    .select('id, name, status, credit_balance, can_go_negative')
    .eq('id', seller.id)
    .single();

  if (sellerError || !freshSeller) {
    throw new Error(`Vendedor não encontrado: ${sellerError?.message || 'não encontrado'}`);
  }

  if (freshSeller.status !== 'active') {
    throw new Error('Vendedor bloqueado ou inativo. Não é possível consumir crédito.');
  }

  const currentBalance = Number(freshSeller.credit_balance || 0);
  const balanceAfter = currentBalance - cost;

  if (balanceAfter < 0 && freshSeller.can_go_negative !== true) {
    throw new Error(`Saldo insuficiente. Saldo atual: ${currentBalance}. Custo: ${cost}.`);
  }

  const duplicateSince = new Date(Date.now() - 15000).toISOString();

  const { data: recentCharge, error: recentChargeError } = await supabase
    .from('panel_credit_ledger')
    .select('id, created_at')
    .eq('seller_id', seller.id)
    .eq('reference_id', payload.deviceId)
    .eq('type', payload.type)
    .gte('created_at', duplicateSince)
    .limit(1);

  if (recentChargeError) {
    throw new Error(`Falha ao verificar cobrança duplicada: ${recentChargeError.message}`);
  }

  if ((recentCharge ?? []).length > 0) {
    throw new Error('Operação duplicada detectada. Aguarde alguns segundos antes de tentar novamente.');
  }

  const customerText = payload.customerName ? ` — cliente ${payload.customerName}` : '';
  const planText = payload.planName ? ` — plano ${payload.planName}` : '';

  const description =
    `${payload.type === 'activation' ? 'Ativação' : 'Renovação'} do aparelho ${payload.deviceCode || payload.deviceId}` +
    customerText +
    planText;

  const { error: updateError } = await supabase
    .from('panel_sellers')
    .update({
      credit_balance: balanceAfter,
      updated_at: new Date().toISOString(),
    })
    .eq('id', seller.id);

  if (updateError) {
    throw new Error(`Falha ao atualizar saldo do vendedor: ${updateError.message}`);
  }

  const { error: ledgerError } = await supabase
    .from('panel_credit_ledger')
    .insert({
      seller_id: seller.id,
      amount: -cost,
      type: payload.type,
      reference_id: payload.deviceId,
      description,
      balance_after: balanceAfter,
      performed_by: `seller:${seller.id}`,
    });

  if (ledgerError) {
    throw new Error(`Falha ao registrar extrato de crédito: ${ledgerError.message}`);
  }

  return {
    sellerId: seller.id,
    sellerName: freshSeller.name,
    amount: -cost,
    balanceBefore: currentBalance,
    balanceAfter,
    type: payload.type,
    description,
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

async function getDashboard(supabase: any, seller: any) {
  const { data: devices, error: devicesError } = await supabase
    .from('panel_devices')
    .select(`
      id,
      device_code,
      device_uuid,
      customer_id,
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
        credit_cost,
        max_devices,
        status
      ),
      playlist:panel_playlists (
        id,
        name,
        active
      )
    `)
    .eq('seller_id', seller.id)
    .order('created_at', { ascending: false });

  if (devicesError) {
    throw new Error(devicesError.message);
  }

  const { data: ledger, error: ledgerError } = await supabase
    .from('panel_credit_ledger')
    .select('id, amount, type, reference_id, description, balance_after, created_at')
    .eq('seller_id', seller.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (ledgerError) {
    throw new Error(ledgerError.message);
  }

  const { data: plans, error: plansError } = await supabase
    .from('panel_plans')
    .select('id, name, duration_days, credit_cost, max_devices, status')
    .eq('status', 'active')
    .order('duration_days', { ascending: true });

  if (plansError) {
    throw new Error(plansError.message);
  }

  const { data: playlists, error: playlistsError } = await supabase
    .from('panel_playlists')
    .select('id, name, playlist_type, active, playlist_updated_at')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (playlistsError) {
    throw new Error(playlistsError.message);
  }

  const normalizedDevices = (devices ?? []).map((device: any) => ({
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
    customerName: device.customer?.name || null,
    customerWhatsapp: device.customer?.whatsapp || null,
    planId: device.plan?.id || null,
    planName: device.plan?.name || null,
    planDurationDays: device.plan?.duration_days ?? null,
    planCreditCost: device.plan?.credit_cost ?? null,
    playlistId: device.playlist?.id || null,
    playlistName: device.playlist?.name || null,
  }));

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
    playlists: (playlists ?? []).map((playlist: any) => ({
      id: playlist.id,
      name: playlist.name,
      playlistType: playlist.playlist_type,
      active: playlist.active,
      playlistUpdatedAt: playlist.playlist_updated_at,
    })),
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const sellerToken = String(req.headers.get('x-seller-token') || '').trim();

    if (!sellerToken) {
      return json({ error: 'Token do vendedor não informado.' }, 401);
    }

    const supabase = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );

    const { data: seller, error: sellerError } = await supabase
      .from('panel_sellers')
      .select('id, name, whatsapp, email, status, credit_balance, can_go_negative, created_at, updated_at')
      .eq('access_token', sellerToken)
      .single();

    if (sellerError || !seller) {
      return json({ error: 'Token do vendedor inválido.' }, 401);
    }

    if (seller.status !== 'active') {
      return json({ error: 'Vendedor bloqueado ou inativo.' }, 403);
    }

    const url = new URL(req.url);
    const body = await readBody(req);
    const action = String(body.action || url.searchParams.get('action') || 'dashboard').trim();

    if (action === 'dashboard' || action === 'list') {
      return json(await getDashboard(supabase, seller));
    }

    if (action === 'claimPendingDevice') {
      const deviceCode = requiredText(body.deviceCode, 'Código do aparelho').toUpperCase();

      const { data: device, error: deviceError } = await supabase
        .from('panel_devices')
        .select('id, device_code, seller_id, status')
        .eq('device_code', deviceCode)
        .maybeSingle();

      if (deviceError) {
        return json({ error: deviceError.message }, 500);
      }

      if (!device) {
        return json({ error: 'Aparelho não encontrado. Confira o código enviado pelo cliente.' }, 404);
      }

      if (device.seller_id && device.seller_id !== seller.id) {
        return json({ error: 'Este aparelho já está vinculado a outro vendedor.' }, 409);
      }

      if (device.status !== 'pending' && device.seller_id !== seller.id) {
        return json({ error: `Aparelho não está pendente. Status atual: ${device.status}.` }, 400);
      }

      const { error: updateError } = await supabase
        .from('panel_devices')
        .update({
          seller_id: seller.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', device.id);

      if (updateError) {
        return json({ error: updateError.message }, 500);
      }

      return json({
        ok: true,
        deviceId: device.id,
        deviceCode: device.device_code,
        status: device.status,
        message: 'Aparelho vinculado ao vendedor. Agora ele pode ser ativado.',
      });
    }

    if (action === 'activateDeviceByCode') {
      const deviceCode = requiredText(body.deviceCode, 'Código do aparelho').toUpperCase();
      const customerName = requiredText(body.customerName, 'Nome do cliente');
      const customerWhatsapp = normalizeWhatsapp(body.customerWhatsapp);

      if (!customerWhatsapp) {
        return json({ error: 'WhatsApp do cliente é obrigatório.' }, 400);
      }

      const plan = await getActivePlanForCharge(supabase, textOrNull(body.planId));
      const playlist = await getActivePlaylist(supabase, textOrNull(body.playlistId));

      const { data: device, error: deviceError } = await supabase
        .from('panel_devices')
        .select('id, device_code, seller_id, status')
        .eq('device_code', deviceCode)
        .maybeSingle();

      if (deviceError) {
        return json({ error: deviceError.message }, 500);
      }

      if (!device) {
        return json({ error: 'Aparelho não encontrado. Confira o código enviado pelo cliente.' }, 404);
      }

      if (device.seller_id && device.seller_id !== seller.id) {
        return json({ error: 'Este aparelho já está vinculado a outro vendedor.' }, 409);
      }

      if (device.status === 'active') {
        return json({ error: 'Este aparelho já está ativo. Use renovação em vez de ativação.' }, 400);
      }

      const customerId = await upsertSellerCustomer(supabase, seller.id, customerName, customerWhatsapp);

      const creditConsumption = await consumeSellerCredits(supabase, seller, {
        deviceId: device.id,
        deviceCode: device.device_code,
        type: 'activation',
        creditCost: plan.creditCost,
        planName: plan.name,
        customerName,
      });

      const expiresAt = textOrNull(body.expiresAt) || addDaysFromNow(plan.durationDays);

      const { error: updateError } = await supabase
        .from('panel_devices')
        .update({
          seller_id: seller.id,
          customer_id: customerId,
          client_name: customerName,
          plan_id: plan.id,
          playlist_id: playlist.id,
          status: 'active',
          subscription_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', device.id);

      if (updateError) {
        return json({ error: updateError.message }, 500);
      }

      return json({
        ok: true,
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId,
        planId: plan.id,
        planName: plan.name,
        playlistId: playlist.id,
        playlistName: playlist.name,
        expiresAt,
        creditConsumption,
        message: 'Aparelho ativado com sucesso.',
      });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Erro inesperado no portal do vendedor.',
    }, 500);
  }
});
