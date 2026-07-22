# ronecaPlayerTV Native 2.1

Versão de estabilidade focada em controle remoto, retorno ao conteúdo e consolidação do aplicativo exclusivamente nativo.

## Player e controle remoto

- centraliza o tratamento das teclas físicas de mídia no aplicativo nativo;
- corrige reprodução e pausa pelo botão central, Enter e teclas de mídia;
- melhora avanço, retrocesso e navegação entre os controles na TV e TV Box;
- mantém controles próprios em Jetpack Compose e Media3, sem conflito com player WebView;
- fecha primeiro os seletores de canais ou episódios antes de sair do player.

## Retorno à categoria e ao conteúdo

- ao sair de um canal, filme ou episódio, retorna à mesma categoria;
- preserva pesquisa, filtros, rolagem e item que estava focado;
- mantém a tela de origem atrás do player para retorno imediato;
- restaura corretamente o foco ao canal, filme ou série que estava aberto.

## Aplicativo exclusivamente nativo

- mantém somente o projeto Android em Kotlin, Jetpack Compose e Media3;
- remove do caminho de publicação os antigos players React, WebView e Capacitor;
- impede que o pipeline volte a publicar acidentalmente o APK antigo.

## Atualização e segurança

- versionCode 18 e versionName 2.1;
- APK de produção assinado com a mesma chave permanente das versões anteriores;
- validação de checksum SHA-256, pacote, número da versão e certificado;
- atualização preparada para instalação por cima da v2.0, preservando ativação, favoritos, progresso e configurações locais.
