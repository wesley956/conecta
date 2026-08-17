# RonecaPlayTV Web — Release gate

Este documento separa **evidência automatizável** de **homologação física/operacional**. Nenhum checkbox manual pode ser marcado apenas porque o código compilou.

## Build promovível

O release candidato deve nascer de um SHA único. O mesmo `web-player/dist` aprovado em preview é o artefato a promover; não reconstruir com dependências diferentes entre QA e produção.

Ambientes:
- local: `/web/` em localhost, origins locais permitidas;
- preview/homologação: domínio HTTPS isolado, Supabase de homologação ou funções apontadas explicitamente;
- produção: domínio confirmado, origins exatas, segredo dedicado, gateway/direct-safe desligados até aprovação específica.

## Gates automáticos

- TypeScript do Web Player;
- build Vite;
- scan do bundle por `deviceCredential`, `playlist_url`, service role e outros segredos;
- Deno check de todas Edge Functions;
- migration reset do zero + db lint + pgTAP;
- contratos de recovery 2/4/8, contentKey e sync;
- PWA allowlist/cache inspection;
- sintaxe e contrato de RBAC do painel;
- budget de bundle;
- regressões existentes: Admin, Browser E2E, Smart TV e Android;
- smoke cross-browser automatizado quando os browsers Playwright estiverem instalados no runner.

## Matriz manual obrigatória antes de rollout comercial

| Plataforma | Gate |
|---|---|
| Chrome desktop atual | Login, catálogo, Live, VOD, recovery, fullscreen, logout |
| Edge desktop atual | Mesmo fluxo |
| Firefox desktop atual | HLS via MSE, áudio, seek e recovery |
| Safari macOS | HLS nativo, fullscreen, PiP quando disponível |
| Safari iPhone/iPad | orientação, safe areas, HLS nativo, background/foreground |
| Chrome Android | touch, fullscreen, troca de rede, retomada |
| hardware fraco | catálogo grande, 20 ciclos abre/fecha player, memória estável |

Esses gates precisam de evidência humana/QA; CI não simula fidelidade de hardware/decoder.

## Mídia autorizada real

Antes de habilitar `WEB_MEDIA_GATEWAY_ENABLED=true`, testar com conteúdo autorizado que represente:
- HLS master + variants;
- AES/key URI se existir no catálogo permitido;
- VOD com Range;
- Live longo;
- troca de origem;
- lista reserva;
- códigos 401/403/404/429/5xx;
- stall de manifest/segmento;
- token expirando durante sessão longa.

Não usar mídia de terceiros sem autorização para homologação.

## Performance/leak

Medir em preview:
- tempo login→Home;
- catálogo grande e busca;
- tempo clique→primeiro frame por tipo;
- 20 ciclos abrir/fechar VOD;
- 30 trocas de canal;
- listeners/HLS instances retornam ao baseline após fechar;
- tamanho JS/CSS dentro do budget CI.

## Gateway: custo e capacidade

Antes de produção registrar:
- egress por hora de Live/VOD;
- concorrência alvo;
- duração máxima de request suportada pela infraestrutura escolhida;
- comportamento de Range/HLS;
- custo estimado por 100 usuários simultâneos;
- proteção contra uso abusivo.

Até essa planilha/evidência existir, o gateway permanece OFF.

## Observabilidade

Acompanhar somente dados sanitizados:
- errorCode por browser/contentType/stage;
- recovery rate e sucesso;
- uso de lista backup;
- correlationId para suporte;
- login/rate-limit sem deviceCode em claro.

Nunca registrar URL real, PIN, access/refresh token, deviceCredential ou credencial Xtream.

## Rollout

1. Preview interno sem gateway.
2. Homologação por contas/aparelhos selecionados.
3. Canary pequeno com Web access explicitamente habilitado no painel.
4. Aumentar gradualmente somente se erro/recovery/custo estiverem dentro do esperado.
5. Produção ampla após matriz manual e mídia real.

## Rollback

Rollback primário:
1. desabilitar acesso Web dos aparelhos/grupo;
2. manter APK/IPK vinculados e operacionais;
3. reverter deployment Web para SHA anterior;
4. `WEB_MEDIA_GATEWAY_ENABLED=false` imediatamente se o problema for mídia/custo;
5. revogar sessões Web quando o incidente envolver autenticação/segredo;
6. preservar biblioteca canônica — rollback do frontend não apaga favoritos/progresso.

Migration destrutiva não faz parte do rollback de aplicação. Novas tabelas são aditivas e service-role only.

## Estado do Android/TV neste lote

- Smart TV: write-through de favorito/progresso para `device-library` quando possui `contentKey`; cache local continua como fallback.
- Android: `LibrarySyncApi` foi adicionado, mas a substituição automática de `PlaybackPreferences` fica **bloqueada até homologação específica do APK**, para não mudar a persistência comercial sem teste. O adapter usa a mesma identidade e mesma credencial do aparelho, nunca web_session/PIN.
- Web: server-first para favoritos/progresso/preferências; cache local é apenas aceleração e é limpo no logout.

A sincronização Android server-first só pode ser marcada como concluída após migração/homologação do APK. Isso é uma limitação explícita, não uma suposição de paridade.
