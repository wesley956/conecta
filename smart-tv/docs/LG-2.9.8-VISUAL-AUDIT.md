# Auditoria visual APK 2.9.8 × IPK webOS 1.1.0 (#298)

## Método

Comparação estrutural entre os componentes Compose do Android 2.9.8 e React/CSS do webOS. Esta etapa confirma fonte de assets, tokens, composição e estados existentes no código. Capturas lado a lado e aprovação de distância permanecem obrigatórias no artifact físico da #300.

## Tokens oficiais compartilhados

| Token | Android | webOS | Estado |
| --- | --- | --- | --- |
| Fundo | `#080809` | `#080809` | alinhado |
| Fundo suave | `#0D0D0F` | `#0D0D0F` | alinhado |
| Superfície | `#131315` | `#131315` | alinhado |
| Superfície elevada | `#19191C` | `#19191C` | alinhado |
| Borda | `#2B2B30` | `#2B2B30` | alinhado |
| Primária | `#E3262E` | `#E3262E` | alinhado |
| Foco | `#FF454C` | `#FF454C` | alinhado |
| Texto | `#F7F7F8` | `#F7F7F8` | alinhado |
| Texto secundário | `#9C9CA5` | `#9C9CA5` | alinhado |

Símbolo, wordmark, lockup e ícone do webOS são comparados semanticamente/por SHA contra `native-android/brand` no gate LG-02.

## Tela por tela

| Área | Composição/estados auditados | Código Android | Código webOS | Estado antes do físico |
| --- | --- | --- | --- | --- |
| Splash | vídeo, áudio, bloqueio de teclas, crossfade, fallback | `RonecaLaunchVideoScreen` | `LaunchVideoOverlay` | alinhado em código |
| Ativação | loading/pending/blocked/expired/error, código, suporte | `ActivationScreen` | `ActivationScreen` em `App.tsx` | QR local pendente |
| Home | hero, atalhos, destaques, Continuar/Minha Lista, vazio | `HomeScreen` | `MainShell` | alinhado em intenção |
| Busca | vazia, texto, grupos, sem resultado | `SearchScreen` | `GlobalSearch` | alinhado em intenção |
| Canais | cards, logo/fallback, Ao Vivo, favoritos, categorias | `ChannelsScreen` | `CatalogGrid`/`ChannelCard` | alinhado em intenção |
| Filmes | posters, badges, progresso, filtros | `MoviesScreen` | `PosterCard`/`Filters` | alinhado em intenção |
| Filme | metadata, favorito, recomendações, play/retomar | `MovieDetailScreen` | `MovieDetailScreen.tsx` | alinhado em intenção |
| Séries | posters, filtros, progresso | `SeriesScreen` | `PosterCard`/`Filters` | alinhado em intenção |
| Série | temporadas, episódios, recomendações e retomada | `SeriesDetailScreen` | `SeriesDetailScreen.tsx` | alinhado em intenção |
| Categorias | Clássica e painel 18%, foco/seleção | `TvCategorySelector` | `CategorySidePanel` | alinhado em código |
| Configurações | grupos, escolhas, diagnóstico e destrutivos | `SettingsScreen` | `Settings` | diferenças B documentadas |
| Player | chrome, timeline, seek, drawers, erros | Media3/Compose | HTML5/webOS | equivalente de plataforma |
| Tracks | áudio, Desativadas, faixa ativa, foco | `PlayerSubtitles` | `track-panel` | alinhado em código |
| Diálogos | suporte, privacidade, cache, dados, desvínculo | Compose Dialog | `Dialog` | alinhado em intenção |

## Estados visuais obrigatórios no físico

- normal, focado, selecionado, pressionado, desabilitado, loading e erro;
- títulos curtos/longos, imagens válidas/quebradas e catálogo vazio/grande;
- 1280×720 e 1920×1080;
- foco vermelho visível sem confundir seleção persistente;
- nenhuma imagem deformada;
- textos vistos à distância e contraste mínimo adequado;
- safe area no player e nas bordas da TV.

## Divergências justificadas B

- Media3/ExoPlayer no Android versus HTML5/player do firmware no webOS;
- decoder Hardware/Software selecionável no Android versus seleção automática do firmware LG;
- instalação de APK pelo sistema Android versus atualização/promoção controlada do IPK;
- dimensões internas podem variar para respeitar 720p/1080p e engine Chromium 53.

## Bloqueadores atuais

- QR Code local e escaneável do suporte;
- capturas comparativas do artifact exato;
- validação real de foco, tracks, contraste e performance em TV LG.
