import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';
import { normalizeSupportProfileInput } from '../_shared/supportProfile.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BODY_BYTES = 32 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('Requisição excede o limite permitido.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error('Requisição excede o limite permitido.');
  }
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function profileResponse(row: any, role: 'system' | 'seller', fallbackName: string) {
  return {
    profile: {
      displayName: row?.display_name || fallbackName,
      whatsapp: row?.whatsapp || '',
      email: row?.email || '',
      supportText: row?.support_text || '',
      businessHours: row?.business_hours || '',
      contactUrl: row?.contact_url || '',
      enabled: role === 'system' ? row?.enabled === true : undefined,
      showInApp: role === 'seller' ? row?.show_in_app !== false : undefined,
      updatedAt: row?.updated_at || null,
    },
  };
}

async function readProfile(supabase: any, role: 'system' | 'seller', sellerId: string | null) {
  if (role === 'system') {
    const { data, error } = await supabase
      .from('panel_system_support_profiles')
      .select('display_name,whatsapp,email,support_text,business_hours,contact_url,enabled,updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error('Não foi possível carregar o suporte oficial.');
    return profileResponse(data, role, 'Suporte Roneca Player TV');
  }

  const [{ data, error }, sellerResult] = await Promise.all([
    supabase
      .from('panel_seller_support_profiles')
      .select('display_name,whatsapp,email,support_text,business_hours,contact_url,show_in_app,updated_at')
      .eq('seller_id', sellerId)
      .maybeSingle(),
    supabase.from('panel_sellers').select('name').eq('id', sellerId).maybeSingle(),
  ]);
  if (error || sellerResult.error) throw new Error('Não foi possível carregar o perfil de suporte.');
  return profileResponse(data, role, sellerResult.data?.name || 'Meu suporte');
}

async function writeAudit(
  supabase: any,
  principal: { userId: string; role: string; sellerId: string | null },
  role: 'system' | 'seller',
) {
  const { error } = await supabase.from('panel_audit_logs').insert({
    action: role === 'system' ? 'support.system.updated' : 'support.seller.updated',
    entity_type: role === 'system' ? 'system_support' : 'seller_support',
    entity_id: role === 'seller' ? principal.sellerId : null,
    description: role === 'system'
      ? 'Perfil de suporte oficial atualizado'
      : 'Perfil público de suporte do vendedor atualizado',
    metadata: {
      role: principal.role,
      sellerId: role === 'seller' ? principal.sellerId : null,
      performedByUserId: principal.userId,
    },
    performed_by: `panel-user:${principal.userId}`,
  });
  if (error) throw new Error('Perfil salvo, mas não foi possível registrar a auditoria.');
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin', 'seller']);
    const body = await readBody(request);
    const action = String(body.action || 'getProfile').trim();
    const profileRole = principal.role === 'seller' ? 'seller' : 'system';

    if (action === 'getProfile') {
      return json(await readProfile(supabase, profileRole, principal.sellerId));
    }

    if (action !== 'saveProfile') return json({ error: 'Ação inválida.' }, 400);

    const input = normalizeSupportProfileInput(
      body,
      profileRole === 'system' ? 'enabled' : 'showInApp',
    );
    const now = new Date().toISOString();
    const values = {
      display_name: input.displayName,
      whatsapp: input.whatsapp,
      email: input.email,
      support_text: input.supportText,
      business_hours: input.businessHours,
      contact_url: input.contactUrl,
      updated_by: principal.userId,
      updated_at: now,
    };

    if (profileRole === 'system') {
      const { error } = await supabase.from('panel_system_support_profiles').upsert({
        id: 1,
        ...values,
        enabled: input.visible,
      }, { onConflict: 'id' });
      if (error) throw new Error('Não foi possível salvar o suporte oficial.');
    } else {
      const { error } = await supabase.from('panel_seller_support_profiles').upsert({
        seller_id: principal.sellerId,
        ...values,
        show_in_app: input.visible,
      }, { onConflict: 'seller_id' });
      if (error) throw new Error('Não foi possível salvar o perfil de suporte.');
    }

    await writeAudit(supabase, principal, profileRole);
    return json({
      ok: true,
      message: 'Perfil de suporte salvo com sucesso.',
      ...(await readProfile(supabase, profileRole, principal.sellerId)),
    });
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, CORS);
    const message = error instanceof Error ? error.message : 'Falha inesperada ao salvar suporte.';
    return json({ error: message }, 400);
  }
});
