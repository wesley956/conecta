# Atualizações do ronecaPlayerTV

O aplicativo consulta a última GitHub Release depois do splash e também permite uma verificação manual em **Configurações > Atualizações do aplicativo**.

## Assinatura permanente

Toda versão a partir da 1.6 deve ser assinada com a mesma chave. A chave privada não pertence ao repositório e é restaurada na GitHub Actions pelos Secrets abaixo:

- `NATIVE_ANDROID_KEYSTORE_BASE64`
- `NATIVE_ANDROID_KEYSTORE_PASSWORD`
- `NATIVE_ANDROID_KEY_ALIAS`
- `NATIVE_ANDROID_KEY_PASSWORD`
- `NATIVE_ANDROID_SIGNING_CERT_SHA256`

O workflow interrompe a publicação se algum Secret estiver ausente ou se o certificado do APK não corresponder ao fingerprint permanente. Nunca gere outra chave para substituir esses Secrets sem um plano formal de rotação compatível com o Android.

## Publicar uma nova versão

1. Aumente `versionCode` em `app/build.gradle.kts`. Esse número sempre precisa crescer.
2. Atualize `versionName` no mesmo arquivo, por exemplo de `1.6` para `1.7`.
3. Atualize `RELEASE_NOTES.md`.
4. Envie as alterações para a branch `main`.
5. Acompanhe o workflow **Publish ronecaPlayerTV Release**.

O workflow gera e publica três arquivos:

- `ronecaPlayerTV-vX.Y.apk`: APK de produção assinado;
- `ronecaPlayerTV-vX.Y.sha256`: checksum para conferência externa;
- `ronecaPlayerTV-update.json`: manifesto consumido pelo aplicativo.

O manifesto informa `versionCode`, `versionName`, URL, checksum, notas e se a atualização é obrigatória. O aplicativo só oferece APKs com número maior e valida checksum, pacote e certificado antes de abrir o instalador do Android.

## Experiência no aparelho

Em Android TV, TV Box, celular ou tablet comum, o Android exige confirmação do usuário. Na primeira atualização, o aparelho também pode solicitar a permissão **Permitir desta fonte** para o ronecaPlayerTV.

## Migração da 1.5

A versão 1.5 foi assinada por uma chave temporária. Ela precisa ser desinstalada uma única vez antes da instalação da 1.6. Depois que a 1.6 estiver instalada, as versões seguintes poderão ser instaladas sobre o aplicativo existente.
