# Rollout seguro da autenticação do painel

Este procedimento migra o painel administrativo e o portal do vendedor de tokens compartilhados para contas individuais do Supabase Auth.

## Princípios

- Não publique o novo frontend antes de aplicar a migration e implantar as Edge Functions.
- Nunca salve `SUPABASE_SERVICE_ROLE_KEY`, senha do banco ou senha de usuário no Git.
- Use primeiro um ambiente de staging ou uma janela controlada de manutenção.
- Mantenha `ENABLE_PANEL_AUTO_DEPLOY` diferente de `true` até o teste completo terminar.

## 1. Validar no CI

O workflow `Validate Pull Request` precisa concluir com sucesso os três jobs:

1. Web, parser and production server;
2. Supabase Edge Functions;
3. Supabase migrations and pgTAP.

O terceiro job recria um banco local do zero, aplica todas as migrations, executa lint PostgreSQL e roda os testes de privilégios e papéis.

## 2. Aplicar a migration no ambiente controlado

Aplique `supabase/migrations/2026071304_panel_auth_roles.sql` pelo processo oficial de migrations do projeto.

Antes de continuar, confirme:

```sql
select
  relrowsecurity,
  relforcerowsecurity
from pg_class
where oid = 'public.panel_user_roles'::regclass;
```

Os dois valores devem ser `true`.

## 3. Criar as contas no Supabase Auth

Crie uma conta individual para cada administrador e vendedor usando o painel do Supabase Auth ou um processo administrativo seguro.

Não compartilhe contas e não reutilize a mesma senha entre pessoas.

Anote apenas os UUIDs dos usuários criados. UUIDs não são segredos.

## 4. Vincular os papéis

Execute com uma conexão administrativa ao banco.

### Administrador

```sql
select public.assign_panel_role(
  '<UUID_DO_USUARIO_ADMIN>'::uuid,
  'admin',
  null,
  true
);
```

### Vendedor

```sql
select public.assign_panel_role(
  '<UUID_DO_USUARIO_VENDEDOR>'::uuid,
  'seller',
  '<UUID_DO_PANEL_SELLER>'::uuid,
  true
);
```

Cada vendedor comercial pode estar ligado a somente uma conta do Auth.

Para revogar um acesso:

```sql
select public.revoke_panel_role('<UUID_DO_USUARIO>'::uuid);
```

## 5. Implantar as Edge Functions

Implante as versões validadas de:

- `admin-panel`;
- `seller-panel`.

Nesta etapa, `verify_jwt` ainda pode permanecer desabilitado no gateway, porque as duas funções validam o Bearer JWT e o papel internamente. A ativação no gateway será feita depois pelo PR específico.

## 6. Configurar o GitHub Pages

Configure no repositório:

- `SUPABASE_URL`: variável ou segredo com a URL HTTPS do projeto;
- `SUPABASE_ANON_KEY`: segredo ou variável pública com a chave pública do projeto.

A chave `anon` é pública por definição, mas nunca use a `service_role` no frontend ou no workflow de Pages.

## 7. Publicar manualmente

Execute manualmente o workflow `Deploy Admin Panel to GitHub Pages`.

O deploy automático permanece bloqueado enquanto `ENABLE_PANEL_AUTO_DEPLOY` não for exatamente `true`.

## 8. Testes obrigatórios

### Administrador

- login com email e senha;
- carregamento do dashboard;
- criação e edição de registros permitidos;
- logout;
- sessão removida ao fechar a aba;
- usuário sem papel recebe 403;
- vendedor não acessa endpoints administrativos.

### Vendedor

- login com email e senha;
- visualização somente dos próprios dados;
- vendedor bloqueado recebe 403;
- logout;
- sessão removida ao fechar a aba.

### Segurança

- nenhuma requisição envia `x-admin-token` ou `x-seller-token`;
- nenhuma chave `service_role` aparece no navegador;
- JWT não é enviado a domínio diferente da origem Supabase configurada;
- refresh token funciona e uma sessão revogada volta para a tela de login.

## 9. Liberar deploy automático

Somente depois dos testes, configure:

```text
ENABLE_PANEL_AUTO_DEPLOY=true
```

## 10. Ativar verificação JWT no gateway

Depois que o fluxo estiver estável, integre o PR que define `verify_jwt=true` para `admin-panel` e `seller-panel` no `supabase/config.toml` e aplique a configuração no projeto hospedado.

## Rollback

Em caso de falha antes da ativação do gateway:

1. desative `ENABLE_PANEL_AUTO_DEPLOY`;
2. restaure a versão anterior do GitHub Pages;
3. mantenha as Edge Functions com validação interna;
4. revogue papéis problemáticos com `revoke_panel_role`;
5. corrija e repita os testes antes de nova publicação.
