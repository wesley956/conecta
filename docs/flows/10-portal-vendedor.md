# Portal do vendedor: verificação ao vivo (2026-09-21)

O portal do vendedor era a parte **não verificada** do inventário (ver [README](README.md)). Nesta rodada o dono entrou com a conta do vendedor "Wesley" e eu percorri as telas **somente em leitura**: não enviei nenhum formulário, não busquei nenhum código de aparelho, não cliquei em "Renovar", "Excluir" nem "Atualizar agora".

`[TELA]` = vista ao vivo nesta rodada · `[BD]` = banco · `[#N]` = issue/PR.

## Conta usada

`[BD]` papel **`seller`**, ligada ao vendedor "Wesley" (5 contas com papel no sistema; papéis existentes: `admin` e `seller`). Não é uma conta de administrador: por isso **as mudanças de painel ADM (#435 a #443) não puderam ser vistas nesta rodada**.

## Telas do portal

| Tela | Visto? | O que apareceu |
|---|---|---|
| **Início** | ✅ `[TELA]` | Saldo atual **34**; aparelhos ativos **1**; vencendo em 7 dias 0; vencidos 0; pendentes 0; bloqueados 0; créditos adicionados **110**; consumidos **76**. "Ações de hoje": nenhuma ativação pendente, nenhum vencimento próximo, "34 crédito(s)". **Bate com o banco:** 110 − 76 = 34 e o saldo do vendedor é 34 `[BD]` |
| **Ativar aparelho** | 🟡 | Campo "RPTV-XXXXXX" e botão "Buscar aparelho"; texto "Busque o código e siga o fluxo único. Não existe formulário comercial alternativo nesta tela." **A busca do código e o assistente de 5 etapas não foram testados** |
| **Meus aparelhos** | ✅ `[TELA]` | Filtros: Status (Todos, Ativos, Pendentes, **Vencidos**, Bloqueados, Inativos) e Vencimento (Todos, **Já vencidos**, vence hoje, até 7 dias, até 30 dias, mais de 30). "1 de 1 aparelho(s) exibido(s)". Cartão: código, cliente, WhatsApp, "Ativo", plano "mensal 1 tela", validade 10/10/2026 23:59 ("20 dia(s)"), lista principal "Teste 01", reserva "Não configurada", último acesso 09/08/2026. **Ações no cartão: Abrir, WhatsApp, Renovar, Alterar listas, Acesso Web.** Não há "Excluir" nem "Bloquear" no cartão (**não abri o "Abrir"** para ver se estão lá) |
| **Clientes** | ✅ `[TELA]` | 3 clientes (parecem de teste), botões "Novo cliente", "WhatsApp" e "Editar" |
| **Minhas listas** | ✅ `[TELA]` | Ver abaixo (2 achados) |
| **Baixar aplicativo** | ✅ `[TELA]` | Versão 2.9.9, 8,2 MB, 22/08/2026. **As notas aparecem em Markdown cru** ("# RonecaPlayTV 2.9.9", "- Remove...") e a tela oferece **"Samsung Tizen · .wgt"** sem pacote publicado. O módulo é o mesmo do ADM, então o PR #440 corrige as duas telas `[#440]` `[#446]` |
| Diagnóstico | ❔ | **Não visto** (a aba travou) |
| Meu suporte | ❔ | **Não visto** |
| Minhas vendas | ❔ | **Não visto** |
| Meus créditos | ❔ | **Não visto** |

## Minhas listas: achados

1. **Promessa falsa.** O cabeçalho dizia "O catálogo em cache é renovado automaticamente após 6 horas" e a lista antiga mostrava "Elegível para renovação automática: <data>". A atualização automática **não está ativa** `[#373]`. Corrigido no PR #450.
2. **Botões duplicados.** "Adicionar lista" (cabeçalho) e "Adicionar fonte" (quadro) abrem a **mesma** janela ("Cadastro universal de fontes"). No portal do vendedor o "Ferramentas antigas" **não é um botão morto**: ao clicar, a página cresce de 1.559 para 3.230 px e aparece a **lista antiga** (com "Atualizar agora" e "Excluir" por lista); clicar de novo volta ao normal. Por isso o PR #442 **mantém os três botões para o vendedor** e só limpa o ADM (no ADM esse botão não muda nada visível).
3. O quadro "Fontes universais" do vendedor mostrou 7 cartões.

## Acesso indevido ao painel do ADM

Com essa conta, abrir `/dashboard.html` mostra o painel do ADM vazio, com "Administrador — Conta principal" e o aviso "Painel carregado parcialmente". O servidor recusou os dados (sem vazamento), mas o vendedor vê o menu inteiro do administrador `[#451]`.

## Pontos de atenção técnicos

- A aba do navegador **travou várias vezes** ao trocar de tela no portal e depois de recarregar (consultas simples deram tempo esgotado de 45 s). **Não sei a causa**: pode ser o portal (vários `MutationObserver` e sobreposições de script, #376) ou outras abas do mesmo site abertas no mesmo processo do Chrome. **Não afirmo que é defeito do portal.** Reavaliar com as outras abas fechadas.
- Plural com "(s)" também no portal do vendedor: "aparelho(s)", "dia(s)", "crédito(s)" (o PR #443 só corrigiu o ADM).

## O que ainda falta neste perfil

As 4 telas não vistas; o assistente de ativação (5 etapas); "Renovar" e "Alterar listas"; o conteúdo de "Abrir" no aparelho (exclusão e bloqueio); "Atualizar agora" (atualização manual do cache).
