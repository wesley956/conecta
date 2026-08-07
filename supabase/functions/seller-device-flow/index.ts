import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BODY_BYTES = 32 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Input = Record<string, unknown>;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function readBody(request: Request): Promise<Input> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error('Requisição excede o limite permitido.');
  }
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Input : {};
  } catch {
    throw new Error('Corpo JSON inválido.');
  }
}

function requiredText(value: unknown, label: string, max = 500) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} é obrigatório.`);
  if (normalized.length > max) throw new Error(`${label} excede o limite permitido.`);
  return normalized;
}

function optionalText(value: unknown, max = 500) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new Error('Texto excede o limite permitido.');
  return normalized;
}

function uuid(value: unknown, label: string, required = true) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    if (required) throw new Error(`${label} é obrigatório.`);
    return null;
  }
  if (!UUID.test(normalized)) throw new Error(`${label} inválido.`);
  return normalized;
}

function optionalTimestamp(value: unknown) {
  const normalized = optionalText(value, 80);
  if (!normalized) return null;
  if (!Number.isFinite(Date.parse(normalized))) throw new Error('Data de validade inválida.');
  return normalized;
}

function normalizedPhone(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function hasAny(input: Input, names: string[]) {
  return names.some(name => Object.prototype.hasOwnProperty.call(input, name)
    && input[name] !== null && input[name] !== undefined && String(input[name]).trim() !== '');
}

function safeMessage(value: unknown) {
  return String(value ?? 'Falha inesperada.')
    .replace(/([?&](?:username|user|login|password|pass|token|key|secret|auth)=)[^&\s]+/gi, '$1[protegido]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [protegido]')
    .slice(0, 500);
}

function successMessage(action: string, result: Record<string, unknown>) {
  if (result.idempotentReplay === true || result.applied === false) {
    return 'Esta operação já havia sido processada. Nenhuma cobrança foi duplicada.';
  }
  if (action === 'renew') return 'Aparelho renovado. Cliente e listas foram preservados.';
  if (action === 'changePlaylists') {
    return result.confirmationStatus === 'confirmed'
      ? 'Listas alteradas sem consumir crédito ou mudar a validade.'
      : 'Listas alteradas. O aplicativo fará a confirmação automática.';
  }
  return result.confirmationStatus === 'confirmed'
    ? 'Aparelho ativado com sucesso.'
    : 'Aparelho ativado. O aplicativo confirmará a lista automaticamente.';
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']);
    const input = await readBody(request);
    const action = requiredText(input.action, 'Ação', 80);
    if (!['activate', 'renew', 'changePlaylists'].includes(action)) {
      return json({ error: 'Ação comercial inválida.' }, 400);
    }

    const sellerId = principal.role === 'seller'
      ? principal.sellerId!
      : uuid(input.sellerId, 'Vendedor');
    const deviceId = uuid(input.deviceId, 'Aparelho');
    const idempotencyKey = requiredText(input.idempotencyKey, 'Chave de idempotência', 200);

    let operationType: 'activation' | 'renewal' | 'change_playlists';
    let planId: string | null = null;
    let primaryPlaylistId: string | null = null;
    let backupPlaylistId: string | null = null;
    let expiresAt: string | null = null;
    let customerId: string | null = null;
    let customerName: string | null = null;
    let customerWhatsapp: string | null = null;
    let reason: string | null = null;

    if (action === 'activate') {
      operationType = 'activation';
      planId = uuid(input.planId, 'Plano');
      primaryPlaylistId = uuid(input.playlistId, 'Lista principal');
      backupPlaylistId = uuid(input.backupPlaylistId, 'Lista reserva', false);
      if (backupPlaylistId && backupPlaylistId === primaryPlaylistId) {
        throw new Error('A lista reserva deve ser diferente da principal.');
      }
      expiresAt = optionalTimestamp(input.expiresAt);
      customerId = uuid(input.customerId, 'Cliente', false);
      if (!customerId) {
        customerName = requiredText(input.customerName, 'Nome do cliente', 180);
        const phone = normalizedPhone(input.customerWhatsapp);
        if (phone.length < 10 || phone.length > 15) throw new Error('WhatsApp do cliente inválido.');
        customerWhatsapp = phone;
      }
    } else if (action === 'renew') {
      operationType = 'renewal';
      if (hasAny(input, ['customerId', 'customerName', 'customerWhatsapp', 'playlistId', 'backupPlaylistId'])) {
        throw new Error('Renovação não altera cliente nem listas. Use a ação correspondente para essas mudanças.');
      }
      planId = uuid(input.planId, 'Plano');
      expiresAt = optionalTimestamp(input.expiresAt);
    } else {
      operationType = 'change_playlists';
      if (hasAny(input, ['customerId', 'customerName', 'customerWhatsapp', 'planId', 'expiresAt'])) {
        throw new Error('Alterar listas não muda cliente, plano ou validade.');
      }
      primaryPlaylistId = uuid(input.playlistId, 'Lista principal');
      backupPlaylistId = uuid(input.backupPlaylistId, 'Lista reserva', false);
      if (backupPlaylistId && backupPlaylistId === primaryPlaylistId) {
        throw new Error('A lista reserva deve ser diferente da principal.');
      }
      reason = optionalText(input.reason, 500) || 'Alteração solicitada no painel';
    }

    const { data, error } = await supabase.rpc('seller_device_flow_transaction', {
      p_seller_id: sellerId,
      p_device_id: deviceId,
      p_operation_type: operationType,
      p_idempotency_key: idempotencyKey,
      p_plan_id: planId,
      p_primary_playlist_id: primaryPlaylistId,
      p_backup_playlist_id: backupPlaylistId,
      p_expires_at: expiresAt,
      p_customer_id: customerId,
      p_customer_name: customerName,
      p_customer_whatsapp: customerWhatsapp,
      p_reason: reason,
      p_performed_by: `${principal.role}:${principal.userId}`,
      p_performed_by_user_id: principal.userId,
    });
    if (error) throw new Error(error.message || 'Falha na operação comercial.');

    const result = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    return json({ ok: true, result, message: successMessage(action, result) });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, CORS);
    return json({ error: safeMessage(error instanceof Error ? error.message : error) }, 400);
  }
});
