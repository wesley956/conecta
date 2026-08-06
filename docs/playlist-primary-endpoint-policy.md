# Política de endpoint principal

Quando uma fonte possui vários endereços, o cadastro deve priorizar endpoints completos de catálogo nesta ordem:

1. Xtream com caminho de API e credenciais;
2. M3U completo;
3. M3U curto;
4. HLS completo;
5. HLS curto;
6. API ou Stalker explicitamente configurados;
7. transmissões diretas e formatos auxiliares.

Um domínio raiz genérico do tipo `direct` não pode substituir automaticamente um endpoint Xtream, M3U, HLS, API ou Stalker com caminho completo. Ele continua permitido quando é a única origem cadastrada.

A regra é aplicada na interface e novamente na Edge Function. Assim, requisições manipuladas não conseguem promover silenciosamente um domínio auxiliar a fonte principal.
