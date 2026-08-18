# Web Player — Baseline visual WEB-17–WEB-27

Esta baseline registra a composição aprovada automaticamente antes da homologação física final. Ela é evidência de regressão visual, não autorização de publicação.

## Estado atual

A baseline abaixo foi **invalidada** após inspeção manual do artifact: as capturas mostravam símbolo/wordmark quebrados porque o bundle usava caminhos absolutos `/brand/...` enquanto o Web Player é servido sob `/web/`. O MP4 do splash também podia cair no fallback de erro sem comprovar carga real.

Correções de caminho e testes de carga real (`naturalWidth`, URL `/web/brand/`, estado de mídia e ausência de erro) já foram adicionados na branch `codex/web-ux-refinement-batch-2`. Uma nova baseline só será declarada canônica depois de:

1. CI completo verde com Chromium/Firefox/WebKit;
2. novo artifact baixado;
3. inspeção manual das capturas desktop/mobile confirmando marca íntegra;
4. atualização deste documento com commit/run/artifact/digest novos.

## Baseline anterior — INVALIDADA

- commit visual: `25285f0a199832724709ee16e0cbf1e0702c746e`;
- workflow: `Validate Pull Request` run **#809** (`32085032425`);
- artifact: `web-player-preview-and-tests` ID **9306486363**;
- digest do artifact: `sha256:b61b3c086a076430a3e54d0998125d702ad529a0f740dffeaa3864957e4b4bfe`;
- motivo da invalidação: assets de marca não resolvidos corretamente sob `/web/`; portanto as PNGs não representam uma experiência visual aprovada.

O artifact posterior #9306577666 reproduziu a mesma divergência e também não deve ser usado como baseline.

## Capturas que a nova baseline deverá preservar

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

O teste que gera a matriz falha se `scrollWidth` ultrapassar `clientWidth + 1 px`, confirma a troca correta entre navegação lateral e inferior e agora também falha se símbolo/wordmark não tiverem `naturalWidth > 0` ou escaparem da base `/web/brand/`.

## Comportamentos exigidos junto da nova baseline

- hero troca após aproximadamente 7 s quando movimento reduzido não está ativo;
- hover/foco no hero pausa a rotação por outro ciclo completo;
- preview de card abre somente após intenção e não altera `x`, `y`, `width` ou `height` dos dois primeiros cards da grade além da tolerância subpixel;
- fluxo principal é completável somente por teclado e devolve foco ao card de origem ao fechar o detalhe;
- contexto Pixel 5 usa toque real e confirma ausência de hover persistente;
- Chromium, Firefox e WebKit passam o conjunto determinístico de descoberta;
- símbolo e wordmark carregam de `/web/brand/` com dimensões naturais válidas;
- MP4 resolve em `/web/brand/roneca_launch_video.mp4`, sem `NETWORK_NO_SOURCE` nem `MediaError`.

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
