# Fluxo 8: Exclusão, bloqueio e vencimento do aparelho (e o que o app mostra)

**Perfis:** ADM, vendedor, cliente · **Plataformas:** todas

## Matriz de estados

| Estado do aparelho | O servidor faz | O painel ADM mostra | O app Android mostra | Web Player / TV |
|---|---|---|---|---|
| **Vencido** (validade no passado) | Nega acesso em vários endpoints; `device-config` devolve `expired` na hora `[CÓD]` | "Ativo" (status gravado) + "Vencido há N dias" `[TELA]` `[#444]` | "Assinatura expirada — Renove a assinatura para continuar"; apaga o catálogo salvo `[CÓD]` | Web Player: `WEB_DEVICE_EXPIRED` `[CÓD]`; tela ❔; TV ❔ |
| **Bloqueado** (`blocked`/`revoked`) | Nega acesso `[CÓD]` | "Bloqueado" (1 aparelho `[BD]`) | "Acesso bloqueado — A identidade segura deste aparelho não foi confirmada"; apaga o catálogo salvo `[CÓD]` | ❔ |
| **Excluído** (cadastro removido) | ❔ não verificado | some da lista | ❔ **não verificado**; se o servidor responder um 4xx genérico, o app cai em "Bloqueado" e mostra a mensagem de identidade `[CÓD]` `[#447]` | ❔ |
| **Pendente** | Sem acesso ao catálogo | "Pendente" | "Aguardando liberação" `[CÓD]` | ❔ |

## Passos

| # | Passo | Status | Evidência |
|---|---|---|---|
| 1 | Vencimento é aplicado no servidor | ✅ | `[CÓD]` `device-library`, `device-config`, `channel-epg`, `series-detail`, `web-player-access`, `web-player-auth`, `web-player-media*`, `app-release` |
| 2 | Status "vencido" existe como valor | ❌ | `[BD]` nenhum aparelho tem `status = 'expired'`; 16 de 28 "ativos" estão vencidos `[#444]` |
| 3 | App Android distingue vencido de bloqueado | ✅ | `[CÓD]` `DeviceSessionRepository` (4 estados) e `ActivationScreen` |
| 4 | O catálogo salvo é apagado quando bloqueado/expirado | ✅ | `[CÓD]` `CatalogSnapshotAccessPolicy` e teste unitário |
| 5 | Excluir aparelho é confirmado e registrado | ✅ | `[BD]` 168 `device.deleted` e 24 `device.deleted_by_seller` na auditoria |
| 6 | O que o cliente vê depois de excluído | ❔ | `[#447]` precisa de aparelho de teste |
| 7 | `device-library` usa o mesmo erro para bloqueado, vencido e inativo | 🟡 | `[CÓD]` `DEVICE_LIBRARY_INACTIVE` nos três casos; nenhum cliente o trata especificamente |

## Lacunas

#444 (P1), #447.
