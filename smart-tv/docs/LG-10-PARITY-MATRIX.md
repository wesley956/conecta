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
>
> **Atualização (2026-10-09, mesmo dia):** os 4 itens que o responsável do projeto pediu para corrigir
> (splash/abertura na Smart TV, resume automático de série na Smart TV, progresso no detalhe de filme +
> seletor de áudio no Android, correção do aspecto no Tizen/Samsung) foram implementados e estão na PR
> [#479](https://github.com/wesley956/conecta/pull/479) (`fix/lg10-parity-splash-resume-audio-aspect`),
> com todos os gates de CI automatizados verdes (Android, LG webOS/IPK, Samsung/Tizen WGT, Browser E2E).
> As linhas abaixo foram reclassificadas para refletir isso, mas **nada disso foi validado em TV física**
> — os dois C críticos só saem de "pendente" de fato depois do teste físico formal.

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
| Splash/abertura | Vídeo de abertura via ExoPlayer (`RonecaLaunchVideoScreen`) com watchdog de 12s e crossfade calculado a partir de 6,5s; áudio do vídeo ligado/desligado pelo toggle "Som de abertura". | ~~Nenhuma tela/vídeo de abertura~~ **(corrigido, PR #479):** `LaunchSplashScreen.tsx` reproduz o mesmo clipe (`public/brand/roneca-launch-video.mp4`) com a mesma política de transição (`launchVideoTransitionPolicy.ts`: crossfade a partir de 6,5s, watchdog de 12s, fallback se autoplay com som for bloqueado), condicionado ao toggle "Som de abertura". `launchSound.ts` (jingle Web Audio) foi removido. | **C (crítico) → corrigido em código, pendente de teste físico** | Android: `MainActivity.kt:62-90`; `RonecaLaunchVideoScreen.kt:38-131`. TV: `splash/LaunchSplashScreen.tsx`; `launchVideoTransitionPolicy.ts`; `App.tsx` (overlay `showSplash`). | Não é limitação de plataforma — `<video>` autoplay mudo funciona em webOS/Tizen. | Autoplay de vídeo+som em TV física **ainda requer confirmação física** (política de autoplay por modelo/firmware) — o código assume o mesmo comportamento do Android mas isso não foi observado numa LG real. |
| Ativação | 6 estados (Loading/Pending/Active/Blocked/Expired/Error); código com "Copiar"/"Compartilhar"; cartão de suporte com QR code; "Gerar novo código" só regenera identidade local (não revoga no servidor). | Mesmos 6 estados/mensagens em `App.tsx:33-58`, mas código só como texto (sem copiar/compartilhar/QR). Em compensação, só a TV tem "Desvincular aparelho" em Configurações, que chama `device-unlink` real no servidor. | **B** com **C não crítico** nos dois sentidos | Android: `ActivationScreen.kt:242-303`; `SupportUi.kt:92-200`. TV: `App.tsx:33-58`; `deviceSession.ts:338-355`; `MainShell.tsx:425`. | Estados equivalentes; TV perde conveniência de suporte (QR/compartilhar), Android nunca revoga credencial antiga ao gerar novo código. | Adicionar QR/compartilhar na ativação da TV; decidir se o Android ganha "Desvincular aparelho" real. Navegação por D-pad **requer confirmação física**. |
| Home | Hero rotativo filme+série (12s); rail "Em destaque"; bloco "Explorar" com contagens abreviadas. Sem carrossel de "Continuar assistindo"/"Minha lista" na Home (só na aba Playback). | Mesma estrutura hero+rail+Explorar, contagens em número cheio. Adiciona 2 carrosséis que o Android não tem na Home: "Continuar assistindo" e "Minha lista". | **C (não crítico)** | Android: `HomeScreen.kt:100-144,756-763`. TV: `MainShell.tsx:472-477,592-600`. | Divergência de produto (não de hardware) — Smart TV é mais rica na Home do que o Android hoje. | Decidir e documentar: portar os 2 carrosséis pro Android ou remover da TV pra igualar; unificar formatação de contagem. |
| Busca | Só pelo botão "Buscar" no header (não é aba fixa); filtro simples sem normalizar acento; avisa "X de Y" quando corta resultados; sem botão "Limpar". | "Buscar" é item fixo do menu lateral; normaliza acentos; limite por tier de hardware (10/15/20); **não** avisa truncamento; tem botão "Limpar". | **C (não crítico)** | Android: `SearchScreen.kt:59-230`; `MainNavigationBar.kt:59-66`. TV: `MainShell.tsx:80-298`; `performanceProfile.ts:21-50`. | Só o limite por tier é justificado por hardware (B); o resto são escolhas divergentes nos dois sentidos. | Portar aviso "exibindo X de Y" pra TV; avaliar fixar "Busca" no Android TV (D-pad); opcionalmente portar normalização de acento ao Android. |
| Canais | Painel lateral de categorias (contagem por categoria, D-pad esquerda/direita) OU chips; grade virtualizada sem paginação; memória de foco mantém o canal focado ao trocar filtro. | Aba equivalente, mesmos filtros; sem painel lateral (só chips); paginação explícita por tier (30/42/60); sem memória de foco por filtro. | **C (não crítico)** | Android: `ChannelsScreen.kt:91-401`. TV: `MainShell.tsx:171-357`; `focus.ts:30-57`; `performanceProfile.ts:25-47`. | Paginação é B (justificada por Chromium ≤53); ausência do painel lateral e do foco determinístico não são hardware-obrigatórias. | Portar lógica de "manter foco no canal após filtrar"; decidir se o painel lateral deve existir na TV. Percepção de "Carregar mais" vs rolagem contínua **requer confirmação física**. |
| Filmes | Grid sem paginação por página (virtualização nativa); filtros Todos/Minha Lista/Continuar + categorias; busca por nome. | Mesmos filtros/busca/card; grade paginada em blocos (30/42/60 por tier). | **B** | Android: `MoviesScreen.kt:96-329`. TV: `MainShell.tsx:473-561`; `performanceProfile.ts:21-50`. | Mesma função/resultado; paginação por botões é justificada por limite de memória do Chromium ≤53. | Nenhuma correção obrigatória. Navegação dos botões de página com D-pad **requer confirmação física**. |
| Detalhe de filme | ~~`MovieDetailScreen` não recebe `progress`~~ **(corrigido, PR #479):** recebe `progress: List<SavedProgress>`, mostra bloco "Continuar assistindo" com tempo/percentual e barra de progresso, e troca o botão principal para "▶ Continuar". | `MovieDetailScreen.tsx` recebe `progress`, mostra bloco "Continuar assistindo" com tempo/percentual e troca o botão principal para "▶ Continuar". | **C (não crítico) → corrigido em código** | Android: `MovieDetailScreen.kt` (`MovieResumeProgress`, parâmetro `progress`). TV: `movie/MovieDetailScreen.tsx:65-96`. | Paridade agora bidirecional nos dois sentidos de UI; não testado em dispositivo Android real nem em TV física. | Nenhuma ação pendente de código; validar visualmente em build real. |
| Séries | Mesma estrutura de filmes (grid, filtros, badge "{N} T"). | Mesma estrutura/paginação; filtro "Continuar" identifica séries iniciadas recortando a **string** do histórico, não por ID estável. | **B** (paginação) + **C não crítico** (robustez do filtro) | Android: `SeriesScreen.kt:96-324`. TV: `MainShell.tsx:504-549`. | Paginação = mesma justificativa de filmes. Match por substring é mais frágil que o ID usado no Android (`ContentIdentity`) e pode falhar com nomes duplicados/variações. | Trocar heurística `startedSeries` pra usar `seriesContentKey`/`contentKey` em vez da string do nome. Não bloqueia o RC atual. |
| Detalhe de série/temporadas/episódios | `SeriesProgressResolver` calcula entre todas as temporadas o episódio com progresso mais recente, pré-seleciona a temporada e mostra CTA "▶ Continuar T{s}E{e}" no topo com foco automático. | ~~Sem cálculo de resume nem CTA~~ **(corrigido, PR #479):** `series/seriesProgressResolver.ts` (porta de `resolveSeriesResumeTarget`) calcula o mesmo episódio de maior progresso entre as temporadas carregadas, pré-seleciona a temporada/página certa e mostra o CTA "▶ Continuar T{s}E{e} • {tempo}" com foco automático, igual ao Android. | **C (não crítico) → corrigido em código** | Android: `SeriesProgressResolver.kt:15-27`; `SeriesDetailScreen.kt:74-95,378-387`. TV: `series/seriesProgressResolver.ts`; `series/SeriesDetailScreen.tsx` (`resumeTarget`, CTA `series:continue`). | Paginação continua B (plataforma). O gap funcional foi fechado; o cuidado tomado foi não resetar a navegação manual do usuário em sessão (dependências de efeito excluem `history` deliberadamente). | Nenhuma ação de código pendente; validar em TV física que o CTA aparece e foca corretamente via D-pad. |
| Player ao vivo | ExoPlayer com `DefaultLoadControl` próprio; timeout start 20s, stall ao vivo 12s; fallback decoder HW→SW só fora de canal (nunca em live). Falha terminal em canal troca pra lista reserva. | Mesmos timeouts (12s/20s) e monitor de stall idêntico; falha terminal com `backupAvailable` troca de lista igual. Sem conceito de decoder HW/SW (API HTML5/AVPlay não expõe isso). | **B** | Android: `NativePlayerScreen.kt:70-229`. TV: `PlayerScreen.tsx:255-344`; `html5Player.ts:110`; `tizenPlayer.ts:88-92`. | Lógica de stall/retry/troca de fonte equivalente linha a linha; diferença de decoder é inerente à plataforma. | Nenhuma ação de paridade necessária. PLAYER-02 (vídeo congelado com áudio tocando) continua sem cobertura nas duas plataformas (já no backlog). |
| Player VOD | Mesmo motor/política, timeout stall VOD 25s; ao esgotar fontes sem canal, só marca falha terminal (sem troca de lista). `FAILED_RUNTIME_CHECK` (87% das falhas reais) tem retry com backoff 2/4/8s. | Mesmo timeout 25s; sem lista reserva para VOD; sem categoria equivalente a `FAILED_RUNTIME_CHECK` (erro específico do ExoPlayer, não existe em HTML5/AVPlay). | **A** | Android: `NativePlayerScreen.kt:70-273`; `PlaybackFailurePolicy.kt:117-127`. TV: `PlayerScreen.tsx:255-344,578`. | Comportamento de stall/retry/troca de fonte equivalente; ausência de retry de "runtime check" na TV é correta (categoria não existe fora do ExoPlayer). | Nenhuma ação. |
| Áudio/legendas | ~~Só legendas~~ **(corrigido, PR #479):** novo `PlayerAudioTracks.kt` (espelha `PlayerSubtitles.kt`, usando `C.TRACK_TYPE_AUDIO` + `TrackSelectionOverride`) com botão "🔊 Áudio" no chrome do player (visível só com >1 faixa), wireado nos dois players (filme/canal e série). | **Áudio e legendas** num único painel; `html5Player.ts` lê `video.textTracks`/`video.audioTracks`; `tizenPlayer.ts` usa `avplay.getTotalTrackInfo()`/`setSelectTrack`, nativo e robusto no Samsung. | **C (não crítico, invertido) → corrigido em código** | Android: `PlayerAudioTracks.kt`; wiring em `NativePlayerScreen.kt`/`SeriesNativePlayerScreen.kt`/`RonecaMedia3PlayerView.kt` + `roneca_media3_player_controls.xml`. TV: `PlayerScreen.tsx:581-585`; `html5Player.ts:141-256`; `tizenPlayer.ts:103-145`. | Paridade de função agora nos dois lados; não testado em dispositivo Android real (seleção de faixa de áudio por conteúdo com múltiplos idiomas). | Nenhuma ação de código pendente; validar com um conteúdo real que tenha dublagem + áudio original. Suporte real de `audioTracks` por firmware LG **continua a requerer confirmação física**. |
| Aspecto da imagem | 3 modos (Original/Preencher/Estender) mapeados pra `RESIZE_MODE_FIT/ZOOM/FILL` na `PlayerView`, idêntico em canal e VOD. | **LG (Html5Player):** equivalente via CSS `object-fit` no elemento `<video>` — classe **B**, sem mudança. **Samsung (TizenPlayer): (corrigido, PR #479)** `TizenPlayer` agora escuta o mesmo evento (`SMART_TV_PLAYER_SETTINGS_EVENT`) que `PlayerAspectControl` já disparava e aplica o modo via `setDisplayMethod`/`setDisplayRect` do AVPlay — deixa de ser puramente decorativo. | **B (LG) / C crítico (Samsung) → corrigido em código, pendente de teste físico** | Android: `RonecaMedia3PlayerView.kt:121,198-202`. TV: `tizenPlayer.ts` (`applyAspectMode`, listener de `playerSettings.ts`). | Para LG a equivalência é real. Para Samsung, o AVPlay só expõe nativamente `LETTER_BOX` (preserva proporção) e `FULL_SCREEN` (estica) — não existe um terceiro modo de "cortar bordas" sem calcular a proporção do vídeo, então "Preencher" e "Estender" ficam mapeados pro mesmo `FULL_SCREEN` por ora (aproximação documentada no código, não é 1:1 com os 3 modos do Android). | **Requer confirmação física** em TV Samsung real: validar que o `PLAYER_DISPLAY_MODE_*` é aceito pelo modelo e que a imagem muda visivelmente ao ciclar o controle — isso não pôde ser observado sem hardware. |
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

Estado original desta auditoria (código-fonte, sem TV física), antes das correções:
- A: 2 (Player VOD; Filmes/paginação é B, não A — ver nota)
- B: 8 (Ativação, Player ao vivo, Filmes, Séries-paginação, Configurações, Diagnóstico, Failover/recovery, Aspecto-LG)
- C não críticos: 12 (Ativação, Home, Busca, Canais, Detalhe de filme, Séries-filtro, Detalhe de série, Áudio/legendas, Configurações, Diagnóstico, Failover/recovery — vários itens têm classificação mista B+C na mesma linha, contados uma vez cada)
- C críticos: **2** — Splash/abertura (afeta LG e Samsung) e Aspecto da imagem no Samsung/Tizen (não afeta o IPK da LG)
- N/A: 1 (decoder HW/SW não existe em HTML5/AVPlay; "Modo TV" não aplicável na própria TV)

**Após a PR [#479](https://github.com/wesley956/conecta/pull/479) (2026-10-09, código ainda não mesclado em `main`):**
- Os **2 C críticos** (splash; aspecto no Samsung) têm correção de código implementada e com CI verde, mas **nenhum dos dois foi observado em TV física** — continuam "pendente de teste físico" na prática, só deixam de ser "ausência total" no código.
- **3 dos C não críticos** (Detalhe de filme, Detalhe de série, Áudio/legendas) têm correção de código implementada e com CI verde.
- Os **9 C não críticos restantes** (Ativação, Home, Busca, Canais, Séries-filtro, Configurações, Diagnóstico, Failover/recovery) **não foram tocados** — ficaram de fora do pedido original ("corrija tudo" se referiu aos 4 itens priorizados nesta sessão, não à lista completa de C não críticos).

## Decisão

- [ ] Nenhum C crítico permanece. **→ FALHA (ainda)**: os 2 C críticos têm correção de código (PR #479, CI verde) mas **zero evidência física** — splash e aspecto-Samsung continuam não observados numa TV real. Código corrigido ≠ gate físico passado.
- [ ] Todas as diferenças B têm justificativa. — justificativas registradas na tabela acima, pendente de revisão humana.
- [ ] O SHA testado é exatamente o SHA do RC destinado à promoção. — SHA registrado acima (RC `0eb2022e...`); esta auditoria foi feita no código-fonte do commit `df91e97f`, correspondente a esse RC. As correções da PR #479 **ainda não geraram um novo RC** — um novo IPK precisa ser empacotado e assinado depois do merge pra esta linha valer para o build corrigido.
- [ ] Evidências físicas estão anexadas/registradas. **→ Pendente** — nenhuma evidência física existe ainda.
- [ ] LG-01→LG-09 estão fisicamente concluídos ou formalmente aceitos. **→ Pendente** — só os gates automatizados (não físicos) foram confirmados até agora (incluindo, agora, os da PR #479).
- [ ] RC apto à promoção segundo LG-P07. **→ NÃO** — bloqueado pela ausência total de evidência física, independente do código estar corrigido.

Aprovação LG-10:
- Responsável: —
- Data: —
- Observações: Esta revisão (2026-10-09) é uma auditoria de código feita sem TV física, a pedido do responsável do projeto, para ter uma primeira leitura de paridade antes do teste físico formal. Ela não substitui o teste físico exigido por este documento. No mesmo dia, os 4 itens priorizados (splash, resume de série, progresso de filme + áudio no Android, aspecto no Samsung) foram corrigidos em código na PR #479, com todos os gates de CI automatizados verdes — mas isso corrige só a lacuna de código; a homologação física completa (18 gates físicos complementares + reteste desta matriz numa LG e numa Samsung reais) continua em aberto e é o próximo passo obrigatório antes de qualquer promoção a Stable.
