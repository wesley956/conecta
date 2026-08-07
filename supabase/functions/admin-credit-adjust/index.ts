import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function requiredUuid(value: unknown, label: string) {
  const id = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${label} inválido.`);
  }
  return id;
}

function requiredInteger(value: unknown) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount === 0) throw new Error('Informe um ajuste inteiro diferente de zero.');
  if (Math.abs(amount) > 1_000_000) throw new Error('O ajuste excede o limite permitido.');
  return amount;
}

function requiredText(value: unknown, label: string, max: number) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  if (text.length > max) throw new Error(`${label} excede ${max} caracteres.`);
  return text;
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin']);
    const body = await request.json().catch(() => ({}));

    const sellerId = requiredUuid(body?.sellerId, 'ID do vendedor');
    const amount = requiredInteger(body?.amount);
    const description = requiredText(body?.description, 'Motivo do ajuste', 500);
    const idempotencyKey = requiredText(body?.idempotencyKey, 'Chave de idempotência', 200);

    const { data, error } = await supabase.rpc('admin_adjust_seller_credit_transaction', {
      p_seller_id: sellerId,
      p_amount: amount,
      p_description: description,
      p_performed_by_user_id: principal.userId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error(error.message);

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw new Error('A transação de créditos não retornou resultado.');

    return json({
      ok: true,
      applied: result.applied !== false,
      ledgerId: result.ledger_id ?? null,
      balanceBefore: Number(result.balance_before ?? 0),
      balanceAfter: Number(result.balance_after ?? 0),
      movementType: result.movement_type ?? (amount > 0 ? 'manual_add' : 'manual_remove'),
      message: result.applied === false
        ? 'Este ajuste já havia sido registrado.'
        : 'Ajuste de créditos registrado com sucesso.',
    });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('Falha no ajuste administrativo de créditos internos.', {
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: error instanceof Error ? error.message : 'Falha inesperada no ajuste de créditos.' }, 400);
  }
});
