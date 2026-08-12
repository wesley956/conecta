import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  genericSupportProfile,
  resolveSystemSupportProfile,
} from '../_shared/supportProfile.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_REQUEST_BYTES = 16 * 1024;

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
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeWhatsapp(value: unknown) {
  return String(value ?? '').replace(/[^\d+]/g, '').trim();
}

function textOrNull(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw new Error('PAYLOAD_TOO_LARGE');

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    const payload = JSON.parse(raw);
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  } catch (error) {
    if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') throw error;
    return {};
  }
}

async function consumeActivationLimit(
  supabase: any,
  key: string,
  limit: number,
  metadata: Record<string, unknown>,
) {
  const keyHash = await sha256Hex(key);
  const { data, error } = await supabase.rpc('consume_device_activation_rate_limit', {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: 3600,
    p_metadata: metadata,
  });
  if (error) throw new Error(`Falha ao validar limite de ativação: ${error.message}`);
  return data === true;
}

async function upsertBasicCustomer(
  supabase: any,
  customerName: string | null,
  customerWhatsapp: string | null,
  sellerId: string | null,
) {
  if (!customerWhatsapp) return null;

  const safeName = customerName || 'Cliente sem nome';
  const normalizedWhatsapp = customerWhatsapp.replace(/\D/g, '');
  let existingQuery = supabase
    .from('panel_customers')
    .select('id, name, whatsapp, seller_id')
    .eq('whatsapp_normalized', normalizedWhatsapp);

  existingQuery = sellerId
    ? existingQuery.eq('seller_id', sellerId)
    : existingQuery.is('seller_id', null);

  const { data: existing, error: findError } = await existingQuery.limit(1).maybeSingle();
  if (findError) throw new Error(`Falha ao buscar cliente: ${findError.message}`);

  if (existing) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (customerName && existing.name !== customerName) updates.name = customerName;
    if (Object.keys(updates).length > 1) {
      const { error: updateError } = await supabase
        .from('panel_customers')
        .update(updates)
        .eq('id', existing.id);
      if (updateError) throw new Error(`Falha ao atualizar cliente: ${updateError.message}`);
    }
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from('panel_customers')
    .insert({
      name: safeName,
      whatsapp: customerWhatsapp,
      status: 'active',
      seller_id: sellerId,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createError) throw new Error(`Falha ao criar cliente básico: ${createError.message}`);
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

  if (error) throw new Error(`Falha ao emitir credencial do aparelho: ${error.message}`);
  return data ? deviceCredential : null;
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ active: false, message: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ active: false, message: 'Servidor não configurado.' }, 500);

  let payload: Record<string, unknown>;
  try {
    payload = await readPayload(request);
  } catch {
    return json({
      active: false,
      status: 'pending',
      message: 'Solicitação de ativação excede o tamanho permitido.',
    }, 413);
  }

  const deviceUuid = String(payload.deviceUuid ?? '').trim();
  const deviceType = String(payload.deviceType ?? 'androidtv').trim() || 'androidtv';
  const appVersion = textOrNull(payload.appVersion);
  const customerName = textOrNull(payload.customerName);
  const customerWhatsapp = normalizeWhatsapp(payload.customerWhatsapp) || null;
  const lastIp = getClientIp(request);

  if (!deviceUuid) {
    return json({ active: false, status: 'pending', message: 'Identificador do aparelho não informado.' }, 400);
  }
  if (deviceUuid.length > 160) {
    return json({ active: false, status: 'pending', message: 'Identificador do aparelho inválido.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const supportProfile = await resolveSystemSupportProfile(supabase).catch(() => genericSupportProfile());

  try {
    const limitMetadata = {
      ip: lastIp,
      deviceUuidHash: await sha256Hex(deviceUuid),
      appVersion,
    };
    const ipAllowed = lastIp
      ? await consumeActivationLimit(supabase, `ip:${lastIp}`, 30, limitMetadata)
      : true;
    const deviceAllowed = await consumeActivationLimit(supabase, `device:${deviceUuid}`, 10, limitMetadata);

    if (!ipAllowed || !deviceAllowed) {
      return json({
        active: false,
        status: 'pending',
        message: 'Muitas tentativas de ativação. Aguarde antes de tentar novamente.',
      }, 429);
    }

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

    // O vendedor nunca é escolhido pelo aplicativo. Em aparelho existente o
    // vínculo atual é apenas preservado; em aparelho novo ele nasce nulo e o
    // código RPTV é usado no painel para vincular/ativar comercialmente.
    const preservedSellerId = existingDevice?.seller_id || null;
    const customerId = await upsertBasicCustomer(
      supabase,
      customerName,
      customerWhatsapp,
      preservedSellerId,
    );

    const baseUpdate: Record<string, unknown> = {
      device_type: deviceType,
      app_version: appVersion,
      last_ip: lastIp,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (customerName) baseUpdate.client_name = customerName;
    if (customerId) baseUpdate.customer_id = customerId;

    if (existingDevice) {
      const { error: updateError } = await supabase
        .from('panel_devices')
        .update(baseUpdate)
        .eq('id', existingDevice.id)
        .eq('device_uuid', deviceUuid);

      if (updateError) {
        return json({ active: false, status: 'pending', message: updateError.message }, 500);
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
        sellerLinked: Boolean(preservedSellerId),
        sellerName: null,
        supportProfile,
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
          seller_id: null,
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
          sellerLinked: false,
          sellerName: null,
          supportProfile,
          message: 'Código criado. Envie este código ao vendedor/admin para liberar o acesso.',
        });
      }

      const message = String(error?.message ?? '');
      if (!message.includes('duplicate') && !message.includes('unique')) {
        return json({ active: false, status: 'pending', message }, 500);
      }

      if (message.includes('device_uuid') || message.includes('device_credential_hash')) {
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
