import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JsonBody = Record<string, unknown>;
type Principal = {
  userId: string;
  email: string | null;
  role: 'owner' | 'admin' | 'seller';
  sellerId: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function readBody(request: Request): Promise<JsonBody> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as JsonBody : {};
  } catch {
    return {};
  }
}

function textOrNull(value: unknown, maxLength = 4000) {
  const valueText = String(value ?? '').trim();
  if (!valueText) return null;
  if (valueText.length > maxLength) throw new Error('Texto excede o tamanho permitido.');
  return valueText;
}

function requiredText(value: unknown, label: string, maxLength = 4000) {
  const text = textOrNull(value, maxLength);
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
}

function uuidOrNull(value: unknown) {
  const text = textOrNull(value, 80);
  if (!text) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error('Identificador inválido.');
  }
  return text;
}

function positiveInteger(value: unknown, label: string) {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${label} deve ser maior que zero.`);
  }
  return numberValue;
}

function normalizeWhatsapp(value: unknown) {
  return String(value ?? '').replace(/\D/g, '').trim();
}

function normalizeRecordType(value: unknown) {
  const type = String(value ?? 'income').trim().toLowerCase();
  if (!['income', 'expense'].includes(type)) throw new Error('Tipo financeiro inválido.');
  return type;
}

function normalizeStatus(value: unknown, dueDate: string | null = null) {
  let status = String(value ?? 'pending').trim().toLowerCase();
  if (!['paid', 'pending', 'overdue', 'cancelled'].includes(status)) {
    throw new Error('Status financeiro inválido.');
  }
  if (status === 'pending' && dueDate && dueDate < new Date().toISOString().slice(0, 10)) {
    status = 'overdue';
  }
  return status;
}

function normalizePaymentMethod(value: unknown) {
  const method = String(value ?? 'pix').trim().toLowerCase();
  if (!['pix', 'cash', 'card', 'bank_transfer', 'boleto', 'other'].includes(method)) {
    throw new Error('Forma de pagamento inválida.');
  }
  return method;
}

function normalizeCategory(value: unknown, recordType: string) {
  const category = String(value ?? '').trim().toLowerCase();
  if (category) return category.slice(0, 100);
  return recordType === 'expense' ? 'other_expense' : 'other_income';
}

function normalizeDate(value: unknown, label: string) {
  const text = textOrNull(value, 10);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) {
    throw new Error(`${label} inválida.`);
  }
  return text;
}

function normalizeTimestamp(value: unknown, label: string) {
  const text = textOrNull(value, 80);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} inválida.`);
  return date.toISOString();
}

function monthRange(body: JsonBody) {
  const now = new Date();
  const defaultFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const dateFrom = normalizeDate(body.dateFrom, 'Data inicial') || defaultFrom;
  const dateTo = normalizeDate(body.dateTo, 'Data final') || defaultTo;
  if (dateFrom > dateTo) throw new Error('A data inicial não pode ser posterior à data final.');
  return { dateFrom, dateTo };
}

function effectiveStatus(record: any) {
  if (record.status === 'pending' && record.due_date && record.due_date < new Date().toISOString().slice(0, 10)) {
    return 'overdue';
  }
  return record.status;
}

