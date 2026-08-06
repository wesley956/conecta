# RonecaPlayTV Native 2.7.1

Compatibilidade universal de endpoints dentro da mesma lista.

- recebe no aparelho todos os endpoints ativos encontrados na mensagem do fornecedor;
- tenta as alternativas da mesma lista em sequência antes de considerar a fonte indisponível;
- separa o failover entre endpoints do failover comercial entre lista principal e reserva;
- evita repetir `/player_api.php` como M3U quando existe um `/get.php` completo cadastrado;
- preserva a ordem definida no painel, incluindo Xtream, M3U, HLS e links curtos;
- mantém a política TLS, os domínios autorizados e os cabeçalhos configurados para a fonte;
- registra as tentativas individuais sem expor usuário, senha ou URL completa;
- não cria venda, não consome crédito e não altera cliente durante a homologação.
