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

function requiredSellerId(value: unknown) {
  const id = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('ID do vendedor inválido.');
  }
  return id;
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
    const sellerId = requiredSellerId(body?.sellerId);

    const { data, error } = await supabase.rpc('delete_seller_account_transaction', {
      p_seller_id: sellerId,
      p_performed_by_user_id: principal.userId,
      p_reason: 'manual_admin_delete',
    });
    if (error) throw new Error(`Não foi possível excluir o vendedor: ${error.message}.`);

    const result = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const authUserId = String(result.authUserId || '').trim() || null;
    let authRevoked = !authUserId;
    let authWarning: string | null = null;

    if (authUserId) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(authUserId);
      if (authDeleteError) {
        // O papel e o vendedor já foram revogados atomicamente no banco, portanto
        // esta conta não recupera acesso ao painel mesmo se a limpeza do Auth falhar.
        authWarning = 'O acesso ao painel foi revogado, mas a limpeza final do usuário Auth precisa ser repetida.';
        console.error('Falha ao remover usuário Auth após exclusão lógica do vendedor.', {
          sellerId,
          authUserId,
          message: authDeleteError.message,
        });
      } else {
        authRevoked = true;
      }
    }

    const { error: auditError } = await supabase.from('panel_audit_logs').insert({
      action: authRevoked ? 'seller.auth_revoked' : 'seller.auth_revoke_pending',
      entity_type: 'seller',
      entity_id: sellerId,
      description: authRevoked
        ? 'Usuário Auth do vendedor removido após exclusão lógica.'
        : 'Acesso local revogado; remoção final do usuário Auth ficou pendente.',
      performed_by: `${principal.role}:${principal.userId}`,
      metadata: {
        authUserId,
        authRevoked,
        preservedHistory: true,
      },
    });
    if (auditError) {
      console.error('Falha ao registrar resultado da revogação Auth.', {
        sellerId,
        message: auditError.message,
      });
    }

    return json({
      ok: true,
      sellerId,
      authRevoked,
      unlinkedDevices: Number(result.unlinkedDevices || 0),
      unlinkedCustomers: Number(result.unlinkedCustomers || 0),
      preservedHistory: result.preservedHistory === true,
      warning: authWarning,
      message: authWarning || 'Vendedor excluído logicamente, acesso revogado e histórico preservado.',
    });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('Falha ao excluir vendedor.', {
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: error instanceof Error ? error.message : 'Falha inesperada ao excluir vendedor.' }, 400);
  }
});
