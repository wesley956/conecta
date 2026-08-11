import { useEffect, useMemo, useState } from "react";
import type { CatalogFailoverResult } from "../catalog";
import { sanitizeDiagnosticText } from "../diagnosticSafety";
import type { DeviceSession } from "../deviceSession";
import { APP_VERSION } from "../deviceSession";
import type { LibraryItem } from "../mediaLibrary";
import type { SmartTvPlayerSettings } from "../playerSettings";
import { platform } from "../platform";
import type { TvAppUpdate } from "../appUpdate";
import type { MediaCard } from "./cards";
import { channelCard, libraryCards, movieCard, normalized, seriesCard } from "./cards";

export type MainSection = "Início" | "Buscar" | "Canais" | "Filmes" | "Séries" | "Minha lista" | "Configurações";
export type AppDialog = "privacy" | "support" | "unlink" | "clear-data" | "clear-cache" | null;

export type MainShellCatalog = {
  status: "idle" | "loading" | "ready" | "error";
  data: import("../catalog").Catalog;
  message: string | null;
  activePlaylistId: string | null;
  activePlaylistName: string | null;
  usingBackupPlaylist: boolean;
  lastSuccessfulSync: string | null;
  lastFailure: string | null;
  lastFailoverAttemptId: string | null;
  lastFailoverOutcome: CatalogFailoverResult["outcome"] | "switching" | null;
  retry: () => void;
};

export type MainShellLibrary = {
  favorites: LibraryItem[];
  history: LibraryItem[];
  isFavorite: (kind: import("../mediaLibrary").LibraryKind, id: string, contentKey?: string) => boolean;
  toggleFavorite: (item: Omit<LibraryItem, "updatedAt">) => void;
  clearAll: () => void;
};

export type MainShellAppUpdate = {
  latest: TvAppUpdate | null;
  update: TvAppUpdate | null;
  checking: boolean;
  lastCheckedAt: string | null;
  error: string | null;
  refresh: () => Promise<TvAppUpdate | null>;
  dismiss: () => void;
};

type MainShellProps = {
  selected: MainSection;
  setSelected: (value: MainSection) => void;
  query: string;
  setQuery: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  channelFavoritesOnly: boolean;
  setChannelFavoritesOnly: (value: boolean) => void;
  channelAlphabetical: boolean;
  setChannelAlphabetical: (value: boolean) => void;
  visibleLimit: number;
  setVisibleLimit: (value: number | ((current: number) => number)) => void;
  pageSize: number;
  catalog: MainShellCatalog;
  session: DeviceSession;
  library: MainShellLibrary;
  settings: SmartTvPlayerSettings;
  updateSettings: (patch: Partial<SmartTvPlayerSettings>) => void;
  appUpdate: MainShellAppUpdate;
  online: boolean;
  dialog: AppDialog;
  openDialog: (value: Exclude<AppDialog, null>) => void;
  closeDialog: () => void;
  onClearCache: () => Promise<void> | void;
  onUnlinkDevice: () => Promise<void> | void;
  onOpenCard: (item: MediaCard) => void;
  onOpenMovie: (movie: import("../catalog").Movie) => void;
  onOpenSeries: (series: import("../catalog").Series) => void;
};

const destinations: Array<{ icon: string; label: Exclude<MainSection, "Minha lista"> }> = [
  { icon: "⌂", label: "Início" },
  { icon: "⌕", label: "Buscar" },
  { icon: "◉", label: "Canais" },
  { icon: "▶", label: "Filmes" },
  { icon: "▥", label: "Séries" },
  { icon: "⚙", label: "Configurações" }
];

const scrollMemory = new Map<string, number>();

function FocusableButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-tv-focusable="true" {...props} />;
}

function Poster({ image, fit = "cover" }: { image?: string; fit?: "cover" | "contain" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return image && !failed
    ? <img src={image} alt="" loading="lazy" data-media-fit={fit} onError={() => setFailed(true)} />
    : <span className="poster-fallback">R</span>;
}

function useScrollMemory(scrollKey: string) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const node = document.querySelector<HTMLElement>(`[data-scroll-key="${scrollKey}"]`);
      if (node) node.scrollTop = scrollMemory.get(scrollKey) || 0;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [scrollKey]);
}

function scrollProps(scrollKey: string) {
  return {
    "data-scroll-key": scrollKey,
    onScroll: (event: React.UIEvent<HTMLElement>) => scrollMemory.set(scrollKey, event.currentTarget.scrollTop)
  };
}

function WatchProgress({ progress }: { progress?: number }) {
  if (!progress || progress <= 0) return null;
  return <span className="watch-progress"><i style={{ width: `${Math.min(100, progress)}%` }} /></span>;
}

function PosterCard({ item, favorite, started, onOpen }: {
  item: MediaCard;
  favorite: boolean;
  started: boolean;
  onOpen: (item: MediaCard) => void;
}) {
  const seasons = item.series?.seasons?.length || 0;
  return <FocusableButton
    data-focus-key={`media:${item.kind}:${item.contentKey}`}
    className="content-poster-card"
    onClick={() => onOpen(item)}
  >
    <span className="content-poster-media"><Poster image={item.image} /></span>
    <span className="content-card-badges">
      {favorite && <b className="content-badge favorite">★</b>}
      {started && <b className="content-badge continue">CONTINUAR</b>}
    </span>
    {item.kind === "series" && <b className="content-season-badge">{seasons > 0 ? `${seasons} T` : "SÉRIE"}</b>}
    <span className="content-card-gradient" />
    <span className="content-card-copy"><strong>{item.name}</strong><small>{item.meta}</small></span>
    <WatchProgress progress={item.progress} />
  </FocusableButton>;
}

