# ronecaPlayerTV Native 1.9

Correção de compatibilidade do atualizador para Android TV, TV Box, celular e tablet.

## Atualização e assinatura

- corrige falsos alertas de assinatura em firmwares que não expõem corretamente o certificado de um APK baixado;
- considera o certificado atual e o histórico de certificados informado pelo Android;
- mantém a comparação antecipada quando o aparelho consegue ler os dois certificados;
- mantém a validação de checksum SHA-256, pacote e versão antes de abrir o instalador;
- quando o firmware não fornece o certificado antecipadamente, a verificação criptográfica final continua sendo feita obrigatoriamente pelo instalador do próprio Android.

## Player

- mantém a correção da versão 1.8 que esconde seta, marca e título junto com os controles do ExoPlayer;
- mantém navegação por controle remoto, toque, canais, filmes e episódios.

## Observação para aparelhos na versão 1.7

Como a versão 1.7 contém o verificador antigo, alguns aparelhos podem exigir uma instalação manual única da versão 1.9 por cima da existente. Não desinstale primeiro: tente instalar o APK normalmente para preservar ativação, listas e configurações. Depois da versão 1.9, as próximas atualizações voltam a funcionar pelo próprio aplicativo.
