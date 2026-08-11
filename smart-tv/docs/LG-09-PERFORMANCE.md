# LG-09 — Performance, memória e compatibilidade webOS

## Baseline oficial

O primeiro ciclo oficial do RonecaPlayTV suporta **webOS 4.x+**. A matriz de engine da LG coloca:

- webOS 4.x (2018–2019) → **Chromium 53** → tier `legacy`;
- webOS 5.x / 6.x / 22 / 23 → Chromium 68 / 79 / 87 / 94 → tier `standard`;
- webOS 24+ → Chromium 108+ → tier `modern`.

O pacote webOS deve continuar funcionando com a engine mínima mesmo que o código-fonte seja construído em ferramentas modernas. Por isso o staging LG remove a dependência de `type="module"`/`modulepreload` e o runtime carrega uma camada pequena de compatibilidade antes do React.

## Limites de UI por tier

| Tier | Catálogo por janela | Episódios por página | Busca por tipo | Pré-carga visual |
| --- | ---: | ---: | ---: | ---: |
| legacy | 30 | 18 | 10 | 140 px |
| standard | 42 | 24 | 15 | 220 px |
| modern | 60 | 36 | 20 | 320 px |

Esses limites são de **elementos simultâneos**, não de tamanho do catálogo. O objetivo é suportar milhares de itens sem transformar todo o catálogo em DOM ao mesmo tempo.

## Gates automáticos

O CI deve validar:

1. target `chrome53` preservado;
2. `legacyCompat` carregado antes da aplicação;
3. APIs usadas no runtime mínimo cobertas ou proibidas;
4. `index.html` webOS empacotado sem `type="module"` e sem `modulepreload`;
5. bundle webOS sem `import.meta`/import dinâmico residual;
6. páginas de série limitadas e fila completa criada somente ao iniciar reprodução;
7. D-pad escolhendo o próximo foco em passagem linear, sem ordenar todos os candidatos;
8. cleanup do HTML5 player removendo listeners, `<video>` e referências;
9. bundle budget existente continuando verde.

## Matriz física obrigatória

### TV A — mínima suportada
- webOS 4.x / geração aproximada 2018–2019;
- confirmar versão em Configurações > Geral > Informações da TV;
- prioridade máxima para boot, D-pad, catálogo grande, imagens e player HTML5.

### TV B — intermediária
- webOS 5.x, 6.x, 22 ou 23;
- validar que os limites standard não causam regressão visual ou de foco.

### TV C — moderna
- webOS 24+ quando disponível;
- confirmar que o tier modern mantém fluidez e paridade visual.

Se não houver três aparelhos físicos, usar pelo menos a TV mais antiga disponível e a mais nova disponível; registrar a lacuna antes da LG-10.

## Como medir na TV

A LG oferece **Resource Monitor** e o monitor da CLI. Com Developer Mode ativo e o app aberto:

```bash
ares-device -d <TV> -r -id com.ronecaplaytv.app
```

Registrar CPU e memória do processo em CSV ou evidência equivalente durante cada cenário. Não usar apenas DevTools de desktop como prova de memória da TV.

## Cenários de 30 minutos

Executar cada cenário por **30 minutos** na TV mínima suportada ou na mais antiga disponível:

### Navegação de catálogo
1. abrir Home;
2. alternar Canais → Filmes → Séries → Busca;
3. percorrer páginas de catálogos grandes;
4. voltar para Home;
5. repetir o ciclo.

Aceite: navegação continua respondendo ao D-pad e a memória não apresenta crescimento monotônico sem estabilização.

### Player repetido
1. abrir um Live;
2. voltar;
3. abrir um VOD;
4. voltar;
5. repetir pelo menos 20 ciclos.

Aceite: no máximo um `<video>` ativo; nenhuma sessão antiga reproduzindo; listeners/timers não se acumulam; memória retorna para uma faixa próxima ao patamar aquecido após os ciclos.

### Série grande
1. abrir série com muitas temporadas/episódios;
2. alternar temporadas;
3. navegar por várias páginas de episódios;
4. iniciar episódios em páginas diferentes e voltar.

Aceite: DOM de episódios permanece limitado pela página do tier e a fila completa só existe enquanto necessária para o playback/next episode.

### Imagens
1. percorrer rapidamente filmes/séries;
2. observar atraso de foco, quadros congelados e crescimento de memória;
3. repetir após voltar à Home.

Aceite: imagens fora da janela visível não podem ser motivo para explosão contínua de memória; capas quebradas devem cair para fallback sem loop de carregamento.

## Boot e catálogo navegável

Medir em cold start e repetir cinco vezes:

- tempo do launch até a primeira tela utilizável;
- tempo até Home/catálogo aceitar foco e OK;
- pior execução e mediana.

Registrar modelo, webOS, versão do app, SHA do IPK e conexão. O resultado físico vira baseline para regressões futuras; não inventar números no CI.

## Regra de aprovação

LG-09 pode ter código integrado antes dos testes físicos, mas a issue permanece aberta como gate. A **LG-10** só pode considerar performance aprovada quando houver evidência física de pelo menos uma TV da faixa mais antiga disponível, sem crescimento contínuo de memória, sem múltiplos players vivos e sem travamento perceptível de D-pad em catálogo grande.
