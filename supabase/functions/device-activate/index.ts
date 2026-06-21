import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'\;
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'\;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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

async function readPayload(request: Request) {
  if (request.method === 'GET') {
    const url = new URL(request.url);

    return {
      deviceUuid: url.searchParams.get('deviceUuid'),
      deviceType: url.searchParams.get('deviceType'),
      appVersion: url.searchParams.get('appVersion'),
    };
  }

  try {
    return await request.json();
  } catch {
    return {};
  }
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
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
  const appVersion = String(payload.appVersion ?? '').trim() || null;
  const lastIp = getClientIp(request);

  if (!deviceUuid) {
    return json({
      active: false,
      status: 'pending',
      message: 'Identificador do aparelho não informado.',
    }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existingDevice, error: existingError } = await supabase
    .from('panel_devices')
    .select('id, device_code, client_name, status, subscription_expires_at')
    .eq('device_uuid', deviceUuid)
    .maybeSingle();

  if (existingError) {
    return json({ active: false, status: 'pending', message: existingError.message }, 500);
  }

  if (existingDevice) {
    await supabase
      .from('panel_devices')
      .update({
        device_type: deviceType,
        app_version: appVersion,
        last_ip: lastIp,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingDevice.id);

    return json({
      active: existingDevice.status === 'active',
      status: existingDevice.status,
      deviceCode: existingDevice.device_code,
      clientName: existingDevice.client_name,
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
});
