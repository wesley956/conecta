# Pré-implantação do Supabase de produção — 01/08/2026

## Limites desta preparação

- Projeto Supabase: `Player` (`awauvkjkucjqulkklmuo`), região `sa-east-1`.
- Plano atual: gratuito; nenhum recurso pago será criado.
- PostgreSQL: `17.6.1.127`, estado `ACTIVE_HEALTHY` no inventário.
- Esta preparação é somente leitura na produção. Nenhuma migration ou Edge Function foi aplicada.
- A implantação só pode começar após backup lógico, CI verde e autorização explícita.

## Estado comprovado da produção

O banco ainda usa o fluxo anterior. A trava global `playlist_cache_generation_lock` existe e as
novas estruturas dos lotes 2, 3 e 4 não existem.

Também estão ausentes dois pré-requisitos que impedem uma implantação automática da `main`:

1. `device_activation_rate_limits` e `consume_device_activation_rate_limit`, exigidos pela
   versão final de `device-activate`;
2. `panel_subscriptions` e `panel_subscription_playlists`. Esse domínio permanece desativado
   no painel publicado e não deve ser criado apenas para satisfazer o lote 4.

Linha de base agregada, sem dados pessoais:

| Indicador | Valor antes da implantação |
|---|---:|
| Vendedores ativos | 4 |
| Aparelhos | 5 |
| Listas | 15 |
| Vínculos aparelho/lista | 7 |
| Registros financeiros | 20 |
| Caches válidos | 11 |
| Listas com cache em erro | 4 |
| Reservas ativas | 2 |
| Aparelhos com principal igual à reserva | 0 |
| Aparelhos com mais de uma reserva ativa | 0 |
| Idempotências financeiras duplicadas | 0 |

## Correção preventiva antes do deploy

A função `delete_playlist_with_reassignment` precisa tratar o domínio central de assinaturas
como opcional. Quando as duas tabelas existem, ela mantém o comportamento completo de promoção
de reservas. Quando não existem, ela processa somente os aparelhos, que é o estado atual da
produção.

A branch local `agent/production-activation-preflight` contém:

- guarda por `to_regclass` na migration comercial ainda não aplicada;
- pgTAP que simula o schema legado sem as tabelas opcionais;
- verificador estrutural contra regressão.

O PR deve permanecer em rascunho até o CI reconstruir todas as migrations e executar o pgTAP.

## Backup gratuito obrigatório

O plano gratuito não possui backup diário automático. Antes da primeira migration, criar um
backup lógico usando a URL do **Session pooler** exibida em **Connect** no Dashboard. A senha
do banco não deve ser gravada no repositório, no histórico do terminal ou neste documento.

CLI conferida nesta preparação: `2.111.0`.

```bash
RONECA_DB_URL='<SESSION_POOLER_URL_PERCENT_ENCODED>'
RONECA_BACKUP_DIR='<DIRETORIO_SEGURO_FORA_DO_REPOSITORIO>'

SUPABASE_HOME=/tmp/roneca-supabase-home \
  npx --yes supabase@2.111.0 db dump \
  --db-url "$RONECA_DB_URL" \
  --file "$RONECA_BACKUP_DIR/roles.sql" \
  --role-only

SUPABASE_HOME=/tmp/roneca-supabase-home \
  npx --yes supabase@2.111.0 db dump \
  --db-url "$RONECA_DB_URL" \
  --file "$RONECA_BACKUP_DIR/schema.sql"

SUPABASE_HOME=/tmp/roneca-supabase-home \
  npx --yes supabase@2.111.0 db dump \
  --db-url "$RONECA_DB_URL" \
  --file "$RONECA_BACKUP_DIR/data.sql" \
  --data-only \
  --use-copy

sha256sum \
  "$RONECA_BACKUP_DIR/roles.sql" \
  "$RONECA_BACKUP_DIR/schema.sql" \
  "$RONECA_BACKUP_DIR/data.sql" \
  > "$RONECA_BACKUP_DIR/SHA256SUMS"
```

Os arquivos podem conter dados pessoais e credenciais internas. Não enviar ao Git, ao painel ou
a armazenamento público. A implantação deve parar se os três dumps não existirem, estiverem
vazios ou não corresponderem ao `SHA256SUMS`.

## Ordem obrigatória das migrations

Não usar `db push` nesta produção: o histórico remoto contém migrations antigas com nomes
divergentes. Aplicar somente os quatro arquivos abaixo, um por vez, e executar a verificação de
cada etapa antes de continuar.

