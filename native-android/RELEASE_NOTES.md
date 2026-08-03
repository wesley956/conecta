# RonecaPlayTV Native 2.5.2

Compatibilidade adicional para fornecedores que filtram o download da lista pelo perfil do aplicativo.

- mantém as tentativas automáticas em HTTPS e HTTP;
- mantém as alternativas `m3u8` e `ts`;
- tenta a M3U com perfis RonecaPlayTV, IPTV Smarters, VLC e Android/OkHttp;
- adiciona cabeçalhos compatíveis sem alterar a URL cadastrada;
- não repete perfis quando a falha é de rede e não depende do aplicativo;
- interrompe as tentativas quando o provedor confirma autenticação negada;
- não altera listas, aparelhos, prioridades, favoritos ou progresso;
- preserva o comportamento que já corrigiu a lista Kmaster na versão 2.5.1.
