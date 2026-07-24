import { useEffect, useMemo, useState } from "react";
import { useCatalog } from "./catalog";
import type { DeviceSession } from "./deviceSession";
import { useDeviceSession } from "./deviceSession";
import { moveFocus } from "./focus";
import { closeApplication, isBackKey, platform } from "./platform";
import { PlayerScreen } from "./player/PlayerScreen";
import type { PlaybackItem } from "./player/types";

const destinations = [
  { icon: "⌂", label: "Início" }, { icon: "◉", label: "TV ao vivo" },
  { icon: "▶", label: "Filmes" }, { icon: "▣", label: "Séries" },
  { icon: "♥", label: "Minha lista" }, { icon: "⚙", label: "Ajustes" }
];
function FocusableButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-tv-focusable="true" {...props} />;
}
function ActivationScreen({ session, onRefresh, onReset }: {
  session: DeviceSession; onRefresh: () => void; onReset: () => void;
}) {
  const pending = session.status === "pending";
  const title = {
    loading: "Preparando dispositivo", pending: "Ativar dispositivo", active: "Dispositivo ativo",
    blocked: "Acesso bloqueado", expired: "Assinatura expirada", error: "Falha de conexão"
  }[session.status];
  return <main className="activation-shell"><section className="activation-panel">
    <div className="activation-brand"><span className="brand-mark">R</span><span><b>RONECA</b><small>PLAYER TV</small></span></div>
    <p className="eyebrow">{platform === "webos" ? "LG WEBOS" : platform === "tizen" ? "SAMSUNG TIZEN" : "PRÉ-VISUALIZAÇÃO"}</p>
    <h1>{title}</h1>
    <p className="activation-message">{session.message || (pending ? "Envie o código abaixo ao seu vendedor ou administrador." : "Conectando ao painel com segurança.")}</p>
    {session.deviceCode && <div className="activation-code"><small>CÓDIGO DO APARELHO</small><strong>{session.deviceCode}</strong><span>{pending ? "Aguardando liberação automática" : "Identidade do aparelho"}</span></div>}
    <div className="activation-actions">
      <FocusableButton data-autofocus="true" className="primary" disabled={session.refreshing || session.status === "loading"} onClick={onRefresh}>{session.refreshing ? "Atualizando..." : "Atualizar acesso"}</FocusableButton>
      {(session.status === "blocked" || session.status === "error") && <FocusableButton className="secondary danger" onClick={onReset}>Gerar novo código</FocusableButton>}
    </div>
  </section><div className="activation-art"><i /><span>R</span></div></main>;
}
function Poster({ image }: { image?: string }) {
  return image ? <img src={image} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }} /> : <span className="poster-fallback">R</span>;
}
function playableUrls(url: string, alternatives?: string[]) {
  return Array.from(new Set([...(alternatives || []), url].filter(value => typeof value === "string" && value.trim().length > 0)));
}

