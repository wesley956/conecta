# RonecaPlayTV 2.9.0

- Nova identidade visual grafite e vermelha, alinhada aos painéis ADM e vendedor.
- Sistema vetorial oficial da marca, ícone adaptativo, banner Android TV e tela de ativação renovada.
- Controle de aspecto no player: Original, Preencher, Estender, Largura e Altura.
- Capas, banners e logotipos com interpolação de alta qualidade, cache nativo e fallback oficial.
- Reconexão inteligente: falhas temporárias usam espera progressiva de 2, 4 e 8 segundos.
- Erros 401/403, 404, formato, decoder e TLS deixam de repetir a mesma URL sem necessidade.
- Lista reserva somente é confirmada depois que a reprodução realmente avança.
- Posição de filmes e episódios preservada durante tentativas e failover.
- Mensagens de reprodução mais claras e diagnóstico seguro sem URLs ou credenciais.

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
