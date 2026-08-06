import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BODY_BYTES = 64 * 1024;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}
async function body(req: Request) {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('Requisição excede o limite permitido.');
  try { return JSON.parse(raw || '{}') as Record<string, unknown>; } catch { return {}; }
}
function text(value: unknown, label: string, max = 500) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} é obrigatório.`);
  if (result.length > max) throw new Error(`${label} excede o limite permitido.`);
  return result;
}
function optional(value: unknown, max = 500) {
  const result = String(value ?? '').trim();
  if (!result) return null;
  if (result.length > max) throw new Error('Texto excede o limite permitido.');
  return result;
}
function whatsapp(value: unknown) { return String(value ?? '').replace(/[^\d+]/g, '').trim(); }
function safeMessage(value: unknown) {
  return String(value ?? 'Falha inesperada.')
    .replace(/([?&](?:username|user|login|password|pass|token|key|secret|auth)=)[^&\s]+/gi, '$1••••')
    .slice(0, 500);
}
async function getSeller(supabase: any, sellerId: string) {
  const { data, error } = await supabase.from('panel_sellers')
    .select('id,name,status,credit_balance,can_go_negative')
    .eq('id', sellerId).maybeSingle();
  if (error || !data || data.status !== 'active') throw new Error('Vendedor bloqueado, inativo ou não encontrado.');
  return data;
}
async function assertDevice(supabase: any, sellerId: string, deviceId: string) {
  const { data, error } = await supabase.from('panel_devices')
    .select('id,device_code,seller_id,status,device_type,is_playlist_validation_device,plan_id,customer_id,client_name,subscription_expires_at')
    .eq('id', deviceId).maybeSingle();
  if (error || !data) throw new Error('Aparelho não encontrado.');
  if (data.is_playlist_validation_device === true) throw new Error('Este aparelho está reservado para diagnóstico administrativo.');
  if (data.seller_id && data.seller_id !== sellerId) throw new Error('Este aparelho pertence a outro vendedor.');
  return data;
}
async function assertPlaylist(supabase: any, sellerId: string, playlistId: string, label: string) {
  const { data: permission, error: permissionError } = await supabase.from('panel_seller_playlists')
    .select('id').eq('seller_id', sellerId).eq('playlist_id', playlistId).eq('active', true).maybeSingle();
  if (permissionError || !permission) throw new Error(`${label} não está liberada para este vendedor.`);
  const { data, error } = await supabase.from('panel_playlists')
    .select('id,name,active,playlist_qualification_status,playlist_qualification_message,playlist_access_mode')
    .eq('id', playlistId).maybeSingle();
  if (error || !data || data.active !== true) throw new Error(`${label} não existe ou está inativa.`);
  if (data.playlist_qualification_status === 'blocked') throw new Error(`${label} está bloqueada. Corrija os dados antes de utilizar.`);
  return data;
}
async function upsertCustomer(supabase: any, sellerId: string, name: string, phone: string) {
  const { data: existing } = await supabase.from('panel_customers')
    .select('id').eq('seller_id', sellerId).eq('whatsapp', phone).maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('panel_customers').update({ name, whatsapp: phone, status: 'active', updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) throw new Error('Não foi possível atualizar o cliente.');
    return existing.id;
  }
  const { data, error } = await supabase.from('panel_customers')
    .insert({ seller_id: sellerId, name, whatsapp: phone, status: 'active', updated_at: new Date().toISOString() })
    .select('id').single();
  if (error || !data) throw new Error('Não foi possível criar o cliente.');
  return data.id;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const principal = await requirePanelPrincipal(req, supabase, ['seller']);
    const seller = await getSeller(supabase, principal.sellerId!);
    const input = await body(req);
    const action = text(input.action, 'Ação', 80);

    if (action === 'activate') {
      const deviceId = text(input.deviceId, 'Aparelho', 80);
      const device = await assertDevice(supabase, seller.id, deviceId);
      if (device.status === 'active') throw new Error('O aparelho já está ativo. Use renovação ou alteração de listas.');
      const planId = text(input.planId, 'Plano', 80);
      const primaryId = text(input.playlistId, 'Lista principal', 80);
      const backupId = optional(input.backupPlaylistId, 80);
      if (backupId && backupId === primaryId) throw new Error('A lista reserva deve ser diferente da principal.');
      const customerName = text(input.customerName, 'Nome do cliente', 180);
      const customerWhatsapp = whatsapp(input.customerWhatsapp);
      if (!customerWhatsapp) throw new Error('WhatsApp do cliente é obrigatório.');
      const expiresAt = text(input.expiresAt, 'Data de expiração', 80);
      await assertPlaylist(supabase, seller.id, primaryId, 'Lista principal');
      if (backupId) await assertPlaylist(supabase, seller.id, backupId, 'Lista reserva');
      const customerId = await upsertCustomer(supabase, seller.id, customerName, customerWhatsapp);
      const idempotencyKey = text(input.idempotencyKey, 'Chave de idempotência', 200);
      const { data, error } = await supabase.rpc('apply_device_subscription_transaction', {
        p_seller_id: seller.id,
        p_device_id: deviceId,
        p_plan_id: planId,
        p_playlist_id: primaryId,
        p_expires_at: expiresAt,
        p_operation_type: 'activation',
        p_performed_by: `seller:${seller.id}`,
        p_idempotency_key: idempotencyKey,
        p_customer_id: customerId,
        p_client_name: customerName,
        p_enforce_seller_ownership: true,
      });
      if (error) throw new Error(error.message || 'Falha na ativação.');
      const subscription = Array.isArray(data) ? data[0] : data;
      const { data: assignmentData, error: assignmentError } = await supabase.rpc('change_device_playlists_transaction', {
        p_seller_id: seller.id,
        p_device_id: deviceId,
        p_primary_playlist_id: primaryId,
        p_backup_playlist_id: backupId,
        p_reason: 'Listas definidas pelo assistente de ativação',
        p_performed_by: `seller:${seller.id}`,
        p_idempotency_key: `${idempotencyKey}:playlists`,
      });
      if (assignmentError) throw new Error(assignmentError.message || 'A ativação ocorreu, mas as listas não foram sincronizadas.');
      const assignment = Array.isArray(assignmentData) ? assignmentData[0] : assignmentData;
      return json({ ok: true, result: { subscription, assignment }, message: assignment?.confirmation_status === 'confirmed'
        ? 'Aparelho ativado e lista confirmada.'
        : 'Aparelho ativado. O aplicativo confirmará a lista na primeira abertura.' });
    }

    if (action === 'changePlaylists') {
      const deviceId = text(input.deviceId, 'Aparelho', 80);
      await assertDevice(supabase, seller.id, deviceId);
      const primaryId = text(input.playlistId, 'Lista principal', 80);
      const backupId = optional(input.backupPlaylistId, 80);
      if (backupId && backupId === primaryId) throw new Error('A lista reserva deve ser diferente da principal.');
      await assertPlaylist(supabase, seller.id, primaryId, 'Lista principal');
      if (backupId) await assertPlaylist(supabase, seller.id, backupId, 'Lista reserva');
      const { data, error } = await supabase.rpc('change_device_playlists_transaction', {
        p_seller_id: seller.id,
        p_device_id: deviceId,
        p_primary_playlist_id: primaryId,
        p_backup_playlist_id: backupId,
        p_reason: optional(input.reason, 500) || 'Troca de lista solicitada pelo vendedor',
        p_performed_by: `seller:${seller.id}`,
        p_idempotency_key: text(input.idempotencyKey, 'Chave de idempotência', 200),
      });
      if (error) throw new Error(error.message || 'Falha ao alterar as listas.');
      const result = Array.isArray(data) ? data[0] : data;
      return json({ ok: true, result, message: result?.confirmation_status === 'confirmed'
        ? 'Listas alteradas com sucesso, sem renovar a validade.'
        : 'Listas alteradas. O aplicativo fará a confirmação automática.' });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, CORS);
    return json({ error: safeMessage(error instanceof Error ? error.message : error) }, 400);
  }
});
