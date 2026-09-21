# Origem do catálogo e bloqueio de datacenter (HTTP 429) — avaliação

Problema: o provedor responde 429/404 a IPs de datacenter do Supabase (`DATACENTER_BLOCKED`).

| Opção | Estabilidade | Segurança de credenciais | Custo | Observabilidade | Manutenção |
|---|---|---|---|---|---|
| A. Worker em VPS com IP fixo (recomendada) | Alta; IP pode ser liberado pelo provedor | Credenciais ficam só no servidor | VPS pequena ~US$4–6/mês (a confirmar) | Logs/métricas centralizados, retry controlado | Média (1 serviço) |
| B. Geração pelo próprio app | Variável (rede do usuário, CPU da TV) | Piora: credenciais nos aparelhos (contraria requisito) | Zero | Fraca | Alta (3 plataformas) |
| C. Proxy residencial/serviço de proxy | Média | Credenciais passam por terceiro | Mensal recorrente | Média | Baixa |
| D. Worker gratuito (ex.: runner agendado/free tier de nuvem) | Baixa/média; IP não garantido fixo | Boa | R$0 | Média | Média |

Recomendação: A, com o worker gerando snapshots e enviando ao Storage via endpoint autenticado; o Supabase apenas serve o cache.
Alternativa sem custo para validar antes: D como prova de conceito (IP não fixo → pode não resolver).
Nenhuma contratação será feita sem sua aprovação (serviço, valor, motivo, alternativa gratuita acima).
