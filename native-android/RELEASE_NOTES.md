# RonecaPlayTV Native 2.6.2

Correção do carregamento progressivo para provedores Xtream lentos.

- mantém a autenticação rápida da conta Xtream;
- faz uma segunda tentativa controlada somente de canais quando o primeiro tempo limite é atingido;
- não interrompe mais o carregamento logo após informar que o login foi aceito;
- não consulta categorias, filmes e séries durante essa recuperação;
- limita a recuperação para evitar esperas prolongadas;
- preserva cache local de canais para acelerar as próximas aberturas;
- mantém filmes e séries em segundo plano depois que o primeiro conteúdo aparece;
- continua respeitando lista principal e lista reserva sem alterar vínculos existentes;
- registra separadamente no diagnóstico quando a etapa de recuperação foi utilizada.
