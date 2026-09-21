# Fluxo 6: Vendedor (créditos, plano, cliente, aparelho, renovação e vencimento)

**Perfis:** vendedor, ADM · **Plataformas:** portal do vendedor, painel ADM

> **Limite:** não tenho login de vendedor. As telas do vendedor estão `❔`; o que está marcado vem do banco e do código.

## Passos

| # | Passo | Status | Evidência |
|---|---|---|---|
| 1 | Saldo de créditos do vendedor bate com o extrato | ✅ | `[BD]` para os 5 vendedores, saldo = soma do extrato (diferença 0); total 1.965, igual ao indicador do painel |
| 2 | Modelo de créditos por lotes (com validade) | 🟡 | `[BD]` 0 lotes ativos: todos os saldos são legado; só 1 pedido de pacote existe. Por desenho, mas o modelo de lotes ainda não foi exercitado em produção |
| 3 | Vendedor sem saldo não passa do limite | ❔ | `[BD]` `can_go_negative = false` em todos; a tela/mensagem não foi verificada |
| 4 | Cadastro de clientes independente da ativação | ✅ | `[CÓD]` `check-commercial-consolidation` proíbe o acoplamento; 8 clientes `[BD]` |
| 5 | Preço por plano e venda registrada automaticamente | 🟡 | `[BD]` só **1** preço configurado `[#448]` |
| 6 | Renovação: confirmação reforçada se houver renovação recente; mostra validade atual e resultante | ✅ | `[CÓD]` coberto por `check-lote4-browser-ux` |
| 7 | Vencimento: o vendedor vê quantos aparelhos venceram | ✅ | `[CÓD]` `seller-panel` calcula `expiredDevices` por `daysLeft < 0`, sem depender do status gravado |
| 8 | Excluir aparelho como vendedor | 🟡 | `[BD]` 24 exclusões (`device.deleted_by_seller`); o que o cliente vê depois: `[#447]` |
| 9 | Extrato do vendedor | 🟡 | `[BD]` 119 de 279 movimentos são de vendedores excluídos (996 créditos); exibição do nome ❔ `[#448]`; o painel ADM mostra só 200 `[#423]` |
| 10 | Vendedor inativo com saldo | ❔ | `[BD]` 1 vendedor `inactive` com 5 créditos; regra para saldo de inativo não verificada |

## Variáveis e estados

`panel_sellers` (`credit_balance`, `can_go_negative`, `status`, `access_expires_at`, `auto_delete_after_expiry`, `scheduled_deletion_at`), `panel_credit_ledger` (`amount`, `balance_after`, `idempotency_key`, `seller_name_snapshot`), `panel_credit_lots`, `panel_seller_plan_prices`, `panel_customers`.

## Lacunas

#444, #447, #448, #423.
