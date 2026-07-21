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

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin']);
    const body = await request.json().catch(() => ({}));
    const sellerId = String(body?.sellerId || '').trim();
    if (!sellerId) return json({ error: 'ID do vendedor é obrigatório.' }, 400);

    const { data: seller, error: sellerError } = await supabase
      .from('panel_sellers')
      .select('id, name, email')
      .eq('id', sellerId)
      .maybeSingle();
    if (sellerError) throw new Error(`Não foi possível localizar o vendedor: ${sellerError.message}.`);
    if (!seller) return json({ error: 'Vendedor não encontrado.' }, 404);

    const { data: role, error: roleError } = await supabase
      .from('panel_user_roles')
      .select('user_id')
      .eq('seller_id', sellerId)
      .maybeSingle();
    if (roleError) throw new Error(`Não foi possível localizar o acesso do vendedor: ${roleError.message}.`);

    const { count: linkedDevices, error: unlinkDevicesError } = await supabase
      .from('panel_devices')
      .update({ seller_id: null, updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('seller_id', sellerId);
    if (unlinkDevicesError) throw new Error(`Não foi possível liberar os aparelhos do vendedor: ${unlinkDevicesError.message}.`);

    const { count: linkedCustomers, error: unlinkCustomersError } = await supabase
      .from('panel_customers')
      .update({ seller_id: null }, { count: 'exact' })
      .eq('seller_id', sellerId);
    if (unlinkCustomersError) throw new Error(`Não foi possível liberar os clientes do vendedor: ${unlinkCustomersError.message}.`);

    const { error: deleteSellerError } = await supabase
      .from('panel_sellers')
      .delete()
      .eq('id', sellerId);
    if (deleteSellerError) throw new Error(`Não foi possível excluir o vendedor: ${deleteSellerError.message}.`);

    if (role?.user_id) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(String(role.user_id));
      if (authDeleteError) {
        console.error('Vendedor removido, mas houve falha ao excluir usuário Auth.', authDeleteError);
      }
    }

    await supabase.from('panel_audit_logs').insert({
      action: 'seller.deleted',
      entity_type: 'seller',
      entity_id: sellerId,
      description: `Vendedor excluído: ${seller.name}`,
      metadata: {
        email: seller.email || null,
        authUserId: role?.user_id || null,
        unlinkedDevices: linkedDevices || 0,
        unlinkedCustomers: linkedCustomers || 0,
        performedByUserId: principal.userId,
      },
    });

    return json({
      ok: true,
      unlinkedDevices: linkedDevices || 0,
      unlinkedCustomers: linkedCustomers || 0,
      message: 'Vendedor e acesso excluídos. Aparelhos, clientes e histórico foram preservados.',
    });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('Falha ao excluir vendedor.', error);
    return json({ error: error instanceof Error ? error.message : 'Falha inesperada ao excluir vendedor.' }, 400);
  }
});
