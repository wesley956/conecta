# Portal do vendedor: verificação ao vivo (2026-09-21)

O portal do vendedor era a parte **não verificada** do inventário (ver [README](README.md)). O dono entrou com a conta do vendedor "Wesley" em duas rodadas (a sessão caiu entre elas) e eu percorri as telas **somente em leitura**: não enviei nenhum formulário, não busquei nenhum código de aparelho, não cliquei em "Renovar", "Excluir", "Atualizar agora" nem "Registrar recebimento".

`[TELA]` = vista ao vivo · `[BD]` = banco · `[CÓD]` = código · `[#N]` = issue/PR.

## Conta usada

`[BD]` papel **`seller`**, ligada ao vendedor "Wesley" (5 contas com papel no sistema; papéis existentes: `admin` e `seller`). Não é uma conta de administrador.

## Todas as 10 telas do portal, agora vistas

| Tela | Visto? | O que apareceu |
|---|---|---|
| **Início** | ✅ | Saldo atual **34**; aparelhos ativos **1**; créditos adicionados **110**; consumidos **76** (110−76=34, bate com o banco) `[BD]` |
| **Ativar aparelho** | 🟡 | Campo do código e "Buscar aparelho"; **a busca e o assistente de 5 etapas não foram testados** |
| **Meus aparelhos** | ✅ | Filtros "Vencidos"/"Já vencidos"; ações Abrir, WhatsApp, Renovar, Alterar listas, Acesso Web; sem "Excluir"/"Bloquear" visível no cartão (não abri "Abrir") |
| **Clientes** | ✅ | 3 clientes, "Novo cliente", "WhatsApp", "Editar" |
| **Minhas listas** | ✅ | Promessa falsa de renovação automática corrigida `[#450]`; botões duplicados mantidos de propósito ("Ferramentas antigas" funciona aqui, diferente do ADM) |
| **Baixar aplicativo** | ✅ | **Confirmado em produção, após o merge do #440:** as notas da 2.9.9 aparecem como lista com marcadores, não mais em Markdown cru ("# RonecaPlayTV", "-") |
| **Diagnóstico** | ✅ | 5 indicadores (Problemas em 24h, Aparelhos afetados, Recuperados, Sem lista reserva, Precisam verificar), todos 0; busca, filtro por situação, paginação; "Nenhum problema encontrado. Ótima notícia." |
| **Meu suporte** | ✅ | Formulário de perfil de suporte (nome comercial, WhatsApp, e-mail, URL, texto de atendimento, horário, checkbox de exibição) com prévia ao lado. **Achado:** o campo "Texto curto de atendimento" (`#sellerSupportText`) estava em fonte monoespaçada — mesmo defeito do `#adminSupportText` que o #438 corrigiu, mas só para o ADM. Corrigido e confirmado ao vivo `[#452]` |
| **Minhas vendas** | ✅ | "Meus preços por plano": os **2 planos deste vendedor não têm preço configurado** (confirma o achado geral do `[#448]` a nível de conta real). Indicadores Recebido/Pendente/Atrasado/Vendas pagas/Ticket médio, todos zerados. Mesmo "1 crédito(s)" sem plural correto (fora do escopo do #443, que só cobriu o ADM) |
| **Meus créditos** | ✅ | Extrato de movimentações (ativações/renovações, -1 cada, com saldo após). **Achado:** o cabeçalho "Saldo atual" aqui mostra **0** (é `cpSellerBalance`, do sistema de compra financiada de pacotes — recurso à parte), diferente do "Saldo atual: 34" da tela Início. Mesmo rótulo, dois significados `[#453]` |

**Todas as 10 telas foram vistas.** O que continua não testado: o assistente de ativação (5 etapas), "Renovar", "Alterar listas", "Registrar recebimento", e o conteúdo de "Abrir" no aparelho.

## Achados novos desta rodada

- **#452** (corrigido): `#sellerSupportText` em fonte monoespaçada.
- **#453** (aberto): "Saldo atual" com dois significados.
- **Plural "crédito(s)" no lado do vendedor** (Minhas vendas: "custo 1 crédito(s)") não foi corrigido — o #443 só tratou o ADM. Sem issue própria ainda; ver #427.

## Pontos de atenção técnicos

- A aba do navegador **trava ao trocar de tela no portal do vendedor**, de forma repetida (confirmado em duas rodadas de teste, com abas diferentes). Os comandos parecem executar mesmo assim (a ação acontece), só a confirmação demora ~30–45 s. **Não determinei a causa**; não afirmo que é defeito do portal.
- **A sessão do vendedor caiu** ao navegar para fora e voltar (sessionStorage não sobreviveu à re-navegação nesta sessão de teste); exigiu login de novo. Não investiguei se é TTL curto do token ou efeito da minha navegação entre abas/reinicializações do Chrome.
