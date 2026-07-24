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

## Painel

O conteúdo de `admin-panel/` pode ser publicado como site estático. Gere a configuração pública a partir do exemplo existente e nunca inclua chaves privadas ou `service_role` no navegador.

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

## Releases

O workflow `release-native-android.yml` publica o APK assinado. Cada atualização deve possuir `versionCode` maior e uma versão ainda não publicada.
