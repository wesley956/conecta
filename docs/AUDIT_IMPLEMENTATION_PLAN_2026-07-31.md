# Plano de implementação da auditoria — 31/07/2026

Este documento transforma a auditoria técnica em lotes publicáveis, com dependências, critérios de aceite e rollback explícitos. O objetivo é corrigir causas comprovadas sem misturar mudanças estruturais de risco diferente no mesmo deploy.

## Estado atual

Branch do lote 3: `agent/cache-concurrency`
Base: `main` no commit `332a177`

Os lotes 1 e 2 foram revisados, aprovados por todos os checks e mesclados pelo PR #180. O deploy automático do GitHub Pages, redundante e desabilitado no repositório, foi removido pelo PR #181; o Vercel permanece como hospedagem oficial do painel. O lote 3 está implementado nesta branch e aguarda validação do banco/pgTAP no CI. Nenhuma migration ou Edge Function deste plano foi aplicada manualmente ao Supabase de produção.

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

Status: implementado na branch `agent/cache-concurrency`; aguarda CI e revisão antes de mesclagem.

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

- Consolidar operações de crédito, ativação e renovação em RPCs transacionais.
- Corrigir fluxos de exclusão manual que hoje dependem de várias operações separadas.
- Criar testes de concorrência e idempotência no Postgres.

### Lote 5 — continuidade no aparelho

- Recuperar automaticamente o mesmo canal, filme ou episódio depois da troca de lista no Android.
- Padronizar motivo, tentativa e resultado do failover entre Android, LG e Samsung.
- Persistir progresso e favoritos com chaves estáveis entre listas equivalentes.

### Lote 6 — diagnóstico e saneamento

- Adicionar identificadores de correlação e tentativa entre painel, cache e aparelho.
- Criar diagnóstico dirigido sem registrar URL completa, usuário ou senha.
- Sanear auditorias históricas que possam conter credenciais de listas.
- Decidir se contas autoexcluídas também terão o usuário do Supabase Auth removido depois de uma janela adicional.

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
- Teste estrutural e comportamental de integridade SHA-256/limite de concorrência do lote 3: aprovado localmente.
- Teste pgTAP do lote 3: criado; será executado pelo CI porque o Supabase CLI local não consegue usar seu diretório de configuração neste ambiente restrito.
