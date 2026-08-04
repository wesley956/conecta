# RonecaPlayTV Native 2.6.0

Segundo lote do Motor de Compatibilidade de Provedores: executor Xtream inteligente.

- adiciona no painel o cadastro por host, usuário e senha, mantendo a opção por URL M3U completa;
- preserva protocolo, porta e subpasta informados pelo vendedor;
- monta os endpoints Xtream automaticamente sem exibir novamente a senha salva;
- testa a autenticação Xtream antes de depender das categorias e do catálogo;
- diferencia conta vencida, credencial inválida, API ausente, DNS, TLS, timeout, conexão reiniciada, HTML e resposta incompatível;
- interrompe tentativas quando a conta está comprovadamente vencida ou inválida;
- reduz os tempos individuais de rede e aplica um orçamento global de 75 segundos por carregamento da matriz;
- mantém canais, filmes e séries independentes, preservando as seções que funcionarem;
- memoriza por servidor, conta e seção a estratégia que funcionou;
- tenta primeiro o transporte, protocolo e formato vencedores nas próximas aberturas;
- mantém fallback entre Xtream e M3U quando a falha não é definitiva;
- registra todos os resultados no histórico sanitizado criado no Lote 1;
- não altera automaticamente listas existentes, vínculos, prioridades, favoritos ou progresso.
