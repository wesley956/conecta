# RonecaPlayTV

Aplicativo cliente para Android, TV Box, Android TV e WebView, construído com React + Vite + TypeScript + Capacitor. O app funciona como player legal/autorizado: ele não fornece canais, filmes, séries ou listas próprias. O conteúdo é liberado por um painel externo e vinculado ao código do aparelho.

## Estado atual do projeto

Este repositório contém o app cliente do RonecaPlayTV. O projeto já possui:

- React + Vite + TypeScript.
- Tailwind CSS 4.
- Zustand para estado global.
- Capacitor configurado para geração de aplicativo Android.
- Splash, ativação do aparelho, home, canais, filmes, séries, favoritos, busca, configurações e telas de erro.
- Player com suporte a HLS (`hls.js`), MPEG-TS (`mpegts.js`) e reprodução nativa quando possível.
- Integração com painel externo por código do aparelho.
- Cache local em IndexedDB para canais, filmes, séries e playlists.
- Cache do painel por snapshot completo ou partes separadas de canais, filmes e séries.
- Parser M3U em Web Worker para reduzir travamentos em listas grandes.
- Suporte a fontes Xtream com carregamento sob demanda de séries.
- Navegação preparada para controle remoto de TV Box/Android TV.

## Como o fluxo funciona

1. O usuário abre o app.
2. O app gera ou recupera o código do aparelho.
3. O vendedor/admin libera esse código no painel externo.
4. O painel retorna status, vencimento e lista vinculada.
5. O app carrega cache pronto do painel ou baixa a lista M3U/Xtream.
6. O conteúdo é organizado em canais, filmes e séries.
7. O app salva um snapshot local para acelerar as próximas aberturas.
8. O usuário navega e reproduz o conteúdo autorizado.

## Requisitos

- Node.js compatível com Vite 7.
- npm.
- Android Studio/SDK quando for gerar APK localmente.
- Java/JDK compatível com a versão do Android Gradle Plugin usada pelo Capacitor.

## Instalação

```bash
npm install
```

## Rodar em desenvolvimento

```bash
npm run dev
```

O servidor Vite também registra proxies de desenvolvimento para lista M3U e mídia:

- `/api/dev-m3u-proxy`
- `/api/m3u-proxy`
- `/api/dev-media-proxy`
- `/api/media-proxy`

## Build web

```bash
npm run build
```

## Verificação completa

```bash
npm run verify
```

Esse comando executa:

1. Teste do parser M3U.
2. Typecheck TypeScript.
3. Build Vite.

## Build single-file

```bash
npm run build:singlefile
```

Use quando precisar gerar uma versão com bundle concentrado em um único arquivo HTML/JS/CSS, conforme suporte do `vite-plugin-singlefile`.

## Servir build em Node

```bash
npm run serve:prod
```

ou, se o `dist/` já existir:

```bash
npm run serve:dist
```

O `server.mjs` serve o build e expõe proxies de mídia/lista para ambiente controlado.

## Variáveis de ambiente

Crie um `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

Principais variáveis:

```env
VITE_ENABLE_DEVICE_PANEL=true
VITE_DEVICE_CONFIG_URL=https://seu-painel.com/api/device-config
```

Variáveis opcionais do servidor Node/proxy:

```env
PORT=4173
RONECA_PROXY_ALLOWED_HOSTS=
RONECA_ALLOW_PRIVATE_PROXY=false
```

`RONECA_PROXY_ALLOWED_HOSTS` aceita uma lista separada por vírgulas. Quando preenchida, o proxy só acessa esses hosts. `RONECA_ALLOW_PRIVATE_PROXY=true` libera URLs privadas/locais, útil apenas em ambiente controlado.

## Capacitor / Android

O Capacitor está configurado em `capacitor.config.ts` com:

- `appId`: `com.ronecaplaytv.app`
- `appName`: `RonecaPlayTV`
- `webDir`: `dist`
- `androidScheme`: `http`
- `cleartext`: `true`

Fluxo comum para gerar o projeto Android localmente:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Depois, gere o APK/AAB pelo Android Studio ou por Gradle dentro da pasta `android/`.

Importante: a pasta `android/` não deve ser ignorada quando você quiser versionar ajustes nativos do app, como permissões, ícones, splash, assinatura e configurações Gradle. Os artefatos gerados (`android/build`, `android/app/build`, `.gradle`, `*.apk`) continuam ignorados.

## Segurança e uso correto

O RonecaPlayTV não fornece conteúdo. Ele deve ser usado somente com listas e fontes autorizadas. O projeto não deve incluir canais, filmes, séries, listas piratas, scraping de conteúdo pago, bypass de DRM ou qualquer mecanismo de violação de direitos autorais.

Se publicar o `server.mjs` na internet, configure `RONECA_PROXY_ALLOWED_HOSTS` para evitar que o proxy seja usado como proxy aberto.

## Estrutura principal

```text
src/
  App.tsx                         Roteador principal por estado
  main.tsx                        Entrada React
  stores/appStore.ts              Estado global Zustand
  screens/                        Telas do app
  components/shared.tsx           Layout, menu lateral e componentes comuns
  hooks/useTvRemoteNavigation.ts  Navegação por controle remoto
  utils/m3u.ts                    Parser/classificador M3U
  utils/parseM3UWorker.ts         Execução do parser fora da main thread
  workers/m3uParser.worker.ts     Worker real do parser
  utils/fetchM3U.ts               Download M3U/Xtream
  utils/xtreamSeries.ts           Catálogo e episódios Xtream
  utils/devicePanel.ts            Integração com painel externo
  utils/contentCache.ts           Cache local IndexedDB
  utils/panelPlaylistCache.ts     Cache pronto vindo do painel
```

## Scripts úteis

```bash
npm run dev
npm run build
npm run typecheck
npm run verify
npm run serve:prod
npm run serve:dist
npm run build:singlefile
npm run audit:ui
```

## Observação sobre backend/painel

Este repositório representa o app cliente. O painel externo responsável por clientes, aparelhos, vendedores, listas, vencimentos e geração de cache precisa estar disponível em outro serviço e cumprir o contrato usado por `src/utils/devicePanel.ts`.
