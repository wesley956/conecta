# LG-10 — Matriz de paridade Android APK × LG IPK

Android de referência: **RonecaPlayTV 2.9.5** (congelado para o ciclo LG-10 original).

> **Nota sobre esta revisão (2026-10-09):** o Android em produção hoje é a **3.0.1** (`versionCode 52`,
> commit `b57c144`), já bem adiante da baseline 2.9.5 congelada acima (migração de backend Supabase,
> redesign do painel, etc.). Esta auditoria foi feita **por leitura de código** (sem TV física) comparando
> o Smart TV (`smart-tv/src/**`, mesma base usada para empacotar o IPK da LG e o WGT da Samsung) contra o
> Android **3.0.1 real**, não contra a 2.9.5. Ela substitui o preenchimento manual que nunca tinha sido
> feito neste arquivo (estava 100% vazio antes desta revisão). Tudo que depende de sensação/remoto/tela
> física continua **pendente de teste físico** — está marcado explicitamente na coluna Ação.
>
> Decisão recomendada: tratar esta tabela como ponto de partida e, quando o teste físico acontecer,
> atualizar a baseline de referência para 3.0.1 (ou a versão Android vigente na época).

## Classificação

- **A — praticamente idêntico**: mesma intenção, fluxo e resultado; diferenças cosméticas irrelevantes.
- **B — equivalente**: mesma função/resultado, com diferença justificada por webOS, controle remoto, player ou recurso de plataforma.
- **C — divergente**: comportamento/visual/resultado incompatível com a referência e precisa correção.
- **N/A — não aplicável**: recurso não existe naquela plataforma; justificar.

Nenhum **C crítico** pode permanecer no RC aprovado.

## Identidade do RC testado

- Versão LG: 1.0.0 (RC)
- Commit: df91e97f3c760cdb1797141072e11a66e938cbc1
- Arquivo IPK: com.ronecaplaytv.app_1.0.0_all.ipk
- SHA-256: 0eb2022ee965a8f7df0aa477e4cdfe0812eb1969ed25dee980bc5ae9ff1ef2c9
- Artifact ID: roneca-play-tv-lg-ipk (build-lg-webos-installer)
- Modelo LG: — (pendente, requer TV física)
- webOS: — (pendente, requer TV física)
- Android de comparação/modelo: 3.0.1 (código-fonte; não testado em aparelho físico nesta revisão)
- Data: 2026-10-09
- Tester: auditoria de código (Claude, sem TV física) — **não substitui o teste físico com tester humano**

## Matriz obrigatória

