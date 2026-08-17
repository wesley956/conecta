# RonecaPlayTV Web — Threat model

Escopo: login Web, sessão, catálogo, broker, media gateway, PWA, biblioteca canônica, diagnóstico e gestão pelo painel.

## Princípio central

O navegador é um cliente não confiável. Ele pode receber somente sessão Web própria, catálogo sanitizado, `contentId`/`recoveryToken` opacos e URLs temporárias classificadas pelo broker. Credenciais técnicas do APK/IPK, `playlist_url`, usuário/senha Xtream, service role, PIN em claro e URL privada de origem não pertencem ao contrato Web.

## Ameaças e controles

| Ameaça | Controle |
|---|---|
| Enumeração de device code | Erro genérico, hash do código em telemetria/rate-limit, custo criptográfico semelhante para aparelho inexistente. |
| Brute force do PIN | PIN 6 dígitos derivado PBKDF2-SHA256 210k + salt + pepper server-side; rate limit por código/IP; reset revoga sessões. |
| Replay de refresh | Refresh rotativo com compare-and-update pelo hash anterior; replay falha; backend guarda apenas hashes. |
| Roubo de access token | Access token só em memória; lifetime idle; backend revalida aparelho; logout/revogação imediata. |
| XSS | React escaping, sem `dangerouslySetInnerHTML` no produto Web, CSP `script-src 'self'`, no inline script. |
| CSRF | APIs Web não usam cookie de autenticação; bearer explícito + Origin allowlist; painel usa bearer Supabase + Origin allowlist. |
| Clickjacking | CSP `frame-ancestors 'none'` + X-Frame-Options DENY. |
| SSRF/open proxy | Gateway não recebe URL arbitrária; URL nasce de token selado; valida protocolo/DNS/destino público/redirect; URL real não é escolhida pelo browser. |
| IDOR/BOLA em conteúdo | `contentId` AES-GCM escopado a device/playlist/tipo/expiração; sessão e playlist são revalidadas server-side. |
| Manipulação do recovery | `recoveryToken` selado contém contentKey/priority/urlIndex; navegador informa apenas código sanitizado de falha. |
| Cache de segredo | Service worker allowlist-only; rejeita Authorization, token params, Edge Functions, HLS e mídia; logout limpa cache privado local. |
| Vazamento em logs | Diagnóstico aceita somente correlationId, browser, versão, tipo, estágio, errorCode, recovered e papel da lista. |
| Abuso de bandwidth | Broker é rate-limited; segmentos HLS não usam contador DB request-a-request; gateway fica OFF até gate de custo/egress. |
| Sessão de aparelho bloqueado | `requireWebSession` e gateway revalidam status/expiração/Web enabled; painel revoga sessão imediatamente. |
| Seller acessando aparelho alheio | `web-access-panel` compara `seller_id` server-side; UI não é fronteira de segurança. |
| Dependência comprometida | Dependências pinadas, CI typecheck/build; atualização exige revisão/preview. |
| Mixed content | Produção exige HTTPS; Direct Safe exige HTTPS e permanece OFF por padrão. |
| CORS excessivo | Endpoints Web e painel refletem apenas origins configuradas/local dev; nenhum `*` em auth/catalog/playback/library/diagnostic/panel. |

## Rate limits

- login: janela específica anti-enumeração por código + IP;
- refresh: 20/min por sessão;
- catálogo/EPG/séries: 40/min por sessão;
- broker authorize/recover: 60/min por sessão;
- diagnóstico: 40/min por sessão;
- gestão Web do painel: 40/min por ator+aparelho;
- segmentos/media gateway: **não** usam contador PostgreSQL por segmento.

## PWA

O service worker só pode guardar shell versionado, assets próprios, manifest e página offline. É proibido guardar respostas de autenticação, catálogo privado, autorização, manifest HLS, segmento, vídeo/áudio ou URL com `token`.

## Recovery

Ordem autoritativa no backend: retry transitório da origem atual (2/4/8 s) → próxima origem do item → mesma identidade lógica na lista seguinte autorizada → indisponível. Erros definitivos não entram em retry cego. Offline aguarda evento `online`. Zapping/unmount cancela timers/lifecycle anterior.

## Dados da biblioteca

A biblioteca canônica usa `contentKey` lógico e scope `customer:<uuid>` ou fallback `device:<uuid>`. Não guarda URL, provider ID, PIN, token ou credencial. Progresso é monotônico por padrão para impedir checkpoint atrasado de reduzir a posição; restart explícito usa reset.

## Segredos/ambiente

`WEB_PLAYER_TOKEN_SECRET`, service role e origens permitidas são somente backend/configuração do ambiente. O bundle Web não pode conter esses valores. `WEB_MEDIA_GATEWAY_ENABLED` e `WEB_ALLOW_DIRECT_SAFE` ficam `false` até homologação.
