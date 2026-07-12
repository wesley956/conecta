# Fase 8 — Diagnóstico seguro das fontes

## Objetivo

Registrar localmente eventos técnicos do player para investigar fontes que funcionam em outros aplicativos, mas falham no RonecaPlayTV.

## O que é registrado

- tipo de conteúdo: canal, filme ou episódio;
- motor estimado: HTML Video, hls.js ou mpegts.js;
- início da sessão e tempo até cada evento;
- `readyState`, `networkState`, posição, duração e buffer à frente;
- eventos de carregamento, reprodução, espera, travamento e erro;
- erros HLS fatais e não fatais;
- perfil de buffer, reconexão e ambiente nativo/navegador.

## Privacidade

Os dados ficam somente no aparelho e não são enviados para servidor.

Antes de salvar, o diagnóstico:

- remove usuário e senha embutidos na URL;
- substitui valores de query string por `***`;
- remove fragmentos da URL;
- mascara tokens, cookies, autorização e outros segredos encontrados em mensagens;
- mantém no máximo 120 eventos das últimas 24 horas.

## Acesso técnico

No console do navegador:

```js
RonecaPlayerDiagnostics.getEntries()
RonecaPlayerDiagnostics.getReport()
RonecaPlayerDiagnostics.clear()
```

O relatório retornado por `getReport()` já é sanitizado e pode ser copiado para análise.

## Fora do escopo

Esta fase não muda o motor de reprodução, a ordem das fontes, os tempos de recuperação, o buffer adaptativo, os headers M3U, os controles do player, filmes, séries, favoritos, painéis ou backend.
