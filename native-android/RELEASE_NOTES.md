# RonecaPlayTV Native 2.5.0

Atualização urgente de velocidade e compatibilidade para listas em acesso direto.

- reconhece automaticamente credenciais Xtream presentes em URLs M3U;
- consulta canais, filmes e séries diretamente pela `player_api.php`;
- carrega as três áreas em paralelo, sem esperar a M3U inteira;
- busca temporadas e episódios somente quando a série é aberta;
- mantém cache privado das respostas Xtream por seis horas no aparelho;
- preserva o fallback M3U para listas comuns ou APIs incompatíveis;
- impede downloads M3U duplicados quando o fallback é necessário;
- mantém o failover entre lista principal e reserva;
- exibe as áreas que responderam mesmo quando uma seção do provedor falha.
