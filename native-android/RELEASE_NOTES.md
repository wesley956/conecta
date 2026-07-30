# ronecaPlayerTV Native 2.4.1

Correção urgente para listas que funcionam no aparelho, mas bloqueiam servidores de cache.

- adiciona acesso direto seguro quando o provedor bloqueia Supabase, Vercel e GitHub;
- mantém a autenticação do aparelho, assinatura e validade da assinatura;
- baixa a lista M3U diretamente pela internet do cliente somente quando o cache não estiver disponível;
- separa canais, filmes e séries no próprio Android;
- reutiliza o catálogo em memória para evitar downloads repetidos;
- mantém limite de tamanho, timeout e failover entre lista principal e reserva;
- impede que o painel permaneça eternamente em “Gerando” e passa a registrar o erro real.