function ChannelCard({ item, favorite, onOpen, onFavorite }: {
  item: MediaCard;
  favorite: boolean;
  onOpen: (item: MediaCard) => void;
  onFavorite: (item: MediaCard) => void;
}) {
  return <div className="content-channel-shell">
    <FocusableButton data-focus-key={`media:channel:${item.contentKey}`} className="content-channel-card" onClick={() => onOpen(item)}>
      <span className="content-channel-logo"><Poster image={item.image} fit="contain" /></span>
      <span className="content-channel-copy"><strong>{item.name}</strong><small>{item.meta || "TV ao vivo"}</small></span>
      <b className="live-chip">AO VIVO</b>
      <span className="channel-open">›</span>
    </FocusableButton>
    <FocusableButton
      data-focus-key={`favorite:${item.contentKey}`}
      aria-label={favorite ? `Remover ${item.name} dos favoritos` : `Favoritar ${item.name}`}
      className={`content-channel-favorite ${favorite ? "selected" : ""}`}
      onClick={() => onFavorite(item)}
    >{favorite ? "♥" : "♡"}</FocusableButton>
  </div>;
}

function LoadMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return <FocusableButton data-focus-key="catalog:load-more" className="content-load-more" onClick={onMore}>
    <b>＋</b><strong>Carregar mais</strong><small>{(total - shown).toLocaleString("pt-BR")} itens restantes</small>
  </FocusableButton>;
}

function CatalogGrid({ section, cards, total, library, onOpen, onMore }: {
  section: MainSection;
  cards: MediaCard[];
  total: number;
  library: MainShellLibrary;
  onOpen: (item: MediaCard) => void;
  onMore: () => void;
}) {
  const scrollKey = `catalog-${encodeURIComponent(section)}`;
  useScrollMemory(scrollKey);
  if (section === "Canais") {
    return <section className="content-channel-grid" {...scrollProps(scrollKey)}>
      {cards.map(item => <ChannelCard
        key={item.contentKey}
        item={item}
        favorite={library.isFavorite(item.kind, item.id, item.contentKey)}
        onOpen={onOpen}
        onFavorite={value => library.toggleFavorite({ id: value.id, contentKey: value.contentKey, kind: value.kind, name: value.name, image: value.image, meta: value.meta })}
      />)}
      <LoadMore shown={cards.length} total={total} onMore={onMore} />
    </section>;
  }
  return <section className="content-poster-grid" {...scrollProps(scrollKey)}>
    {cards.map(item => <PosterCard
      key={item.contentKey}
      item={item}
      favorite={library.isFavorite(item.kind, item.id, item.contentKey)}
      started={Boolean(item.progress && item.progress > 0)}
      onOpen={onOpen}
    />)}
    <LoadMore shown={cards.length} total={total} onMore={onMore} />
  </section>;
}

function HomeRow({ title, subtitle, cards, library, onOpen }: {
  title: string;
  subtitle: string;
  cards: MediaCard[];
  library: MainShellLibrary;
  onOpen: (item: MediaCard) => void;
}) {
  if (!cards.length) return null;
  const sectionKey = normalized(title).replace(/\s+/g, "-");
  return <section className="content-home-row">
    <div className="content-section-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="content-accent-cut"><i /><i /></span></div>
    <div className="content-home-posters">{cards.map(item => <PosterCard
      key={`${title}:${item.contentKey}`}
      item={item}
      favorite={library.isFavorite(item.kind, item.id, item.contentKey)}
      started={Boolean(item.progress && item.progress > 0)}
      onOpen={onOpen}
    />)}</div>
    <span className="sr-only" data-home-section={sectionKey}>{title}</span>
  </section>;
}

function SearchResultRow({ item, onOpen }: { item: MediaCard; onOpen: (item: MediaCard) => void }) {
  return <FocusableButton data-focus-key={`search-result:${item.kind}:${item.contentKey}`} className="global-search-row" onClick={() => onOpen(item)}>
    <span className="global-search-image"><Poster image={item.image} fit={item.kind === "channel" ? "contain" : "cover"} /></span>
    <span><strong>{item.name}</strong><small>{item.meta}</small></span>
    <b>{item.kind === "channel" ? "TV" : item.kind === "movie" ? "FILME" : "SÉRIE"}</b>
    <i>›</i>
  </FocusableButton>;
}

function SearchGroup({ title, cards, onOpen }: { title: string; cards: MediaCard[]; onOpen: (item: MediaCard) => void }) {
  if (!cards.length) return null;
  return <section className="global-search-group">
    <h2>{title} <small>• {cards.length}</small></h2>
    <div>{cards.map(item => <SearchResultRow key={item.contentKey} item={item} onOpen={onOpen} />)}</div>
  </section>;
}

