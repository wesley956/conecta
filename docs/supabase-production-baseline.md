# Baseline seguro do Supabase em produção

O deploy automático de produção permanece **desabilitado por padrão** até o histórico remoto de migrations ser alinhado ao histórico versionado no GitHub.

## Por que existe este passo

Parte das migrations históricas foi aplicada pela API/Management do Supabase e recebeu versões remotas diferentes dos timestamps dos arquivos em `supabase/migrations`. O schema de produção está funcional, mas `supabase db push` compara os **números de versão** do diretório local com `supabase_migrations.schema_migrations`. Sem baseline, o CLI pode interpretar SQL antigo como pendente.

## Regra de segurança

Nunca usar em produção:

```bash
supabase db reset --linked
supabase db push --include-seed
```

Nunca marcar uma migration como aplicada apenas porque o nome parece equivalente. Antes do `migration repair`, confirmar que o efeito da migration já existe no schema de produção.

## Procedimento único de baseline

1. Configurar no GitHub Actions os secrets recomendados pelo Supabase:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_DB_PASSWORD`
   - `SUPABASE_PROJECT_ID`
2. Manter `SUPABASE_PRODUCTION_DEPLOY_ENABLED` diferente de `true` durante o baseline.
3. Executar `supabase link --project-ref "$SUPABASE_PROJECT_ID"`.
4. Executar `supabase migration list` e comparar as versões locais e remotas.
5. Para cada versão **local antiga** comprovadamente já representada no schema remoto, usar o comando oficial de reparo de histórico:

```bash
supabase migration repair --status applied <versao-local>
```

6. Não remover registros remotos históricos apenas para deixar a lista visualmente igual. O objetivo é fazer com que todas as migrations versionadas no GitHub que já existem em produção também constem como aplicadas.
7. Rodar:

```bash
supabase db push --dry-run
```

O resultado aceitável é: nenhuma migration histórica inesperada será aplicada; apenas migrations realmente novas podem aparecer como pendentes.
8. Rodar novamente `supabase migration list` e guardar a evidência no PR/issue de baseline.
9. Somente depois disso definir a variável do repositório:

```text
SUPABASE_PRODUCTION_DEPLOY_ENABLED=true
```

## Pipeline depois do baseline

O workflow `.github/workflows/deploy-supabase-production.yml` executa, nessa ordem:

1. valida os três secrets;
2. liga o projeto remoto;
3. mostra o estado das migrations;
4. executa `supabase db push --dry-run`;
5. aplica `supabase db push`;
6. publica as Edge Functions do **mesmo commit**;
7. mostra novamente o estado das migrations.

A concorrência de produção é serializada e `cancel-in-progress` fica desabilitado para impedir dois deploys de banco simultâneos.
