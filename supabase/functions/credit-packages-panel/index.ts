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
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function requiredEnv(name: string) {
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

function text(value: unknown, max = 500) {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new Error('Texto excede o tamanho permitido.');
  return result || null;
}

function uuid(value: unknown, label: string) {
  const result = text(value, 80);
  if (!result || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error(`${label} inválido.`);
  }
  return result;
}

function positiveInt(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${label} inválida.`);
  return result;
}

function dateOnly(value: unknown) {
  const result = text(value, 10);
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('Data inválida.');
  return result;
}

function mapOrder(row: any) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.seller?.name || null,
    packageName: row.package_name_snapshot,
    packageCode: row.package_code_snapshot,
    packageQuantity: row.package_quantity,
    creditsTotal: row.credits_total,
    unitPackagePriceCents: Number(row.unit_package_price_cents || 0),
    totalAmountCents: Number(row.total_amount_cents || 0),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    releasePolicy: row.release_policy,
    creditsStatus: row.credits_status,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    releasedAt: row.released_at,
    expiresAt: row.expires_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

async function refreshExpirations(supabase: any, sellerId: string | null = null) {
  const { error } = await supabase.rpc('expire_credit_lots', { p_seller_id: sellerId });
  if (error) console.error('Falha ao processar expiração de créditos.', { code: error.code });
}

async function dashboard(supabase: any, principal: Principal) {
  await refreshExpirations(supabase, principal.role === 'seller' ? principal.sellerId : null);

  const { data: packages, error: packageError } = await supabase
    .from('panel_credit_packages')
    .select('id, code, name, credits, price_cents, validity_days, active, sort_order')
    .eq('active', true)
    .order('sort_order');
  if (packageError) throw new Error(`Falha ao carregar pacotes: ${packageError.message}`);

  let orderQuery = supabase
    .from('panel_credit_orders')
    .select('*, seller:panel_sellers(id, name)')
    .order('created_at', { ascending: false })
    .limit(400);
  if (principal.role === 'seller') orderQuery = orderQuery.eq('seller_id', principal.sellerId);

  const { data: orders, error: orderError } = await orderQuery;
  if (orderError) throw new Error(`Falha ao carregar compras: ${orderError.message}`);

  if (principal.role === 'seller') {
    const { data: seller, error: sellerError } = await supabase
      .from('panel_sellers')
      .select('id, name, credit_balance, financial_credit_limit_cents, allow_credit_purchases_on_terms')
      .eq('id', principal.sellerId)
      .single();
    if (sellerError) throw new Error('Vendedor não encontrado.');

    const { data: lots } = await supabase
      .from('panel_credit_lots')
      .select('credits_remaining, expires_at, status')
      .eq('seller_id', principal.sellerId)
      .eq('status', 'active')
      .gt('credits_remaining', 0)
      .order('expires_at');

    const openDebt = (orders || [])
      .filter((item: any) => ['pending', 'overdue'].includes(item.payment_status))
      .reduce((total: number, item: any) => total + Number(item.total_amount_cents || 0), 0);

    return {
      role: 'seller',
      packages,
      orders: (orders || []).map(mapOrder),
      seller: {
        id: seller.id,
        name: seller.name,
        creditBalance: seller.credit_balance,
        financialCreditLimitCents: Number(seller.financial_credit_limit_cents || 0),
        allowCreditPurchasesOnTerms: seller.allow_credit_purchases_on_terms,
        openDebtCents: openDebt,
      },
      lots: lots || [],
    };
  }

  const { data: sellers, error: sellerError } = await supabase
    .from('panel_sellers')
    .select('id, name, status, credit_balance, financial_credit_limit_cents, allow_credit_purchases_on_terms')
    .order('name');
  if (sellerError) throw new Error(`Falha ao carregar vendedores: ${sellerError.message}`);

  const mappedOrders = (orders || []).map(mapOrder);
  const received = mappedOrders.filter(item => item.paymentStatus === 'paid').reduce((sum, item) => sum + item.totalAmountCents, 0);
  const pending = mappedOrders.filter(item => item.paymentStatus === 'pending').reduce((sum, item) => sum + item.totalAmountCents, 0);
  const overdue = mappedOrders.filter(item => item.paymentStatus === 'overdue').reduce((sum, item) => sum + item.totalAmountCents, 0);
  const creditsSold = mappedOrders.filter(item => item.creditsStatus === 'released').reduce((sum, item) => sum + item.creditsTotal, 0);

  return {
    role: principal.role,
    packages,
    sellers: (sellers || []).map((seller: any) => ({
      id: seller.id,
      name: seller.name,
      status: seller.status,
      creditBalance: seller.credit_balance,
      financialCreditLimitCents: Number(seller.financial_credit_limit_cents || 0),
      allowCreditPurchasesOnTerms: seller.allow_credit_purchases_on_terms,
    })),
    orders: mappedOrders,
    summary: { receivedCents: received, pendingCents: pending, overdueCents: overdue, creditsSold },
  };
}

async function createOrder(supabase: any, principal: Principal, body: JsonBody) {
  if (!['owner', 'admin'].includes(principal.role)) throw new PanelAuthError('Somente o administrador pode vender créditos.', 403);

  const sellerId = uuid(body.sellerId, 'Vendedor');
  const packageId = uuid(body.packageId, 'Pacote');
  const packageQuantity = positiveInt(body.packageQuantity || 1, 'Quantidade de pacotes');
  const paymentStatus = String(body.paymentStatus || 'pending').toLowerCase();
  const paymentMethod = String(body.paymentMethod || 'pix').toLowerCase();
  const releasePolicy = String(body.releasePolicy || 'after_payment').toLowerCase();
  const idempotencyKey = text(body.idempotencyKey, 200);
  if (!idempotencyKey) throw new Error('Chave da operação ausente.');

  const { data, error } = await supabase.rpc('create_credit_package_order', {
    p_seller_id: sellerId,
    p_package_id: packageId,
    p_package_quantity: packageQuantity,
    p_payment_status: paymentStatus,
    p_payment_method: paymentMethod,
    p_release_policy: releasePolicy,
    p_due_date: dateOnly(body.dueDate),
    p_notes: text(body.notes, 2000),
    p_idempotency_key: idempotencyKey,
    p_created_by_user_id: principal.userId,
    p_created_by_role: principal.role,
  });
  if (error) throw new Error(error.message);

  await supabase.from('panel_audit_logs').insert({
    action: 'credits.package_order.created',
    entity_type: 'credit_order',
    entity_id: data.id,
    description: `Venda de ${data.credits_total} créditos`,
    metadata: { sellerId, packageId, packageQuantity, paymentStatus, releasePolicy, performedByUserId: principal.userId },
  });

  return { ok: true, order: mapOrder(data) };
}

async function updatePayment(supabase: any, principal: Principal, body: JsonBody) {
  if (!['owner', 'admin'].includes(principal.role)) throw new PanelAuthError('Somente o administrador pode atualizar compras.', 403);
  const orderId = uuid(body.orderId, 'Pedido');
  const status = String(body.paymentStatus || '').toLowerCase();
  if (!['paid', 'pending', 'overdue', 'cancelled'].includes(status)) throw new Error('Status inválido.');

  const { data: current, error: currentError } = await supabase.from('panel_credit_orders').select('*').eq('id', orderId).single();
  if (currentError) throw new Error('Pedido não encontrado.');
  if (current.credits_status === 'released' && status === 'cancelled') {
    throw new Error('Créditos já liberados não podem ser cancelados sem um estorno específico.');
  }

  const updates: Record<string, unknown> = {
    payment_status: status,
    paid_at: status === 'paid' ? current.paid_at || new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('panel_credit_orders').update(updates).eq('id', orderId);
  if (error) throw new Error(error.message);

  await supabase.from('panel_financial_records').update({
    status,
    paid_at: status === 'paid' ? updates.paid_at : null,
    updated_at: new Date().toISOString(),
  }).eq('idempotency_key', `credit-order-finance:${orderId}`);

  if (status === 'paid' && current.credits_status === 'waiting_payment') {
    const { error: releaseError } = await supabase.rpc('release_credit_order', { p_order_id: orderId });
    if (releaseError) throw new Error(releaseError.message);
  }

  return { ok: true };
}

async function updateSellerTerms(supabase: any, principal: Principal, body: JsonBody) {
  if (!['owner', 'admin'].includes(principal.role)) throw new PanelAuthError('Somente o administrador pode alterar limite.', 403);
  const sellerId = uuid(body.sellerId, 'Vendedor');
  const limit = Number(body.financialCreditLimitCents || 0);
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Limite inválido.');
  const { error } = await supabase.from('panel_sellers').update({
    financial_credit_limit_cents: limit,
    allow_credit_purchases_on_terms: Boolean(body.allowCreditPurchasesOnTerms),
    updated_at: new Date().toISOString(),
  }).eq('id', sellerId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']) as Principal;
    const body = await bodyOf(request);
    const action = String(body.action || 'dashboard');

    if (action === 'dashboard') return json(await dashboard(supabase, principal));
    if (action === 'createOrder') return json(await createOrder(supabase, principal, body));
    if (action === 'updatePayment') return json(await updatePayment(supabase, principal, body));
    if (action === 'updateSellerTerms') return json(await updateSellerTerms(supabase, principal, body));
    return json({ error: 'Ação não reconhecida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('Falha em credit-packages-panel.', error);
    return json({ error: error instanceof Error ? error.message : 'Falha interna.' }, 400);
  }
});
