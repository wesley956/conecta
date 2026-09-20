# Fluxos 3, 4 e 5: Assistir filme, série e TV ao vivo

**Perfis:** cliente · **Plataformas:** Android TV/celular, Web Player, Smart TV (webOS/Tizen)

> **Limite:** o que vem das telas do Web Player foi visto numa sessão anterior de 2026-09-20 (Web Player logado) e está registrado nas issues citadas. Eu **não testei reprodução em aparelho** nesta rodada, então o comportamento em falha e recuperação no Android/TV está `❔`.

## Comum aos três

| # | Passo | Status | Evidência |
|---|---|---|---|
| 1 | A home carrega o catálogo a partir do cache | ✅ | `[TELA]` Web Player logado carrega o catálogo do Storage |
| 2 | Cada chamada baixa o JSON completo (até 12 MB) | 🟡 | `[#419]` P0: 178 chamadas em 10 min geraram 212 MB de download; correção do cliente no PR #420, do servidor pendente |
| 3 | Vencimento/bloqueio impedem o acesso | ✅ | `[CÓD]` `series-detail`, `channel-epg`, `web-player-media*` comparam `subscription_expires_at` com o agora |
| 4 | Falha de reprodução no Android é recuperada | ❌ | `[#375]` P0: 87% das falhas de reprodução no Android **sem recuperação**. `[BD]` `panel_playback_diagnostics` tem ~595 registros e `web_player_diagnostics` ~401 |
| 5 | Texto mostrado ao usuário quando falta descrição | 🟡 | `[#429]` "Filme autorizado pelo painel." vaza como conteúdo |

## Fluxo 3: Filme (abrir, tocar, falhar, recuperar, sair, retomar)

- Abrir e tocar: ✅ no Web Player `[TELA]`; ❔ no Android e na TV.
- Falha e recuperação: ❌/❔ (ver passo 4 acima).
- Sair e retomar: 🟡 `[BD]` `web_player_library_progress` (~63 registros) guarda o ponto; a regra de conclusão está em #428.

## Fluxo 4: Série (temporada e episódio, continuar, concluído)

- Detalhe da série servido por `series-detail` com checagem de vencimento ✅ `[CÓD]`.
- **Continuar assistindo:** 🟡 `[#428]` P1: mostra o mesmo seriado várias vezes (7 de 12 cartões) e 6 episódios com 96 a 98% nunca saem da lista, porque a regra de conclusão só considera o fim a partir de 45 s do final.

## Fluxo 5: TV ao vivo (categoria, canal, EPG, falha)

- Lista de canais: 3.368 canais no Web Player `[TELA]`.
- 🟡 `[#430]` quadrados de logo vazios, botão "‹" sem rótulo, contador "3368" sem legenda.
- EPG: `channel-epg` valida vencimento e credencial do aparelho ✅ `[CÓD]`; o que aparece quando o EPG falha ❔.

## Lacunas

#375 (P0), #419 (P0), #428 (P1), #429, #430.
