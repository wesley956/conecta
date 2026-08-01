# Plano de implementação da auditoria — 31/07/2026

Este documento transforma a auditoria técnica em lotes publicáveis, com dependências, critérios de aceite e rollback explícitos. O objetivo é corrigir causas comprovadas sem misturar mudanças estruturais de risco diferente no mesmo deploy.

## Estado atual

Branch de pré-implantação: `agent/production-activation-preflight`
Base: `main` no commit `ff4f992`

Os lotes 1 e 2 foram mesclados pelo PR #180; o workflow redundante do GitHub Pages foi removido pelo PR #181; o lote 3 foi mesclado pelo PR #182; e o lote 4 foi mesclado pelo PR #183. O Vercel permanece como hospedagem oficial do painel. Nenhuma migration ou Edge Function desses lotes foi aplicada manualmente ao Supabase de produção.

O inventário de produção de 01/08/2026 encontrou o schema legado sem o domínio central de assinaturas e sem o limitador público de ativações. A ativação deve seguir o plano detalhado em `docs/PRODUCTION_ACTIVATION_PREFLIGHT_2026-08-01.md`. A branch atual prepara uma compatibilidade do lote 4 com esse schema e ainda depende do CI antes de qualquer implantação.

## Lote 1 — segurança, Xtream e continuidade

Status: mesclado na `main` pelo PR #180, com todos os checks aprovados.

- Preservar porta e caminho-base nas APIs e URLs de reprodução Xtream.
- Aceitar catálogos válidos sem filmes quando canais ou séries existem.
- Impedir que respostas inválidas do provedor apareçam em erros ou logs.
- Impedir redirecionamento de requisições Xtream com credenciais para outra origem.
- Aplicar a mesma proteção de DNS/SSRF em EPG e detalhes de séries.
- Remover a URL de origem duplicada dos documentos de cache.
- Evitar estado `processing` preso quando a trava global estiver ocupada.
- Tratar HTTP 404 como endpoint incorreto, sem liberar acesso direto automaticamente.
- Remover URLs completas das novas auditorias de listas.
- Fechar o vetor de XSS no botão que copia a URL de uma lista.
- Isolar a busca de cliente por WhatsApp dentro do vendedor responsável.
- Fazer Android, LG e Samsung respeitarem a lista escolhida pelo servidor.
- Declarar corretamente `device-config-direct` como função com autenticação própria no gateway.

## Lote 2 — contas temporárias de vendedores

Status: mesclado na `main` pelo PR #180. Migration, lint do PostgreSQL e teste pgTAP foram aprovados no CI.

### Regra funcional

- `0` horas: conta sem vencimento.
- `24` horas: exemplo de conta de teste válida por 24 horas a partir da criação ou renovação.
- No instante do vencimento, todas as Edge Functions protegidas recusam o acesso do vendedor.
- O job do banco consolida o status `blocked` em no máximo cinco minutos e desativa o papel do vendedor.
- Se a exclusão automática estiver ligada, a data é calculada a partir do vencimento. Exemplo: 24 horas ativas mais 36 horas de tolerância.
- Uma renovação antes da exclusão reativa a conta, cria uma nova validade a partir daquele momento e cancela a exclusão agendada.
- A exclusão automática é lógica: revoga o acesso e esconde a conta das telas ativas, preservando créditos, vendas, aparelhos, clientes e auditoria.

### Componentes

- Campos de criação no painel administrativo.
- Ação de renovação e mudança de validade nos detalhes do vendedor.
- RPC administrativa de configuração com limites de 1 a 8760 horas.
- Job `pg_cron` a cada cinco minutos para bloqueio e exclusão lógica.
- Auditorias distintas para vencimento, exclusão automática e renovação.
- Validação imediata do vencimento no login e no código público usado na ativação.
- Índices parciais somente para contas com vencimento ou exclusão pendentes.

## Ordem obrigatória de implantação

| Ordem | Entrega | Verificação antes de avançar |
|---|---|---|
| 1 | Migration `20260801000935_seller_temporary_access_lifecycle.sql` | Colunas, RPCs e job aparecem no banco; contas existentes continuam sem vencimento |
| 2 | Edge Functions compartilhadas e administrativas | Login de conta sem vencimento e listagem comercial continuam funcionando |
| 3 | `seller-provision`, `device-activate`, cache, EPG e séries | Criar uma conta de teste e validar bloqueio/renovação em staging |
| 4 | Painel administrativo | Campos de validade, tolerância e renovação aparecem sem erros no navegador |
| 5 | Smart TV | Lista selecionada pelo servidor é tentada primeiro; build publicado passa pelo teste no aparelho |
| 6 | Android | Compilar APK, testar lista principal/reserva e só então promover a versão |
| 7 | Monitoramento | Conferir `cron.job_run_details`, auditorias e falhas de cache durante 24 horas |

