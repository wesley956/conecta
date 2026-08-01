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

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await request.json();
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function requiredText(value: unknown, label: string, maximumLength: number) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  if (text.length > maximumLength) throw new Error(`${label} excede o tamanho permitido.`);
  return text;
}

function normalizeEmail(value: unknown) {
  const email = requiredText(value, 'E-mail de acesso', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido para o vendedor.');
  return email;
}

function normalizeWhatsapp(value: unknown) {
  const whatsapp = String(value ?? '').replace(/[^\d+]/g, '').trim();
  if (!whatsapp) throw new Error('WhatsApp do vendedor é obrigatório.');
  if (whatsapp.length > 24) throw new Error('WhatsApp do vendedor é inválido.');
  return whatsapp;
}

function normalizePassword(value: unknown) {
  const password = String(value ?? '');
  if (password.length < 8) throw new Error('A senha inicial deve possuir pelo menos 8 caracteres.');
  if (password.length > 128) throw new Error('A senha inicial excede o tamanho permitido.');
  return password;
}

function intOrDefault(value: unknown, fallback: number, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.floor(parsed));
}

function accessDurationHours(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error('A validade deve ser informada em horas inteiras entre 0 e 8760.');
  }
  if (parsed === 0) return null;
  if (parsed > 8760) throw new Error('A validade da conta não pode ultrapassar 1 ano.');
  return parsed;
}

function graceHours(value: unknown) {
  if (value === null || value === undefined || value === '') return 36;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error('A tolerância deve ser informada em horas inteiras entre 1 e 720.');
  }
  if (parsed > 720) throw new Error('A tolerância para exclusão não pode ultrapassar 720 horas.');
  return parsed;
}

function createLegacySellerAccessToken() {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
}

function duplicateEmailMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /already|registered|exists|duplicate/i.test(message);
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  let supabase: any = null;
  let createdUserId: string | null = null;
  let createdSellerId: string | null = null;
  let existingSellerId: string | null = null;

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin']);
    const body = await readBody(request);
    const name = requiredText(body.name, 'Nome do vendedor', 160);
    const whatsapp = normalizeWhatsapp(body.whatsapp);
    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);
    const initialCredits = intOrDefault(body.initialCredits, 0, 0);
    const canGoNegative = body.canGoNegative === true;
    const durationHours = accessDurationHours(body.accessDurationHours);
    const autoDelete = durationHours !== null && body.autoDeleteAfterExpiry === true;
    const deleteGraceHours = graceHours(body.autoDeleteGraceHours);
    existingSellerId = String(body.existingSellerId ?? '').trim() || null;

    if (existingSellerId) {
      const { data: existingSeller, error: existingError } = await supabase
        .from('panel_sellers')
        .select('id, name, whatsapp, email, status, credit_balance, can_go_negative')
        .eq('id', existingSellerId)
        .maybeSingle();

      if (existingError || !existingSeller) {
        return json({ error: existingError?.message || 'Vendedor antigo não encontrado.' }, 404);
      }

      const { data: existingRole, error: roleLookupError } = await supabase
        .from('panel_user_roles')
        .select('user_id')
        .eq('seller_id', existingSellerId)
        .eq('role', 'seller')
        .maybeSingle();

      if (roleLookupError) throw new Error(`Não foi possível verificar o acesso atual: ${roleLookupError.message}.`);
      if (existingRole?.user_id) return json({ error: 'Este vendedor já possui login no portal.' }, 409);
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: name, panel_role: 'seller' },
    });

    if (authError || !authData?.user?.id) {
      if (duplicateEmailMessage(authError)) return json({ error: 'Já existe uma conta de acesso com este e-mail.' }, 409);
      throw new Error(`Não foi possível criar a conta de acesso: ${authError?.message || 'resposta incompleta'}.`);
    }

    createdUserId = String(authData.user.id);

    if (existingSellerId) {
      const { error: sellerUpdateError } = await supabase
        .from('panel_sellers')
        .update({ email, name, whatsapp, status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existingSellerId);
      if (sellerUpdateError) throw new Error(`Não foi possível atualizar o vendedor antigo: ${sellerUpdateError.message}.`);
      createdSellerId = existingSellerId;
    } else {
      const { data: seller, error: sellerError } = await supabase
        .from('panel_sellers')
        .insert({
          name,
          whatsapp,
          email,
          status: 'active',
          credit_balance: initialCredits,
          can_go_negative: canGoNegative,
          access_token: createLegacySellerAccessToken(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (sellerError || !seller?.id) throw new Error(`Não foi possível criar o cadastro comercial: ${sellerError?.message || 'resposta incompleta'}.`);
      createdSellerId = String(seller.id);
    }

    const { error: roleError } = await supabase.rpc('assign_panel_role', {
      p_user_id: createdUserId,
      p_role: 'seller',
      p_seller_id: createdSellerId,
      p_active: true,
    });
    if (roleError) throw new Error(`Não foi possível liberar o portal do vendedor: ${roleError.message}.`);

    const { error: accessError } = await supabase.rpc('configure_seller_temporary_access', {
      p_seller_id: createdSellerId,
      p_duration_hours: durationHours,
      p_auto_delete: autoDelete,
      p_grace_hours: deleteGraceHours,
    });
    if (accessError) throw new Error(`Não foi possível configurar a validade do vendedor: ${accessError.message}.`);

    if (!existingSellerId && initialCredits > 0) {
      const { error: ledgerError } = await supabase.from('panel_credit_ledger').insert({
        seller_id: createdSellerId,
        amount: initialCredits,
        type: 'manual_add',
        description: 'Créditos iniciais do vendedor',
        balance_after: initialCredits,
        performed_by: 'admin',
      });
      if (ledgerError) throw new Error(`Não foi possível registrar os créditos iniciais: ${ledgerError.message}.`);
    }

    const auditAction = existingSellerId ? 'seller.login_migrated' : 'seller.provisioned';
    const auditDescription = existingSellerId
      ? `Login unificado liberado para vendedor existente: ${name}`
      : `Vendedor e acesso criados: ${name}`;

    const { error: auditError } = await supabase.from('panel_audit_logs').insert({
      action: auditAction,
      entity_type: 'seller',
      entity_id: createdSellerId,
      description: auditDescription,
      metadata: {
        email,
        whatsapp,
        initialCredits,
        authUserId: createdUserId,
        performedByUserId: principal.userId,
        migrated: Boolean(existingSellerId),
        accessDurationHours: durationHours,
        autoDeleteAfterExpiry: autoDelete,
        autoDeleteGraceHours: deleteGraceHours,
      },
    });
    if (auditError) throw new Error(`Não foi possível registrar a auditoria: ${auditError.message}.`);

    return json({
      ok: true,
      sellerId: createdSellerId,
      userId: createdUserId,
      email,
      migrated: Boolean(existingSellerId),
      accessDurationHours: durationHours,
      autoDeleteAfterExpiry: autoDelete,
      autoDeleteGraceHours: deleteGraceHours,
      message: existingSellerId
        ? 'Login do vendedor antigo liberado sem alterar saldo, aparelhos ou movimentações.'
        : 'Vendedor cadastrado e acesso ao portal liberado.',
    }, existingSellerId ? 200 : 201);
  } catch (error) {
    if (supabase && createdUserId) await supabase.auth.admin.deleteUser(createdUserId);
    if (supabase && createdSellerId && !existingSellerId) {
      await supabase.from('panel_credit_ledger').delete().eq('seller_id', createdSellerId);
      await supabase.from('panel_sellers').delete().eq('id', createdSellerId);
    }

    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, corsHeaders);

    console.error('Falha ao provisionar vendedor.', {
      createdUserId,
      createdSellerId,
      existingSellerId,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: error instanceof Error ? error.message : 'Falha inesperada ao cadastrar vendedor.' }, 400);
  }
});
