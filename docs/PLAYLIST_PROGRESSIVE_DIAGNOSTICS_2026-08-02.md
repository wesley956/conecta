# Diagnóstico progressivo de listas — etapas 5 a 14

Data: 2026-08-02

## Objetivo

Validar uma lista antes de depender de um download grande, comparar o acesso do servidor com a rede do cliente quando necessário e escolher uma estratégia única: `server_cache`, `direct`, `hybrid`, `retry` ou `blocked`.

## Fluxo implementado

1. O painel inicia um diagnóstico autenticado para uma lista permitida ao administrador ou vendedor.
2. O servidor executa de forma serial e limitada:
   - etapa 5: HEAD curto;
   - etapa 6: redirects restritos ao mesmo origin;
   - etapa 7: autenticação;
   - etapa 8: informações básicas da conta;
   - etapa 9: uma categoria pequena;
   - etapa 10: uma amostra técnica de conteúdo;
   - etapa 11: HEAD da reprodução.
3. Se a evidência do servidor for suficiente, as etapas 12–14 são concluídas sem acionar aparelho.
4. Se houver divergência possível, uma tarefa com validade de dez minutos é vinculada somente a um Android/Android TV oficial, ativo e associado à lista.
5. O Android executa no máximo três testes técnicos em segundo plano e devolve somente tipo, sucesso, HTTP, latência e código normalizado.
6. O servidor compara as duas origens, conclui a classificação e o painel atualiza a linha do tempo.

## Segurança e privacidade

- URL, usuário, senha e catálogo nunca são retornados ao painel de diagnóstico.
- A URL é entregue somente ao Android já autenticado com credencial do aparelho e vinculado à lista.
- O dispositivo não envia lista, resposta bruta nem URL; envia no máximo três resultados técnicos.
- Redirecionamento de Xtream para outro origin é bloqueado para não reenviar credenciais.
- Destinos locais, privados e reservados são rejeitados no servidor; o Android também rejeita hosts locais e IPv4 privados literais.
- As tabelas possuem RLS, sem privilégio para `anon` ou `authenticated`; somente `service_role` manipula as tarefas.
- Diagnóstico não consome crédito, não ativa aparelho e não substitui cache válido.

## Persistência

- `panel_playlist_diagnostics`: resultado saneado, etapas, classificação e estratégia.
- `panel_playlist_diagnostic_tasks`: tarefa curta para o Android, com estados `waiting_device`, `claimed`, `completed`, `expired` e `cancelled`.
- Uma tarefa expira em dez minutos; o diagnóstico possui expiração operacional de 24 horas.

## Implantação futura

Este trabalho não altera o Supabase de produção por conta própria. A ordem segura é:

1. backup lógico recuperável;
2. aplicar a migration do diagnóstico;
3. publicar `playlist-diagnostics` e `device-config-direct`;
4. publicar o painel;
5. gerar uma nova versão Android somente após CI verde;
6. executar smoke test controlado sem listas de produção sensíveis.
