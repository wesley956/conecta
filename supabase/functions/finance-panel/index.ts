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

function normalizeWhatsapp(value: unknown) {
  const result = String(value ?? '').replace(/\D/g, '');
  if (result.length < 10 || result.length > 15) return '';
  return result;
}

function dateOnly(value: unknown, label: string) {
  const result = cleanText(value, 10);
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${label} inválida.`);
  return result;
}

function timestamp(value: unknown, label: string) {
  const result = cleanText(value, 80);
  if (!result) return null;
  const parsed = new Date(result);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} inválida.`);
  return parsed.toISOString();
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

async function upsertSellerCustomer(supabase: any, sellerId: string, name: string, whatsapp: string) {
  const { data: existing, error: findError } = await supabase
    .from('panel_customers')
    .select('id, name')
    .eq('seller_id', sellerId)
    .eq('whatsapp', whatsapp)
    .maybeSingle();
  if (findError) throw new Error(`Falha ao localizar cliente: ${findError.message}`);

  if (existing) {
    if (existing.name !== name) {
      const { error } = await supabase
        .from('panel_customers')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('seller_id', sellerId);
      if (error) throw new Error(`Falha ao atualizar cliente: ${error.message}`);
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .from('panel_customers')
    .insert({ name, whatsapp, seller_id: sellerId, status: 'active', updated_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Falha ao criar cliente: ${error?.message || 'erro desconhecido'}`);
  return data.id;
}

async function getDeviceForOperation(supabase: any, principal: Principal, body: JsonBody) {
  let query = supabase
    .from('panel_devices')
    .select('id, device_code, seller_id, customer_id, client_name, status, subscription_expires_at, plan_id, playlist_id');

  if (body.deviceId) {
    const id = uuidOrNull(body.deviceId);
    if (!id) throw new Error('Aparelho inválido.');
    query = query.eq('id', id);
  } else {
    const deviceCode = requiredText(body.deviceCode, 'Código do aparelho', 40).toUpperCase();
    query = query.eq('device_code', deviceCode);
  }

  const { data: device, error } = await query.maybeSingle();
  if (error) throw new Error(`Falha ao buscar aparelho: ${error.message}`);
  if (!device) throw new Error('Aparelho não encontrado.');
  if (device.seller_id && device.seller_id !== principal.sellerId) {
    throw new PanelAuthError('Este aparelho pertence a outro vendedor.', 403);
  }
  return device;
}

async function defaultPlanPrice(supabase: any, sellerId: string, planId: string) {
  const { data, error } = await supabase
    .from('panel_seller_plan_prices')
    .select('default_sale_price_cents, active')
    .eq('seller_id', sellerId)
    .eq('plan_id', planId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar preço do plano: ${error.message}`);
  if (!data || data.active === false) return null;
  const amount = Number(data.default_sale_price_cents || 0);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

async function activateOrRenew(supabase: any, principal: Principal, body: JsonBody) {
  const operationType = String(body.operationType || 'activation').trim().toLowerCase();
  if (!['activation', 'renewal'].includes(operationType)) throw new Error('Operação comercial inválida.');

  const device = await getDeviceForOperation(supabase, principal, body);
  const sellerId = principal.sellerId;
  let customerId = uuidOrNull(body.customerId) || device.customer_id || null;
  let customerName = cleanText(body.customerName, 180) || device.client_name || null;

  if (operationType === 'activation') {
    customerName = requiredText(body.customerName, 'Nome do cliente', 180);
    const whatsapp = normalizeWhatsapp(body.customerWhatsapp);
    if (!whatsapp) throw new Error('WhatsApp do cliente é obrigatório.');
    customerId = await upsertSellerCustomer(supabase, sellerId, customerName, whatsapp);
  } else if (customerId) {
    await validateOwnership(supabase, principal, customerId, null);
  }

  const planId = uuidOrNull(body.planId) || device.plan_id;
  const playlistId = uuidOrNull(body.playlistId) || device.playlist_id;
  const backupPlaylistId = uuidOrNull(body.backupPlaylistId);
  if (!planId) throw new Error('Escolha um plano.');
  if (!playlistId) throw new Error('Escolha uma lista principal.');
  if (backupPlaylistId && backupPlaylistId === playlistId) throw new Error('As listas principal e reserva precisam ser diferentes.');

  const { data: plan, error: planError } = await supabase
    .from('panel_plans')
    .select('id, name, status, credit_cost')
    .eq('id', planId)
    .maybeSingle();
  if (planError || !plan || plan.status !== 'active') throw new Error('Plano inexistente ou inativo.');

  const { data: playlist, error: playlistError } = await supabase
    .from('panel_playlists')
    .select('id, name, active, playlist_cache_status')
    .eq('id', playlistId)
    .maybeSingle();
  if (playlistError || !playlist || playlist.active !== true) throw new Error('Lista inexistente ou inativa.');
  if (playlist.playlist_cache_status !== 'ready') throw new Error('O cache da lista principal ainda não está pronto.');

  const expiresAt = timestamp(body.expiresAt, 'Validade');
  if (!expiresAt || new Date(expiresAt) <= new Date()) throw new Error('A validade precisa estar no futuro.');
  const idempotencyKey = requiredText(body.idempotencyKey, 'Chave de idempotência', 200);

  const explicitAmount = body.amountCents === null || body.amountCents === undefined || body.amountCents === ''
    ? null
    : positiveCents(body.amountCents);
  const amountCents = explicitAmount || await defaultPlanPrice(supabase, sellerId, planId);
  const dueDate = dateOnly(body.dueDate, 'Vencimento financeiro');
  const financeStatus = amountCents ? statusOf(body.financeStatus || 'pending', dueDate) : null;
  const method = amountCents ? paymentMethod(body.paymentMethod) : null;
  const paidAt = financeStatus === 'paid'
    ? timestamp(body.paidAt, 'Data do pagamento') || new Date().toISOString()
    : null;

  const { data, error } = await supabase.rpc('apply_device_subscription_with_finance', {
    p_seller_id: sellerId,
    p_device_id: device.id,
    p_plan_id: planId,
    p_playlist_id: playlistId,
    p_backup_playlist_id: backupPlaylistId,
    p_expires_at: expiresAt,
    p_operation_type: operationType,
    p_performed_by: 'seller',
    p_idempotency_key: idempotencyKey,
    p_customer_id: customerId,
    p_client_name: customerName,
    p_enforce_seller_ownership: true,
    p_finance_amount_cents: amountCents,
    p_finance_status: financeStatus,
    p_payment_method: method,
    p_due_date: dueDate,
    p_paid_at: paidAt,
    p_finance_notes: cleanText(body.financeNotes, 2000),
    p_finance_description: cleanText(body.financeDescription, 300),
    p_created_by_user_id: principal.userId,
    p_created_by_role: 'seller',
  });

  if (error) throw new Error(`Falha na operação comercial: ${error.message}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('A operação comercial não retornou resultado.');

  await supabase.from('panel_audit_logs').insert({
    action: operationType === 'activation' ? 'device.activated_with_finance' : 'device.renewed_with_finance',
    entity_type: 'device',
    entity_id: device.id,
    description: `${operationType === 'activation' ? 'Ativação' : 'Renovação'} processada pelo vendedor`,
    metadata: {
      sellerId,
      customerId,
      planId,
      playlistId,
      backupPlaylistId,
      financeRecordId: result.finance_record_id || null,
      amountCents,
      financeStatus,
      performedByUserId: principal.userId,
      performedByRole: 'seller',
    },
  });

  return {
    ok: true,
    applied: result.applied !== false,
    deviceId: device.id,
    deviceCode: device.device_code,
    sellerId,
    customerId,
    planId,
    planName: plan.name,
    playlistId,
    playlistName: playlist.name,
    backupPlaylistId,
    expiresAt: result.subscription_expires_at || expiresAt,
    ledgerId: result.ledger_id || null,
    financeRecordId: result.finance_record_id || null,
    balanceBefore: Number(result.balance_before || 0),
    balanceAfter: Number(result.balance_after || 0),
    saleAmountCents: amountCents,
  };
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
    if (action === 'activateDeviceWithFinance') return json(await activateOrRenew(supabase, principal, { ...body, operationType: 'activation' }));
    if (action === 'renewDeviceWithFinance') return json(await activateOrRenew(supabase, principal, { ...body, operationType: 'renewal' }));
    return json({ error: 'Ação não reconhecida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('Falha no financeiro privado do vendedor.', error);
    return json({ error: error instanceof Error ? error.message : 'Falha interna.' }, 400);
  }
});
