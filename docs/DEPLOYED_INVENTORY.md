# DEPLOY-01 — Inventário e reconciliação (produção x main)

Estado em 2026-09-19 (leitura somente-leitura via MCP; 58 funções implantadas).

## Achados
- Funções "shim": `admin-panel`/`seller-panel` (→ `0c410f71…`), `web-player-playback` (→ `bd8aa03a…`),
  `web-player-media-resolve-v4` (→ `66519540…`), `seller-provision`/`seller-delete` (→ `2beac235…`),
  `web-player-homolog` (→ `3b42923e…`). Executam código importado de `raw.githubusercontent.com` em um SHA fixo,
  que NÃO é `main`.
- Funções inline: `device-config`, `device-activate`, `series-detail`, `admin-inline-playlist`, `finance-panel`,
  `subscription-playlist-edit`, `app-release`, `channel-epg`, `credit-packages-panel` (fonte lida e diferente do repo em graus variados).
- Deriva de `_shared/panelAuth.ts`: cada função inline empacota sua própria cópia; as versões diferem entre funções.
- Órfãs: 7 retornam 410 (confirmado), 3 ativas sem equivalente no repo, 5 sem leitura conclusiva.
- O código de auto-refresh de 6 h (`20260831070000_playlist_cache_auto_refresh_6h.sql`) existe no repo e não está implantado.

## Como provar "este commit é o que roda"
1. `scripts/audit-deployed-functions.mjs` compara lista implantada x repo e falha (exit 1) se houver shim ou função fora do repo.
2. Pipeline de deploy (a implementar em staging primeiro): CLI Supabase com versão fixa, deploy por função a partir de um commit,
   registro de `git SHA` + `ezbr_sha256` por função em `docs/deploy-ledger.json`.
3. Auditoria periódica compara `ezbr_sha256` atual com o ledger.

## Regras de transição (sem ação destrutiva)
- Snapshot da fonte atual de cada função antes de qualquer troca (rollback = reimplantar o snapshot).
- Trocar shim por deploy real só após validação em staging; uma função por vez.
- Nenhuma função órfã é removida sem aprovação explícita.
