import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const activationRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = activationRateLimit.get(key);

  if (!current || current.resetAt <= now) {
    activationRateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  current.count += 1;

  if (current.count > RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  return true;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    null
  );
}

function makeDeviceCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';

  crypto.getRandomValues(new Uint8Array(6)).forEach(value => {
    suffix += chars[value % chars.length];
  });

  return `RPTV-${suffix}`;
}

function normalizeWhatsapp(value: unknown) {
  return String(value ?? '')
    .replace(/[^\d+]/g, '')
    .trim();
}

function textOrNull(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeSellerCode(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  return text || null;
}

function isValidSellerPublicCode(value: string | null) {
  if (!value) return false;
  return /^[a-z0-9][a-z0-9-]{2,63}$/.test(value);
}

async function readPayload(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function findSellerByCode(supabase: any, sellerCode: string | null) {
  if (!sellerCode) return null;

  const { data, error } = await supabase
    .from('panel_sellers')
    .select('id, name, status, public_code')
    .eq('public_code', sellerCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao localizar vendedor: ${error.message}`);
  }

  if (!data) return null;

  if (data.status !== 'active') {
    throw new Error('Código de vendedor bloqueado ou inativo.');
  }

  return data;
}

async function upsertBasicCustomer(
  supabase: any,
  customerName: string | null,
  customerWhatsapp: string | null,
  sellerId: string | null,
) {
  if (!customerName && !customerWhatsapp) return null;

  const safeName = customerName || 'Cliente sem nome';
  const safeWhatsapp = customerWhatsapp || 'sem-whatsapp';

  if (customerWhatsapp) {
    const { data: existing, error: findError } = await supabase
      .from('panel_customers')
      .select('id, name, whatsapp, seller_id')
      .eq('whatsapp', customerWhatsapp)
      .limit(1)
      .maybeSingle();

    if (findError) {
      throw new Error(`Falha ao buscar cliente: ${findError.message}`);
    }

    if (existing) {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (customerName && existing.name !== customerName) updates.name = customerName;
      if (sellerId && !existing.seller_id) updates.seller_id = sellerId;

      if (Object.keys(updates).length > 1) {
        await supabase.from('panel_customers').update(updates).eq('id', existing.id);
      }

      return existing.id;
    }
  }

  const { data: created, error: createError } = await supabase
    .from('panel_customers')
    .insert({
      name: safeName,
      whatsapp: safeWhatsapp,
      status: 'active',
      seller_id: sellerId,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createError) {
    throw new Error(`Falha ao criar cliente básico: ${createError.message}`);
  }

  return created.id;
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ active: false, message: 'Método não permitido. Use POST.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ active: false, message: 'Servidor não configurado.' }, 500);
  }

  const payload = await readPayload(request);
  const deviceUuid = (textOrNull(payload.deviceUuid) ?? textOrNull(payload.device_uuid) ?? textOrNull(payload.deviceId) ?? textOrNull(payload.device_id) ?? '').slice(0, 128);
  const deviceType = String(payload.deviceType ?? payload.device_type ?? 'androidtv').trim().slice(0, 40) || 'androidtv';
  const appVersion = (textOrNull(payload.appVersion) ?? textOrNull(payload.app_version))?.slice(0, 40) ?? null;
  const customerName = (textOrNull(payload.customerName) ?? textOrNull(payload.customer_name))?.slice(0, 120) ?? null;
  const customerWhatsapp = normalizeWhatsapp(payload.customerWhatsapp ?? payload.customer_whatsapp).slice(0, 32) || null;
  const sellerCode = normalizeSellerCode(payload.sellerCode ?? payload.seller_code ?? payload.publicCode ?? payload.public_code);
  const lastIp = getClientIp(request);
  const rateLimitKey = `${lastIp || 'unknown'}:${sellerCode || 'sem-vendedor'}`;

  if (!checkRateLimit(rateLimitKey)) {
    return json({
      active: false,
      status: 'pending',
      message: 'Muitas tentativas de ativação. Aguarde um minuto e tente novamente.',
    }, 429);
  }

  if (!deviceUuid) {
    return json({
      active: false,
      status: 'pending',
      message: 'Identificador do aparelho não informado.',
    }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
      if (!sellerCode) {
        return json({
          active: false,
          status: 'pending',
          message: 'Informe o código público do vendedor.',
        }, 400);
      }

      if (!isValidSellerPublicCode(sellerCode)) {
        return json({
          active: false,
          status: 'pending',
          message: 'Código público do vendedor inválido.',
        }, 400);
      }

    const seller = await findSellerByCode(supabase, sellerCode);

      if (!seller) {
        return json({
          active: false,
          status: 'pending',
          message: 'Código público do vendedor não encontrado.',
        }, 404);
      }
    const sellerId = seller.id;
    const customerId = await upsertBasicCustomer(supabase, customerName, customerWhatsapp, sellerId);

    const { data: existingDevice, error: existingError } = await supabase
      .from('panel_devices')
      .select('id, device_code, client_name, status, subscription_expires_at, customer_id, seller_id')
      .eq('device_uuid', deviceUuid)
      .maybeSingle();

    if (existingError) {
      return json({ active: false, status: 'pending', message: existingError.message }, 500);
    }

    const baseUpdate: Record<string, unknown> = {
      device_type: deviceType,
      app_version: appVersion,
      last_ip: lastIp,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (customerName) baseUpdate.client_name = customerName;
    if (customerId) baseUpdate.customer_id = customerId;
    if (sellerId) baseUpdate.seller_id = sellerId;

    if (existingDevice) {
      await supabase
        .from('panel_devices')
        .update(baseUpdate)
        .eq('id', existingDevice.id);

      return json({
        active: existingDevice.status === 'active',
        status: existingDevice.status,
        deviceCode: existingDevice.device_code,
        clientName: customerName || existingDevice.client_name,
        customerName,
        customerWhatsapp,
        sellerLinked: Boolean(sellerId || existingDevice.seller_id),
        sellerName: seller?.name ?? null,
        expiresAt: existingDevice.subscription_expires_at,
        message: existingDevice.status === 'active'
          ? 'Aparelho já ativo.'
          : 'Aparelho aguardando liberação no painel.',
      });
    }

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const deviceCode = makeDeviceCode();

      const { data, error } = await supabase
        .from('panel_devices')
        .insert({
          device_code: deviceCode,
          device_uuid: deviceUuid,
          client_name: customerName,
          customer_id: customerId,
          seller_id: sellerId,
          status: 'pending',
          device_type: deviceType,
          app_version: appVersion,
          last_ip: lastIp,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id, device_code, status')
        .single();

      if (!error && data) {
        return json({
          active: false,
          status: 'pending',
          deviceCode: data.device_code,
          clientName: customerName,
          customerName,
          customerWhatsapp,
          sellerLinked: Boolean(sellerId),
          sellerName: seller?.name ?? null,
          message: 'Aparelho criado e aguardando liberação no painel.',
        });
      }

      const message = String(error?.message ?? '');

      if (!message.includes('duplicate') && !message.includes('unique')) {
        return json({ active: false, status: 'pending', message }, 500);
      }
    }

    return json({
      active: false,
      status: 'pending',
      message: 'Não foi possível gerar um código único para o aparelho.',
    }, 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no cadastro do aparelho.';
    return json({ active: false, status: 'pending', message }, 400);
  }
});
