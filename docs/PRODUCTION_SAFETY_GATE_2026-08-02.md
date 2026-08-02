# Bloqueio seguro de produção — 02/08/2026

Este documento substitui o procedimento operacional de implantação descrito em
`PRODUCTION_ACTIVATION_PREFLIGHT_2026-08-01.md` para qualquer release que inclua o diagnóstico
progressivo de listas.

## Princípio obrigatório

Nenhuma alteração deste lote deve ser aplicada automaticamente no Supabase de produção.
Mesclar código, publicar o painel, aplicar migrations e publicar Edge Functions são etapas
separadas. A próxima etapa só começa depois que a anterior foi comprovada e registrada.

O objetivo deste bloqueio é impedir que uma melhoria cause indisponibilidade, alteração de saldo,
perda de aparelho, perda de vínculo, perda de cache ou exposição de credenciais.

## Estado desta preparação

- O PR do diagnóstico progressivo permanece sem implantação na produção.
- A migration `20260802190000_playlist_progressive_diagnostics.sql` ainda não foi aplicada.
- A Edge Function `playlist-diagnostics` ainda não foi publicada.
- As alterações de `device-config-direct` ainda não foram publicadas.
- Nenhuma senha, URL completa ou dump deve entrar no Git, Vercel, painel ou comentários de PR.
- O plano gratuito continua sendo respeitado; este procedimento não cria recurso pago.

## Ferramentas adicionadas

### `scripts/production-backup.sh`

Cria um diretório novo fora do repositório e produz:

- `roles.sql`;
- `schema.sql`;
- `data.sql`;
- `METADATA.json`, sem URL, senha ou token;
- `SHA256SUMS`;
- marcador `READY` somente depois de duas verificações completas.

O processo usa `umask 077`, arquivos com permissão privada, arquivos parciais e o marcador
`INCOMPLETE`. Se qualquer comando falhar, o diretório é marcado como `FAILED` e os dumps parciais
são removidos por padrão.

A URL do Session pooler pode ser fornecida por variável de ambiente ou digitada de forma oculta em
um terminal interativo. Ela nunca é escrita nos metadados ou impressa pelo script.

```bash
export RONECA_BACKUP_ROOT="$HOME/.roneca/backups"
export RONECA_DB_URL='<URL_DO_SESSION_POOLER>'
bash scripts/production-backup.sh
unset RONECA_DB_URL
```

Não colocar a URL diretamente na linha do comando. Preferir uma variável definida em sessão
privada ou a leitura oculta do próprio script.

### `scripts/verify-production-backup.sh`

Valida sem conectar à produção:

- existência dos três dumps;
- marcadores de conclusão;
- permissões privadas;
- ausência de links simbólicos;
- lista exata de arquivos protegidos;
- assinatura SHA-256;
- estrutura mínima dos dumps;
- contrato e saneamento de `METADATA.json`.

```bash
bash scripts/verify-production-backup.sh "$HOME/.roneca/backups/production-AAAAMMDDTHHMMSSZ"
```

A implantação deve parar se essa verificação não terminar com sucesso.

### `scripts/restore-backup-to-disposable.sh`

Executa um ensaio de restauração somente depois de confirmação explícita. Por padrão, aceita apenas
`localhost`, `127.0.0.1`, `::1` ou `host.docker.internal`.

O script bloqueia:

- destino com o mesmo identificador do backup;
- mesmo host da origem;
- qualquer host contendo o identificador do projeto de produção;
- banco que já tenha objetos no schema `public`;
- destino remoto sem uma segunda confirmação explícita.

Exemplo para uma instância local e vazia do Supabase:

```bash
export RONECA_RESTORE_CONFIRM='RESTORE_TO_DISPOSABLE_DATABASE'
export RONECA_RESTORE_TARGET_URL='<URL_LOCAL_DESCARTAVEL>'
bash scripts/restore-backup-to-disposable.sh \
  "$HOME/.roneca/backups/production-AAAAMMDDTHHMMSSZ"
unset RONECA_RESTORE_TARGET_URL RONECA_RESTORE_CONFIRM
```

O ensaio não limpa nem remove o banco ao final. Isso permite conferir tabelas, contagens e funções
antes de descartar manualmente o ambiente local.

## Critério de backup recuperável

O backup é considerado apto para implantação somente quando todos os itens abaixo forem verdadeiros:

1. o diretório está fora do repositório;
2. existe o marcador `READY` e não existe `INCOMPLETE` nem `FAILED`;
3. `verify-production-backup.sh` passa;
4. `restore-backup-to-disposable.sh` termina em um banco vazio e descartável;
5. o relatório do ensaio registra sucesso e não contém credencial;
6. as contagens essenciais restauradas são compatíveis com a linha de base da produção;
7. o diretório do backup possui uma segunda cópia privada em mídia diferente.

