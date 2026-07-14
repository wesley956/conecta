export type PanelRole = 'admin' | 'seller';

export interface PanelPrincipal {
  userId: string;
  email: string | null;
  role: PanelRole;
  sellerId: string | null;
}

export class PanelAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'PanelAuthError';
    this.status = status;
  }
}

function readBearerToken(request: Request) {
  const authorization = String(request.headers.get('authorization') || '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function requirePanelPrincipal(
  request: Request,
  supabase: any,
  allowedRoles: PanelRole[],
): Promise<PanelPrincipal> {
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    throw new PanelAuthError('Sessão do painel não informada.', 401);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  const user = authData?.user;

  if (authError || !user) {
    throw new PanelAuthError('Sessão do painel inválida ou expirada.', 401);
  }

  const { data: roleRecord, error: roleError } = await supabase
    .from('panel_user_roles')
    .select('user_id, role, seller_id, active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (roleError) {
    console.error('Falha ao consultar papel do usuário do painel.', {
      userId: user.id,
      code: roleError.code || null,
    });
    throw new PanelAuthError('Falha ao validar acesso ao painel.', 500);
  }

  if (!roleRecord || roleRecord.active !== true) {
    throw new PanelAuthError('Usuário sem acesso ativo ao painel.', 403);
  }

  if (!allowedRoles.includes(roleRecord.role as PanelRole)) {
    throw new PanelAuthError('Usuário sem permissão para esta área.', 403);
  }

  const role = roleRecord.role as PanelRole;
  const sellerId = roleRecord.seller_id ? String(roleRecord.seller_id) : null;

  if (role === 'seller') {
    if (!sellerId) {
      throw new PanelAuthError('Conta de vendedor sem vínculo comercial.', 403);
    }

    const { data: seller, error: sellerError } = await supabase
      .from('panel_sellers')
      .select('id, status')
      .eq('id', sellerId)
      .maybeSingle();

    if (sellerError) {
      console.error('Falha ao consultar vendedor vinculado ao usuário.', {
        userId: user.id,
        sellerId,
        code: sellerError.code || null,
      });
      throw new PanelAuthError('Falha ao validar acesso do vendedor.', 500);
    }

    if (!seller || seller.status !== 'active') {
      throw new PanelAuthError('Vendedor bloqueado ou inativo.', 403);
    }
  }

  return {
    userId: user.id,
    email: user.email || null,
    role,
    sellerId,
  };
}

export function panelAuthErrorResponse(
  error: unknown,
  corsHeaders: Record<string, string>,
) {
  const authError = error instanceof PanelAuthError
    ? error
    : new PanelAuthError('Falha inesperada de autenticação.', 500);

  const headers: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (authError.status === 401) {
    headers['WWW-Authenticate'] = 'Bearer';
  }

  return new Response(JSON.stringify({ error: authError.message }), {
    status: authError.status,
    headers,
  });
}
