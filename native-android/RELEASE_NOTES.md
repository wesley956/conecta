# RonecaPlayTV Native 2.5.1

Correção de compatibilidade para listas que funcionam em outros players, mas recusam um protocolo específico no RonecaPlayTV.

- tenta automaticamente HTTPS e HTTP quando o provedor recusa a conexão;
- preserva a URL cadastrada no painel, sem substituição automática;
- tenta os formatos `m3u8` e `ts` no acesso direto;
- mantém a consulta Xtream antes do fallback M3U;
- interrompe as alternativas quando o provedor confirma credenciais inválidas;
- reduz mensagens de erro repetidas e mostra somente as tentativas finais relevantes;
- mantém o failover entre lista principal e reserva;
- preserva cache, favoritos, progresso e vínculos existentes.
