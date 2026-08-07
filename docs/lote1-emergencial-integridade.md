# Lote 1 — Correções emergenciais e integridade

Status: backend publicado e validado; interface administrativa aguardando a publicação visual final.

## Escopo aprovado

1. Sincronizar `admin-panel` da `main` com o Supabase.
2. Sanitizar credenciais em auditorias e histórico.
3. Corrigir a janela de telemetria de homologação.
4. Identificar e tratar aparelhos ativos sem lista.
5. Impedir exclusão destrutiva de listas.
6. Validar o ciclo de contas temporárias.

## Resultados

### Sincronização

- `admin-panel` atualizada no Supabase e fixada ao commit validado da branch.
- Contratos SQL ausentes restaurados.
- API `admin-integrity-panel` criada com autenticação owner/admin.
- Funções administrativas continuam retornando 401 sem sessão válida.

### Auditoria

- Sanitização central aplicada por trigger do PostgreSQL.
- URLs, query strings, usuários, senhas, tokens e cabeçalhos de autorização são removidos antes da gravação.
- Histórico existente foi sanitizado sem apagar eventos, datas ou responsáveis.
- Busca final por padrões sensíveis retornou zero ocorrências.

### Telemetria

- Sessões de homologação concluídas aceitam eventos atrasados por até 10 minutos.
- Sessões revogadas ou fora da janela continuam bloqueadas.
- Teste real da função publicada:
  - sessão recém-encerrada: HTTP 200;
  - credencial incorreta: HTTP 403;
  - sessão fora da janela: HTTP 403.
- Todos os registros técnicos temporários foram removidos após o teste.

### Aparelhos ativos sem lista

Foram identificados três aparelhos comerciais que permanecem ativos e válidos, mas sem lista principal:

- `RPTV-4LUKVT`;
- `RPTV-8TCTJZ`;
- `RPTV-A4NSG5`.

Nenhuma lista foi atribuída automaticamente. A interface do Lote 1 permitirá ao administrador escolher principal e reserva sem consumir crédito ou alterar a validade.

### Exclusão segura de listas

- A exclusão comercial passa a arquivar a lista, em vez de apagar dados sem avaliação.
- O sistema calcula aparelhos principais, reservas, vendedores e homologações afetados.
- Lista principal de aparelho ativo sem reserva é bloqueada.
- Quando existe reserva elegível, ela pode ser promovida atomicamente após confirmação.
- Vínculos comerciais e sessões de homologação são desativados na mesma transação.

### Contas temporárias

O ciclo foi validado dentro de uma transação com rollback:

- vencimento bloqueia vendedor e login;
- exclusão é agendada conforme tolerância;
- renovação reativa a conta e cancela a exclusão;
- vencimento final executa exclusão lógica e preserva histórico;
- cron de produção continua ativo a cada cinco minutos.

## Proteção dos dados comerciais

A fotografia antes e depois permaneceu igual:

- créditos totais: 1999;
- aparelhos: 13;
- aparelhos ativos: 12;
- listas: 16;
- vínculos ativos: 9;
- lançamentos: 239;
- aparelhos ativos sem lista: 3.

Nenhum crédito, validade, aparelho, lista comercial ou vínculo foi modificado durante a implantação do backend.

## Testes

Passaram:

- reaplicação de todas as migrações desde zero;
- lint do PostgreSQL;
- pgTAP;
- type-check das Edge Functions;
- navegador E2E;
- painel e parser;
- Android;
- LG webOS;
- Samsung Tizen.

## Implantação

A Vercel não foi acionada durante as alterações de banco e backend. A interface administrativa será publicada uma única vez, após esta validação, para reduzir o consumo de builds.