| Área | Android 3.0.1 (comportamento real) | LG webOS/Smart TV (comportamento real) | Classe | Evidência | Diferença/justificativa | Ação |
| --- | --- | --- | --- | --- | --- | --- |
| Splash/abertura | Vídeo de abertura via ExoPlayer (`RonecaLaunchVideoScreen`) com watchdog de 12s e crossfade calculado a partir de 6,5s; áudio do vídeo ligado/desligado pelo toggle "Som de abertura". | Nenhuma tela/vídeo de abertura. `main.tsx` monta direto na raiz; só resta um jingle sintetizado via Web Audio (~2,85s, 1x por sessão), condicionado ao mesmo toggle. | **C (crítico)** | Android: `MainActivity.kt:62-90`; `RonecaLaunchVideoScreen.kt:38-131`. TV: `main.tsx:15-20`; `launchSound.ts:1-39`. | Não é limitação de plataforma — `<video>` autoplay mudo funciona em webOS/Tizen. É ausência de produto. | Implementar sequência de abertura real na smart-tv (vídeo HTML5 com o mesmo clipe/crossfade/watchdog). Autoplay de vídeo+som em TV física **requer confirmação física** (política de autoplay por modelo/firmware). |
| Ativação | 6 estados (Loading/Pending/Active/Blocked/Expired/Error); código com "Copiar"/"Compartilhar"; cartão de suporte com QR code; "Gerar novo código" só regenera identidade local (não revoga no servidor). | Mesmos 6 estados/mensagens em `App.tsx:33-58`, mas código só como texto (sem copiar/compartilhar/QR). Em compensação, só a TV tem "Desvincular aparelho" em Configurações, que chama `device-unlink` real no servidor. | **B** com **C não crítico** nos dois sentidos | Android: `ActivationScreen.kt:242-303`; `SupportUi.kt:92-200`. TV: `App.tsx:33-58`; `deviceSession.ts:338-355`; `MainShell.tsx:425`. | Estados equivalentes; TV perde conveniência de suporte (QR/compartilhar), Android nunca revoga credencial antiga ao gerar novo código. | Adicionar QR/compartilhar na ativação da TV; decidir se o Android ganha "Desvincular aparelho" real. Navegação por D-pad **requer confirmação física**. |
| Home | Hero rotativo filme+série (12s); rail "Em destaque"; bloco "Explorar" com contagens abreviadas. Sem carrossel de "Continuar assistindo"/"Minha lista" na Home (só na aba Playback). | Mesma estrutura hero+rail+Explorar, contagens em número cheio. Adiciona 2 carrosséis que o Android não tem na Home: "Continuar assistindo" e "Minha lista". | **C (não crítico)** | Android: `HomeScreen.kt:100-144,756-763`. TV: `MainShell.tsx:472-477,592-600`. | Divergência de produto (não de hardware) — Smart TV é mais rica na Home do que o Android hoje. | Decidir e documentar: portar os 2 carrosséis pro Android ou remover da TV pra igualar; unificar formatação de contagem. |
| Busca | Só pelo botão "Buscar" no header (não é aba fixa); filtro simples sem normalizar acento; avisa "X de Y" quando corta resultados; sem botão "Limpar". | "Buscar" é item fixo do menu lateral; normaliza acentos; limite por tier de hardware (10/15/20); **não** avisa truncamento; tem botão "Limpar". | **C (não crítico)** | Android: `SearchScreen.kt:59-230`; `MainNavigationBar.kt:59-66`. TV: `MainShell.tsx:80-298`; `performanceProfile.ts:21-50`. | Só o limite por tier é justificado por hardware (B); o resto são escolhas divergentes nos dois sentidos. | Portar aviso "exibindo X de Y" pra TV; avaliar fixar "Busca" no Android TV (D-pad); opcionalmente portar normalização de acento ao Android. |
| Canais | Painel lateral de categorias (contagem por categoria, D-pad esquerda/direita) OU chips; grade virtualizada sem paginação; memória de foco mantém o canal focado ao trocar filtro. | Aba equivalente, mesmos filtros; sem painel lateral (só chips); paginação explícita por tier (30/42/60); sem memória de foco por filtro. | **C (não crítico)** | Android: `ChannelsScreen.kt:91-401`. TV: `MainShell.tsx:171-357`; `focus.ts:30-57`; `performanceProfile.ts:25-47`. | Paginação é B (justificada por Chromium ≤53); ausência do painel lateral e do foco determinístico não são hardware-obrigatórias. | Portar lógica de "manter foco no canal após filtrar"; decidir se o painel lateral deve existir na TV. Percepção de "Carregar mais" vs rolagem contínua **requer confirmação física**. |
| Filmes | Grid sem paginação por página (virtualização nativa); filtros Todos/Minha Lista/Continuar + categorias; busca por nome. | Mesmos filtros/busca/card; grade paginada em blocos (30/42/60 por tier). | **B** | Android: `MoviesScreen.kt:96-329`. TV: `MainShell.tsx:473-561`; `performanceProfile.ts:21-50`. | Mesma função/resultado; paginação por botões é justificada por limite de memória do Chromium ≤53. | Nenhuma correção obrigatória. Navegação dos botões de página com D-pad **requer confirmação física**. |
| Detalhe de filme | `MovieDetailScreen` não recebe `progress` — nunca mostra retomar/percentual na tela de detalhe (só a lista tem badge CONTINUAR). | `MovieDetailScreen.tsx` recebe `progress`, mostra bloco "Continuar assistindo" com tempo/percentual e troca o botão principal para "▶ Continuar". | **C (não crítico)** | Android: `MovieDetailScreen.kt:56-65,274-281`. TV: `movie/MovieDetailScreen.tsx:65-96`. | Não é limitação de plataforma — é lacuna real do Android (a tela de série já tem isso via `SeriesProgressResolver`, a de filme não). Aqui a TV está na frente. | Replicar no Android a exibição de progresso/retomar na tela de detalhe de filme. |
| Séries | Mesma estrutura de filmes (grid, filtros, badge "{N} T"). | Mesma estrutura/paginação; filtro "Continuar" identifica séries iniciadas recortando a **string** do histórico, não por ID estável. | **B** (paginação) + **C não crítico** (robustez do filtro) | Android: `SeriesScreen.kt:96-324`. TV: `MainShell.tsx:504-549`. | Paginação = mesma justificativa de filmes. Match por substring é mais frágil que o ID usado no Android (`ContentIdentity`) e pode falhar com nomes duplicados/variações. | Trocar heurística `startedSeries` pra usar `seriesContentKey`/`contentKey` em vez da string do nome. Não bloqueia o RC atual. |
| Detalhe de série/temporadas/episódios | `SeriesProgressResolver` calcula entre todas as temporadas o episódio com progresso mais recente, pré-seleciona a temporada e mostra CTA "▶ Continuar T{s}E{e}" no topo com foco automático. | Temporada inicial vem de memória de navegação manual (`seriesSeasonMemory`), **sem** cálculo de resume nem CTA no cabeçalho. Progresso por episódio aparece igual ao Android; episódios paginados (18/24/36 por tier). | **C (não crítico)** | Android: `SeriesProgressResolver.kt:15-27`; `SeriesDetailScreen.kt:74-95,378-387`. TV: `series/SeriesDetailScreen.tsx:79-101`; `App.tsx:340`. | Paginação = B (plataforma). Ausência do resume automático + CTA é lacuna funcional real, cresce com séries grandes (usuário precisa achar o episódio manualmente). | Implementar na TV um resolvedor equivalente ao `resolveSeriesResumeTarget`, pré-selecionar temporada/página desse episódio e exibir CTA "▶ Continuar T{s}E{e}" com foco automático. |
| Player ao vivo | ExoPlayer com `DefaultLoadControl` próprio; timeout start 20s, stall ao vivo 12s; fallback decoder HW→SW só fora de canal (nunca em live). Falha terminal em canal troca pra lista reserva. | Mesmos timeouts (12s/20s) e monitor de stall idêntico; falha terminal com `backupAvailable` troca de lista igual. Sem conceito de decoder HW/SW (API HTML5/AVPlay não expõe isso). | **B** | Android: `NativePlayerScreen.kt:70-229`. TV: `PlayerScreen.tsx:255-344`; `html5Player.ts:110`; `tizenPlayer.ts:88-92`. | Lógica de stall/retry/troca de fonte equivalente linha a linha; diferença de decoder é inerente à plataforma. | Nenhuma ação de paridade necessária. PLAYER-02 (vídeo congelado com áudio tocando) continua sem cobertura nas duas plataformas (já no backlog). |
| Player VOD | Mesmo motor/política, timeout stall VOD 25s; ao esgotar fontes sem canal, só marca falha terminal (sem troca de lista). `FAILED_RUNTIME_CHECK` (87% das falhas reais) tem retry com backoff 2/4/8s. | Mesmo timeout 25s; sem lista reserva para VOD; sem categoria equivalente a `FAILED_RUNTIME_CHECK` (erro específico do ExoPlayer, não existe em HTML5/AVPlay). | **A** | Android: `NativePlayerScreen.kt:70-273`; `PlaybackFailurePolicy.kt:117-127`. TV: `PlayerScreen.tsx:255-344,578`. | Comportamento de stall/retry/troca de fonte equivalente; ausência de retry de "runtime check" na TV é correta (categoria não existe fora do ExoPlayer). | Nenhuma ação. |
| Áudio/legendas | **Só legendas** (`PlayerSubtitles.kt`, `C.TRACK_TYPE_TEXT`). Não existe seletor de faixa de áudio em nenhum lugar do app (confirmado por busca no projeto inteiro). | **Áudio e legendas** num único painel; `html5Player.ts` lê `video.textTracks`/`video.audioTracks`; `tizenPlayer.ts` usa `avplay.getTotalTrackInfo()`/`setSelectTrack`, nativo e robusto no Samsung. | **C (não crítico, invertido)** | Android: ausência confirmada por busca em `.../ui/player`. TV: `PlayerScreen.tsx:581-585`; `html5Player.ts:141-256`; `tizenPlayer.ts:103-145`. | A Smart TV tem **mais** função aqui — seleção de áudio multi-faixa existe na TV e não no Android. | Adicionar seletor de faixa de áudio ao Android (`C.TRACK_TYPE_AUDIO` + `TrackSelectionOverride`). Suporte real de `audioTracks` por firmware LG **requer confirmação física**. |
| Aspecto da imagem | 3 modos (Original/Preencher/Estender) mapeados pra `RESIZE_MODE_FIT/ZOOM/FILL` na `PlayerView`, idêntico em canal e VOD. | **LG (Html5Player):** equivalente via CSS `object-fit` no elemento `<video>` — classe **B**. **Samsung (TizenPlayer):** o botão muda o texto/preferência, mas o player nunca chama `setDisplayMethod`/`setDisplayRect` — a imagem fica sempre travada em letterbox, independente da escolha do usuário. | **B (LG) / C crítico (Samsung)** | Android: `RonecaMedia3PlayerView.kt:121,198-202`. TV: `PlayerAspectControl.tsx:11`; `player-v2.css:3-5`; `tizenPlayer.ts:66-74` (sem `aspectMode` em lugar nenhum). | Para LG a equivalência é real. Para Samsung o controle é puramente decorativo — não afeta a imagem renderizada pelo AVPlay. **Não bloqueia o IPK da LG**, mas bloqueia o WGT da Samsung se o mesmo padrão de gate for aplicado lá. | Implementar no `TizenPlayer` a tradução do modo pra `setDisplayMethod`/`setDisplayRect` do SDK AVPlay. **Requer confirmação física** em TV Samsung real para validar os `PLAYER_DISPLAY_MODE_*` aceitos pelo modelo. |
| Configurações | Atualizar conteúdo; Suporte; Diagnóstico das listas; Player com seletor real de decoder HW/Software, buffer, aspecto; Interface (Clássica/Painel lateral, som de abertura, Modo TV); Rede; verificação de atualização com download+instalação real de APK. Sem limpar cache/dados, sem desvincular. | Atualizar conteúdo; Player (tecnologia fixa/informativa, aspecto/buffer/reconexão idênticos, som de abertura); Diagnóstico (lista ativa/saúde/última sync/último failover/código de suporte); verificação de atualização só informativa (loja não permite instalar); além disso Suporte, Privacidade, Limpar cache, Limpar dados, **Desvincular aparelho**. Sem "Painel lateral" de categorias, sem "Modo TV" (N/A — a TV já é sempre modo TV). | **B** geral + **C não crítico** nos dois sentidos | Android: `SettingsScreen.kt:144-228`. TV: `MainShell.tsx:401-425`. | Decoder fixo/update informativo = B (justificado por plataforma). "Painel lateral" ausente na TV é gap de interface; limpar cache/dados/desvincular ausentes no Android é o inverso — a TV tem mais ferramentas de manutenção local. | Decidir se "Painel lateral" deve existir na TV ou documentar N/A; portar "Limpar cache/dados"/"Desvincular aparelho" pro Android (ou justificar ausência). Fluidez de D-pad entre os cards **requer confirmação física**. |
| Diagnóstico | Card "Diagnóstico das listas" (lista ativa/reserva, contagens, última troca/motivo). Falhas de player só telemetria invisível (`NativeDiagnostics.kt`); expõe device code bruto; sem "código de suporte" curto. | `diagnosticSafety.ts` sanitiza de forma equivalente e gera **código de suporte curto** (hash, `RP-LG-XXXXXX`/`RP-SZ-XXXXXX`); reporta pros mesmos endpoints que o Android; expõe "Último failover" na UI. | **B** (mesmo backend) + **C não crítico** | Android: `NativeDiagnostics.kt:29-126`; `SettingsScreen.kt:136-142`. TV: `diagnosticSafety.ts:1-49`; `deviceSession.ts:168-241`. | Sanitização/destino equivalentes; TV expõe "último failover" e código de suporte anonimizado que o Android não tem como itens próprios. | Portar pro Android um item "Último failover" explícito e um `supportCode` curto análogo, pra não expor o device code bruto no atendimento. |
| Failover/recovery | 3 camadas (retry com backoff 2/4/8s → troca de fonte → troca de lista reserva só em canal ao vivo). Reconexão automática desligável interrompe tudo na 1ª falha. Sem detecção de perda de rede do sistema. | Mesmas 3 camadas, mesmos backoffs; mas VOD e live tratam igual (ambos podem usar lista reserva se o chamador passar `backupAvailable=true`). Reage a `online`/`offline` e `visibilitychange` (pausa/retoma rede, suspende e recarrega ao voltar do background) — sem equivalente explícito no Android. | **B** geral + **C não crítico** (assimetria VOD×live) | Android: `NativePlayerScreen.kt:188-273`; `PlaybackFailurePolicy.kt:150`. TV: `PlayerScreen.tsx:267-479`; `failurePolicy.ts:39`; `html5Player.ts:175-236`. | Estratégia central equivalente e backoffs idênticos. TV tem tratamento de rede explícito mais sofisticado; Android distingue VOD×live de forma diferente da TV — verificar se é intencional. | Confirmar se a assimetria VOD×live é intencional e alinhar a regra; avaliar portar o tratamento online/offline/background pro Android. PLAYER-04 (token) e latência real de troca de fonte **requerem confirmação física**. |

