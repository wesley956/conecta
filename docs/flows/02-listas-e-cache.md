# Fluxo 2: Cadastro e edição de lista/fonte, cache e modo direto

**Perfis:** ADM, vendedor · **Plataformas:** Painel ADM, portal do vendedor, todos os clientes (consomem o cache)

## Passos

| # | Passo | Status | Evidência |
|---|---|---|---|
| 1 | Cadastrar: "Nova lista" abre o "Cadastro universal de fontes" (3 passos: Origem, Segurança, Salvar; mensagem completa, M3U/HLS, Xtream ou outras fontes) | ✅ | `[TELA]` `[CÓD]` `universal-playlist-registration.js` |
| 2 | Botões redundantes de cadastro no quadro "Fontes universais" | 🟡 | `[TELA]` "Nova lista" e "Adicionar fonte" abrem a **mesma** janela; "Ferramentas antigas" não faz nada visível. Corrigido no ADM em PR #442 `[#426]` |
| 3 | Segurança TLS por fonte (validar, CA específica, ignorar erros, hosts autorizados) | ✅ | `[CÓD]` exceções TLS só pelo ADM; vendedor fica em `strict` |
| 4 | Gerar o cache do catálogo | ✅ | `[BD]` 34 listas com cache `ready` e caminho de arquivo preenchido (no levantamento) |
| 5 | **Atualizar o cache sozinho a cada 6 h** | ❌ | `[#373]` não está ativo (bloqueado por #418 e #378). `[BD]` **nenhum** dos 34 caches tinha menos de 7 dias; 33 tinham mais de 30; o mais recente é de 25/08/2026 |
| 6 | Erros de cache aparecem para o ADM | 🟡 | `[BD]` **16** listas com `cache_status = 'error'` no levantamento; o selo do painel mostra o erro, mas não há alerta ativo |
| 7 | O que o painel mostra quando o cache está velho | 🟡 | Antes: "Cache pronto" em verde para tudo `[#426]`. Agora (PR #442): mostra a idade e vira amarelo "Cache antigo" após 7 dias. **Hoje todos os caches ficam amarelos**, porque de fato todos têm mais de 7 dias |
| 8 | O que o **cliente** vê quando o cache está velho | ❔ | Não verificado no app. O catálogo é servido do cache `[CÓD]`, sem aviso de idade que eu tenha encontrado |
| 9 | Excluir/arquivar lista com verificação de impacto | ✅ | `[CÓD]` `safeDeletePlaylist` mostra aparelhos, vendedores e homologações afetados e bloqueia se for a principal de um aparelho ativo sem reserva; a função de banco `archive_playlist_safe_transaction` faz o arquivamento |
| 10 | Listas sem uso | ✅ | `[BD]` No levantamento: **23 de 51** sem nenhum vínculo (11 com cache, ≈153 MB). **Depois, com autorização do dono, no mesmo dia:** 17 excluídas e 5 arquivadas (`playlist.bulk_cleanup` na auditoria); restam 6 sem vínculo, todas arquivadas. Pendente: apagar as pastas órfãs do Storage pelo Dashboard `[#445]` `[#418]` |
| 11 | Texto de reserva "Filme autorizado pelo painel." mostrado ao usuário | 🟡 | `[#429]` |
| 12 | Proteção do histórico de troca de lista | ✅ | `[BD]` a FK `panel_device_playlist_revisions.new_playlist_id` é `RESTRICT`: lista que já foi usada por um aparelho **não pode ser apagada**, só arquivada (foi o que impediu excluir 5 das 23) |

## Variáveis e estados

`panel_playlists`: `active`, `archived_at`, `playlist_cache_status`, `playlist_cache_updated_at`, `playlist_cache_item_count`, `playlist_cache_size_bytes`, `playlist_cache_error(_code)`, `playlist_qualification_status` (`ready_cache`, `ready_direct`, `awaiting_device_test`, `retryable_error`, `blocked`, `validating`), `playlist_cache_version`; `panel_playlist_endpoints`, `panel_playlist_connection_profiles`, `panel_playlist_test_runs`; Storage `playlist-cache` (474 MB em uso e 720 MB órfãos: #418).

**Cascata ao excluir uma lista:** endpoints, perfis de conexão, importações, testes, sessões de validação, vínculos de vendedor, tentativas/lease/lock de cache e tentativas de provedor são apagados junto; `panel_devices.playlist_id`, diagnósticos e contas de revisão da LG ficam com `NULL` (por isso a exclusão só vale para lista sem esses vínculos).

## Se algo falha

Falhas de origem (conexão recusada, certificado, bloqueio) viram `retryable_error` ou `blocked` `[CÓD]`; `playlist_provider_attempts` guarda ~1.400 tentativas `[BD]`.

## Lacunas

#373 (P0), #418 (P0), #445, #426, #429.
