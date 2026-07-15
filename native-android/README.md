# RonecaPlayTV Native

Novo cliente Android nativo para celulares, Android TV e TV Box.

## Objetivo

Substituir o cliente WebView/Capacitor na TV por uma implementação Kotlin com Jetpack Compose e Media3 ExoPlayer, preservando o backend Supabase, ativação, credenciais, clientes, listas e regras comerciais já existentes.

## Estratégia universal

O mesmo pacote Android possui duas entradas:

- `MainActivity`: experiência móvel para toque;
- `TvActivity`: experiência TV para controle remoto e foco DPAD.

O manifesto declara Android TV como suporte opcional e touchscreen como não obrigatório. Assim, o mesmo APK pode ser instalado em celular, TV e TV Box.

## Tecnologias

- Kotlin
- Jetpack Compose
- Compose for TV
- Media3 ExoPlayer
- Android Keystore para credenciais na próxima etapa
- Supabase Edge Functions existentes

## Marcos

1. Fundação universal e CI nativo.
2. Ativação do aparelho e armazenamento seguro da credencial.
3. Catálogo de canais, filmes e séries.
4. Player Media3 com HLS, MPEG-TS, áudio e legendas.
5. Interface TV com DPAD e interface móvel por toque.
6. Favoritos, histórico, busca e configurações.
7. APK release assinado e testes em aparelhos reais.

## Build local

Requer JDK 17, Android SDK 36 e Gradle 9.4.1.

```bash
gradle --no-daemon -p native-android :app:assembleDebug
```

APK gerado:

```text
native-android/app/build/outputs/apk/debug/app-debug.apk
```
