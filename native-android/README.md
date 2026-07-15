# RonecaPlayTV Native

Cliente Android nativo, em Kotlin, para Android TV, TV Box, celular e tablet.

## Objetivo

Substituir o cliente Capacitor/WebView em aparelhos Android por uma aplicação nativa com melhor desempenho, navegação por controle remoto e reprodução via Media3 ExoPlayer, mantendo o backend Supabase, o painel administrativo, os vendedores, a ativação e as credenciais já existentes.

## Plataformas

- Android TV e Google TV
- TV Box Android
- Celulares Android
- Tablets Android

O mesmo APK detecta o tipo de aparelho e carrega uma interface adaptada:

- TV: foco por DPAD, elementos maiores, navegação a distância e buffer conservador.
- Celular/tablet: toque, orientação adaptativa e controles compactos.

## Estado atual

Primeiro marco implementado:

- projeto Gradle independente em `native-android/`;
- Android Gradle Plugin 9.2.0 e Kotlin 2.4.10;
- um único manifesto para celular e Android TV;
- detecção automática de televisão;
- tela inicial adaptativa;
- primeiro player nativo com Media3 ExoPlayer 1.10.1;
- reprodução HLS de validação;
- workflow GitHub Actions para gerar APK debug.

Ainda não conectado nesta etapa:

- ativação pelo Supabase;
- credencial protegida no Android Keystore;
- catálogo real de canais, filmes e séries;
- cache local e paginação;
- políticas definitivas de buffer por aparelho.

## Stack

- Kotlin
- Jetpack Compose
- Compose for TV
- AndroidX Media3 ExoPlayer
- Coroutines e Flow
- cliente HTTP nativo
- DataStore
- Android Keystore

## Arquitetura planejada

- `app`: inicialização e navegação adaptativa
- `core:model`: modelos compartilhados
- `core:network`: comunicação com Edge Functions
- `core:security`: credencial do aparelho no Android Keystore
- `core:player`: Media3 ExoPlayer e políticas de buffer
- `feature:activation`: ativação e vínculo do aparelho
- `feature:home`: início e destaques
- `feature:channels`: canais ao vivo
- `feature:movies`: filmes
- `feature:series`: séries
- `feature:settings`: configurações

A primeira versão mantém essas áreas no módulo `app` para validar a arquitetura e será modularizada progressivamente.

## Compatibilidade com o backend atual

O cliente utilizará os endpoints existentes:

- `device-activate`
- `device-config`
- `playlist-cache`

A credencial secreta do aparelho será armazenada no Android Keystore e enviada somente em chamadas autorizadas.

## Compilação

O workflow `.github/workflows/build-native-android.yml` instala Java 17, Android SDK 37 e Gradle 9.4.1, executando:

```bash
gradle --no-daemon :app:assembleDebug
```

O APK resultante fica em:

```text
native-android/app/build/outputs/apk/debug/app-debug.apk
```

## Fases

1. Fundação Gradle e detecção TV/celular. **Em validação no CI.**
2. Ativação e credenciais.
3. Catálogo e cache local.
4. Player Media3 ExoPlayer integrado ao catálogo.
5. Navegação por controle remoto e toque.
6. Testes em celular, TV e TV Box.
7. APK de release assinado.
