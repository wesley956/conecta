import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seller-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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

function daysLeft(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
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
        )
      `)
      .eq('seller_id', seller.id)
      .order('created_at', { ascending: false });

    if (devicesError) {
      return json({ error: devicesError.message }, 500);
    }

    const { data: ledger, error: ledgerError } = await supabase
      .from('panel_credit_ledger')
      .select('id, amount, type, reference_id, description, balance_after, created_at')
      .eq('seller_id', seller.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (ledgerError) {
      return json({ error: ledgerError.message }, 500);
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
      planName: device.plan?.name || null,
      planDurationDays: device.plan?.duration_days ?? null,
      planCreditCost: device.plan?.credit_cost ?? null,
    }));

    return json({
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
      creditLedger: (ledger ?? []).map((entry: any) => ({
        id: entry.id,
        amount: entry.amount,
        type: entry.type,
        referenceId: entry.reference_id,
        description: entry.description,
        balanceAfter: entry.balance_after,
        createdAt: entry.created_at,
      })),
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Erro inesperado no portal do vendedor.',
    }, 500);
  }
});