## Gates físicos complementares

**Nenhum destes foi executado — todos pendentes, exigem TV física (não avaliável por leitura de código):**

| Gate | Resultado | Evidência | Observação |
| --- | --- | --- | --- |
| Instalação limpa | Pendente | — | Requer TV física |
| Segunda abertura | Pendente | — | Requer TV física |
| Reboot da TV + reabertura | Pendente | — | Requer TV física |
| Atualização N→N+1 | Pendente | — | Requer TV física |
| Identidade preservada | Pendente | — | Requer TV física |
| Favoritos preservados | Pendente | — | Requer TV física |
| Progresso preservado | Pendente | — | Requer TV física |
| Preferências preservadas | Pendente | — | Requer TV física |
| Catálogo grande | Pendente | — | Requer TV física |
| Série grande | Pendente | — | Requer TV física |
| Queda/retorno de internet | Pendente | — | Requer TV física |
| Source switch | Pendente | — | Requer TV física |
| Failover principal → reserva | Pendente | — | Requer TV física |
| Standby/resume | Pendente | — | Requer TV física |
| 30 minutos de navegação | Pendente | — | Requer TV física |
| 20 ciclos Live/VOD | Pendente | — | Requer TV física |
| CPU/memória sem crescimento contínuo | Pendente | — | Requer TV física |
| Apenas um player ativo | Pendente | — | Requer TV física |

