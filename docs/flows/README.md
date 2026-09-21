# Fluxos do RonecaPlayTV: inventário e matriz (FLOW-01, #434)

Levantamento de **2026-09-20**, com uma verificação ao vivo do portal do vendedor em **2026-09-21**. Uma ficha por fluxo, com cada passo marcado como completo, parcial, ausente ou não verificado, e a evidência de onde vem a marca.

## Como ler

**Status do passo**

| Marca | Significado |
|---|---|
| ✅ | Completo, com evidência |
| 🟡 | Parcial: existe, mas com lacuna conhecida |
| ❌ | Ausente |
| ❔ | **Não verificado** (não afirmo que funciona nem que falha) |

**Evidência**

| Tag | Significado |
|---|---|
| `[BD]` | Leitura no banco de produção (só contagens; nenhum dado pessoal foi copiado) |
| `[CÓD]` | Código do repositório na `main` (`38de79f0`) |
| `[TELA]` | Tela vista ao vivo (painel ADM em 2026-09-20; portal do vendedor em 2026-09-21). A versão em produção tem shims: ver #374 |
| `[#N]` | Issue ou PR já aberto com a evidência |

## O que este inventário NÃO cobre (limites)

- **Portal do vendedor: verificado só em parte** (2026-09-21, conta de vendedor, só leitura): 6 das 10 telas vistas, 4 não (a aba travou). Detalhes em [10-portal-vendedor.md](10-portal-vendedor.md). O assistente de ativação, "Renovar" e "Alterar listas" **não foram testados**.
- **App do cliente em aparelho (Android/TV/Web):** não verificado; o que está nas fichas vem do código (`ActivationScreen.kt` etc.) e de sessões anteriores do Web Player.
- **Painel ADM depois dos PRs #435 a #443:** nenhuma tela foi conferida (a conta usada em 2026-09-21 era de vendedor, sem acesso ao ADM).
- **Navegador:** a extensão travou várias vezes; a causa não foi determinada.
- Os números do banco são um retrato de 2026-09-20 e mudam.

## Matriz

| # | Fluxo | Situação | Lacunas (issues) | Ficha |
|---|---|---|---|---|
| 1 | Ativação do aparelho e liberação no painel | 🟡 | #432 (P1), #444 (P1), rate limit a investigar | [01](01-ativacao.md) |
| 2 | Cadastro de lista/fonte e cache | 🟡 (risco alto) | #373 (P0), #445, #426, #429, #450 | [02](02-listas-e-cache.md) |
| 3 | Assistir filme | 🟡 | #375 (P0), #419 (P0), #429 | [03-05](03-05-reproducao.md) |
| 4 | Assistir série | 🟡 | #428 (P1) | [03-05](03-05-reproducao.md) |
| 5 | TV ao vivo | 🟡 | #430 | [03-05](03-05-reproducao.md) |
| 6 | Vendedor: créditos, plano, cliente, aparelho, vencimento | 🟡 (portal visto em parte) | #448, #444, #451 | [06](06-vendedor-creditos.md), [10](10-portal-vendedor.md) |
| 7 | Financeiro e comercial do ADM | 🟡 | #423, #422, #448 | [07](07-financeiro-comercial.md) |
| 8 | Exclusão, bloqueio e vencimento do aparelho | 🟡 | #444 (P1), #447 | [08](08-bloqueio-vencimento.md) |
| 9 | Atualização do app (APK/IPK/WGT) | 🟡 | #421 (P0), #446 | [09](09-atualizacao-app.md) |

Nenhum fluxo está 100% fechado. Nenhum foi marcado 🟢 porque nenhum foi verificado de ponta a ponta com os três perfis.

## Lacunas por prioridade

**P0:** #373 (cache não atualiza sozinho), #375 (falhas de reprodução no Android), #419 (download completo do catálogo por chamada), #421 (webOS rejeitado por ícone).
**P1:** #428 (episódios concluídos em "continuar assistindo"), #432 (tela de ativação da TV), #444 (aparelho vencido aparece como "Ativo").
**P2:** #426, #429, #430, #445, #446, #447, #448.
**P3:** #451 (vendedor abre o painel do ADM e vê uma tela vazia).

**Dono das lacunas P0/P1:** o repositório tem um único mantenedor e as issues não têm responsável atribuído. Atribuir é uma decisão do dono; ficou pendente.

## Achados que não são defeito (para não serem "corrigidos" por engano)

- O **vencimento é aplicado no servidor** em vários pontos (biblioteca, EPG, séries, Web Player, mídia e atualização do app); o status "Ativo" com validade passada é só de exibição no painel (#444).
- **Créditos consistentes:** saldo = soma do extrato em todos os vendedores `[BD]`; a tela Início do vendedor confere (110 − 76 = 34) `[TELA]`.
- **Saldo legado sem lotes:** os 5 vendedores têm 0 lotes ativos em `panel_credit_lots`; o modelo de lotes só vale para pacotes comprados (1 pedido), e o saldo antigo é preservado por desenho (comentário da migração `2026072604`).
- **O servidor recusa** dados de administração para conta de vendedor `[TELA]`: o problema é só de apresentação (#451).
- **"Ferramentas antigas" no portal do vendedor funciona** (mostra a lista antiga); no ADM é um botão sem efeito visível. Por isso só o ADM foi limpo no PR #442.