function mapRecord(record: any) {
  const status = effectiveStatus(record);
  return {
    id: record.id,
    recordType: record.record_type,
    source: record.source,
    category: record.category,
    sellerId: record.seller_id || null,
    sellerName: record.seller?.name || record.seller_name_snapshot || null,
    customerId: record.customer_id || null,
    customerName: record.customer?.name || record.customer_name_snapshot || null,
    customerWhatsapp: record.customer?.whatsapp || null,
    deviceId: record.device_id || null,
    deviceCode: record.device?.device_code || record.device_code_snapshot || null,
    planId: record.plan_id || null,
    planName: record.plan?.name || record.plan_name_snapshot || null,
    description: record.description,
    amountCents: Number(record.amount_cents || 0),
    currency: record.currency || 'BRL',
    paymentMethod: record.payment_method,
    status,
    dueDate: record.due_date || null,
    paidAt: record.paid_at || null,
    referenceDate: record.reference_date,
    notes: record.notes || null,
    createdByRole: record.created_by_role,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function refreshOverdue(supabase: any, principal: Principal) {
  let query = supabase
    .from('panel_financial_records')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', new Date().toISOString().slice(0, 10));

  if (principal.role === 'seller') query = query.eq('seller_id', principal.sellerId);
  const { error } = await query;
  if (error) console.error('Falha ao atualizar títulos vencidos.', { code: error.code || null });
}

function recordsSelect() {
  return `
    id,
    record_type,
    source,
    category,
    seller_id,
    customer_id,
    device_id,
    plan_id,
    seller_name_snapshot,
    customer_name_snapshot,
    device_code_snapshot,
    plan_name_snapshot,
    description,
    amount_cents,
    currency,
    payment_method,
    status,
    due_date,
    paid_at,
    reference_date,
    notes,
    created_by_role,
    created_at,
    updated_at,
    seller:panel_sellers(id, name),
    customer:panel_customers(id, name, whatsapp),
    device:panel_devices(id, device_code),
    plan:panel_plans(id, name)
  `;
}

async function listRecords(supabase: any, principal: Principal, body: JsonBody) {
  await refreshOverdue(supabase, principal);
  const { dateFrom, dateTo } = monthRange(body);
  const limit = Math.min(500, Math.max(1, Number(body.limit || 300)));

  let query = supabase
    .from('panel_financial_records')
    .select(recordsSelect())
    .gte('reference_date', dateFrom)
    .lte('reference_date', dateTo)
    .order('reference_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (principal.role === 'seller') {
    query = query.eq('seller_id', principal.sellerId).eq('record_type', 'income');
  } else if (body.sellerId) {
    query = query.eq('seller_id', uuidOrNull(body.sellerId));
  }

  if (body.recordType) query = query.eq('record_type', normalizeRecordType(body.recordType));
  if (body.status) query = query.eq('status', normalizeStatus(body.status));
  if (body.paymentMethod) query = query.eq('payment_method', normalizePaymentMethod(body.paymentMethod));

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar financeiro: ${error.message}`);
  return { records: (data || []).map(mapRecord), dateFrom, dateTo };
}

async function listAllRecordsForSummary(supabase: any, principal: Principal, body: JsonBody, dateFrom: string, dateTo: string) {
  const pageSize = 1000;
  const records: any[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('panel_financial_records')
      .select(recordsSelect())
      .gte('reference_date', dateFrom)
      .lte('reference_date', dateTo)
      .order('reference_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (principal.role === 'seller') {
      query = query.eq('seller_id', principal.sellerId).eq('record_type', 'income');
    } else if (body.sellerId) {
      query = query.eq('seller_id', uuidOrNull(body.sellerId));
    }

    if (body.recordType) query = query.eq('record_type', normalizeRecordType(body.recordType));
    if (body.status) query = query.eq('status', normalizeStatus(body.status));
    if (body.paymentMethod) query = query.eq('payment_method', normalizePaymentMethod(body.paymentMethod));

    const { data, error } = await query;
    if (error) throw new Error(`Falha ao consolidar o financeiro: ${error.message}`);
    const page = (data || []).map(mapRecord);
    records.push(...page);
    if (page.length < pageSize) break;
  }

  return records;
}

function summarize(records: any[]) {
  const paidIncome = records
    .filter(record => record.recordType === 'income' && record.status === 'paid')
    .reduce((total, record) => total + record.amountCents, 0);
  const paidExpenses = records
    .filter(record => record.recordType === 'expense' && record.status === 'paid')
    .reduce((total, record) => total + record.amountCents, 0);
  const pending = records
    .filter(record => record.recordType === 'income' && record.status === 'pending')
    .reduce((total, record) => total + record.amountCents, 0);
  const overdue = records
    .filter(record => record.recordType === 'income' && record.status === 'overdue')
    .reduce((total, record) => total + record.amountCents, 0);
  const paidSales = records.filter(record => record.recordType === 'income' && record.status === 'paid');
  const ticketAverage = paidSales.length ? Math.round(paidIncome / paidSales.length) : 0;

  return {
    paidIncomeCents: paidIncome,
    paidExpensesCents: paidExpenses,
    confirmedCashResultCents: paidIncome - paidExpenses,
    pendingIncomeCents: pending,
    overdueIncomeCents: overdue,
    paidSalesCount: paidSales.length,
    ticketAverageCents: ticketAverage,
    recordsCount: records.length,
  };
}

function sellerSummary(records: any[]) {
  const grouped = new Map<string, any>();
  for (const record of records) {
    const key = record.sellerId || 'without-seller';
    const current = grouped.get(key) || {
      sellerId: record.sellerId,
      sellerName: record.sellerName || 'Sem vendedor',
      paidCents: 0,
      pendingCents: 0,
      overdueCents: 0,
      salesCount: 0,
    };
    if (record.recordType === 'income' && record.status !== 'cancelled') {
      current.salesCount += 1;
      if (record.status === 'paid') current.paidCents += record.amountCents;
      if (record.status === 'pending') current.pendingCents += record.amountCents;
      if (record.status === 'overdue') current.overdueCents += record.amountCents;
    }
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((left, right) => right.paidCents - left.paidCents);
}

async function loadEntitySnapshots(supabase: any, payload: {
  sellerId: string | null;
  customerId: string | null;
  deviceId: string | null;
  planId: string | null;
}) {
  const result: Record<string, any> = {};

  if (payload.sellerId) {
    const { data } = await supabase.from('panel_sellers').select('id, name, status').eq('id', payload.sellerId).maybeSingle();
    if (!data) throw new Error('Vendedor não encontrado.');
    if (data.status !== 'active') throw new Error('Vendedor bloqueado ou inativo.');
    result.seller = data;
  }
  if (payload.customerId) {
    const { data } = await supabase.from('panel_customers').select('id, name, whatsapp, seller_id').eq('id', payload.customerId).maybeSingle();
    if (!data) throw new Error('Cliente não encontrado.');
    result.customer = data;
  }
  if (payload.deviceId) {
    const { data } = await supabase.from('panel_devices').select('id, device_code, seller_id, customer_id').eq('id', payload.deviceId).maybeSingle();
    if (!data) throw new Error('Aparelho não encontrado.');
    result.device = data;
  }
  if (payload.planId) {
    const { data } = await supabase.from('panel_plans').select('id, name, status').eq('id', payload.planId).maybeSingle();
    if (!data) throw new Error('Plano não encontrado.');
    result.plan = data;
  }

  return result;
}

async function createRecord(supabase: any, principal: Principal, body: JsonBody) {
  let recordType = normalizeRecordType(body.recordType);
  let sellerId = uuidOrNull(body.sellerId);

  if (principal.role === 'seller') {
    recordType = 'income';
    sellerId = principal.sellerId;
  }

  const customerId = uuidOrNull(body.customerId);
  const deviceId = uuidOrNull(body.deviceId);
  const planId = uuidOrNull(body.planId);
  const amountCents = positiveInteger(body.amountCents, 'Valor');
  const dueDate = normalizeDate(body.dueDate, 'Vencimento');
  const status = normalizeStatus(body.status, dueDate);
  const paidAt = status === 'paid'
    ? normalizeTimestamp(body.paidAt, 'Data do pagamento') || new Date().toISOString()
    : null;
  const snapshots = await loadEntitySnapshots(supabase, { sellerId, customerId, deviceId, planId });
  const referenceDate = normalizeDate(body.referenceDate, 'Data de referência')
    || (paidAt ? paidAt.slice(0, 10) : new Date().toISOString().slice(0, 10));

  if (principal.role === 'seller') {
    if (snapshots.customer?.seller_id && snapshots.customer.seller_id !== principal.sellerId) {
      throw new Error('Este cliente não pertence ao vendedor autenticado.');
    }
    if (snapshots.device?.seller_id && snapshots.device.seller_id !== principal.sellerId) {
      throw new Error('Este aparelho não pertence ao vendedor autenticado.');
    }
  }

  if (recordType === 'income' && deviceId) {
    const { data: automaticRecord, error: duplicateError } = await supabase
      .from('panel_financial_records')
      .select('id')
      .eq('device_id', deviceId)
      .eq('reference_date', referenceDate)
      .in('source', ['device_activation', 'device_renewal'])
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle();
    if (duplicateError) throw new Error(`Falha ao verificar duplicidade: ${duplicateError.message}`);
    if (automaticRecord) {
      throw new Error('Já existe uma venda automática para este aparelho nesta data. Atualize o registro existente em vez de criar uma receita duplicada.');
    }
  }

  const insert = {
    record_type: recordType,
    source: 'manual',
    category: normalizeCategory(body.category, recordType),
    seller_id: sellerId,
    customer_id: customerId,
    device_id: deviceId,
    plan_id: planId,
    seller_name_snapshot: snapshots.seller?.name || null,
    customer_name_snapshot: snapshots.customer?.name || textOrNull(body.customerName, 180),
    device_code_snapshot: snapshots.device?.device_code || null,
    plan_name_snapshot: snapshots.plan?.name || null,
    description: requiredText(body.description, 'Descrição', 300),
    amount_cents: amountCents,
    payment_method: normalizePaymentMethod(body.paymentMethod),
    status,
    due_date: dueDate,
    paid_at: paidAt,
    reference_date: referenceDate,
    notes: textOrNull(body.notes, 2000),
    idempotency_key: textOrNull(body.idempotencyKey, 200),
    created_by_user_id: principal.userId,
    created_by_role: principal.role,
  };

  const { data, error } = await supabase
    .from('panel_financial_records')
    .insert(insert)
    .select('id')
    .single();

  if (error) throw new Error(`Falha ao registrar movimentação: ${error.message}`);

  await supabase.from('panel_audit_logs').insert({
    action: `finance.${recordType}.created`,
    entity_type: 'financial_record',
    entity_id: data.id,
    description: `${recordType === 'income' ? 'Receita' : 'Despesa'} registrada: ${insert.description}`,
    metadata: {
      amountCents,
      status,
      paymentMethod: insert.payment_method,
      sellerId,
      performedByUserId: principal.userId,
      performedByRole: principal.role,
    },
  });

  return { ok: true, id: data.id };
}

async function getScopedRecord(supabase: any, principal: Principal, id: string) {
  let query = supabase.from('panel_financial_records').select('*').eq('id', id);
  if (principal.role === 'seller') query = query.eq('seller_id', principal.sellerId).eq('record_type', 'income');
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error('Movimentação financeira não encontrada.');
  return data;
}

async function updateRecord(supabase: any, principal: Principal, body: JsonBody) {
  const id = requiredText(body.id, 'ID da movimentação', 80);
  const current = await getScopedRecord(supabase, principal, id);
  const updates: Record<string, unknown> = {};
  const isAutomatic = current.source !== 'manual';

  if (isAutomatic && ['description', 'amountCents', 'category', 'dueDate', 'referenceDate', 'recordType']
    .some(field => field in body)) {
    throw new Error('Vendas automáticas preservam valor, origem e referência. Altere somente pagamento, status ou observação.');
  }

  if ('description' in body) updates.description = requiredText(body.description, 'Descrição', 300);
  if ('notes' in body) updates.notes = textOrNull(body.notes, 2000);
  if ('amountCents' in body) updates.amount_cents = positiveInteger(body.amountCents, 'Valor');
  if ('paymentMethod' in body) updates.payment_method = normalizePaymentMethod(body.paymentMethod);
  if ('category' in body) updates.category = normalizeCategory(body.category, current.record_type);
  if ('dueDate' in body) updates.due_date = normalizeDate(body.dueDate, 'Vencimento');
  if ('referenceDate' in body) updates.reference_date = normalizeDate(body.referenceDate, 'Data de referência');

  if ('status' in body) {
    const status = normalizeStatus(body.status, String(updates.due_date || current.due_date || '') || null);
    updates.status = status;
    updates.paid_at = status === 'paid'
      ? normalizeTimestamp(body.paidAt, 'Data do pagamento') || current.paid_at || new Date().toISOString()
      : null;
  }

  if (principal.role === 'admin' && 'recordType' in body) {
    updates.record_type = normalizeRecordType(body.recordType);
  }

  const { error } = await supabase.from('panel_financial_records').update(updates).eq('id', id);
  if (error) throw new Error(`Falha ao atualizar movimentação: ${error.message}`);

  await supabase.from('panel_audit_logs').insert({
    action: 'finance.record.updated',
    entity_type: 'financial_record',
    entity_id: id,
    description: 'Movimentação financeira atualizada',
    metadata: { updates, performedByUserId: principal.userId, performedByRole: principal.role },
  });

  return { ok: true, id };
}

async function deleteRecord(supabase: any, principal: Principal, body: JsonBody) {
  if (!['owner', 'admin'].includes(principal.role)) throw new PanelAuthError('Somente administradores podem excluir movimentações.', 403);
  const id = requiredText(body.id, 'ID da movimentação', 80);
  const current = await getScopedRecord(supabase, principal, id);
  if (current.source !== 'manual') {
    throw new Error('Uma venda automática não pode ser excluída. Cancele o registro para preservar o histórico da operação.');
  }

  const { error } = await supabase.from('panel_financial_records').delete().eq('id', id);
  if (error) throw new Error(`Falha ao excluir movimentação: ${error.message}`);

  await supabase.from('panel_audit_logs').insert({
    action: 'finance.record.deleted',
    entity_type: 'financial_record',
    entity_id: id,
    description: 'Movimentação financeira excluída',
    metadata: { performedByUserId: principal.userId },
  });

  return { ok: true, id };
}

async function upsertSellerCustomer(supabase: any, sellerId: string, name: string, whatsapp: string) {
  const { data: existing, error: findError } = await supabase
    .from('panel_customers')
    .select('id, name, seller_id')
    .eq('seller_id', sellerId)
    .eq('whatsapp', whatsapp)
    .maybeSingle();

  if (findError) throw new Error(`Falha ao localizar cliente: ${findError.message}`);
  if (existing) {
    if (existing.name !== name) {
      const { error } = await supabase.from('panel_customers').update({ name, updated_at: new Date().toISOString() }).eq('id', existing.id);
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
  let device: any = null;
  if (body.deviceId) {
    const { data, error } = await supabase
      .from('panel_devices')
      .select('id, device_code, seller_id, customer_id, client_name, status, subscription_expires_at, plan_id, playlist_id')
      .eq('id', uuidOrNull(body.deviceId))
      .maybeSingle();
    if (error) throw new Error(`Falha ao buscar aparelho: ${error.message}`);
    device = data;
  } else {
    const deviceCode = requiredText(body.deviceCode, 'Código do aparelho', 40).toUpperCase();
    const { data, error } = await supabase
      .from('panel_devices')
      .select('id, device_code, seller_id, customer_id, client_name, status, subscription_expires_at, plan_id, playlist_id')
      .eq('device_code', deviceCode)
      .maybeSingle();
    if (error) throw new Error(`Falha ao buscar aparelho: ${error.message}`);
    device = data;
  }

  if (!device) throw new Error('Aparelho não encontrado.');
  if (principal.role === 'seller' && device.seller_id && device.seller_id !== principal.sellerId) {
    throw new PanelAuthError('Este aparelho pertence a outro vendedor.', 403);
  }
  return device;
}

async function activateOrRenew(supabase: any, principal: Principal, body: JsonBody) {
  const operationType = String(body.operationType || 'activation').trim().toLowerCase();
  if (!['activation', 'renewal'].includes(operationType)) throw new Error('Operação comercial inválida.');

  const device = await getDeviceForOperation(supabase, principal, body);
  const sellerId = principal.role === 'seller'
    ? principal.sellerId
    : uuidOrNull(body.sellerId) || device.seller_id;
  if (!sellerId) throw new Error('Escolha o vendedor responsável.');

  let customerId = uuidOrNull(body.customerId) || device.customer_id || null;
  let customerName = textOrNull(body.customerName, 180) || device.client_name || null;

  if (principal.role === 'seller' && operationType === 'activation') {
    customerName = requiredText(body.customerName, 'Nome do cliente', 180);
    const whatsapp = normalizeWhatsapp(body.customerWhatsapp);
    if (!whatsapp) throw new Error('WhatsApp do cliente é obrigatório.');
    customerId = await upsertSellerCustomer(supabase, sellerId, customerName, whatsapp);
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

  const expiresAt = normalizeTimestamp(body.expiresAt, 'Validade');
  if (!expiresAt || new Date(expiresAt) <= new Date()) throw new Error('A validade precisa estar no futuro.');
  const idempotencyKey = requiredText(body.idempotencyKey, 'Chave de idempotência', 200);

  const amountCents = body.amountCents === null || body.amountCents === undefined || body.amountCents === ''
    ? null
    : positiveInteger(body.amountCents, 'Valor financeiro');
  const dueDate = normalizeDate(body.dueDate, 'Vencimento financeiro');
  const financeStatus = amountCents ? normalizeStatus(body.financeStatus || 'pending', dueDate) : null;
  const paymentMethod = amountCents ? normalizePaymentMethod(body.paymentMethod) : null;
  const paidAt = financeStatus === 'paid'
    ? normalizeTimestamp(body.paidAt, 'Data do pagamento') || new Date().toISOString()
    : null;

  const { data, error } = await supabase.rpc('apply_device_subscription_with_finance', {
    p_seller_id: sellerId,
    p_device_id: device.id,
    p_plan_id: planId,
    p_playlist_id: playlistId,
    p_backup_playlist_id: backupPlaylistId,
    p_expires_at: expiresAt,
    p_operation_type: operationType,
    p_performed_by: principal.role,
    p_idempotency_key: idempotencyKey,
    p_customer_id: customerId,
    p_client_name: customerName,
    p_enforce_seller_ownership: principal.role === 'seller',
    p_finance_amount_cents: amountCents,
    p_finance_status: financeStatus,
    p_payment_method: paymentMethod,
    p_due_date: dueDate,
    p_paid_at: paidAt,
    p_finance_notes: textOrNull(body.financeNotes, 2000),
    p_finance_description: textOrNull(body.financeDescription, 300),
    p_created_by_user_id: principal.userId,
    p_created_by_role: principal.role,
  });

  if (error) throw new Error(`Falha na operação comercial: ${error.message}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('A operação comercial não retornou resultado.');

  await supabase.from('panel_audit_logs').insert({
    action: operationType === 'activation' ? 'device.activated_with_finance' : 'device.renewed_with_finance',
    entity_type: 'device',
    entity_id: device.id,
    description: `${operationType === 'activation' ? 'Ativação' : 'Renovação'} processada com módulo financeiro`,
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
      performedByRole: principal.role,
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
  };
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']) as Principal;
    const body = await readBody(request);
    const action = String(body.action || 'dashboard').trim();

    if (action === 'dashboard' || action === 'listRecords') {
      const result = await listRecords(supabase, principal, body);
      const summaryRecords = await listAllRecordsForSummary(
        supabase,
        principal,
        body,
        result.dateFrom,
        result.dateTo,
      );
      return json({
        ok: true,
        ...result,
        summary: summarize(summaryRecords),
        sellerSummary: principal.role !== 'seller' ? sellerSummary(summaryRecords) : [],
      });
    }

    if (action === 'createRecord') return json(await createRecord(supabase, principal, body), 201);
    if (action === 'updateRecord') return json(await updateRecord(supabase, principal, body));
    if (action === 'deleteRecord') return json(await deleteRecord(supabase, principal, body));
    if (action === 'activateDeviceWithFinance') return json(await activateOrRenew(supabase, principal, { ...body, operationType: 'activation' }));
    if (action === 'renewDeviceWithFinance') return json(await activateOrRenew(supabase, principal, { ...body, operationType: 'renewal' }));

    return json({ error: 'Ação financeira inválida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('Falha no módulo financeiro.', {
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: error instanceof Error ? error.message : 'Falha inesperada no módulo financeiro.' }, 400);
  }
});
