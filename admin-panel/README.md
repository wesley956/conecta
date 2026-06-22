# Cruz Stars Admin

Painel administrativo separado do APK para gerenciar clientes, listas, aparelhos, ativações e histórico de ações.

## Estrutura

- `index.html`: tela de login do painel.
- `dashboard.html`: dashboard administrativo.
- `assets/cruz-stars-logo.png`: logo transparente do Cruz Stars.
- `assets/universe-bg.png`: fundo visual do painel.

## Fluxo principal

1. O cliente instala o APK.
2. O APK gera um código de ativação.
3. O aparelho aparece como pendente no painel.
4. O administrador cadastra ou seleciona um cliente.
5. O administrador cadastra ou seleciona uma lista.
6. O administrador vincula cliente + lista ao aparelho.
7. O administrador libera o aparelho.
8. O APK recebe somente a lista vinculada àquele aparelho.

## Recursos atuais

- CRUD de clientes.
- CRUD de listas.
- Liberação de aparelhos.
- Bloqueio de aparelhos.
- Exclusão de aparelhos.
- Vínculo de cliente por aparelho.
- Vínculo de lista por aparelho.
- Busca e filtros.
- Alertas de vencimento.
- Detalhes de cliente, lista e aparelho.
- Histórico/auditoria de ações do painel.

## Observação

Este painel é separado do APK. O código do aplicativo em `src/` não deve conter rotas, telas ou lógica administrativa.
