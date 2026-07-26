import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JsonBody = Record<string, unknown>;
type Principal = { userId: string; email: string | null; role: 'seller'; sellerId: string };

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

async function bodyOf(request: Request): Promise<JsonBody> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as JsonBody : {};
  } catch {
    return {};
  }
}

function cleanText(value: unknown, max = 2000) {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new Error('Texto excede o tamanho permitido.');
  return result || null;
}

function requiredText(value: unknown, label: string, max = 300) {
  const result = cleanText(value, max);
  if (!result) throw new Error(`${label} é obrigatório.`);
  return result;
}

function uuidOrNull(value: unknown) {
  const result = cleanText(value, 80);
  if (!result) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error('Identificador inválido.');
  }
  return result;
}

function dateOnly(value: unknown, label: string) {
  const result = cleanText(value, 10);
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${label} inválida.`);
  return result;
}

function recordType(value: unknown) {
  const result = String(value ?? 'income').toLowerCase();
  if (!['income', 'expense'].includes(result)) throw new Error('Tipo financeiro inválido.');
  return result;
}

function statusOf(value: unknown, dueDate: string | null = null) {
  let result = String(value ?? 'pending').toLowerCase();
  if (!['paid', 'pending', 'overdue', 'cancelled'].includes(result)) throw new Error('Status inválido.');
  if (result === 'pending' && dueDate && dueDate < new Date().toISOString().slice(0, 10)) result = 'overdue';
  return result;
}

function paymentMethod(value: unknown) {
  const result = String(value ?? 'pix').toLowerCase();
  if (!['pix', 'cash', 'card', 'bank_transfer', 'boleto', 'other'].includes(result)) throw new Error('Forma de pagamento inválida.');
  return result;
}

function positiveCents(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Valor inválido.');
  return result;
}

function monthRange(body: JsonBody) {
  const now = new Date();
  const fromDefault = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const toDefault = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const dateFrom = dateOnly(body.dateFrom, 'Data inicial') || fromDefault;
  const dateTo = dateOnly(body.dateTo, 'Data final') || toDefault;
  if (dateFrom > dateTo) throw new Error('A data inicial não pode ser posterior à final.');
  return { dateFrom, dateTo };
}

function mapRecord(row: any) {
  const effectiveStatus = row.status === 'pending' && row.due_date && row.due_date < new Date().toISOString().slice(0, 10)
    ? 'overdue'
    : row.status;
  return {
    id: row.id,
    recordType: row.record_type,
    source: row.source,
    category: row.category,
    sellerId: row.seller_id,
    customerId: row.customer_id,
    customerName: row.customer?.name || row.customer_name_snapshot || null,
    deviceId: row.device_id,
    deviceCode: row.device?.device_code || row.device_code_snapshot || null,
    planId: row.plan_id,
    planName: row.plan?.name || row.plan_name_snapshot || null,
    description: row.description,
    amountCents: Number(row.amount_cents || 0),
    paymentMethod: row.payment_method,
    status: effectiveStatus,
    dueDate: row.due_date || null,
    paidAt: row.paid_at || null,
    referenceDate: row.reference_date,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const recordSelect = `
  id, record_type, source, category, seller_id, customer_id, device_id, plan_id,
  customer_name_snapshot, device_code_snapshot, plan_name_snapshot, description,
  amount_cents, payment_method, status, due_date, paid_at, reference_date, notes,
  created_at, updated_at,
  customer:panel_customers(id, name), device:panel_devices(id, device_code), plan:panel_plans(id, name)
`;

async function listRecords(supabase: any, principal: Principal, body: JsonBody) {
  const { dateFrom, dateTo } = monthRange(body);
  let query = supabase
    .from('panel_financial_records')
    .select(recordSelect)
    .eq('financial_scope', 'seller_private')
    .eq('seller_id', principal.sellerId)
    .gte('reference_date', dateFrom)
    .lte('reference_date', dateTo)
    .order('reference_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (body.status) query = query.eq('status', statusOf(body.status));
  if (body.paymentMethod) query = query.eq('payment_method', paymentMethod(body.paymentMethod));
  if (body.recordType) query = query.eq('record_type', recordType(body.recordType));

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar financeiro: ${error.message}`);
  const records = (data || []).map(mapRecord);
  return { records, dateFrom, dateTo };
}

function summarize(records: any[]) {
  const paidIncome = records.filter(r => r.recordType === 'income' && r.status === 'paid').reduce((t, r) => t + r.amountCents, 0);
  const paidExpenses = records.filter(r => r.recordType === 'expense' && r.status === 'paid').reduce((t, r) => t + r.amountCents, 0);
  const pending = records.filter(r => r.recordType === 'income' && r.status === 'pending').reduce((t, r) => t + r.amountCents, 0);
  const overdue = records.filter(r => r.recordType === 'income' && r.status === 'overdue').reduce((t, r) => t + r.amountCents, 0);
  const paidSales = records.filter(r => r.recordType === 'income' && r.status === 'paid');
  return {
    paidIncomeCents: paidIncome,
    paidExpensesCents: paidExpenses,
    confirmedCashResultCents: paidIncome - paidExpenses,
    pendingIncomeCents: pending,
    overdueIncomeCents: overdue,
    paidSalesCount: paidSales.length,
    ticketAverageCents: paidSales.length ? Math.round(paidIncome / paidSales.length) : 0,
    recordsCount: records.length,
  };
}

async function dashboard(supabase: any, principal: Principal, body: JsonBody) {
  const result = await listRecords(supabase, principal, body);
  return { ...result, summary: summarize(result.records) };
}

