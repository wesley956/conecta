import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function text(value: unknown, limit: number) {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.length <= limit ? normalized : null;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Servidor não configurado.' }, 500);

    const payload = await request.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    const deviceCode = text(payload.deviceCode, 80);
    const deviceUuid = text(payload.deviceUuid, 160);
    const credential = text(request.headers.get('x-device-credential'), 256);
    if (!deviceCode || !deviceUuid || !credential) return json({ error: 'Identidade incompleta.' }, 400);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: device, error } = await supabase
      .from('panel_devices')
      .select('id, device_uuid, device_credential_hash')
      .eq('device_code', deviceCode)
      .maybeSingle();
    if (error || !device?.device_credential_hash) return json({ error: 'Aparelho não encontrado.' }, 404);
    if (device.device_uuid !== deviceUuid) return json({ error: 'Identidade do aparelho inválida.' }, 403);

    const credentialHash = await sha256Hex(credential);
    if (!constantTimeEqual(credentialHash, String(device.device_credential_hash))) {
      return json({ error: 'Credencial do aparelho inválida.' }, 403);
    }

    const now = new Date().toISOString();
    const { data: unlinked, error: unlinkError } = await supabase
      .from('panel_devices')
      .update({
        status: 'inactive',
        device_uuid: null,
        device_credential_hash: null,
        credential_issued_at: null,
        last_seen_at: now,
        updated_at: now,
      })
      .eq('id', device.id)
      .eq('device_uuid', deviceUuid)
      .eq('device_credential_hash', device.device_credential_hash)
      .select('id')
      .maybeSingle();

    if (unlinkError || !unlinked) return json({ error: 'Não foi possível concluir o desvínculo.' }, 409);
    return json({ ok: true, unlinked: true, status: 'inactive' });
  } catch (error) {
    console.error('device-unlink:', { name: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'Não foi possível desvincular este aparelho.' }, 500);
  }
});
