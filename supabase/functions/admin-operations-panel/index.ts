import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function effectiveStatus(status: unknown, dueDate: unknown) {
  const normalized = String(status || 'pending');
  if (normalized === 'pending' && dueDate) {
    const due = new Date(`${String(dueDate)}T23:59:59.999Z`);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return 'overdue';
  }
  return normalized;
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    await requirePanelPrincipal(request, supabase, ['owner', 'admin']);

    const body = request.method === 'POST'
      ? await request.json().catch(() => ({} as Record<string, unknown>))
      : {};
    const action = String((body as Record<string, unknown>).action || 'dashboard');
    if (action !== 'dashboard') return json({ error: 'Ação inválida.' }, 400);

    const [permissionsResult, financeResult] = await Promise.all([
      supabase
        .from('panel_seller_playlists')
        .select(`
          playlist_id,
          seller_id,
          seller:panel_sellers (
            id,
            name,
            status
          )
        `)
        .eq('active', true),
      supabase
        .from('panel_company_financial_records')
        .select(`
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
          financial_scope
        `)
        .order('created_at', { ascending: false })
        .limit(300),
    ]);

    if (permissionsResult.error) throw new Error(`Falha ao consultar listas dos vendedores: ${permissionsResult.error.message}`);
    if (financeResult.error) throw new Error(`Falha ao consultar o financeiro da empresa: ${financeResult.error.message}`);

    const access = new Map<string, { sellerIds: string[]; sellerNames: string[] }>();
    for (const permission of permissionsResult.data ?? []) {
      const playlistId = String((permission as any).playlist_id || '');
      const sellerId = String((permission as any).seller_id || '');
      if (!playlistId || !sellerId) continue;
      const rawSeller = (permission as any).seller;
      const seller = Array.isArray(rawSeller) ? rawSeller[0] : rawSeller;
      const row = access.get(playlistId) || { sellerIds: [], sellerNames: [] };
      if (!row.sellerIds.includes(sellerId)) row.sellerIds.push(sellerId);
      const sellerName = String(seller?.name || 'Vendedor');
      if (!row.sellerNames.includes(sellerName)) row.sellerNames.push(sellerName);
      access.set(playlistId, row);
    }

    let paidIncomeCents = 0;
    let pendingIncomeCents = 0;
    let overdueIncomeCents = 0;
    let paidExpensesCents = 0;

    const records = (financeResult.data ?? []).map((record: any) => {
      const amountCents = Number(record.amount_cents || 0);
      const status = effectiveStatus(record.status, record.due_date);
      if (record.record_type === 'income') {
        if (status === 'paid') paidIncomeCents += amountCents;
        if (status === 'pending') pendingIncomeCents += amountCents;
        if (status === 'overdue') overdueIncomeCents += amountCents;
      } else if (record.record_type === 'expense' && status === 'paid') {
        paidExpensesCents += amountCents;
      }

      return {
        id: record.id,
        recordType: record.record_type,
        source: record.source,
        category: record.category,
        sellerId: record.seller_id,
        customerId: record.customer_id,
        deviceId: record.device_id,
        planId: record.plan_id,
        sellerName: record.seller_name_snapshot,
        customerName: record.customer_name_snapshot,
        deviceCode: record.device_code_snapshot,
        planName: record.plan_name_snapshot,
        description: record.description,
        amountCents,
        currency: record.currency || 'BRL',
        paymentMethod: record.payment_method,
        status,
        dueDate: record.due_date,
        paidAt: record.paid_at,
        referenceDate: record.reference_date,
        notes: record.notes,
        createdByRole: record.created_by_role,
        financialScope: record.financial_scope,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      };
    });

    return json({
      playlistAccess: Array.from(access.entries()).map(([playlistId, row]) => ({ playlistId, ...row })),
      companyFinance: {
        summary: {
          paidIncomeCents,
          pendingIncomeCents,
          overdueIncomeCents,
          paidExpensesCents,
          paidResultCents: paidIncomeCents - paidExpensesCents,
        },
        records,
      },
    });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('admin-operations-panel:', error);
    return json({ error: error instanceof Error ? error.message : 'Erro interno.' }, 500);
  }
});