## Resumo de classificação

- A: 2 (Player VOD; Filmes/paginação é B, não A — ver nota)
- B: 8 (Ativação, Player ao vivo, Filmes, Séries-paginação, Configurações, Diagnóstico, Failover/recovery, Aspecto-LG)
- C não críticos: 12 (Ativação, Home, Busca, Canais, Detalhe de filme, Séries-filtro, Detalhe de série, Áudio/legendas, Configurações, Diagnóstico, Failover/recovery — vários itens têm classificação mista B+C na mesma linha, contados uma vez cada)
- C críticos: **2** — Splash/abertura (afeta LG e Samsung) e Aspecto da imagem no Samsung/Tizen (não afeta o IPK da LG)
- N/A: 1 (decoder HW/SW não existe em HTML5/AVPlay; "Modo TV" não aplicável na própria TV)

## Decisão

- [ ] Nenhum C crítico permanece. **→ FALHA**: 2 C críticos abertos (splash ausente na TV; aspecto decorativo no Samsung). O splash afeta o IPK da LG; o aspecto crítico é só Samsung/Tizen.
- [ ] Todas as diferenças B têm justificativa. — justificativas registradas na tabela acima, pendente de revisão humana.
- [ ] O SHA testado é exatamente o SHA do RC destinado à promoção. — SHA registrado acima (RC `0eb2022e...`); esta auditoria foi feita no código-fonte do commit `df91e97f`, correspondente a esse RC.
- [ ] Evidências físicas estão anexadas/registradas. **→ Pendente** — nenhuma evidência física existe ainda.
- [ ] LG-01→LG-09 estão fisicamente concluídos ou formalmente aceitos. **→ Pendente** — só os gates automatizados (não físicos) foram confirmados até agora.
- [ ] RC apto à promoção segundo LG-P07. **→ NÃO** — bloqueado pelos 2 C críticos e pela ausência total de evidência física.

Aprovação LG-10:
- Responsável: —
- Data: —
- Observações: Esta revisão (2026-10-09) é uma auditoria de código feita sem TV física, a pedido do responsável do projeto, para ter uma primeira leitura de paridade antes do teste físico formal. Ela não substitui o teste físico exigido por este documento — serve para já corrigir os gaps puramente de código antes de gastar o tempo de homologação física com problemas que já eram visíveis no código.