| Ordem | Migration | Motivo e condição para avançar |
|---:|---|---|
| 1 | `2026072301_device_activation_rate_limit.sql` | Tabela e RPC do limitador existem; nenhum aparelho ou saldo muda. |
| 2 | `20260801000935_seller_temporary_access_lifecycle.sql` | Colunas e RPCs existem; `pg_cron` é instalado; quatro vendedores existentes continuam sem vencimento. |
| 3 | `20260801024610_playlist_cache_leases_and_manifests.sql` | Tabelas/RPCs de lease existem; o job está ativo; 11 caches antigos continuam válidos. |
| 4 | `20260801032340_commercial_consistency_transactions.sql` | Somente após a correção preventiva passar no CI; saldos, aparelhos e vínculos permanecem iguais. |

As migrations 2 e 3 devem permanecer nessa ordem: a segunda instala `pg_cron` e a terceira o
reutiliza para o reconciliador de leases.

## Edge Functions a publicar depois do banco

Publicar os arquivos finais da `main` somente depois das quatro migrations:

1. `admin-panel`, `seller-panel`, `seller-provision`;
2. `device-activate`;
3. `playlist-cache`;
4. `admin-inline-playlist`, `device-config`;
5. `channel-epg`, `series-detail`.

Não publicar `subscription-panel`: ela não existe na produção e o módulo está desativado. Manter
`subscription-playlist-edit` na versão atual até o domínio central de assinaturas ser planejado
em um lote próprio.

### Referência objetiva para rollback das funções

| Função | Versão atual | `verify_jwt` | SHA-256 do pacote atual |
|---|---:|:---:|---|
| `admin-panel` | 33 | `true` | `d4d76d97aa033b2f239362a6135584f5edf85ce92573c74f072db0396efa6126` |
| `seller-panel` | 14 | `true` | `dd936a46ac2128b21d1b612f57665a7651e5e805b830047cf3e32c67f07e0bee` |
| `seller-provision` | 1 | `true` | `bde63e6b06cb68234ea07089cbf6622ad3a23b7601d6c34f6899f2ed9cad06f1` |
| `device-activate` | 23 | `false` | `769c42324ddd25f86f2f573672e5e0c68198729f974b986a6f98af239c0816b2` |
| `playlist-cache` | 16 | `false` | `5d8a7a83fafb80961ced11cdd6a3fc7adc07dfc91a1dde34cf2730b0b91cb28e` |
| `admin-inline-playlist` | 1 | `true` | `fdec318607936a4c0b662e3489438c8cab78fea0012c30a0b0eff9cbe7943a62` |
| `device-config` | 20 | `false` | `35a5aa66c91f53325f264705d90489f02e6bb164342e995b62658c4b787541f9` |
| `channel-epg` | 1 | `false` | `fc789157a4152d1ea697e9f70df3ca4528f2a641993bccd6a4e6fd8a496848e6` |
| `series-detail` | 4 | `false` | `9caa0897e1149525caaedf77bd97edcf158cda3dcaa9aaa382a383dec8037e52` |

Imediatamente antes do primeiro deploy, baixar novamente os pacotes atuais e confirmar que esses
hashes não mudaram. Se mudarem, interromper e atualizar a referência de rollback.

## Smoke tests e critérios de parada

Depois de cada migration, comparar as contagens com a linha de base. Depois das funções:

- login administrativo e do vendedor continuam respondendo;
- conta sem vencimento continua autorizada;
- configuração de um aparelho existente continua retornando principal/reserva;
- duas listas diferentes conseguem iniciar leases independentes;
- a mesma lista não inicia duas tentativas simultâneas;
- refresh não remove o cache válido anterior;
- retry comercial não cria novo débito;
- os advisors de segurança e desempenho não apresentam novo aviso crítico.

Parar imediatamente se houver mudança inesperada em saldo, número de aparelhos, vínculos,
vendedores ativos ou caches válidos. Não seguir para a próxima etapa apenas porque a migration
foi registrada como aplicada.

## Rollback funcional

1. Restaurar primeiro os pacotes de Edge Functions registrados na tabela acima.
2. Interromper os dois jobs novos, sem remover a extensão:

   ```sql
   select cron.unschedule(jobid)
   from cron.job
   where jobname in (
     'seller-temporary-access-lifecycle',
     'playlist-cache-lease-reconciler'
   );
   ```

3. Não apagar colunas, tabelas de tentativa, extrato financeiro, histórico ou migration history.
4. Manter `playlist_cache_generation_lock`: as funções antigas dependem dela.
5. Usar a restauração integral do backup somente em incidente grave e com janela de manutenção,
   porque ela pode descartar alterações legítimas feitas depois do dump.

Esse rollback é compatível porque as RPCs antigas mantêm a mesma assinatura e o schema novo é
aditivo. O painel antigo simplesmente não chama as RPCs novas.

## Autorizações ainda necessárias

1. Disponibilizar a senha/URL do Session pooler somente no momento do backup seguro.
2. Validar e mesclar o PR de pré-implantação após CI verde.
3. Autorizar separadamente a aplicação das migrations e o deploy das Edge Functions.