O frontend não deve ser publicado antes da migration e das Edge Functions, porque ele chama a nova RPC. A migration pode entrar primeiro: todas as contas atuais recebem `access_expires_at = null` e permanecem sem vencimento.

## Critérios de aceite do vendedor temporário

- Criar vendedor com 24 horas e exclusão automática em 36 horas.
- Confirmar que o vencimento está aproximadamente 24 horas à frente.
- Forçar o vencimento em staging e confirmar resposta 403 imediata.
- Executar o processador e confirmar `status = blocked`, papel inativo e auditoria.
- Renovar por 24 horas e confirmar cancelamento da exclusão agendada.
- Forçar a data de exclusão e confirmar exclusão lógica sem perda do histórico relacionado.
- Confirmar que conta sem vencimento não aceita exclusão automática.
- Confirmar que `anon` e `authenticated` não executam as duas RPCs diretamente.

## Rollback seguro

- Interromper novas contas temporárias removendo os campos do frontend ou mantendo validade `0`.
- Desativar o job com `select cron.unschedule('seller-temporary-access-lifecycle');` se houver comportamento inesperado.
- Para uma conta afetada, renovar sem vencimento pela RPC administrativa; isso reativa o status e o papel.
- Restaurar primeiro as Edge Functions e o frontend anteriores. Não remover colunas nem apagar histórico durante o incidente.

## Próximos lotes da auditoria

### Lote 3 — cache e concorrência

Status: mesclado na `main` pelo PR #182, com todos os checks aprovados.

- Substituir a trava global por lease renovável por `playlist_id`, permitindo listas independentes em paralelo.
- Persistir cada tentativa com `attempt_id`, proprietário, fase, heartbeat, validade e resultado, sem guardar URL ou credencial da origem.
- Recuperar leases abandonados automaticamente a cada cinco minutos e liberar uma nova tentativa.
- Manter o último cache válido durante refresh, falha ou reconciliação.
- Gravar canais, filmes, séries e manifest em caminhos imutáveis por tentativa, com `upsert = false`.
- Incluir SHA-256 e tamanho de cada parte no manifest e persistir a integridade do manifest no ponteiro ativo.
- Trocar todos os ponteiros em uma única função SQL, com compare-and-set do `attempt_id` e da versão da origem.
- Reter as duas últimas gerações válidas e remover de forma assíncrona objetos de tentativas antigas, falhas ou substituídas.
- Limitar a duas chamadas simultâneas a coleta das categorias Xtream e processar catálogos grandes por seção.
- Evitar o vetor duplicado de linhas no parser M3U e liberar cada coleção da memória depois do upload.

### Ordem de implantação do lote 3

| Ordem | Entrega | Verificação antes de avançar |
|---|---|---|
| 1 | Migration `20260801024610_playlist_cache_leases_and_manifests.sql` | Tabelas, índices, RPCs, privilégios e job aparecem; cache ativo existente continua inalterado |
| 2 | Edge Function `playlist-cache` e módulos compartilhados | Duas listas diferentes obtêm leases; a mesma lista recebe resposta ocupada; cache anterior continua disponível |
| 3 | Funções que criam/editam/diagnosticam listas | Novas listas começam em `missing`; nenhuma função marca `processing` antes do lease |
| 4 | Monitoramento gratuito | Conferir tentativas, leases expirados, cron e limpeza sem criar staging pago |

Rollback: restaurar primeiro as Edge Functions anteriores. A tabela de trava global foi mantida temporariamente para esse fim. Não remover as novas tabelas, colunas ou histórico durante um incidente; o job pode ser interrompido com `select cron.unschedule('playlist-cache-lease-reconciler');`.

### Lote 4 — consistência comercial

Status: mesclado na `main` pelo PR #183, com reset completo, lint e pgTAP aprovados. A pré-implantação encontrou uma dependência opcional ausente no schema legado; a compatibilidade está sendo validada separadamente antes de produção.

