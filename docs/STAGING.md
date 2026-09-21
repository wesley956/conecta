# Staging — plano (DEV → STAGING → PRODUÇÃO)

Custo: R$0 na fase inicial (segundo projeto Supabase no plano gratuito; Vercel Preview do projeto existente).

1. Projeto Supabase `Player-Staging` (sa-east-1) — **pendente de autorização** (criação negada pelo classificador de permissões).
2. Aplicar as 84 migrations do repo em ordem lexicográfica; comparar schema com produção (evidência para DATA-02).
3. Vercel: separar a variável hoje compartilhada (Production+Preview) — Preview aponta ao Supabase de staging.
4. Deploy das funções em staging pelo pipeline com versão fixa da CLI; registrar SHA + ezbr_sha256.
5. Smoke tests: ativação de device, catálogo, painel, vendedor, Web Player, player.
6. Promoção staging → produção: backup (limitação: plano gratuito não tem PITR), rollback documentado, mesma revisão testada.
7. SEC-01 (REVOKE SELECT) validado primeiro em staging; rollback por GRANT.
