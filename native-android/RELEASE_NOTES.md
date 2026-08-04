# RonecaPlayTV Native 2.5.3

Diagnóstico e compatibilidade de transporte para listas que continuam retornando HTTP 404 apenas no RonecaPlayTV.

- passa a baixar a M3U usando OkHttp real, com negociação HTTP/2, TLS e redirecionamentos;
- mantém as tentativas em HTTPS, HTTP, `m3u8` e `ts`;
- mantém os perfis RonecaPlayTV, IPTV Smarters, VLC e Android;
- registra de forma segura código HTTP, protocolo, servidor, tipo de conteúdo e destino final;
- envia automaticamente a falha de catálogo ao painel sem expor usuário, senha ou query string;
- registra sucesso quando uma lista volta a carregar;
- não altera URLs, vínculos, prioridades, favoritos ou progresso;
- preserva o funcionamento da Kmaster corrigido nas versões anteriores.
