# RonecaPlayTV Web Player

Cliente oficial de navegador da RonecaPlayTV. Este diretório é independente do `smart-tv/`: reaproveita identidade, conceitos e contratos seguros, mas não reutiliza `deviceCredential`, lifecycle webOS nem premissas de D-pad.

## Fluxo

```text
browser
  -> código do dispositivo + PIN Web
  -> web-player-auth
  -> web_player_sessions
  -> web-player-catalog (IDs opacos)
  -> web-player-playback (autorização curta)
  -> Direct Safe ou web-player-media
  -> HTML5 / HLS nativo / HLS.js
```

## Fronteira de segurança

O browser pode receber:
- token de sessão Web próprio;
- metadados sanitizados de catálogo;
- IDs opacos de conteúdo;
- autorização curta de playback;
- URL do gateway ou URL pública classificada como Direct Safe.

O browser não pode receber:
- `deviceCredential` do APK/IPK;
- `playlist_url` privada;
- usuário/senha Xtream;
- M3U privada;
- `service_role`;
- URL de mídia com credencial embutida.

`web-player-access` é um endpoint separado, destinado ao cliente instalado já autenticado pelo aparelho para criar/resetar o PIN Web. Ele não é chamado pela página pública.

## Sessão

- access token: mantido somente em memória;
- refresh token: `sessionStorage`, limitado à aba/sessão do navegador;
- backend persiste somente hashes;
- refresh rotaciona access + refresh;
- timeout idle inicial: 30 min;
- lifetime absoluto inicial: 7 dias;
- limite por aparelho: configurável, padrão 2, aplicado sob lock no banco;
- bloquear/expirar/desabilitar o aparelho invalida o uso Web.

A WEB-12 substituirá a persistência local temporária de favoritos/progresso por sincronização server-side canônica.

## Catálogo

`web-player-catalog` lê o cache privado server-side e cria uma projeção segura. Campos `url` e `playbackUrls` não entram na resposta Web.

Cada `contentId` é um envelope AES-GCM opaco, escopado para:
- dispositivo;
- playlist vinculada;
- tipo de conteúdo;
- ID de origem;
- expiração.

Manipular um `contentId` de outro aparelho não deve conceder acesso porque o token é validado contra a `web_session` atual e contra as playlists realmente vinculadas.

## Mídia

### Direct Safe
Desabilitado por padrão. Só pode ser habilitado por `WEB_ALLOW_DIRECT_SAFE=true`. Ainda assim, exige HTTPS e rejeita URL com userinfo/query/path que pareça conter credencial.

### Media Gateway
Implementado como prova técnica e **desabilitado por padrão**. Ativar apenas em homologação controlada com:

```text
WEB_MEDIA_GATEWAY_ENABLED=true
```

O gateway:
- não recebe `?url=` arbitrária;
- abre somente URL selada pelo broker;
- revalida sessão/dispositivo;
- valida destino público/DNS;
- limita redirects;
- repassa Range;
- reescreve URIs de manifest HLS para tokens-filhos;
- não devolve URL real da origem ao browser.

Antes de produção, WEB-05 precisa confirmar limites de duração, concorrência, egress e custo da infraestrutura escolhida. Supabase/Vercel não devem ser assumidos como relay definitivo de vídeo sem esse gate.

## Player

Estratégia inicial:
- Safari/ambiente com HLS nativo: `<video>` nativo;
- browsers com MSE: HLS.js estável pinado no projeto;
- arquivo compatível: HTML5 direto/gateway;
- formato sem suporte: erro explícito, sem loop infinito.

Recursos no lote WEB-01–WEB-10:
- Live, filme e episódio;
- play/pause e controles HTML5;
- seek VOD;
- aspecto Original / Preencher / Estender;
- fullscreen;
- PiP quando disponível;
- áudio/legendas quando HLS.js expõe tracks;
- EPG para Live;
- drawer para troca rápida de canal;
- cleanup de player/HLS ao trocar ou sair;
- checkpoints locais de VOD como fundação da WEB-12.

Recovery automático, watchdog e failover profundo pertencem à WEB-11 (#314) e não devem ser adicionados por retry cego dentro do player.

## Variáveis

Frontend:

```text
VITE_SUPABASE_FUNCTIONS_URL=https://<project>.supabase.co/functions/v1
```

Backend:

```text
WEB_PLAYER_ORIGINS=https://dominio-do-player.example
WEB_PLAYER_TOKEN_SECRET=<segredo aleatório de backend>
WEB_MEDIA_GATEWAY_ENABLED=false
WEB_ALLOW_DIRECT_SAFE=false
```

`WEB_PLAYER_TOKEN_SECRET` deve existir somente no backend. O fallback atual usa a service role apenas como material server-side se o segredo dedicado ainda não estiver configurado; produção deve preferir segredo dedicado.

## Desenvolvimento

```bash
cd web-player
npm install
npm run typecheck
npm run build
npm run dev
```

## Status do primeiro lote

- WEB-01: fundação/arquitetura implementada nesta branch; validação CI pendente.
- WEB-02: login + PIN + endpoint seguro de provisionamento implementados; UI nos clientes instalados/painel fica para integração posterior.
- WEB-03: sessões, rotação, expiração, limite e logout implementados; homologação pendente.
- WEB-04: catálogo opaco + broker implementados; testes de abuso pendentes.
- WEB-05: gateway técnico implementado mas permanece bloqueado por feature env até prova de infraestrutura/mídia real.
- WEB-06: shell responsivo implementado.
- WEB-07: Home/busca/categorias/catálogo implementados.
- WEB-08: detalhes de VOD/séries e persistência local temporária implementados; sync definitivo depende WEB-12.
- WEB-09: Live/EPG/zapping implementados.
- WEB-10: player HTML5/HLS implementado; cross-browser físico ainda é gate.

Nenhuma dessas marcações autoriza deploy comercial ou merge em `main` sem revisão e CI.
