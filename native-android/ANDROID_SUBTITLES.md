# Legendas no player Android

Escopo da Issue #278, derivada da MASTER #266.

## Comportamento

- O player observa `Player.Listener.onTracksChanged` depois do `prepare` e considera apenas grupos `C.TRACK_TYPE_TEXT` suportados pelo Media3.
- O botão **CC Legendas** só aparece quando existe ao menos uma faixa de texto utilizável.
- O painel de TV e mobile oferece **Desativada** e as faixas detectadas, marcando a seleção atual.
- Label, idioma BCP-47 e flags `default`/`forced` vêm do `Format`; quando label e idioma faltam, a UI usa `Legenda N` sem inventar idioma.
- Selecionar uma faixa aplica `TrackSelectionOverride` em runtime. Desativar usa `setTrackTypeDisabled`; nenhum dos dois recria o player ou altera a posição.
- A seleção inicial é deixada a cargo do Media3 para respeitar default/forced.
- Ao trocar episódio ou fonte no player de séries, overrides específicos do `TrackGroup` anterior são removidos antes do novo `MediaItem`. O novo conteúdo volta à seleção default/forced do Media3.
- O player comum é reconstruído pelo recovery já existente; por isso também não carrega referência de track da fonte anterior.
- Eventos de diagnóstico incluem somente contagem, idioma/label limitado, estado e flags; não incluem URL, manifesto ou credenciais.

Esta implementação não busca nem baixa legendas externas, não faz scraping, tradução, offset manual ou parsing paralelo.

## Formatos

O aplicativo não promete formatos além dos reconhecidos pelo Media3 1.9.2 na mídia/manifesto recebido. O comportamento implementado é agnóstico ao container e cobre faixas de texto que o Media3 expõe em HLS, DASH ou containers compatíveis. O formato efetivamente observado deverá ser registrado junto à mídia autorizada na homologação física.

## Navegação

- TV: o botão fica no cabeçalho do chrome, recebe foco por D-pad e não compete com play/pause ou timebar.
- Ao fechar ou selecionar, o foco retorna ao botão **CC Legendas**.
- `Back` fecha primeiro o painel de legendas; não sai do player.
- Mobile usa o mesmo estado e a mesma política de seleção por toque.

## Homologação física pendente

- mídia autorizada sem legenda, com uma faixa e com múltiplos idiomas;
- default e forced, incluindo áudio estrangeiro;
- troca de episódio, fonte, canal e failover;
- recovery por decoder e preservação da posição VOD;
- TV/D-pad e celular/toque;
- HLS/DASH/container realmente disponíveis na operação;
- TV Box low-RAM.

Ausência ou falha de uma faixa de texto não é tratada como falha de playback.
