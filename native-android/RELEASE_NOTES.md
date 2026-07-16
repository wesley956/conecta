# RonecaPlayTV Native 1.1.0

Atualização do aplicativo Android nativo para celular, tablet, Android TV e TV Box, acompanhada da modernização do acesso ao portal de vendedores.

## Player de séries

- reprodução automática do próximo episódio;
- avanço contínuo entre episódios e temporadas;
- painel de temporadas e episódios dentro do próprio player;
- troca de episódio sem voltar à tela de detalhes;
- retomada da posição salva para cada episódio;
- preservação das fontes alternativas e reconexão automática;
- mensagem clara ao finalizar todos os episódios disponíveis.

## Portal do vendedor

- novos vendedores são cadastrados com e-mail e senha inicial pelo painel administrativo;
- criação automática da conta no Supabase Auth;
- vínculo automático ao papel `seller` e ao cadastro comercial;
- senha nunca armazenada nas tabelas comerciais;
- remoção do token privado antigo da interface;
- gateway do portal protegido por JWT;
- rollback automático quando alguma etapa do cadastro falha.

## Recursos mantidos

- interface escura premium com detalhes dourados e vermelhos;
- layouts separados para retrato, paisagem e televisão;
- canais, filmes, séries, busca, favoritos e Minha Lista;
- reprodução nativa com Media3 ExoPlayer;
- retomada de filmes e episódios;
- painel de canais da mesma categoria;
- configurações persistentes de buffer, decodificação e reconexão;
- catálogo seguro entregue pelo Supabase.

## Distribuição

O APK anexado é instalável e assinado automaticamente com a chave de depuração do Android para testes e distribuição direta. Uma chave privada de produção ainda deve ser configurada antes de publicar na Google Play Store.
