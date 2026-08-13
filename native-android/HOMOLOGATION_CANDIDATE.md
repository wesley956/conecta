# Candidato Android para homologação manual

O workflow `Build isolated Android homologation candidate` gera um APK otimizado e isolado, publicando apenas um artefato privado do GitHub Actions por 30 dias.

Ele não cria tag, GitHub Release, registro em `app_releases`, arquivo no Storage Supabase ou manifesto consumido pelo updater. Portanto, o APK não é distribuído automaticamente a usuários.

## Identidade intencional

- package: `com.ronecaplaytv.nativeapp.homologation`;
- versionName: `2.9.7-homologacao`;
- versionCode: `48`;
- build release com minify/shrink;
- assinatura de teste Android, sem acessar a chave permanente de produção;
- nome do arquivo inclui `homologacao` e o commit exato.

O pacote separado permite instalar o candidato ao lado do aplicativo Direct atual e impede que ele seja confundido com uma atualização de produção. A instalação é manual e os dados/identidade locais são independentes do app principal.

## Promoção comercial

O candidato foi aprovado em teste físico em TV em 13/08/2026. A promoção da versão 2.9.7 para o pacote comercial e o atualizador oficial foi autorizada após a inclusão do crossfade final, condicionada à validação integral da CI e da assinatura permanente.

## Escopo deste candidato

- reproduz o MP4 oficial de abertura completo, com 8,057 segundos, H.264/AAC e fallback seguro;
- inicia um crossfade para a tela já carregada aos 6,5 segundos e conclui exatamente com o final do MP4;
- restaura catálogo utilizável de um snapshot local comprimido e criptografado pelo Android Keystore;
- não consulta novamente uma revisão de cache que o backend confirmou como idêntica;
- posterga atualizações diretas vencidas até depois da abertura e nunca apaga VOD durante hidratação progressiva;
- move migrações pesadas de favoritos/progresso para fora da thread principal;
- registra falha de persistência, restauração e tempo até catálogo disponível sem expor URLs ou credenciais.
