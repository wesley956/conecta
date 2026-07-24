# RonecaPlayTV

Plataforma para distribuição controlada de conteúdo autorizado. O projeto não fornece canais, filmes, séries ou listas próprias.

## Arquitetura oficial

O produto possui três núcleos:

- `native-android/`: aplicativo oficial para celular, tablet, Android TV, Google TV e TV Box, construído com Kotlin, Jetpack Compose e Media3.
- `admin-panel/`: painel estático do administrador e portal do vendedor.
- `supabase/`: banco, migrações, testes pgTAP e Edge Functions.

O antigo aplicativo React/Vite/Capacitor foi removido. O único APK oficial é compilado a partir de `native-android/`.

## Serviços auxiliares

- `server.mjs`: proxy de mídia opcional para ambiente controlado. Ele bloqueia todas as origens quando `RONECA_PROXY_ALLOWED_HOSTS` não está configurado.
- `tooling/m3u/`: parser preservado exclusivamente como ferramenta de validação.
- `scripts/`: verificadores de regressão do painel, backend, segurança e arquitetura.

## Verificação local

```bash
npm ci
npm run verify
```

Para compilar o APK de desenvolvimento:

```bash
cd native-android
gradle --no-daemon :app:assembleDebug
```

O GitHub Actions também valida:

- aplicativo Android nativo;
- painel e regras comerciais;
- parser M3U;
- segurança do proxy;
- Edge Functions;
- reconstrução do banco e testes pgTAP.

## Publicar o painel no Vercel

O arquivo `vercel.json` publica `admin-panel/` como site estático e executa `npm run panel:config` durante o build.

Configure no projeto do Vercel, para os ambientes Production e Preview:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA-ANON
```

`SUPABASE_ANON_KEY` é uma chave pública própria para o navegador. Nunca configure `service_role`, senha de banco ou outra chave privada no painel. O arquivo gerado `admin-panel/panel-config.js` permanece ignorado pelo Git.

## Publicação protegida do APK

O workflow manual de release compila e assina o APK, preserva uma cópia imutável
no GitHub Release e publica automaticamente a mesma versão no bucket privado
`app-releases` do Supabase. O painel administrativo e o portal do vendedor podem
baixar o arquivo ou gerar um link temporário de uma hora para usar no Downloader.
Aparelhos ativos usam a credencial local para obter um link novo no momento do
download.

Configure uma única vez no GitHub, em **Settings → Secrets and variables →
Actions**, o segredo `SUPABASE_SERVICE_ROLE_KEY`. Ele é utilizado somente pelo
runner de release e nunca é enviado ao APK, ao painel ou ao Vercel.

Ao importar o repositório no Vercel, mantenha o diretório raiz do projeto. O build e a pasta de saída já estão definidos em `vercel.json`.

## Proxy opcional

```bash
npm run serve:proxy
```

Variáveis:

```env
PORT=4173
RONECA_PROXY_ALLOWED_HOSTS=midia.exemplo.com,cdn.exemplo.com
RONECA_ALLOW_PRIVATE_PROXY=false
```

`RONECA_PROXY_ALLOWED_HOSTS` é obrigatório em produção. Uma lista vazia faz o proxy responder `403`.

## Segurança e uso correto

Use o RonecaPlayTV somente com conteúdo próprio ou devidamente autorizado. O projeto não deve incluir scraping de conteúdo pago, bypass de DRM, credenciais reais, listas públicas ou mecanismos de violação de direitos autorais.

## GitHub Actions

Os workflows atuais possuem funções distintas:

- `validate-pull-request.yml`: valida painel, arquitetura nativa, APK, Edge Functions, migrações e pgTAP antes da mesclagem.
- `release-native-android.yml`: publica manualmente o APK assinado e imutável a partir da `main`.

Eles não são duplicados e devem permanecer separados. Cada atualização deve possuir `versionCode` maior e uma versão ainda não publicada.
