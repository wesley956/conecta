# Isolamento de fontes universais compartilhadas

## Regra canônica

Quando uma URL ou fingerprint já existe, o cadastro apenas reutiliza a fonte e cria o vínculo necessário. A nova tentativa não altera nome, endpoints, cabeçalhos, credenciais, estratégia de conexão ou política TLS da origem existente.

## Permissões

- Administrador: pode editar a fonte, seus endpoints e a política de certificado.
- Vendedor: pode cadastrar uma fonte nova com TLS estrito, reutilizar uma origem existente, testar a configuração já autorizada e remover o vínculo da própria conta.
- Vendedor não recebe os detalhes sensíveis usados para edição e não pode configurar `custom_ca` ou `insecure`.

## Defesa em profundidade

A proteção existe em três camadas:

1. interface, que oculta ações administrativas;
2. Edge Function, que valida o papel antes de processar dados sensíveis;
3. função SQL transacional, que impede sobrescrita mesmo diante de uma chamada direta do backend.

A reutilização é registrada na auditoria como `universal_playlist_reused`, sem URL completa, usuário, senha, token ou cabeçalhos sensíveis.

## Validação automatizada

As funções SQL qualificam explicitamente as colunas que podem coincidir com nomes de retorno do PL/pgSQL. O Deno usa resolução automática das dependências npm para que todas as Edge Functions sejam verificadas isoladamente no fluxo de integração contínua.