async function validateOwnership(supabase: any, principal: Principal, customerId: string | null, deviceId: string | null) {
  if (customerId) {
    const { data } = await supabase.from('panel_customers').select('seller_id').eq('id', customerId).maybeSingle();
    if (!data || data.seller_id !== principal.sellerId) throw new Error('Cliente não pertence ao vendedor autenticado.');
  }
  if (deviceId) {
    const { data } = await supabase.from('panel_devices').select('seller_id').eq('id', deviceId).maybeSingle();
    if (!data || data.seller_id !== principal.sellerId) throw new Error('Aparelho não pertence ao vendedor autenticado.');
  }
}

async function createRecord(supabase: any, principal: Principal, body: JsonBody) {
  const type = recordType(body.recordType);
  const customerId = uuidOrNull(body.customerId);
  const deviceId = uuidOrNull(body.deviceId);
  const planId = uuidOrNull(body.planId);
  await validateOwnership(supabase, principal, customerId, deviceId);
  const dueDate = dateOnly(body.dueDate, 'Vencimento');
  const status = statusOf(body.status, dueDate);
  const paidAt = status === 'paid' ? new Date().toISOString() : null;
  const referenceDate = dateOnly(body.referenceDate, 'Data de referência') || (paidAt ? paidAt.slice(0, 10) : new Date().toISOString().slice(0, 10));

  const insert = {
    record_type: type,
    source: 'manual',
    category: cleanText(body.category, 100) || (type === 'expense' ? 'other_expense' : 'other_income'),
    seller_id: principal.sellerId,
    customer_id: customerId,
    device_id: deviceId,
    plan_id: planId,
    description: requiredText(body.description, 'Descrição'),
    amount_cents: positiveCents(body.amountCents),
    payment_method: paymentMethod(body.paymentMethod),
    status,
    due_date: dueDate,
    paid_at: paidAt,
    reference_date: referenceDate,
    notes: cleanText(body.notes),
    idempotency_key: cleanText(body.idempotencyKey, 200),
    created_by_user_id: principal.userId,
    created_by_role: 'seller',
    financial_scope: 'seller_private',
  };

  const { data, error } = await supabase.from('panel_financial_records').insert(insert).select('id').single();
  if (error) throw new Error(`Falha ao registrar movimentação: ${error.message}`);
  return { ok: true, id: data.id };
}

async function scopedRecord(supabase: any, principal: Principal, id: string) {
  const { data, error } = await supabase
    .from('panel_financial_records')
    .select('*')
    .eq('id', id)
    .eq('financial_scope', 'seller_private')
    .eq('seller_id', principal.sellerId)
    .maybeSingle();
  if (error || !data) throw new Error('Movimentação financeira não encontrada.');
  return data;
}

async function updateRecord(supabase: any, principal: Principal, body: JsonBody) {
  const id = uuidOrNull(body.id);
  if (!id) throw new Error('Movimentação inválida.');
  const current = await scopedRecord(supabase, principal, id);
  const updates: Record<string, unknown> = {};
  const automatic = current.source !== 'manual';

  if (automatic && ['description', 'amountCents', 'category', 'dueDate', 'referenceDate', 'recordType'].some(key => key in body)) {
    throw new Error('Vendas automáticas preservam valor e referência.');
  }
  if ('description' in body) updates.description = requiredText(body.description, 'Descrição');
  if ('notes' in body) updates.notes = cleanText(body.notes);
  if ('amountCents' in body) updates.amount_cents = positiveCents(body.amountCents);
  if ('paymentMethod' in body) updates.payment_method = paymentMethod(body.paymentMethod);
  if ('category' in body) updates.category = cleanText(body.category, 100);
  if ('recordType' in body) updates.record_type = recordType(body.recordType);
  if ('dueDate' in body) updates.due_date = dateOnly(body.dueDate, 'Vencimento');
  if ('referenceDate' in body) updates.reference_date = dateOnly(body.referenceDate, 'Data de referência');
  if ('status' in body) {
    const status = statusOf(body.status, String(updates.due_date || current.due_date || '') || null);
    updates.status = status;
    updates.paid_at = status === 'paid' ? current.paid_at || new Date().toISOString() : null;
  }
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase.from('panel_financial_records').update(updates)
    .eq('id', id).eq('financial_scope', 'seller_private').eq('seller_id', principal.sellerId);
  if (error) throw new Error(`Falha ao atualizar movimentação: ${error.message}`);
  return { ok: true, id };
}

async function deleteRecord(supabase: any, principal: Principal, body: JsonBody) {
  const id = uuidOrNull(body.id);
  if (!id) throw new Error('Movimentação inválida.');
  const current = await scopedRecord(supabase, principal, id);
  if (current.source !== 'manual') throw new Error('Uma venda automática não pode ser excluída.');
  const { error } = await supabase.from('panel_financial_records').delete()
    .eq('id', id).eq('financial_scope', 'seller_private').eq('seller_id', principal.sellerId);
  if (error) throw new Error(`Falha ao excluir movimentação: ${error.message}`);
  return { ok: true };
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['seller']) as Principal;
    const body = await bodyOf(request);
    const action = String(body.action || 'dashboard');

    if (action === 'dashboard') return json(await dashboard(supabase, principal, body));
    if (action === 'createRecord') return json(await createRecord(supabase, principal, body));
    if (action === 'updateRecord') return json(await updateRecord(supabase, principal, body));
    if (action === 'deleteRecord') return json(await deleteRecord(supabase, principal, body));
    return json({ error: 'Ação não reconhecida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('Falha no financeiro privado do vendedor.', error);
    return json({ error: error instanceof Error ? error.message : 'Falha interna.' }, 400);
  }
});