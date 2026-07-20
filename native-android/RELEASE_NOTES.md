# ronecaPlayerTV Native 2.0

Versão focada na experiência de navegação por controle remoto em Android TV e TV Box.

## Navegação do player

- remove a interceptação global que fazia Enter, setas esquerda e direita competirem com os controles do ExoPlayer;
- deixa o próprio Media3 tratar reprodução, pausa, avanço, retorno e movimentação entre os controles;
- ao pressionar a seta para cima, o foco pode ser levado diretamente ao cabeçalho do player;
- mantém a seta de voltar, o título e os atalhos visíveis apenas enquanto os controles estão abertos;
- preserva a navegação dos seletores de canais e episódios sem bloquear o botão central do controle remoto.

## Foco visível nas categorias

- adiciona indicação visual de foco antes do usuário apertar Enter;
- usa borda vermelha reforçada, fundo elevado e texto destacado no item atualmente focado;
- mantém separado o estado de foco do estado da categoria já selecionada;
- aplica a correção às categorias de canais, filmes e séries.

## Atualizações e segurança

- mantém a correção de compatibilidade de assinatura introduzida na versão 1.9;
- mantém validação de checksum SHA-256, pacote, versão e certificado;
- publica o APK com a mesma chave permanente usada nas versões anteriores.
