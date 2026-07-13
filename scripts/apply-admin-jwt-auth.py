from pathlib import Path

path = Path('supabase/functions/admin-panel/index.ts')
source = path.read_text(encoding='utf-8')

supabase_import = "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';\n"
auth_import = "import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';\n"

if auth_import not in source:
    if source.count(supabase_import) != 1:
        raise SystemExit('Import Supabase não encontrado exatamente uma vez.')
    source = source.replace(supabase_import, supabase_import + auth_import, 1)

source = source.replace(
    "'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',",
    "'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',",
    1,
)

auth_start = source.find('function requireAdmin(req: Request) {')
auth_end = source.find('\n\nasync function readBody(', auth_start)
if auth_start >= 0 and auth_end >= 0:
    source = source[:auth_start] + source[auth_end + 2:]

old_start = """  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const url = new URL(req.url);"""

new_start = """  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    await requirePanelPrincipal(req, supabase, ['admin']);

    const url = new URL(req.url);"""

if old_start in source:
    source = source.replace(old_start, new_start, 1)
elif "await requirePanelPrincipal(req, supabase, ['admin']);" not in source:
    raise SystemExit('Inicialização autenticada do admin não encontrada.')

old_catch = """  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Erro inesperado no painel.',
    }, 500);
  }
});"""
new_catch = """  } catch (error) {
    if (error instanceof PanelAuthError) {
      return panelAuthErrorResponse(error, corsHeaders);
    }

    return json({
      error: error instanceof Error ? error.message : 'Erro inesperado no painel.',
    }, 500);
  }
});"""

if old_catch in source:
    source = source.replace(old_catch, new_catch, 1)
elif 'panelAuthErrorResponse(error, corsHeaders)' not in source:
    raise SystemExit('Catch final do admin não encontrado.')

if 'customerName: currentCustomer?.name || null,' not in source:
    marker = "      let creditConsumption = null;\n\n      if (isActivation || isRenewal) {"
    replacement = """      const currentCustomer = Array.isArray(currentDevice.customer)
        ? currentDevice.customer[0] ?? null
        : currentDevice.customer;

      let creditConsumption = null;

      if (isActivation || isRenewal) {"""

    if source.count(marker) != 1:
        raise SystemExit('Marcador do relacionamento customer não encontrado.')

    source = source.replace(marker, replacement, 1)

    old_access = 'customerName: currentDevice.customer?.name || null,'
    if source.count(old_access) != 1:
        raise SystemExit('Acesso legado ao customer não encontrado.')

    source = source.replace(
        old_access,
        'customerName: currentCustomer?.name || null,',
        1,
    )

path.write_text(source, encoding='utf-8')
print('Admin JWT codemod aplicado com sucesso.')
