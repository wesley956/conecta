# Fluxo 9: Atualização do app (APK/IPK/WGT) e versões

**Perfis:** ADM, vendedor, cliente · **Plataformas:** Android, LG webOS, Samsung Tizen

## Estado das releases `[BD]` (2026-09-20)

| Plataforma | Releases | Mais recente | Obrigatória |
|---|---|---|---|
| Android (`apk`) | 26 (2.3.2 a 2.9.9) | 2.9.9, 22/08/2026, 8,4 MB | nenhuma (`mandatory = false`) |
| LG webOS (`ipk`) | 2 (0.5.0, 1.0.0) | 1.0.0, 28/07/2026, 5 KB | nenhuma |
| Samsung Tizen (`wgt`) | **0** | não existe | n/a |

## Passos

| # | Passo | Status | Evidência |
|---|---|---|---|
| 1 | Painel: escolher plataforma, ver versão, tamanho, data e notas | ✅ | `[TELA]` `[CÓD]` `app-release.js`; notas formatadas no PR #440 `[#427]` |
| 2 | Painel: gerar link temporário (1 h) e baixar | ✅ | `[CÓD]` `app-release.js`; o campo de link vazio aparecia antes de gerar (corrigido no PR #440) |
| 3 | Só oferecer plataformas que têm pacote | 🟡 | `[BD]` "Samsung Tizen · .wgt" é oferecido sem nenhuma release `[#446]` |
| 4 | Aparelho vencido consegue atualizar o app | 🟡 | `[CÓD]` `app-release` compara `subscription_expires_at`; vencido não baixa a atualização (efeito colateral a decidir) |
| 5 | Forçar atualização de versão antiga | ❌ | `[BD]` `mandatory = false` em todas as releases `[#446]` |
| 6 | Pipeline do Android valida o build | 🟡 | `[CI]` o job "Native Android Compose and Media3" falha em ~15 a 20 s **em todos os PRs** (inclusive só de documentação); causa não investigada; risco para publicar APK novo |
| 7 | webOS aceito na loja LG | ❌ | `[#421]` P0: rejeitado por formato de ícone; a versão publicada (1.0.0, 28/07) é anterior ao gerador de ícones (11/08) |
| 8 | Samsung Tizen publicado | ❌ | `[BD]` nenhuma release `[#446]` |

## Lacunas

#421 (P0), #446, e o job Android do CI (sem issue própria ainda).