function GlobalSearch({ query, setQuery, catalog, onOpen }: {
  query: string;
  setQuery: (value: string) => void;
  catalog: MainShellCatalog;
  onOpen: (item: MediaCard) => void;
}) {
  const term = normalized(query);
  const channels = useMemo(() => term ? catalog.data.channels.filter(item => normalized(item.name).includes(term)).slice(0, 20).map(channelCard) : [], [catalog.data.channels, term]);
  const movies = useMemo(() => term ? catalog.data.movies.filter(item => normalized(item.name).includes(term)).slice(0, 20).map(movieCard) : [], [catalog.data.movies, term]);
  const series = useMemo(() => term ? catalog.data.series.filter(item => normalized(item.name).includes(term)).slice(0, 20).map(seriesCard) : [], [catalog.data.series, term]);
  const total = channels.length + movies.length + series.length;
  const scrollKey = `global-search-${encodeURIComponent(term)}`;
  useScrollMemory(scrollKey);

  return <section className="global-search-shell">
    <div className="global-search-head">
      <div><h2>Busca</h2><p>Canais, filmes e séries em um só lugar</p></div>
      <label className="global-search-field"><span>⌕</span><input data-tv-focusable="true" data-autofocus="true" data-focus-key="search:global" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar canais, filmes, séries..." /></label>
      {query && <FocusableButton data-focus-key="search:clear" className="clear-search" onClick={() => setQuery("")}>Limpar</FocusableButton>}
    </div>
    <div className="global-search-scroll" {...scrollProps(scrollKey)}>
      {!term && <EmptyState title="O que você quer assistir?" message="Digite um nome para iniciar a busca." />}
      {term && total === 0 && <EmptyState title="Nenhum resultado encontrado" message={`Não encontramos conteúdo para “${query}”.`} />}
      <SearchGroup title="Canais" cards={channels} onOpen={onOpen} />
      <SearchGroup title="Filmes" cards={movies} onOpen={onOpen} />
      <SearchGroup title="Séries" cards={series} onOpen={onOpen} />
    </div>
  </section>;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <section className="content-empty-state"><span className="poster-fallback">R</span><h2>{title}</h2><p>{message}</p></section>;
}

function MainHeader({ selected, session, usingBackup, onSearch }: {
  selected: MainSection;
  session: DeviceSession;
  usingBackup: boolean;
  onSearch: () => void;
}) {
  return <header className="content-main-header">
    <div><p className="eyebrow">RONECA PLAYER TV</p><h1>{selected}</h1></div>
    <div className="content-header-actions">
      {selected === "Início" && <FocusableButton data-focus-key="home:header:search" className="content-header-search" onClick={onSearch}>⌕ Buscar</FocusableButton>}
      <div className="status"><i /> {session.clientName || "Aparelho ativo"} <span>•</span> <b>{usingBackup ? "Reserva ativa" : "Ativo"}</b></div>
    </div>
  </header>;
}

