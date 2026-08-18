# Web Player — Homologação UX WEB-17–WEB-27

Este documento é o gate de homologação do refinamento visual iniciado nas issues #322–#332. Ele não representa aprovação comercial automática e não substitui teste físico em dispositivos reais.

## Artefato candidato

- Branch de implementação: `codex/web-ux-refinement-batch-2`.
- O build candidato deve ser gerado pelo mesmo commit que for testado.
- A publicação comercial só pode promover exatamente esse artifact após autorização explícita.
- O vídeo de splash Web precisa ter o mesmo SHA-256 do arquivo `native-android/app/src/main/res/raw/roneca_launch_video.mp4`.

## Fluxo de entrada

1. Abrir `/web/` sem sessão ativa.
2. Confirmar marca ampliada, formulário íntegro e partículas discretas.
3. Confirmar que partículas não capturam clique/teclado.
4. Fazer login válido.
5. Confirmar splash em tela cheia usando o vídeo oficial do APK.
6. Confirmar que a Home começa a carregar atrás do overlay.
7. Por volta de 6,5 s, confirmar início do crossfade.
8. Confirmar ausência de frame preto, freeze final ou salto de layout.
9. Em `prefers-reduced-motion: reduce`, confirmar entrada curta/estática.

## Home e descoberta

- Hero usa até 6 filmes/séries e permanece estável durante a sessão.
- Troca automática acontece em aproximadamente 7 s quando movimento reduzido não está ativo.
- Hover/foco/interação pausa a rotação.
- Indicadores permitem troca manual por mouse, teclado e toque.
- Somente destaque atual e próximo devem receber prioridade de imagem; não pré-carregar seis fundos agressivamente.
- Cards desktop exibem preview somente após intenção (~600 ms), sem deslocar a prateleira.
- Touch/coarse pointer não deve manter preview de hover preso.

## Filme

- Detalhe usa a maior parte útil da viewport sem deformar poster/backdrop.
- Assistir/Continuar e Minha Lista permanecem operacionais.
- `Você também pode gostar` aparece quando houver candidatos.
- Item atual e duplicados não aparecem nas recomendações.
- Escape fecha o detalhe e o foco retorna ao card de origem.

## Série

- Temporadas ficam em seletor horizontal, não todas abertas verticalmente.
- T1/T2/etc. possuem estado ativo inequívoco.
- ArrowLeft/ArrowRight/Home/End funcionam quando o seletor está focado.
- Trocar temporada atualiza apenas os episódios do painel ativo.
- Episódio correto inicia playback.
- `Séries semelhantes` exclui a série atual.

## Matriz obrigatória de viewport/input

| Alvo | Resolução base | Input principal | Evidência |
|---|---:|---|---|
| Mobile compacto | 360 × 800 | touch | screenshot + navegação |
| Mobile referência | 390 × 844 | touch | screenshot + navegação |
| Tablet | 768 × 1024 | touch/teclado | screenshot + detalhes |
| Tablet/desktop pequeno | 1024 × 768 | mouse/teclado | screenshot + hover |
| Notebook | 1366 × 768 | mouse/teclado | gravação curta |
| Desktop Full HD | 1920 × 1080 | mouse/teclado | gravação curta |
| Ultrawide razoável | 2560 × 1080 | mouse/teclado | screenshot |

Também validar landscape com altura <= 620 px e safe areas quando disponíveis.

## Navegadores

- Chrome/Chromium atual.
- Edge atual.
- Firefox atual.
- Safari/WebKit atual.
- Chrome Android em aparelho real.
- Safari iOS em aparelho real quando disponível.

## Performance

O build possui dois budgets diferentes porque o engine HLS é carregado somente quando o usuário abre um conteúdo:

- entry inicial: <= 330 KB raw;
- shell em `assets/`: <= 700 KB raw;
- `media-engine`: <= 600 KB raw e fora do `index.html`;
- total JS: <= 810 KB raw;
- `WebPlayerCore`: <= 130 KB raw.

O gate deve falhar se o HLS voltar ao carregamento inicial, mesmo que o total permaneça dentro do limite.

## Regressão funcional

Validar que as mudanças visuais não quebraram:

- login/refresh/logout;
- catálogo e lista reserva;
- busca global;
- TV ao vivo e EPG;
- filmes e séries;
- player, fullscreen, PiP e aspecto;
- zapping;
- favoritos;
- progresso/Continuar assistindo;
- preferências sincronizadas;
- PWA/update/offline fallback;
- gestão Web no ADM/Vendedor.

## Evidência automatizada

`web-player/e2e/discovery.spec.ts` cobre fixtures determinísticas para login→splash→Home, hero, detalhe de filme, retorno de foco, temporadas por setas, hover atrasado, mobile 390 px e reduced motion. O CI mantém screenshots de evidência no diretório `test-results` para os testes mobile.

## Gate de promoção

A issue #332 só pode ser considerada concluída quando:

1. CI estiver verde no commit candidato;
2. evidência automatizada estiver anexada;
3. teste físico desktop/mobile não apontar divergência crítica;
4. não houver regressão de player, biblioteca ou autenticação;
5. o artifact testado for identificado pelo commit/hash;
6. houver autorização explícita para promover esse mesmo artifact.

Até isso acontecer, a PR deve permanecer como homologação e nenhuma promoção comercial é implícita.
