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
    const payload = await request.json();
    return payload && typeof payload === 'object'
      ? payload as Record<string, unknown>
      : {};
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail válido para o vendedor.');
  }
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
  if (password.length < 8) {
    throw new Error('A senha inicial deve possuir pelo menos 8 caracteres.');
  }
  if (password.length > 128) {
    throw new Error('A senha inicial excede o tamanho permitido.');
  }
  return password;
}

function intOrDefault(value: unknown, fallback: number, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.floor(parsed));
}

function createLegacySellerAccessToken() {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
}

function duplicateEmailMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /already|registered|exists|duplicate/i.test(message);
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  let supabase: any = null;
  let createdUserId: string | null = null;
  let createdSellerId: string | null = null;

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const principal = await requirePanelPrincipal(request, supabase, ['admin']);
    const body = await readBody(request);
    const name = requiredText(body.name, 'Nome do vendedor', 160);
    const whatsapp = normalizeWhatsapp(body.whatsapp);
    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);
    const initialCredits = intOrDefault(body.initialCredits, 0, 0);
    const canGoNegative = body.canGoNegative === true;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: name,
        panel_role: 'seller',
      },
    });

    if (authError || !authData?.user?.id) {
      if (duplicateEmailMessage(authError)) {
        return json({ error: 'Já existe uma conta de acesso com este e-mail.' }, 409);
      }
      throw new Error(`Não foi possível criar a conta de acesso: ${authError?.message || 'resposta incompleta'}.`);
    }

    createdUserId = String(authData.user.id);

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

    if (sellerError || !seller?.id) {
      throw new Error(`Não foi possível criar o cadastro comercial: ${sellerError?.message || 'resposta incompleta'}.`);
    }

    createdSellerId = String(seller.id);

    const { error: roleError } = await supabase.rpc('assign_panel_role', {
      p_user_id: createdUserId,
      p_role: 'seller',
      p_seller_id: createdSellerId,
      p_active: true,
    });

    if (roleError) {
      throw new Error(`Não foi possível liberar o portal do vendedor: ${roleError.message}.`);
    }

    if (initialCredits > 0) {
      const { error: ledgerError } = await supabase
        .from('panel_credit_ledger')
        .insert({
          seller_id: createdSellerId,
          amount: initialCredits,
          type: 'manual_add',
          description: 'Créditos iniciais do vendedor',
          balance_after: initialCredits,
          performed_by: 'admin',
        });

      if (ledgerError) {
        throw new Error(`Não foi possível registrar os créditos iniciais: ${ledgerError.message}.`);
      }
    }

    const { error: auditError } = await supabase
      .from('panel_audit_logs')
      .insert({
        action: 'seller.provisioned',
        entity_type: 'seller',
        entity_id: createdSellerId,
        description: `Vendedor e acesso criados: ${name}`,
        metadata: {
          email,
          whatsapp,
          initialCredits,
          authUserId: createdUserId,
          performedByUserId: principal.userId,
        },
      });

    if (auditError) {
      throw new Error(`Não foi possível registrar a auditoria: ${auditError.message}.`);
    }

    return json({
      ok: true,
      sellerId: createdSellerId,
      userId: createdUserId,
      email,
      message: 'Vendedor cadastrado e acesso ao portal liberado.',
    }, 201);
  } catch (error) {
    if (supabase && createdSellerId) {
      await supabase.from('panel_credit_ledger').delete().eq('seller_id', createdSellerId);
      await supabase.from('panel_sellers').delete().eq('id', createdSellerId);
    }

    if (supabase && createdUserId) {
      await supabase.auth.admin.deleteUser(createdUserId);
    }

    if (error instanceof PanelAuthError) {
      return panelAuthErrorResponse(error, corsHeaders);
    }

    console.error('Falha ao provisionar vendedor.', {
      createdUserId,
      createdSellerId,
      message: error instanceof Error ? error.message : String(error),
    });

    return json({
      error: error instanceof Error ? error.message : 'Falha inesperada ao cadastrar vendedor.',
    }, 400);
  }
});
