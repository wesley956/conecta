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

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
}

function normalizeEmail(value: unknown) {
  const email = requiredText(value, 'E-mail').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Informe um e-mail válido.');
  }
  return email;
}

function normalizeWhatsapp(value: unknown) {
  const whatsapp = String(value ?? '').replace(/[^\d+]/g, '').trim();
  if (!whatsapp) throw new Error('WhatsApp é obrigatório.');
  if (whatsapp.length > 24) throw new Error('WhatsApp inválido.');
  return whatsapp;
}

function validatePassword(value: unknown) {
  const password = String(value ?? '');
  if (password.length < 8) throw new Error('A senha inicial deve ter no mínimo 8 caracteres.');
  if (password.length > 128) throw new Error('A senha excede o tamanho permitido.');
  return password;
}

function intOrDefault(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function createSellerAccessToken() {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
}

async function writeAudit(
  supabase: any,
  action: string,
  sellerId: string | null,
  description: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase.from('panel_audit_logs').insert({
    action,
    entity_type: 'seller',
    entity_id: sellerId,
    description,
    metadata,
  });
  if (error) console.error('seller access audit failed', { action, sellerId, message: error.message });
}

async function createAuthUser(supabase: any, email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      panel_role: 'seller',
    },
  });
  if (error || !data.user) {
    const message = String(error?.message || 'Não foi possível criar o usuário autenticado.');
    if (/already|registered|exists/i.test(message)) {
      throw new Error('Este e-mail já possui uma conta. Use a opção de vincular/redefinir acesso.');
    }
    throw new Error(message);
  }
  return data.user;
}

async function assignSellerRole(supabase: any, userId: string, sellerId: string, active = true) {
  const { error } = await supabase.rpc('assign_panel_role', {
    p_user_id: userId,
    p_role: 'seller',
    p_seller_id: sellerId,
    p_active: active,
  });
  if (error) throw new Error(`Não foi possível atribuir o papel de vendedor: ${error.message}`);
}

