# Validação ponta a ponta — Lote 7E

Data: 2026-08-01

## Objetivo

Validar a interface realmente publicada do administrador, do vendedor e da Smart TV antes da ativação no Supabase de produção. O teste usa navegador real, dados isolados e interceptação de rede; não acessa clientes, credenciais ou recursos de produção.

## Histórias automatizadas

| Área | Fluxo coberto | Evidência automática |
|---|---|---|
| Administrador | login, busca de aparelho, liberação pendente, lista principal/reserva, renovação transacional, ajuste manual de créditos e exclusão | chamadas e payloads verificados; screenshot em 1366×900 |
| Vendedor | login, ações do dia, busca por código, ativação, renovação, lista principal/reserva e exclusão | chamadas e payloads verificados; screenshot responsivo em 390×844 |
| Smart TV | configuração do aparelho, falha da lista principal, entrada automática da reserva, catálogo, detalhes, Voltar, setas e foco | telemetria de falha/sucesso; screenshots em 1280×720 e 1920×1080 |

O roteiro falha se houver erro JavaScript não tratado, estouro horizontal, perda de foco, chamada ausente, payload comercial incompleto ou failover sem telemetria.

## Regressões encontradas e corrigidas

1. Módulos de financeiro e diagnóstico tentavam inserir novas abas antes de itens que estavam dentro do menu “Mais”, causando `NotFoundError` e repetição da inicialização.
2. A renovação financeira deixava o modal de detalhes aberto por baixo e bloqueava a próxima navegação.
3. A Smart TV usava a lista reserva na inicialização, mas não registrava a falha da lista principal no diagnóstico.

## Execução

```bash
npm ci
npm ci --prefix smart-tv
CHROME_PATH=/caminho/para/chrome npm run check:end-to-end
```

O CI executa o mesmo roteiro em cada pull request e publica `artifacts/e2e` por sete dias, inclusive quando houver falha.

## Limites e próxima validação

- Android continua protegido por compilação nativa, testes estruturais e paridade de comportamento. O fluxo visual do APK em aparelho/emulador fica para o smoke test de ativação, pois este ambiente não fornece uma TV Android real.
- Login e dados de produção não são usados nesta etapa. O smoke test real só deve ocorrer depois do backup lógico e da aplicação controlada das migrations e Edge Functions.
- Nenhuma validação deste documento autoriza implantação automática em produção.
