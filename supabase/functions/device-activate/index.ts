import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
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

function makeDeviceCredential() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  const binary = String.fromCharCode(...bytes);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
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

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await request.json();
    return payload && typeof payload === 'object'
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function findSellerByCode(supabase: any, sellerCode: string | null) {
  if (!sellerCode) return null;

  const { data, error } = await supabase
    .from('panel_sellers')
    .select('id, name, status, public_code')
    .eq('public_code', sellerCode.toLowerCase())
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
        const { error: updateError } = await supabase
          .from('panel_customers')
          .update(updates)
          .eq('id', existing.id);

        if (updateError) {
          throw new Error(`Falha ao atualizar cliente: ${updateError.message}`);
        }
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

async function issueCredentialIfMissing(
  supabase: any,
  deviceId: string,
  existingHash: string | null,
) {
  if (existingHash) return null;

  const deviceCredential = makeDeviceCredential();
  const deviceCredentialHash = await sha256Hex(deviceCredential);
  const issuedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('panel_devices')
    .update({
      device_credential_hash: deviceCredentialHash,
      credential_issued_at: issuedAt,
      updated_at: issuedAt,
    })
    .eq('id', deviceId)
    .is('device_credential_hash', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao emitir credencial do aparelho: ${error.message}`);
  }

  // Outra requisição pode ter emitido a credencial primeiro. Nesse caso, não
  // revelamos um segredo que não corresponde ao hash salvo.
  return data ? deviceCredential : null;
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ active: false, message: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ active: false, message: 'Servidor não configurado.' }, 500);
  }

  const payload = await readPayload(request);
  const deviceUuid = String(payload.deviceUuid ?? '').trim();
  const deviceType = String(payload.deviceType ?? 'androidtv').trim() || 'androidtv';
  const appVersion = textOrNull(payload.appVersion);
  const customerName = textOrNull(payload.customerName);
  const customerWhatsapp = normalizeWhatsapp(payload.customerWhatsapp) || null;
  const sellerCode = textOrNull(payload.sellerCode);
  const lastIp = getClientIp(request);

  if (!deviceUuid) {
    return json({
      active: false,
      status: 'pending',
      message: 'Identificador do aparelho não informado.',
    }, 400);
  }

  if (deviceUuid.length > 160) {
    return json({
      active: false,
      status: 'pending',
      message: 'Identificador do aparelho inválido.',
    }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const seller = sellerCode ? await findSellerByCode(supabase, sellerCode) : null;

    if (sellerCode && !seller) {
      return json({
        active: false,
        status: 'pending',
        message: 'Código público do vendedor não encontrado.',
      }, 404);
    }

    const sellerId = seller?.id ?? null;
    const customerId = await upsertBasicCustomer(
      supabase,
      customerName,
      customerWhatsapp,
      sellerId,
    );

    const { data: existingDevice, error: existingError } = await supabase
      .from('panel_devices')
      .select(`
        id,
        device_code,
        device_uuid,
        device_credential_hash,
        client_name,
        status,
        subscription_expires_at,
        customer_id,
        seller_id
      `)
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
      const { error: updateError } = await supabase
        .from('panel_devices')
        .update(baseUpdate)
        .eq('id', existingDevice.id)
        .eq('device_uuid', deviceUuid);

      if (updateError) {
        return json({
          active: false,
          status: 'pending',
          message: updateError.message,
        }, 500);
      }

      const deviceCredential = await issueCredentialIfMissing(
        supabase,
        existingDevice.id,
        existingDevice.device_credential_hash,
      );

      return json({
        active: existingDevice.status === 'active',
        status: existingDevice.status,
        deviceCode: existingDevice.device_code,
        deviceCredential,
        credentialIssued: Boolean(deviceCredential),
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

    const deviceCredential = makeDeviceCredential();
    const deviceCredentialHash = await sha256Hex(deviceCredential);
    const issuedAt = new Date().toISOString();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const deviceCode = makeDeviceCode();

      const { data, error } = await supabase
        .from('panel_devices')
        .insert({
          device_code: deviceCode,
          device_uuid: deviceUuid,
          device_credential_hash: deviceCredentialHash,
          credential_issued_at: issuedAt,
          client_name: customerName,
          customer_id: customerId,
          seller_id: sellerId,
          status: 'pending',
          device_type: deviceType,
          app_version: appVersion,
          last_ip: lastIp,
          last_seen_at: issuedAt,
          updated_at: issuedAt,
        })
        .select('id, device_code, status')
        .single();

      if (!error && data) {
        return json({
          active: false,
          status: 'pending',
          deviceCode: data.device_code,
          deviceCredential,
          credentialIssued: true,
          clientName: customerName,
          customerName,
          customerWhatsapp,
          sellerLinked: Boolean(sellerId),
          sellerName: seller?.name ?? null,
          message: 'Código criado. Envie este código ao vendedor/admin para liberar o acesso.',
        });
      }

      const message = String(error?.message ?? '');

      if (!message.includes('duplicate') && !message.includes('unique')) {
        return json({ active: false, status: 'pending', message }, 500);
      }

      // Se o conflito foi no UUID ou no hash, outra requisição criou o aparelho.
      // O cliente deve repetir a ativação para consultar o registro já existente.
      if (
        message.includes('device_uuid') ||
        message.includes('device_credential_hash')
      ) {
        return json({
          active: false,
          status: 'pending',
          message: 'Aparelho criado por outra solicitação. Atualize a liberação.',
        }, 409);
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
