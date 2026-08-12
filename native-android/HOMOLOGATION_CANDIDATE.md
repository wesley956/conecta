# Candidato Android para homologação manual

O workflow `Build isolated Android homologation candidate` gera um APK otimizado e isolado, publicando apenas um artefato privado do GitHub Actions por 30 dias.

Ele não cria tag, GitHub Release, registro em `app_releases`, arquivo no Storage Supabase ou manifesto consumido pelo updater. Portanto, o APK não é distribuído automaticamente a usuários.

## Identidade intencional

- package: `com.ronecaplaytv.nativeapp.homologation`;
- versionName: `2.9.6-homologacao`;
- versionCode: `47`;
- build release com minify/shrink;
- assinatura de teste Android, sem acessar a chave permanente de produção;
- nome do arquivo inclui `homologacao` e o commit exato.

O pacote separado permite instalar o candidato ao lado do aplicativo Direct atual e impede que ele seja confundido com uma atualização de produção. A instalação é manual e os dados/identidade locais são independentes do app principal.

## Antes de promoção futura

Só aumentar versão, publicar release/updater ou promover para produção após a matriz física de performance, D-pad, ativação/suporte/QR e legendas ser concluída e aprovada.