- Ativar/renovar, debitar crédito e gravar principal/reserva numa única RPC idempotente.
- Trocar o par principal/reserva sem a janela intermediária de `delete` seguido de `insert`.
- Serializar ativação, troca, remoção e exclusão com trava transacional por playlist.
- Remover a permissão do vendedor somente depois de confirmar, dentro da mesma transação, que nenhum aparelho usa a lista.
- Excluir uma lista administrativa promovendo reservas de aparelhos e assinaturas na mesma transação.
- Bloquear a exclusão quando uma assinatura usa a lista como principal e não possui reserva.
- Restringir todas as novas funções ao `service_role`, com `search_path` vazio.
- Cobrir retries, fingerprint divergente, rollback, permissões, promoção e bloqueios em pgTAP.

### Ordem de implantação do lote 4

| Ordem | Entrega | Verificação antes de avançar |
|---|---|---|
| 1 | Migration `20260801032340_commercial_consistency_transactions.sql` | RPCs, privilégios e testes pgTAP aprovados; saldos e vínculos existentes inalterados |
| 2 | Edge Functions `admin-panel` e `seller-panel` | Ativação/renovação cria um débito e as duas listas; retry não altera saldo |
| 3 | Monitoramento gratuito | Conferir erros de idempotência, exclusões bloqueadas e promoções de reserva |

Rollback: restaurar primeiro as duas Edge Functions anteriores. As RPCs novas podem permanecer sem chamadas; não remover extrato, vínculos ou histórico durante um incidente.

### Lote 5 — continuidade no aparelho

Status: concluído e mesclado no PR #185; Android, LG, Samsung, banco e Vercel aprovados no CI.

- Recuperar automaticamente o mesmo canal, filme ou episódio depois da troca de lista no Android.
- Padronizar motivo, tentativa e resultado do failover entre Android, LG e Samsung.
- Persistir progresso e favoritos com chaves estáveis entre listas equivalentes.

### Lote 6 — diagnóstico e saneamento

Status: implementado na branch `agent/diagnostics-security`; PostgreSQL/pgTAP, Deno e Android pendentes do CI.

- Adicionar identificadores de correlação e tentativa entre painel, cache e aparelho.
- Criar diagnóstico dirigido sem registrar URL completa, usuário ou senha.
- Sanear auditorias históricas que possam conter credenciais de listas.
- Decidir se contas autoexcluídas também terão o usuário do Supabase Auth removido depois de uma janela adicional.

Decisão: a exclusão lógica cria uma fila privada e concede mais sete dias de recuperação. Depois
desse prazo, uma Edge Function idempotente remove o usuário pelo Admin API; a migration nunca
executa `delete` direto em `auth.users`.

### Diagnóstico visual — obrigatório antes do lote 7

- Auditar painel administrativo e portal do vendedor em computador e celular.
- Auditar Android TV, LG webOS e Samsung Tizen com foco real de controle remoto.
- Verificar alinhamento, hierarquia, legibilidade, densidade, estados vazios, erros e consistência visual.
- Produzir relatório priorizado antes de alterar layout; as correções aprovadas entram no lote 7.

### Lote 7 — painel e testes ponta a ponta

- Separar módulos realmente publicados de scripts legados.
- Eliminar testes que aprovam código não carregado pelo painel.
- Cobrir os fluxos de administrador, vendedor, lista e failover em navegador real.

## Verificações executadas nesta branch

- `npm run verify`: aprovado.
- `npm run typecheck --prefix smart-tv`: aprovado.
- `npm run build --prefix smart-tv`: aprovado.
- `git diff --check`: aprovado.
- Builds Android, LG e Samsung dos lotes 1 e 2: aprovados no CI do PR #180 e após a mesclagem.
- Lote 3: reset de 42 migrations, lint e 39 testes pgTAP aprovados no PR #182.
- Lote 4: `npm run verify`, typecheck/build da Smart TV, versões únicas de migration e `git diff --check` aprovados localmente.
- Lote 4: PRs #183 e #184 mesclados com reset das 43 migrations, lint e 320 testes pgTAP aprovados.
- Lote 5: `npm run verify`, typecheck/build da Smart TV e `git diff --check` aprovados localmente.
- Lote 5: PR #185 mesclado com todos os 10 checks aprovados, incluindo os dois builds Android.
- Lote 6: `npm run verify`, 44 migrations únicas, typecheck/build da Smart TV e saneador Deno aprovados localmente.
