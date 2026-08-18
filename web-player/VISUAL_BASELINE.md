# Web Player — Baseline visual WEB-17–WEB-27

Esta baseline registra a composição aprovada automaticamente antes da homologação física final. Ela é evidência de regressão visual, não autorização de publicação.

## Baseline canônica

- commit visual: `7d3b93baa713e7b503dab93bc0f4820edbe8eb22`;
- workflow: `Validate Pull Request` run **#805** (`32084698655`);
- artifact: `web-player-preview-and-tests` ID **9306343473**;
- digest do artifact: `sha256:eb4f0db6abf026f27ef46550a6335b1af6db90596713b460cc8ac8672de96a9f`;
- Playwright: 1.60.0;
- movimento reduzido usado nas capturas de composição para remover variação temporal.

Commits posteriores que alterem somente testes/documentação podem continuar apontando para esta baseline. Qualquer mudança de CSS, markup visual, assets de marca ou lógica de composição exige nova baseline identificada.

## Capturas preservadas no artifact

### Cross-browser mobile 390 px

- `ux-home-390-chromium.png`
- `ux-home-390-firefox.png`
- `ux-home-390-webkit.png`

### Matriz Chromium

- `ux-viewport-360x800-chromium.png`
- `ux-viewport-390x844-chromium.png`
- `ux-viewport-768x1024-chromium.png`
- `ux-viewport-1024x768-chromium.png`
- `ux-viewport-1366x768-chromium.png`
- `ux-viewport-1920x1080-chromium.png`
- `ux-viewport-2560x1080-chromium.png`

O teste que gera a matriz também falha se `scrollWidth` ultrapassar `clientWidth + 1 px` e confirma a troca correta entre navegação lateral e inferior.

## Tolerância de regressão

Para comparação automática futura usando o mesmo browser/runner:

- tolerância alvo de diferença de pixels: **até 2%** da imagem;
- threshold perceptual recomendado: **0,20 YIQ** (padrão compatível com Playwright);
- deslocamento estrutural de regiões primárias (nav, hero, primeiro shelf, detalhe) acima de **8 px** deve ser revisado mesmo quando o diff global ficar abaixo de 2%;
- mudança de ordem/hierarquia dos blocos, overflow horizontal, corte de CTA ou perda de foco visível é regressão crítica e não entra na tolerância percentual.

Font rendering pequeno, antialiasing e diferenças de rasterização entre Chromium/Firefox/WebKit podem ser aceitos quando não alterarem geometria, contraste ou leitura. A comparação principal de geometria usa Chromium; os outros engines funcionam como evidência cross-browser separada.

## Quando renovar

Renovar esta baseline quando houver alteração intencional em:

- login, partículas ou marca;
- splash/crossfade;
- hero/carrossel;
- cards/hover;
- detalhes de filme/série;
- navegação ou breakpoints;
- tipografia, espaçamentos ou cores estruturais.

A renovação deve registrar novo commit, run, artifact e digest. Não substituir silenciosamente a baseline após uma falha.
