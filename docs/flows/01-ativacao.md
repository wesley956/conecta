# Fluxo 1: Ativação do aparelho e liberação no painel

**Perfis:** cliente (aparelho), ADM, vendedor · **Plataformas:** Android TV, LG webOS, Samsung, Web Player

## Passos

| # | Passo | Status | Evidência |
|---|---|---|---|
| 1 | O aparelho abre o app e gera um código; nasce como `pending` | ✅ | `[CÓD]` o app tem o estado "Pendente" ("Aguardando liberação"); `[BD]` `pending` existe como status e hoje há **0** pendentes, **0** há mais de 7 dias |
| 2 | ADM libera pelo modal "Liberar aparelho" (cliente, vendedor, plano, lista principal, reserva, validade; resumo de custo e saldo) | ✅ | `[CÓD]` `admin-operations-redesign.js`; contrato validado por `check-admin-operations-redesign` |
| 3 | Vendedor ativa pelo assistente de 5 etapas | ❔ | `[CÓD]` `seller-activation-wizard.js` e o E2E `check-lote4-browser-ux` cobrem o assistente; **portal não aberto por mim** |
| 4 | Consumo de crédito e registro (extrato, auditoria, operação comercial) | ✅ | `[BD]` saldo = soma do extrato em todos os vendedores; `panel_device_commercial_operations`: 33 ativações, 6 renovações, 43 trocas de lista |
| 5 | O aparelho recebe a lista principal | ✅ | `[BD]` **0** aparelhos ativos sem lista principal, sem vendedor, sem plano, sem cliente ou sem validade |
| 6 | Limite de tentativas de ativação (rate limit) | ❔ | `[BD]` **89** eventos `device.activation.rate_limited` na auditoria (contra 87 ativações); não sei se são tentativas indevidas ou clientes legítimos barrados. **A investigar** (sem issue ainda) |
| 7 | Tela de ativação da TV (o que o cliente vê enquanto espera) | 🟡 | `[#432]` sem logo, fontes de 10 px, 175 px vazios no topo |
| 8 | Pré-visualização da TV que "aguarda liberação" sem nunca registrar aparelho | 🟡 | `[#434]` achado inicial; não reverificado nesta rodada |
| 9 | Depois de liberado, o painel mostra o estado correto do aparelho | 🟡 | `[BD]` **16 de 28** "ativos" já estão vencidos e o painel os chama de "Ativo" `[#444]` |

## Variáveis e estados

- `panel_devices`: `status` (`pending`/`active`/`blocked`; **nunca** `expired` gravado), `device_code`, `device_credential_hash`, `subscription_expires_at`, `playlist_id`, `seller_id`, `plan_id`, `customer_id`, `web_access_enabled`.
- `panel_credit_ledger`, `panel_device_commercial_operations` (idempotência por `idempotency_key`), `panel_device_playlists` (lista principal e reserva com prioridade).

## Se algo falha

- Saldo insuficiente / `can_go_negative`: todos os vendedores têm `can_go_negative = false` `[BD]`; a mensagem exibida ao vendedor **não foi verificada** ❔.
- Código inválido ou tentativas demais: ver passo 6 ❔.

## Lacunas

#432 (P1), #444 (P1), rate limit (investigar).
