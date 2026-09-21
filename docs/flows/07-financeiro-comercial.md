# Fluxo 7: Financeiro e comercial do ADM

**Perfis:** ADM · **Plataformas:** painel ADM

## Passos

| # | Passo | Status | Evidência |
|---|---|---|---|
| 1 | Indicadores da tela Comercial (vendedores, créditos, planos, movimentações, ativos, bloqueados) | 🟡 | `[TELA]` "Movimentações" mostra 200; o banco tem 279. Mitigação "200+" no PR #441 `[#423]` |
| 2 | Extrato completo disponível no ADM | 🟡 | `[CÓD]` o servidor limita a 200 linhas (`.limit(200)`); depende de #374 para corrigir de vez |
| 3 | Financeiro da empresa (recebido em pacotes, a receber, em atraso, despesas, resultado) | ✅ | `[CÓD]` `admin-operations-redesign.js`; `[BD]` 1 venda de créditos paga; 4 recebimentos pendentes (2 ativações, 2 renovações), **0 vencidos** |
| 4 | Privacidade: o ADM não vê o financeiro particular dos vendedores | ✅ | `[CÓD]` o endpoint de organização administrativa não aceita perfil vendedor (checado por `check-admin-operations-redesign`) |
| 5 | Cobertura do financeiro | 🟡 | `[BD]` 47 registros contra ~265 ativações/renovações; só 1 preço configurado `[#448]` |
| 6 | Leiaute do Financeiro | 🟡 | `[TELA]` indicadores em R$ transbordavam a caixa; correção no PR #435 `[#422]` |
| 7 | Integridade referencial | ✅ | `[BD]` 0 registros financeiros apontando para aparelho inexistente |

## Lacunas

#423, #422, #448.
