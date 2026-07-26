import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JsonBody = Record<string, unknown>;
type SellerPlanPriceRow = {
  plan_id: string;
  default_sale_price_cents: number | string;
  active: boolean;
  updated_at: string | null;
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

function text(value: unknown, label: string, max = 200) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} é obrigatório.`);
  if (result.length > max) throw new Error(`${label} excede o tamanho permitido.`);
  return result;
}

function uuid(value: unknown, label: string) {
  const result = text(value, label, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error(`${label} inválido.`);
  }
  return result;
}

function whatsapp(value: unknown) {
  const result = String(value ?? '').replace(/\D/g, '');
  if (result.length < 10 || result.length > 15) throw new Error('WhatsApp inválido.');
  return result;
}

function priceCents(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 100_000_000) {
    throw new Error('Preço inválido.');
  }
  return result;
}

async function dashboard(supabase: any, sellerId: string) {
  const [{ data: plans, error: plansError }, { data: prices, error: pricesError }, { data: customers, error: customersError }] = await Promise.all([
    supabase
      .from('panel_plans')
      .select('id, name, duration_days, credit_cost, max_devices, status')
      .eq('status', 'active')
      .order('duration_days'),
    supabase
      .from('panel_seller_plan_prices')
      .select('plan_id, default_sale_price_cents, active, updated_at')
      .eq('seller_id', sellerId),
    supabase
      .from('panel_customers')
      .select('id, name, whatsapp, status, created_at, updated_at')
      .eq('seller_id', sellerId)
      .order('name'),
  ]);

  if (plansError) throw new Error(`Falha ao carregar planos: ${plansError.message}`);
  if (pricesError) throw new Error(`Falha ao carregar preços: ${pricesError.message}`);
  if (customersError) throw new Error(`Falha ao carregar clientes: ${customersError.message}`);

  const priceByPlan = new Map<string, SellerPlanPriceRow>(
    ((prices || []) as SellerPlanPriceRow[]).map(item => [item.plan_id, item]),
  );
  return {
    plans: (plans || []).map((plan: any) => {
      const configured = priceByPlan.get(String(plan.id));
      return {
        id: plan.id,
        name: plan.name,
        durationDays: Number(plan.duration_days || 30),
        creditCost: Number(plan.credit_cost || 1),
        maxDevices: Number(plan.max_devices || 1),
        defaultSalePriceCents: configured?.active === false
          ? null
          : Number(configured?.default_sale_price_cents || 0) || null,
        priceUpdatedAt: configured?.updated_at || null,
      };
    }),
    customers: (customers || []).map((customer: any) => ({
      id: customer.id,
      name: customer.name,
      whatsapp: customer.whatsapp,
      status: customer.status,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    })),
  };
}

async function savePlanPrice(supabase: any, sellerId: string, body: JsonBody) {
  const planId = uuid(body.planId, 'Plano');
  const amount = priceCents(body.defaultSalePriceCents);
  const { data: plan, error: planError } = await supabase
    .from('panel_plans')
    .select('id, status')
    .eq('id', planId)
    .single();
  if (planError || !plan || plan.status !== 'active') throw new Error('Plano inexistente ou inativo.');

  const { error } = await supabase.from('panel_seller_plan_prices').upsert({
    seller_id: sellerId,
    plan_id: planId,
    default_sale_price_cents: amount,
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'seller_id,plan_id' });
  if (error) throw new Error(`Falha ao salvar preço: ${error.message}`);
  return { ok: true, planId, defaultSalePriceCents: amount };
}

async function createCustomer(supabase: any, sellerId: string, body: JsonBody) {
  const name = text(body.name, 'Nome do cliente', 160);
  const phone = whatsapp(body.whatsapp);
  const { data: existing, error: lookupError } = await supabase
    .from('panel_customers')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('whatsapp', phone)
    .maybeSingle();
  if (lookupError) throw new Error(`Falha ao consultar cliente: ${lookupError.message}`);
  if (existing) throw new Error('Já existe um cliente com este WhatsApp.');

  const { data, error } = await supabase.from('panel_customers').insert({
    seller_id: sellerId,
    name,
    whatsapp: phone,
    status: 'active',
    updated_at: new Date().toISOString(),
  }).select('id, name, whatsapp, status, created_at, updated_at').single();
  if (error || !data) throw new Error(`Falha ao cadastrar cliente: ${error?.message || 'sem retorno'}`);
  return { ok: true, customer: data };
}

async function updateCustomer(supabase: any, sellerId: string, body: JsonBody) {
  const customerId = uuid(body.customerId, 'Cliente');
  const name = text(body.name, 'Nome do cliente', 160);
  const phone = whatsapp(body.whatsapp);
  const { data: existing, error: ownerError } = await supabase
    .from('panel_customers')
    .select('id')
    .eq('id', customerId)
    .eq('seller_id', sellerId)
    .maybeSingle();
  if (ownerError) throw new Error(`Falha ao consultar cliente: ${ownerError.message}`);
  if (!existing) throw new PanelAuthError('Cliente não pertence a este vendedor.', 403);

  const { data: duplicate, error: duplicateError } = await supabase
    .from('panel_customers')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('whatsapp', phone)
    .neq('id', customerId)
    .maybeSingle();
  if (duplicateError) throw new Error(`Falha ao validar WhatsApp: ${duplicateError.message}`);
  if (duplicate) throw new Error('Outro cliente já utiliza este WhatsApp.');

  const { data, error } = await supabase.from('panel_customers').update({
    name,
    whatsapp: phone,
    updated_at: new Date().toISOString(),
  }).eq('id', customerId).eq('seller_id', sellerId)
    .select('id, name, whatsapp, status, created_at, updated_at').single();
  if (error || !data) throw new Error(`Falha ao atualizar cliente: ${error?.message || 'sem retorno'}`);
  return { ok: true, customer: data };
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['seller']);
    if (!principal.sellerId) throw new PanelAuthError('Vendedor sem vínculo comercial.', 403);
    const body = await bodyOf(request);
    const action = String(body.action || 'dashboard');

    if (action === 'dashboard') return json(await dashboard(supabase, principal.sellerId));
    if (action === 'savePlanPrice') return json(await savePlanPrice(supabase, principal.sellerId, body));
    if (action === 'createCustomer') return json(await createCustomer(supabase, principal.sellerId, body));
    if (action === 'updateCustomer') return json(await updateCustomer(supabase, principal.sellerId, body));
    return json({ error: 'Ação não reconhecida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('Falha em seller-commercial-panel.', error);
    return json({ error: error instanceof Error ? error.message : 'Falha interna.' }, 400);
  }
});
