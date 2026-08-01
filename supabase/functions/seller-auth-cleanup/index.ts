import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';
import { safeDiagnosticText } from '../_shared/diagnosticSafety.ts';

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

function bearer(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(env('SUPABASE_URL'), serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const invokedByService = constantTimeEqual(bearer(request), serviceRoleKey);
    let performedBy = 'system';
    if (!invokedByService) {
      const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin']);
      performedBy = principal.userId;
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const requestedLimit = Number((body as Record<string, unknown>).limit || 25);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 25));
    const { data: claimed, error: claimError } = await supabase.rpc('claim_seller_auth_deletions', {
      p_limit: limit,
    });
    if (claimError) throw new Error(`Falha ao reservar exclusões Auth: ${claimError.message}`);

    let completed = 0;
    let failed = 0;
    for (const item of claimed ?? []) {
      const queueId = String(item.queue_id || '');
      const sellerId = String(item.seller_id || '');
      const authUserId = String(item.auth_user_id || '');
      if (!queueId || !authUserId) continue;

      const { error: deleteError } = await supabase.auth.admin.deleteUser(authUserId);
      const alreadyMissing = deleteError?.status === 404 || /not found|does not exist/i.test(deleteError?.message || '');
      if (!deleteError || alreadyMissing) {
        const now = new Date().toISOString();
        await supabase
          .from('panel_auth_deletion_queue')
          .update({ status: 'completed', completed_at: now, locked_at: null, last_error: null, updated_at: now })
          .eq('id', queueId);
        await supabase.from('panel_audit_logs').insert({
          action: 'seller.auth_deleted_after_recovery_window',
          entity_type: 'seller',
          entity_id: sellerId || null,
          description: 'Usuário Auth do vendedor removido após a janela adicional de recuperação',
          metadata: { queueId, authUserId, alreadyMissing, performedBy },
          performed_by: performedBy,
        });
        completed += 1;
        continue;
      }

      const safeError = safeDiagnosticText(deleteError.message, 500) || 'Falha ao excluir usuário Auth.';
      await supabase
        .from('panel_auth_deletion_queue')
        .update({ status: 'failed', locked_at: null, last_error: safeError, updated_at: new Date().toISOString() })
        .eq('id', queueId);
      failed += 1;
    }

    return json({ ok: failed === 0, claimed: (claimed ?? []).length, completed, failed });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('seller-auth-cleanup:', { name: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'Não foi possível processar a limpeza de acessos.' }, 500);
  }
});