function CatalogToolbar({ selected, query, setQuery, filteredCount }: {
  selected: MainSection;
  query: string;
  setQuery: (value: string) => void;
  filteredCount: number;
}) {
  const noun = selected === "Canais" ? "canais" : selected === "Filmes" ? "títulos" : "séries";
  const placeholder = selected === "Canais" ? "⌕  Buscar canal" : selected === "Filmes" ? "⌕  Buscar filme" : "⌕  Buscar série";
  return <section className="content-catalog-toolbar">
    <div><h2>{selected === "Canais" ? "TV ao vivo" : selected}</h2><small>{filteredCount.toLocaleString("pt-BR")} {noun}</small></div>
    <label><input data-tv-focusable="true" data-focus-key={`search:${selected}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} /></label>
  </section>;
}

function FilterChip({ label, selected, focusKey, onClick }: { label: string; selected: boolean; focusKey: string; onClick: () => void }) {
  return <FocusableButton data-focus-key={focusKey} className={`content-filter-chip ${selected ? "selected" : ""}`} onClick={onClick}>{label}</FocusableButton>;
}

function Filters({ selected, categories, category, setCategory, favoritesOnly, setFavoritesOnly, alphabetical, setAlphabetical, resetPage }: {
  selected: MainSection;
  categories: string[];
  category: string;
  setCategory: (value: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean) => void;
  alphabetical: boolean;
  setAlphabetical: (value: boolean) => void;
  resetPage: () => void;
}) {
  if (selected === "Canais") {
    return <section className="content-filter-row">
      <FilterChip label="Todos" selected={!favoritesOnly && !alphabetical && category === "Todos"} focusKey="filter:channels:all" onClick={() => { setFavoritesOnly(false); setAlphabetical(false); setCategory("Todos"); resetPage(); }} />
      <FilterChip label="Favoritos" selected={favoritesOnly} focusKey="filter:channels:favorites" onClick={() => { setFavoritesOnly(!favoritesOnly); resetPage(); }} />
      <FilterChip label="A-Z" selected={alphabetical} focusKey="filter:channels:az" onClick={() => { setAlphabetical(!alphabetical); resetPage(); }} />
      {categories.filter(value => value !== "Todos").map(value => <FilterChip key={value} label={value} selected={category === value} focusKey={`filter:channels:${value}`} onClick={() => { setCategory(value); setFavoritesOnly(false); resetPage(); }} />)}
    </section>;
  }
  return <section className="content-filter-row">{categories.map(value => <FilterChip key={value} label={value} selected={category === value} focusKey={`filter:${selected}:${value}`} onClick={() => { setCategory(value); resetPage(); }} />)}</section>;
}

function failoverLabel(outcome: MainShellCatalog["lastFailoverOutcome"]) {
  if (!outcome) return "Nenhum failover nesta sessão";
  return {
    switching: "Alternando para uma lista reserva",
    switched: "Lista reserva ativada e aguardando/confirmando reprodução",
    busy: "Outra recuperação já estava em andamento",
    no_active_playlist: "Sem lista ativa para failover",
    no_backup: "Nenhuma lista reserva disponível",
    catalog_failed: "A lista reserva não pôde ser carregada"
  }[outcome];
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : null;
}

function Settings({ catalog, session, settings, updateSettings, appUpdate, online, openDialog }: {
  catalog: MainShellCatalog;
  session: DeviceSession;
  settings: SmartTvPlayerSettings;
  updateSettings: (patch: Partial<SmartTvPlayerSettings>) => void;
  appUpdate: MainShellAppUpdate;
  online: boolean;
  openDialog: (value: Exclude<AppDialog, null>) => void;
}) {
  const counts = { channels: catalog.data.channels.length, movies: catalog.data.movies.length, series: catalog.data.series.length };
  const activePlaylistId = catalog.activePlaylistId || session.selectedPlaylistId;
  const activePlaylist = session.playlists.find(value => value.id === activePlaylistId) || null;
  const lastFailure = sanitizeDiagnosticText(catalog.lastFailure || activePlaylist?.lastError || session.cacheError, 360);
  const stableVersion = appUpdate.latest?.versionName || null;
  const updateDescription = appUpdate.error
    ? `Falha na última consulta: ${sanitizeDiagnosticText(appUpdate.error, 180) || "erro desconhecido"}`
    : appUpdate.update
      ? `Stable ${appUpdate.update.versionName} disponível${appUpdate.update.mandatory ? " • atualização obrigatória" : ""}.`
      : stableVersion
        ? `Stable publicada: ${stableVersion}. Esta TV está na versão ${APP_VERSION}.`
        : "Nenhuma versão Stable publicada foi informada pelo serviço.";

  return <section className="settings-list content-settings-scroll" data-scroll-key="settings" onScroll={event => scrollMemory.set("settings", event.currentTarget.scrollTop)}>
    <div className="settings-heading"><p className="eyebrow">AJUSTES DO APP</p><h2>Configurações</h2><small>Preferências, operação, diagnóstico e informações seguras desta TV</small></div>
    <section className="settings-card"><span><strong>Atualizar conteúdo</strong><small>Sincroniza novamente catálogo/listas. Não verifica nem instala uma nova versão do aplicativo.</small></span><FocusableButton data-autofocus="true" data-focus-key="settings:refresh-content" onClick={catalog.retry}>ATUALIZAR</FocusableButton></section>

    <p className="settings-section-title">PLAYER</p>
    <section className="settings-card info"><span><strong>Tecnologia de reprodução</strong><small>{platform === "tizen" ? "Samsung AVPlay nativo com seleção automática de formato." : "Player HTML5 otimizado para o webOS da televisão."}</small></span><b>{platform === "tizen" ? "AVPLAY" : "HTML5"}</b></section>
    <section className="settings-card"><span><strong>Aspecto da imagem</strong><small>Original preserva a proporção; Preencher ocupa a tela; Estender força a imagem ao quadro.</small></span><div className="settings-options">{(["Original", "Preencher", "Estender"] as const).map(value => <FocusableButton key={value} data-focus-key={`settings:aspect:${value}`} className={settings.aspectMode === value ? "selected" : ""} onClick={() => updateSettings({ aspectMode: value })}>{value}</FocusableButton>)}</div></section>
    <section className="settings-card"><span><strong>Buffer inicial</strong><small>Um buffer maior ajuda conexões instáveis, mas demora um pouco mais para iniciar.</small></span><div className="settings-options">{([2, 5, 10] as const).map(value => <FocusableButton key={value} data-focus-key={`settings:buffer:${value}`} className={settings.bufferSeconds === value ? "selected" : ""} onClick={() => updateSettings({ bufferSeconds: value })}>{value}s</FocusableButton>)}</div></section>
    <section className="settings-card"><span><strong>Reconexão automática</strong><small>Tentar novamente, alternar origens e usar a lista reserva sem fechar o player.</small></span><FocusableButton data-focus-key="settings:reconnect" className={settings.automaticReconnect ? "selected" : ""} onClick={() => updateSettings({ automaticReconnect: !settings.automaticReconnect })}>{settings.automaticReconnect ? "ATIVA" : "DESATIVADA"}</FocusableButton></section>
    <section className="settings-card"><span><strong>Som de abertura</strong><small>Reproduzir a assinatura sonora ao iniciar o aplicativo.</small></span><FocusableButton data-focus-key="settings:launch-sound" className={settings.launchSoundEnabled ? "selected" : ""} onClick={() => updateSettings({ launchSoundEnabled: !settings.launchSoundEnabled })}>{settings.launchSoundEnabled ? "ATIVO" : "DESATIVADO"}</FocusableButton></section>

    <p className="settings-section-title">DIAGNÓSTICO</p>
    <section className="settings-card info"><span><strong>{catalog.usingBackupPlaylist ? "Lista reserva em uso" : "Lista principal em uso"}</strong><small>{catalog.activePlaylistName || session.playlistName || "Lista ativa"} • {counts.channels} canais • {counts.movies} filmes • {counts.series} séries</small></span><b>{online ? "CONECTADO" : "SEM INTERNET"}</b></section>
    <section className="settings-card info"><span><strong>Saúde da lista ativa</strong><small>Cache {activePlaylist?.cacheStatus || "não informado"} • falhas consecutivas {activePlaylist?.consecutiveFailures || 0}{formatDate(activePlaylist?.lastSuccessAt) ? ` • último sucesso ${formatDate(activePlaylist?.lastSuccessAt)}` : ""}</small></span><b>{activePlaylist?.role === "backup" || catalog.usingBackupPlaylist ? "RESERVA" : "PRINCIPAL"}</b></section>
    <section className="settings-card info"><span><strong>Última sincronização</strong><small>{formatDate(catalog.lastSuccessfulSync) || "Ainda não concluída"}{lastFailure ? ` • Última falha: ${lastFailure}` : ""}</small></span><b>{lastFailure ? "ATENÇÃO" : "OK"}</b></section>
    <section className="settings-card info"><span><strong>Último failover</strong><small>{failoverLabel(catalog.lastFailoverOutcome)}</small></span><b>{catalog.lastFailoverOutcome === "switched" ? "RECUPERADO" : catalog.lastFailoverOutcome ? "REGISTRADO" : "SEM EVENTO"}</b></section>
    <section className="settings-card info"><span><strong>Código de suporte</strong><small>Use este código curto ao falar com o suporte. Não envie senha, token nem URL da lista.</small></span><b>{session.supportCode || "INDISPONÍVEL"}</b></section>
    {session.expiresAt && Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 86_400_000) <= 7 && <section className="settings-card warning-card"><span><strong>Assinatura próxima do vencimento</strong><small>Vencimento em {new Date(session.expiresAt).toLocaleDateString("pt-BR")}. Fale com seu vendedor para renovar.</small></span><b>ATENÇÃO</b></section>}

    <p className="settings-section-title">APLICATIVO</p>
    <section className="settings-card"><span><strong>Verificar atualização do aplicativo</strong><small>{updateDescription}{appUpdate.lastCheckedAt ? ` • Verificado ${formatDate(appUpdate.lastCheckedAt)}` : ""}</small></span><FocusableButton data-focus-key="settings:app-update" onClick={() => void appUpdate.refresh()}>{appUpdate.checking ? "AGUARDE" : "VERIFICAR"}</FocusableButton></section>
    <section className="settings-card info"><span><strong>{session.clientName || "Roneca Player TV"}</strong><small>{platform === "webos" ? "LG webOS" : platform === "tizen" ? "Samsung Tizen" : "Navegador"} • App {APP_VERSION} • suporte {session.supportCode || "indisponível"}</small></span><b>SMART TV</b></section>
    <section className="settings-card"><span><strong>Suporte</strong><small>Consultar versão, lista ativa, conexão, failover e identificação segura desta TV.</small></span><FocusableButton data-focus-key="settings:support" onClick={() => openDialog("support")}>ABRIR</FocusableButton></section>
    <section className="settings-card"><span><strong>Privacidade</strong><small>Entender quais dados ficam nesta TV e quais são usados na ativação e diagnóstico.</small></span><FocusableButton data-focus-key="settings:privacy" onClick={() => openDialog("privacy")}>LER</FocusableButton></section>
    <section className="settings-card"><span><strong>Limpar cache temporário</strong><small>Remove somente dados reconstruíveis. Ativação, favoritos, progresso e preferências são preservados.</small></span><FocusableButton data-focus-key="settings:clear-cache" onClick={() => openDialog("clear-cache")}>LIMPAR CACHE</FocusableButton></section>
    <section className="settings-card danger-card"><span><strong>Limpar dados desta TV</strong><small>Remover favoritos, histórico e progresso salvos localmente sem desvincular o aparelho.</small></span><FocusableButton data-focus-key="settings:clear-data" className="danger" onClick={() => openDialog("clear-data")}>LIMPAR DADOS</FocusableButton></section>
    <section className="settings-card danger-card"><span><strong>Desvincular aparelho</strong><small>Revogar esta instalação no servidor e gerar uma nova identidade/código de ativação.</small></span><FocusableButton data-focus-key="settings:unlink" className="danger" onClick={() => openDialog("unlink")}>DESVINCULAR</FocusableButton></section>
  </section>;
}

function Dialog({ dialog, session, catalog, online, closeDialog, clearAll, clearCache, unlinkDevice }: {
  dialog: Exclude<AppDialog, null>;
  session: DeviceSession;
  catalog: MainShellCatalog;
  online: boolean;
  closeDialog: () => void;
  clearAll: () => void;
  clearCache: () => Promise<void> | void;
  unlinkDevice: () => Promise<void> | void;
}) {
  const supportFailure = sanitizeDiagnosticText(catalog.lastFailure || session.cacheError, 360);
  const title = dialog === "privacy" ? "Privacidade nesta TV"
    : dialog === "support" ? "Dados para suporte"
      : dialog === "unlink" ? "Desvincular este aparelho?"
        : dialog === "clear-cache" ? "Limpar cache temporário?"
          : "Limpar dados locais?";
  return <section className="app-dialog-backdrop" role="presentation"><article className="app-dialog" role="dialog" aria-modal="true">
    <p className="eyebrow">{dialog === "privacy" ? "PRIVACIDADE" : dialog === "support" ? "SUPORTE" : "CONFIRMAÇÃO"}</p>
    <h2>{title}</h2>
    {dialog === "privacy" && <div className="dialog-copy"><p>O aplicativo usa uma identidade exclusiva do aparelho para consultar ativação, validade e listas autorizadas.</p><p>Favoritos, histórico, progresso e preferências permanecem no armazenamento local da TV; cache temporário é reconstruível.</p><p>Diagnósticos são sanitizados no cliente e novamente no servidor. O suporte deve usar o código curto e nunca solicitar senha, token ou URL completa da lista.</p></div>}
    {dialog === "support" && <dl><dt>Código de suporte</dt><dd>{session.supportCode || "Não disponível"}</dd><dt>Plataforma</dt><dd>{platform === "webos" ? "LG webOS" : platform === "tizen" ? "Samsung Tizen" : "Navegador"}</dd><dt>Versão do app</dt><dd>{APP_VERSION}</dd><dt>Lista ativa</dt><dd>{catalog.activePlaylistName || session.playlistName || "Não disponível"} ({catalog.usingBackupPlaylist ? "reserva" : "principal"})</dd><dt>Conexão</dt><dd>{online ? "Conectada" : "Sem internet"}</dd><dt>Último failover</dt><dd>{failoverLabel(catalog.lastFailoverOutcome)}</dd><dt>Última falha</dt><dd>{supportFailure || "Nenhuma falha registrada"}</dd></dl>}
    {dialog === "unlink" && <p>Esta instalação será revogada no servidor, a credencial atual deixará de funcionar e a TV voltará para a ativação com uma nova identidade. Favoritos, histórico e progresso locais também serão removidos.</p>}
    {dialog === "clear-cache" && <p>Somente cache e estado temporário reconstruível serão removidos. Ativação, favoritos, progresso e preferências serão preservados.</p>}
    {dialog === "clear-data" && <p>Favoritos, histórico e progresso serão removidos somente desta TV. A ativação, a lista e as preferências do player continuarão funcionando.</p>}
    <div className="dialog-actions">
      {(dialog === "privacy" || dialog === "support") && <FocusableButton data-autofocus="true" data-focus-key="dialog:close" className="primary" onClick={closeDialog}>FECHAR</FocusableButton>}
      {dialog === "clear-cache" && <><FocusableButton data-autofocus="true" data-focus-key="dialog:confirm-cache" className="primary" onClick={() => { closeDialog(); void clearCache(); }}>LIMPAR CACHE</FocusableButton><FocusableButton data-focus-key="dialog:cancel-cache" className="secondary" onClick={closeDialog}>CANCELAR</FocusableButton></>}
      {dialog === "clear-data" && <><FocusableButton data-autofocus="true" data-focus-key="dialog:confirm-clear" className="danger" onClick={() => { clearAll(); closeDialog(); }}>CONFIRMAR LIMPEZA</FocusableButton><FocusableButton data-focus-key="dialog:cancel-clear" className="secondary" onClick={closeDialog}>CANCELAR</FocusableButton></>}
      {dialog === "unlink" && <><FocusableButton data-autofocus="true" data-focus-key="dialog:confirm-unlink" className="danger" onClick={() => { clearAll(); closeDialog(); void unlinkDevice(); }}>DESVINCULAR</FocusableButton><FocusableButton data-focus-key="dialog:cancel-unlink" className="secondary" onClick={closeDialog}>CANCELAR</FocusableButton></>}
    </div>
  </article></section>;
}

export function MainShell(props: MainShellProps) {
  const {
    selected, setSelected, query, setQuery, category, setCategory,
    channelFavoritesOnly, setChannelFavoritesOnly, channelAlphabetical, setChannelAlphabetical,
    visibleLimit, setVisibleLimit, pageSize, catalog, session, library, settings, updateSettings,
    appUpdate, online, dialog, openDialog, closeDialog, onClearCache, onUnlinkDevice, onOpenCard, onOpenMovie, onOpenSeries
  } = props;

  const [featuredIndex, setFeaturedIndex] = useState(0);
  const counts = useMemo(() => ({ channels: catalog.data.channels.length, movies: catalog.data.movies.length, series: catalog.data.series.length }), [catalog.data]);
  const recentCards = useMemo(() => libraryCards(catalog.data, library.history).filter(item => item.kind !== "channel").slice(0, 6), [catalog.data, library.history]);
  const favoriteCards = useMemo(() => libraryCards(catalog.data, library.favorites).filter(item => item.kind === "movie" || item.kind === "series").slice(0, 6), [catalog.data, library.favorites]);
  const discoveryCards = useMemo(() => [...catalog.data.movies.map(movieCard), ...catalog.data.series.map(seriesCard)].slice(0, 6), [catalog.data.movies, catalog.data.series]);
  const heroPool = useMemo(() => catalog.data.movies.filter(item => item.cover).slice(0, 12), [catalog.data.movies]);
  const featuredMovie = heroPool[featuredIndex % Math.max(1, heroPool.length)] || catalog.data.movies[0];
  const railMovie = heroPool[(featuredIndex + 1) % Math.max(1, heroPool.length)] || catalog.data.movies[1] || featuredMovie;
  const seriesPool = useMemo(() => catalog.data.series.filter(item => item.cover).slice(0, 12), [catalog.data.series]);
  const featuredSeries = seriesPool[featuredIndex % Math.max(1, seriesPool.length)] || catalog.data.series[0];

  useEffect(() => {
    if (heroPool.length + seriesPool.length <= 1) return;
    const timer = window.setInterval(() => setFeaturedIndex(value => value + 1), 12_000);
    return () => window.clearInterval(timer);
  }, [heroPool.length, seriesPool.length]);

  const categories = useMemo(() => {
    if (selected === "Canais") return ["Todos", ...Array.from(new Set(catalog.data.channels.map(item => item.groupTitle || "Outros"))).sort((a, b) => a.localeCompare(b, "pt-BR"))];
    if (selected === "Filmes") return ["Todos", "Minha Lista", "Continuar", ...Array.from(new Set(catalog.data.movies.map(item => item.category || "Outros"))).sort((a, b) => a.localeCompare(b, "pt-BR"))];
    if (selected === "Séries") return ["Todas", "Minha Lista", "Continuar", ...Array.from(new Set(catalog.data.series.map(item => item.category || "Outros"))).sort((a, b) => a.localeCompare(b, "pt-BR"))];
    return [];
  }, [catalog.data, selected]);

  const filteredCards = useMemo(() => {
    const term = normalized(query);
    const historyIds = new Set(library.history.map(item => item.contentKey || `${item.kind}:${item.id}`));
    if (selected === "Canais") {
      let values = catalog.data.channels
        .filter(item => category === "Todos" || (item.groupTitle || "Outros") === category)
        .filter(item => !channelFavoritesOnly || library.isFavorite("channel", item.id, channelCard(item).contentKey))
        .filter(item => !term || normalized(item.name).includes(term));
      if (channelAlphabetical) values = [...values].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      return values.map(channelCard);
    }
    if (selected === "Filmes") return catalog.data.movies.filter(item => {
      const card = movieCard(item);
      const filterMatches = category === "Todos" ||
        (category === "Minha Lista" && library.isFavorite("movie", item.id, card.contentKey)) ||
        (category === "Continuar" && (historyIds.has(card.contentKey) || historyIds.has(`movie:${item.id}`))) ||
        (item.category || "Outros") === category;
      return filterMatches && (!term || normalized(item.name).includes(term));
    }).map(movieCard).map(card => {
      const saved = library.history.find(value => (value.contentKey || `${value.kind}:${value.id}`) === card.contentKey || (value.kind === "movie" && value.id === card.id));
      return saved?.duration && saved.currentTime ? { ...card, progress: Math.min(100, saved.currentTime / saved.duration * 100) } : card;
    });
    if (selected === "Séries") return catalog.data.series.filter(item => {
      const card = seriesCard(item);
      const started = library.history.some(value => value.kind === "episode" && (value.meta || value.name).startsWith(`${item.name} •`));
      const filterMatches = category === "Todas" ||
        (category === "Minha Lista" && library.isFavorite("series", item.id, card.contentKey)) ||
        (category === "Continuar" && started) ||
        (item.category || "Outros") === category;
      return filterMatches && (!term || normalized(item.name).includes(term));
    }).map(seriesCard).map(card => {
      const started = library.history.some(value => value.kind === "episode" && (value.meta || value.name).startsWith(`${card.name} •`));
      return started ? { ...card, progress: 1 } : card;
    });
    if (selected === "Minha lista") return libraryCards(catalog.data, library.favorites).filter(item => item.kind === "movie" || item.kind === "series");
    return [];
  }, [catalog.data, category, channelAlphabetical, channelFavoritesOnly, library, query, selected]);

  const visibleCards = filteredCards.slice(0, visibleLimit);
  const resetPage = () => setVisibleLimit(pageSize);
  const homeScrollKey = "home";
  useScrollMemory(homeScrollKey);
  useScrollMemory("settings");

  return <main className="shell content-experience">
    <aside className="rail"><div className="brand"><span className="brand-mark">RP</span><span className="brand-name">RONECA</span></div><nav>{destinations.map(item => <FocusableButton key={item.label} data-focus-key={`nav:${item.label}`} className={`nav-item ${selected === item.label ? "selected" : ""}`} onClick={() => setSelected(item.label)}><span>{item.icon}</span><strong>{item.label}</strong></FocusableButton>)}</nav><small className="platform">{platform.toUpperCase()}</small></aside>
    <section className={`content ${["Canais", "Filmes", "Séries", "Minha lista"].includes(selected) ? "catalog-view" : ""}`}>
      {!online && <aside className="connection-banner" role="status"><b>Sem internet</b><span>O último catálogo válido continua disponível. A sincronização volta automaticamente quando a conexão retornar.</span></aside>}
      {appUpdate.update && <aside className="update-banner" role="status"><span><b>Stable {appUpdate.update.versionName} disponível</b><small>Uma versão publicada foi detectada. A instalação continua sujeita ao canal oficial LG/pacote homologado; esta verificação não promove Candidate para Stable.</small></span><FocusableButton data-focus-key="update:dismiss" onClick={appUpdate.dismiss}>Agora não</FocusableButton></aside>}
      <MainHeader selected={selected} session={session} usingBackup={catalog.usingBackupPlaylist} onSearch={() => setSelected("Buscar")} />

      {catalog.status === "loading" && <section className="state-panel content-loading-state"><span className="spinner" /><h2>Carregando seu catálogo</h2><p>Buscando canais, filmes e séries com segurança.</p></section>}
      {catalog.status === "error" && <section className="state-panel error"><h2>Não foi possível carregar</h2><p>{catalog.message}</p><FocusableButton data-autofocus="true" data-focus-key="catalog:retry" className="primary" onClick={catalog.retry}>Tentar novamente</FocusableButton></section>}
      {catalog.status === "ready" && catalog.message && <aside className={`catalog-notice ${catalog.usingBackupPlaylist ? "backup" : ""}`}><b>{catalog.usingBackupPlaylist ? "Lista reserva ativa" : "Catálogo preservado"}</b><span>{catalog.message}</span></aside>}

      {catalog.status === "ready" && selected === "Início" && <section className="content-home-scroll" {...scrollProps(homeScrollKey)}>
        <div className="content-home-feature">
          <section className="content-hero">
            {featuredMovie?.cover && <div className="content-hero-media"><Poster image={featuredMovie.cover} fit="contain" /></div>}
            <span className="content-hero-shade" />
            <span className="content-hero-accent"><i /><i /></span>
            <div className="content-hero-copy"><p className="eyebrow">{(featuredMovie?.category || "RONECA PLAYER TV").toUpperCase()}</p><h2>{featuredMovie?.name || "Sua programação em um só lugar"}</h2><p>{featuredMovie?.synopsis || (session.playlistName ? `${session.playlistName} pronta para explorar.` : "Seu catálogo, favoritos e progresso em uma única experiência.")}</p><div><FocusableButton data-autofocus="true" data-focus-key="home:hero:details" className="primary" onClick={() => featuredMovie ? onOpenMovie(featuredMovie) : setSelected("Filmes")}>{featuredMovie ? "Ver detalhes" : "Explorar filmes"}</FocusableButton><FocusableButton data-focus-key="home:hero:live" className="secondary" onClick={() => setSelected("Canais")}>TV ao vivo</FocusableButton></div></div>
          </section>
          <aside className="content-featured-rail">
            <FocusableButton data-focus-key="home:featured:movie" onClick={() => railMovie ? onOpenMovie(railMovie) : setSelected("Filmes")}><span><Poster image={railMovie?.cover} /></span><small>FILME EM DESTAQUE</small><strong>{railMovie?.name || "Explorar filmes"}</strong></FocusableButton>
            <FocusableButton data-focus-key="home:featured:series" onClick={() => featuredSeries ? onOpenSeries(featuredSeries) : setSelected("Séries")}><span><Poster image={featuredSeries?.cover} /></span><small>SÉRIE EM DESTAQUE</small><strong>{featuredSeries?.name || "Explorar séries"}</strong></FocusableButton>
          </aside>
        </div>
        <section className="content-explore-section"><div className="content-section-heading"><div><h3>Explorar</h3><p>Acesso direto ao seu catálogo</p></div><span className="content-accent-cut"><i /><i /></span></div><div className="content-quick-grid">
          {[
            ["Canais", "TV ao vivo", `${counts.channels.toLocaleString("pt-BR")} disponíveis`, "◉"],
            ["Filmes", "Filmes", `${counts.movies.toLocaleString("pt-BR")} disponíveis`, "▶"],
            ["Séries", "Séries", `${counts.series.toLocaleString("pt-BR")} disponíveis`, "▥"],
            ["Minha lista", "Minha lista", "Favoritos e progresso", "♡"]
          ].map(([target, label, subtitle, icon]) => <FocusableButton key={target} data-focus-key={`home:explore:${target}`} className="content-quick-card" onClick={() => setSelected(target as MainSection)}><span>{icon}</span><span><strong>{label}</strong><small>{subtitle}</small></span><b>›</b></FocusableButton>)}
        </div></section>
        <HomeRow title="Continuar assistindo" subtitle="Retome exatamente de onde parou" cards={recentCards} library={library} onOpen={onOpenCard} />
        <HomeRow title="Minha lista" subtitle="Filmes e séries marcados como favoritos" cards={favoriteCards} library={library} onOpen={onOpenCard} />
        {recentCards.length === 0 && favoriteCards.length === 0 && <HomeRow title="Para explorar agora" subtitle="Uma seleção do seu catálogo" cards={discoveryCards} library={library} onOpen={onOpenCard} />}
      </section>}

      {catalog.status === "ready" && selected === "Buscar" && <GlobalSearch query={query} setQuery={value => { setQuery(value); resetPage(); }} catalog={catalog} onOpen={onOpenCard} />}

      {catalog.status === "ready" && ["Canais", "Filmes", "Séries"].includes(selected) && <>
        <CatalogToolbar selected={selected} query={query} setQuery={value => { setQuery(value); resetPage(); }} filteredCount={filteredCards.length} />
        <Filters selected={selected} categories={categories} category={category} setCategory={setCategory} favoritesOnly={channelFavoritesOnly} setFavoritesOnly={setChannelFavoritesOnly} alphabetical={channelAlphabetical} setAlphabetical={setChannelAlphabetical} resetPage={resetPage} />
        {filteredCards.length > 0 ? <CatalogGrid section={selected} cards={visibleCards} total={filteredCards.length} library={library} onOpen={onOpenCard} onMore={() => setVisibleLimit(current => typeof current === "number" ? current + pageSize : pageSize * 2)} /> : <EmptyState title={selected === "Canais" ? "Nenhum canal encontrado" : selected === "Filmes" ? "Nenhum filme encontrado" : "Nenhuma série encontrada"} message="Tente outro nome, filtro ou categoria." />}
      </>}

      {catalog.status === "ready" && selected === "Minha lista" && (filteredCards.length > 0 ? <CatalogGrid section={selected} cards={visibleCards} total={filteredCards.length} library={library} onOpen={onOpenCard} onMore={() => setVisibleLimit(current => typeof current === "number" ? current + pageSize : pageSize * 2)} /> : <EmptyState title="Sua lista está vazia" message="Adicione filmes e séries pelos detalhes do conteúdo. Canais favoritos ficam em Canais → Favoritos." />)}

      {catalog.status === "ready" && selected === "Configurações" && <Settings catalog={catalog} session={session} settings={settings} updateSettings={updateSettings} appUpdate={appUpdate} online={online} openDialog={openDialog} />}
    </section>
    {dialog && <Dialog dialog={dialog} session={session} catalog={catalog} online={online} closeDialog={closeDialog} clearAll={library.clearAll} clearCache={onClearCache} unlinkDevice={onUnlinkDevice} />}
  </main>;
}
