# RonecaPlayTV Native

Cliente Android nativo, em Kotlin, para Android TV, TV Box, celular e tablet.

## Objetivo

Substituir o cliente Capacitor/WebView em aparelhos Android por uma aplicação nativa com melhor desempenho, navegação por controle remoto e reprodução via Media3 ExoPlayer, mantendo o backend Supabase, o painel administrativo, os vendedores, a ativação e as credenciais já existentes.

## Plataformas

- Android TV e Google TV
- TV Box Android
- Celulares Android
- Tablets Android

O mesmo APK detectará o tipo de aparelho e carregará uma interface adaptada:

- TV: foco por DPAD, elementos maiores, navegação a distância e buffer conservador.
- Celular/tablet: toque, gestos, orientação adaptativa e controles compactos.

## Stack

- Kotlin
- Jetpack Compose
- Compose for TV
- AndroidX Media3 ExoPlayer
- Navigation Compose
- Coroutines e Flow
- Retrofit/OkHttp
- Coil
- DataStore
- Android Keystore

## Arquitetura inicial

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

## Compatibilidade com o backend atual

O cliente utilizará os endpoints existentes:

- `device-activate`
- `device-config`
- `playlist-cache`

A credencial secreta do aparelho será armazenada no Android Keystore e enviada somente em chamadas autorizadas.

## Fases

1. Fundação Gradle e detecção TV/celular.
2. Ativação e credenciais.
3. Catálogo e cache local.
4. Player Media3 ExoPlayer.
5. Navegação por controle remoto e toque.
6. Testes em celular, TV e TV Box.
7. APK de release assinado.