export function App() {
  const [selected, setSelected] = useState("Início");
  const [playback, setPlayback] = useState<PlaybackItem | null>(null);
  const { session, refresh, renewConfiguration, reset } = useDeviceSession();
  const catalog = useCatalog(session, renewConfiguration);

  useEffect(() => {
    if (playback) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"
      };
      const direction = directions[event.key];
      if (direction) { event.preventDefault(); moveFocus(direction); }
      else if (isBackKey(event)) {
        event.preventDefault();
        if (selected !== "Início") setSelected("Início"); else closeApplication();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => document.querySelector<HTMLElement>("[data-autofocus='true']")?.focus(), 0);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playback, selected, session.status, catalog.status]);

  const counts = useMemo(() => ({
    channels: catalog.data.channels.length, movies: catalog.data.movies.length, series: catalog.data.series.length
  }), [catalog.data]);
  const cards = selected === "TV ao vivo"
    ? catalog.data.channels.slice(0, 60).map(item => ({
      id: item.id, name: item.name, image: item.logo, meta: item.groupTitle || "TV ao vivo",
      playback: { id: item.id, name: item.name, urls: playableUrls(item.url, item.playbackUrls), live: true } as PlaybackItem
    }))
    : selected === "Filmes"
      ? catalog.data.movies.slice(0, 60).map(item => ({
        id: item.id, name: item.name, image: item.cover,
        meta: [item.category, item.year || ""].filter(Boolean).join(" • "),
        playback: { id: item.id, name: item.name, urls: playableUrls(item.url, item.playbackUrls), live: false } as PlaybackItem
      }))
      : selected === "Séries"
        ? catalog.data.series.slice(0, 60).map(item => ({
          id: item.id, name: item.name, image: item.cover, meta: item.category || "Séries", playback: null
        }))
        : [];

  if (playback) return <PlayerScreen item={playback} onClose={() => setPlayback(null)} />;
  if (session.status !== "active") return <ActivationScreen session={session} onRefresh={() => void refresh()} onReset={() => void reset()} />;

  return <main className="shell">
    <aside className="rail">
      <div className="brand"><span className="brand-mark">R</span><span className="brand-name">RONECA</span></div>
      <nav>{destinations.map(item => <FocusableButton key={item.label} className={`nav-item ${selected === item.label ? "selected" : ""}`} onClick={() => setSelected(item.label)}><span>{item.icon}</span><strong>{item.label}</strong></FocusableButton>)}</nav>
      <small className="platform">{platform.toUpperCase()}</small>
    </aside>
    <section className="content">
      <header><div><p className="eyebrow">RONECAPLAYTV</p><h1>{selected}</h1></div><div className="status"><i /> {session.clientName || "Aparelho ativo"} <span>•</span> <b>Ativo</b></div></header>
      {catalog.status === "loading" && <section className="state-panel"><span className="spinner" /><h2>Carregando seu catálogo</h2><p>Buscando canais, filmes e séries com segurança.</p></section>}
      {catalog.status === "error" && <section className="state-panel error"><h2>Não foi possível carregar</h2><p>{catalog.message}</p><FocusableButton data-autofocus="true" className="primary" onClick={catalog.retry}>Tentar novamente</FocusableButton></section>}
      {catalog.status === "ready" && selected === "Início" && <>
        <section className="hero"><div className="accent"><i /><i /></div><div className="hero-copy">
          <p className="eyebrow">RONECAPLAYTV</p><h2>Sua programação em um só lugar</h2>
          <p className="description">{session.playlistName ? `${session.playlistName} pronta para explorar.` : "A mesma experiência do aplicativo Android."}</p>
          <div className="hero-actions"><FocusableButton data-autofocus="true" className="primary" onClick={() => setSelected("Filmes")}>Explorar filmes</FocusableButton><FocusableButton className="secondary" onClick={() => setSelected("TV ao vivo")}>TV ao vivo</FocusableButton></div>
        </div><div className="hero-art"><div className="orb" /><span>R</span></div></section>
        <section className="explore-section"><div className="section-heading"><div><h3>Explorar</h3><p>Conteúdo real da sua lista</p></div></div><div className="cards">
          {[["TV ao vivo", `${counts.channels.toLocaleString("pt-BR")} canais`, "gold"], ["Filmes", `${counts.movies.toLocaleString("pt-BR")} títulos`, "red"], ["Séries", `${counts.series.toLocaleString("pt-BR")} séries`, "gold"]].map(([label, count, tone]) =>
            <FocusableButton key={label} className={`card ${tone}`} onClick={() => setSelected(label)}><span className="card-icon">◆</span><span><strong>{label}</strong><small>{count}</small></span><b>›</b></FocusableButton>)}
        </div></section>
      </>}
      {catalog.status === "ready" && cards.length > 0 && <section className="catalog-grid">{cards.map((item, index) =>
        <FocusableButton key={item.id} data-autofocus={index === 0 ? "true" : undefined} className="media-card" onClick={() => item.playback ? setPlayback(item.playback) : undefined}>
          <span className="poster"><Poster image={item.image} /></span><strong>{item.name}</strong><small>{item.playback ? item.meta : `${item.meta} • Episódios em breve`}</small>
        </FocusableButton>)}</section>}
      {catalog.status === "ready" && !["Início", "TV ao vivo", "Filmes", "Séries"].includes(selected) && <section className="state-panel"><h2>{selected}</h2><p>Esta área será conectada nos próximos marcos.</p></section>}
      {catalog.status === "ready" && ["TV ao vivo", "Filmes", "Séries"].includes(selected) && cards.length === 0 && <section className="state-panel"><h2>Nenhum conteúdo encontrado</h2><p>Esta categoria está vazia na lista vinculada.</p></section>}
    </section>
  </main>;
}
