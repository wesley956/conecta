# Web Player E2E

`smoke.spec.ts` mantém o smoke estrutural/PWA já existente.

`discovery.spec.ts` usa respostas determinísticas das Edge Functions para validar o refinamento WEB-17–WEB-27 sem depender de catálogo ou stream externo imprevisível. A mídia real continua sendo um gate de homologação física separado.

Os screenshots gerados pelos cenários mobile ficam em `test-results` e são enviados pelo workflow `Validate Pull Request` como evidência temporária. Falhas de fluxo preservam trace/screenshot conforme `playwright.config.ts`.