async function listAccess(supabase: any) {
  const [{ data: sellers, error: sellersError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase
      .from('panel_sellers')
      .select('id, name, whatsapp, email, status, credit_balance, can_go_negative, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('panel_user_roles')
      .select('user_id, seller_id, active, created_at, updated_at')
      .eq('role', 'seller'),
  ]);

  if (sellersError) throw new Error(sellersError.message);
  if (rolesError) throw new Error(rolesError.message);

  const roleBySeller = new Map((roles ?? []).map((role: any) => [role.seller_id, role]));
  const authUsers = new Map<string, any>();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Não foi possível consultar usuários Auth: ${error.message}`);
    const users = data.users ?? [];
    users.forEach((user: any) => authUsers.set(user.id, user));
    if (users.length < 100) break;
    page += 1;
  }

  return (sellers ?? []).map((seller: any) => {
    const role = roleBySeller.get(seller.id);
    const user = role ? authUsers.get(role.user_id) : null;
    return {
      id: seller.id,
      name: seller.name,
      whatsapp: seller.whatsapp,
      email: seller.email || user?.email || null,
      status: seller.status,
      creditBalance: Number(seller.credit_balance || 0),
      canGoNegative: seller.can_go_negative === true,
      access: role ? {
        userId: role.user_id,
        active: role.active === true,
        email: user?.email || seller.email || null,
        emailConfirmed: Boolean(user?.email_confirmed_at),
        lastSignInAt: user?.last_sign_in_at || null,
        createdAt: role.created_at,
        updatedAt: role.updated_at,
      } : null,
    };
  });
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await requirePanelPrincipal(request, supabase, ['admin']);

    const body = await readBody(request);
    const action = String(body.action || '').trim();

    if (action === 'listSellerAccess') {
      return json({ sellers: await listAccess(supabase) });
    }

    if (action === 'createSellerWithAccess') {
      const name = requiredText(body.name, 'Nome do vendedor');
      const whatsapp = normalizeWhatsapp(body.whatsapp);
      const email = normalizeEmail(body.email);
      const password = validatePassword(body.password);
      const initialCredits = intOrDefault(body.initialCredits, 0);
      const canGoNegative = body.canGoNegative === true;

      let authUserId: string | null = null;
      let sellerId: string | null = null;

      try {
        const user = await createAuthUser(supabase, email, password, name);
        authUserId = user.id;

        const { data: seller, error: sellerError } = await supabase
          .from('panel_sellers')
          .insert({
            name,
            whatsapp,
            email,
            status: 'active',
            credit_balance: initialCredits,
            can_go_negative: canGoNegative,
            access_token: createSellerAccessToken(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (sellerError || !seller) throw new Error(sellerError?.message || 'Falha ao criar vendedor.');
        sellerId = seller.id;

        await assignSellerRole(supabase, authUserId, sellerId, true);

        if (initialCredits > 0) {
          const { error: ledgerError } = await supabase.from('panel_credit_ledger').insert({
            seller_id: sellerId,
            amount: initialCredits,
            type: 'manual_add',
            description: 'Créditos iniciais do vendedor',
            balance_after: initialCredits,
            performed_by: 'admin',
          });
          if (ledgerError) throw new Error(`Falha ao registrar créditos iniciais: ${ledgerError.message}`);
        }

        await writeAudit(
          supabase,
          'seller.access.created',
          sellerId,
          `Vendedor e acesso Auth criados: ${name}`,
          { name, whatsapp, email, initialCredits, userId: authUserId },
        );

        return json({ ok: true, sellerId, userId: authUserId, email });
      } catch (error) {
        if (sellerId) await supabase.from('panel_sellers').delete().eq('id', sellerId);
        if (authUserId) await supabase.auth.admin.deleteUser(authUserId);
        throw error;
      }
    }

    if (action === 'provisionSellerAccess') {
      const sellerId = requiredText(body.sellerId, 'Vendedor');
      const email = normalizeEmail(body.email);
      const password = validatePassword(body.password);

      const { data: seller, error: sellerError } = await supabase
        .from('panel_sellers')
        .select('id, name')
        .eq('id', sellerId)
        .single();
      if (sellerError || !seller) throw new Error('Vendedor não encontrado.');

      const { data: existingRole } = await supabase
        .from('panel_user_roles')
        .select('user_id')
        .eq('seller_id', sellerId)
        .maybeSingle();
      if (existingRole?.user_id) throw new Error('Este vendedor já possui acesso Auth vinculado.');

      let authUserId: string | null = null;
      try {
        const user = await createAuthUser(supabase, email, password, seller.name);
        authUserId = user.id;
        await assignSellerRole(supabase, authUserId, sellerId, true);
        await supabase.from('panel_sellers').update({ email, updated_at: new Date().toISOString() }).eq('id', sellerId);
        await writeAudit(
          supabase,
          'seller.access.provisioned',
          sellerId,
          `Acesso Auth criado para vendedor: ${seller.name}`,
          { email, userId: authUserId },
        );
        return json({ ok: true, sellerId, userId: authUserId, email });
      } catch (error) {
        if (authUserId) await supabase.auth.admin.deleteUser(authUserId);
        throw error;
      }
    }

    if (action === 'resetSellerPassword') {
      const sellerId = requiredText(body.sellerId, 'Vendedor');
      const password = validatePassword(body.password);

      const { data: role, error: roleError } = await supabase
        .from('panel_user_roles')
        .select('user_id')
        .eq('seller_id', sellerId)
        .eq('role', 'seller')
        .single();
      if (roleError || !role) throw new Error('Este vendedor ainda não possui acesso Auth.');

      const { error } = await supabase.auth.admin.updateUserById(role.user_id, { password });
      if (error) throw new Error(`Não foi possível redefinir a senha: ${error.message}`);

      await writeAudit(
        supabase,
        'seller.access.password_reset',
        sellerId,
        'Senha do vendedor redefinida pelo administrador.',
        { userId: role.user_id },
      );
      return json({ ok: true });
    }

    if (action === 'setSellerAccessActive') {
      const sellerId = requiredText(body.sellerId, 'Vendedor');
      const active = body.active === true;

      const { data: role, error: roleError } = await supabase
        .from('panel_user_roles')
        .select('user_id')
        .eq('seller_id', sellerId)
        .eq('role', 'seller')
        .single();
      if (roleError || !role) throw new Error('Este vendedor ainda não possui acesso Auth.');

      const { error } = await supabase
        .from('panel_user_roles')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('user_id', role.user_id);
      if (error) throw new Error(error.message);

      await writeAudit(
        supabase,
        active ? 'seller.access.enabled' : 'seller.access.disabled',
        sellerId,
        active ? 'Acesso do vendedor reativado.' : 'Acesso do vendedor bloqueado.',
        { userId: role.user_id },
      );
      return json({ ok: true, active });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);
    console.error('admin-seller-access failed', error);
    return json({ error: error instanceof Error ? error.message : 'Erro interno.' }, 500);
  }
});
