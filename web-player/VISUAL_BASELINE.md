# Web Player — Baseline visual WEB-17–WEB-27

Esta baseline registra a composição aprovada automaticamente antes da homologação física final. Ela é evidência de regressão visual, não autorização de publicação.

## Baseline canônica atual

- commit visual: `96abbb738ad2a9f1d09a88686d289fc285cb021f`;
- workflow: `Validate Pull Request` run **#816** (`32086892050`);
- artifact: `web-player-preview-and-tests` ID **9307080286**;
- digest do artifact: `sha256:5e123641c95a68925b1b8b6353a84c1cbffb6c00fe23c1e699ad4ca4101738f1`;
- Playwright: 1.60.0;
- movimento reduzido usado nas capturas estáticas para remover variação temporal;
- Chromium/Firefox/WebKit passaram o conjunto determinístico;
- o CI valida `naturalWidth > 0` dos assets de marca e exige URL canônica `/web/brand/`;
- o teste do splash exige `/web/brand/roneca_launch_video.mp4`, ausência de `NETWORK_NO_SOURCE` e `MediaError`;
- inspeção manual das PNGs do artifact confirmou símbolo/wordmark íntegros em 360, 390, 1366 e 1920 px.

Commits posteriores que alterem somente documentação podem continuar apontando para esta baseline. Qualquer mudança de CSS, markup visual, assets de marca ou lógica de composição exige nova baseline identificada.

## Baselines anteriores invalidadas

A baseline do commit `25285f0a199832724709ee16e0cbf1e0702c746e`, run **#809** (`32085032425`), artifact **9306486363**, digest `sha256:b61b3c086a076430a3e54d0998125d702ad529a0f740dffeaa3864957e4b4bfe`, foi **invalidada** após inspeção manual: símbolo/wordmark apareciam quebrados porque o bundle usava caminhos absolutos `/brand/...` enquanto o Web Player é servido sob `/web/`. O artifact posterior **9306577666** reproduziu a mesma divergência e também não deve ser usado como baseline.

A correção passou a normalizar assets para `/web/brand/`, preservando a cópia raiz apenas como compatibilidade no staging do painel. O E2E agora falha antes de produzir baseline caso símbolo/wordmark estejam quebrados ou o MP4 não resolva corretamente.

## Capturas preservadas no artifact atual

### Login

- `ux-login-360x800-chromium.png`
- `ux-login-1366x768-chromium.png`

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

O teste que gera a matriz falha se `scrollWidth` ultrapassar `clientWidth + 1 px`, confirma a troca correta entre navegação lateral e inferior e também falha se símbolo/wordmark não tiverem dimensões naturais válidas ou escaparem da base `/web/brand/`.

## Comportamentos validados junto da baseline

- hero troca após aproximadamente 7 s quando movimento reduzido não está ativo;
- hover/foco no hero pausa a rotação por outro ciclo completo;
- preview de card abre somente após intenção e não altera `x`, `y`, `width` ou `height` dos dois primeiros cards da grade além da tolerância subpixel;
- fluxo principal é completável somente por teclado e devolve foco ao card de origem ao fechar o detalhe;
- contexto Pixel 5 usa toque real e confirma ausência de hover persistente;
- Chromium, Firefox e WebKit passam o conjunto determinístico de descoberta;
- símbolo e wordmark carregam de `/web/brand/` com dimensões naturais válidas;
- MP4 resolve em `/web/brand/roneca_launch_video.mp4`, sem `NETWORK_NO_SOURCE` nem `MediaError`.

## Inspeção manual do artifact #9307080286

A revisão manual abriu diretamente as capturas geradas pelo CI e confirmou:

- **1366×768 login:** símbolo dourado/vermelho e wordmark `RonecaPlayerTV` carregados corretamente, sem ícone de imagem quebrada;
- **360×800 login:** marca íntegra e composição compacta sem overflow horizontal;
- **1366×768 Home:** marca lateral íntegra, navegação e shelves sem quebra visual;
- **390×844 Home:** wordmark superior íntegro, navegação inferior ativa e conteúdo sem overflow crítico;
- **1920×1080 Home:** marca lateral íntegra e composição estável em desktop amplo.

## Tolerância de regressão

Para comparação automática futura usando o mesmo browser/runner:

- tolerância alvo de diferença de pixels: **até 2%** da imagem;
- threshold perceptual recomendado: **0,20 YIQ** (padrão compatível com Playwright);
- deslocamento estrutural de regiões primárias (nav, hero, primeiro shelf, detalhe) acima de **8 px** deve ser revisado mesmo quando o diff global ficar abaixo de 2%;
- mudança de ordem/hierarquia dos blocos, overflow horizontal, corte de CTA, asset quebrado ou perda de foco visível é regressão crítica e não entra na tolerância percentual.

Font rendering pequeno, antialiasing e diferenças de rasterização entre Chromium/Firefox/WebKit podem ser aceitos quando não alterarem geometria, contraste ou leitura. A comparação principal de geometria usa Chromium; os outros engines funcionam como evidência cross-browser separada.

## Quando renovar

Renovar a baseline quando houver alteração intencional em:

- login, partículas ou marca;
- splash/crossfade;
- hero/carrossel;
- cards/hover;
- detalhes de filme/série;
- navegação ou breakpoints;
- tipografia, espaçamentos ou cores estruturais.

A renovação deve registrar novo commit, run, artifact e digest. Não substituir silenciosamente a baseline após uma falha.