Uma cópia sem ensaio de restauração é somente um dump, não uma recuperação comprovada.

## Ordem de implantação atualizada

As migrations devem ser aplicadas individualmente. Não usar `db push` na produção porque o histórico
remoto possui nomes antigos divergentes.

| Ordem | Migration | Verificação antes de avançar |
|---:|---|---|
| 1 | `2026072301_device_activation_rate_limit.sql` | Limitador existe; aparelhos e saldos não mudam. |
| 2 | `20260801000935_seller_temporary_access_lifecycle.sql` | Vendedores existentes continuam sem vencimento. |
| 3 | `20260801024610_playlist_cache_leases_and_manifests.sql` | Caches válidos antigos continuam disponíveis. |
| 4 | `20260801032340_commercial_consistency_transactions.sql` | Saldos, aparelhos e vínculos permanecem iguais. |
| 5 | `20260801060000_diagnostics_security_hardening.sql` | Diagnósticos saneados e fila privada criada. |
| 6 | `20260802190000_playlist_progressive_diagnostics.sql` | Tabelas privadas do diagnóstico existem e RLS bloqueia `anon` e `authenticated`. |

Depois de cada migration:

- comparar vendedores ativos, aparelhos, listas e vínculos com a linha de base;
- comparar saldos e idempotências financeiras;
- confirmar caches válidos e caches em erro;
- executar consulta de integridade específica da migration;
- parar ao primeiro valor inesperado.

## Ordem das Edge Functions

Publicar somente depois das seis migrations e uma função por vez:

1. `admin-panel`, `seller-panel`, `seller-provision`;
2. `device-activate`;
3. `playlist-cache`;
4. `admin-inline-playlist`, `device-config`;
5. `channel-epg`, `series-detail`;
6. `playback-diagnostics-report`, `playback-diagnostics-panel`;
7. `device-config-direct`;
8. `playlist-diagnostics`;
9. `seller-auth-cleanup`, mantendo a execução agendada desativada até a fila ser conferida.

Não publicar `subscription-panel`. O domínio central de assinaturas não faz parte desta implantação.

Antes de cada publicação, registrar a versão e o SHA-256 do pacote atualmente implantado. O pacote
anterior é o primeiro rollback funcional.

## Smoke tests do diagnóstico progressivo

Após publicar `device-config-direct` e `playlist-diagnostics`:

1. abrir uma lista de teste sem expor a URL no navegador;
2. iniciar o diagnóstico pelo administrador;
3. confirmar que as etapas 5 a 11 retornam somente status técnico, HTTP e latência;
4. quando necessário, confirmar a criação de uma única tarefa para Android oficial vinculado;
5. confirmar que o aparelho reivindica no máximo uma tarefa e executa no máximo três verificações;
6. confirmar que o painel recebe as etapas 12 a 14 sem URL, usuário, senha ou catálogo;
7. confirmar que diagnóstico não consome crédito, não ativa aparelho e não substitui cache válido;
8. confirmar que uma tarefa expirada não é executada;
9. repetir login, configuração de aparelho, catálogo e reprodução normal.

## Critérios de parada imediata

Interromper a implantação se ocorrer qualquer um destes sinais:

- mudança inesperada em saldo, vendedor, aparelho, lista ou vínculo;
- cache válido removido ou substituído durante uma falha;
- URL ou credencial em resposta do painel, log ou diagnóstico;
- mais de uma tarefa ativa para o mesmo diagnóstico;
- Android deixando de carregar catálogo ou iniciar reprodução;
- erro novo crítico nos advisors de segurança ou desempenho;
- migration, função ou smoke test com resultado ambíguo.

Não continuar apenas porque o deploy retornou código de sucesso.

## Rollback funcional

1. interromper novas execuções do diagnóstico no painel;
2. restaurar os pacotes anteriores de `playlist-diagnostics` e `device-config-direct`;
3. restaurar as demais Edge Functions na ordem inversa da publicação;
4. interromper jobs novos sem apagar tabelas ou histórico;
5. manter as migrations aditivas enquanto o aplicativo antigo continuar compatível;
6. usar restauração integral do backup somente em incidente grave, com janela de manutenção e
   confirmação de que alterações legítimas posteriores ao dump podem ser perdidas.

## Bloqueio operacional restante

Para executar o backup real ainda é necessária a URL do Session pooler com a senha atual. Esse dado
não pode ser recuperado do repositório e não deve ser enviado em comentário público. Até o backup e
o ensaio descartável existirem, a implantação deve permanecer bloqueada.
