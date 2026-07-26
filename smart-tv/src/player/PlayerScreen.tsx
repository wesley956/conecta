import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "../catalog";
import { fetchChannelEpg } from "../deviceSession";
import type { ChannelEpgProgram } from "../deviceSession";
import { moveFocus } from "../focus";
import { isBackKey, platform } from "../platform";
import { createPlayer } from "./createPlayer";
import type { PlaybackItem, PlaybackSnapshot, PlayerAdapter } from "./types";

const initial: PlaybackSnapshot = {
  status: "loading", currentTime: 0, duration: 0, buffering: true, error: null,
  sourceIndex: 0, sourceCount: 1, audioTracks: [], textTracks: [],
  selectedAudioTrack: null, selectedTextTrack: null
};

function time(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  return [hours, minutes, seconds].filter((_, index) => hours > 0 || index > 0)
    .map(part => String(part).padStart(2, "0")).join(":");
}

export function PlayerScreen({ item, playlistId, channels = [], onChangeChannel, onChangePlayback, onClose, onProgress, onTerminalPlaybackFailure }: {
  item: PlaybackItem;
  playlistId?: string | null;
  channels?: Channel[];
  onChangeChannel?: (channel: Channel) => void;
  onChangePlayback?: (item: PlaybackItem) => void;
  onClose: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onTerminalPlaybackFailure?: (reason: string) => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [controls, setControls] = useState(true);
  const [trackPanel, setTrackPanel] = useState(false);
  const [channelPanel, setChannelPanel] = useState(false);
  const [episodePanel, setEpisodePanel] = useState(false);
  const [programs, setPrograms] = useState<ChannelEpgProgram[]>([]);
  const [networkOffline, setNetworkOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
  const adapter = useRef<PlayerAdapter | null>(null);
  const hideTimer = useRef<number | null>(null);
  const lastSavedSecond = useRef(-1);
  const snapshotRef = useRef(initial);
  const lastPosition = useRef(0);
  const stalledSince = useRef<number | null>(null);
  const terminalFailureReported = useRef(false);
  const wasPlayingBeforeHidden = useRef(false);
  const seriesQueue = item.seriesQueue || [];
  const seriesQueueIndex = item.seriesQueueIndex ?? seriesQueue.findIndex(entry => entry.id === item.id);
  const changeEpisode = useCallback((index: number) => {
    const entry = seriesQueue[index];
    if (!entry || !onChangePlayback) return;
    onChangePlayback({
      id: entry.id,
      name: entry.name,
      urls: entry.urls,
      live: false,
      kind: "episode",
      image: entry.image,
      meta: entry.meta,
      seriesQueue,
      seriesQueueIndex: index
    });
  }, [onChangePlayback, seriesQueue]);

  useEffect(() => {
    if (!item.live) { setPrograms([]); return; }
    let cancelled = false;
    void fetchChannelEpg(item.id, playlistId).then(value => {
      if (!cancelled) setPrograms(value);
    });
    return () => { cancelled = true; };
  }, [item.id, item.live, playlistId]);

  const showControls = useCallback(() => {
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 4_000);
  }, []);

  const focusControls = useCallback(() => {
    setControls(true);
    window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.closest(".player-overlay")) {
        document.querySelector<HTMLElement>(".player-overlay [data-autofocus='true']")?.focus();
      }
    }, 0);
  }, []);

  useEffect(() => {
    if (item.live || !onProgress || snapshot.currentTime < 1) return;
    const second = Math.floor(snapshot.currentTime);
    if (lastSavedSecond.current >= 0 && second - lastSavedSecond.current < 15) return;
    lastSavedSecond.current = second;
    onProgress(snapshot.currentTime, snapshot.duration);
  }, [item.live, onProgress, snapshot.currentTime, snapshot.duration]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (snapshot.status !== "ended" || seriesQueueIndex < 0 || seriesQueueIndex + 1 >= seriesQueue.length) {
      setNextEpisodeCountdown(null);
      return;
    }
    setNextEpisodeCountdown(8);
  }, [item.id, seriesQueue.length, seriesQueueIndex, snapshot.status]);

  useEffect(() => {
    if (nextEpisodeCountdown == null) return;
    if (nextEpisodeCountdown <= 0) {
      changeEpisode(seriesQueueIndex + 1);
      return;
    }
    const timer = window.setTimeout(() => setNextEpisodeCountdown(value => value == null ? null : value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [changeEpisode, nextEpisodeCountdown, seriesQueueIndex]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = snapshotRef.current;
      if (["paused", "ended", "error", "idle"].includes(current.status)) {
        stalledSince.current = null;
        lastPosition.current = current.currentTime;
        return;
      }

      if (current.currentTime > lastPosition.current + 0.25) {
        stalledSince.current = null;
        lastPosition.current = current.currentTime;
        terminalFailureReported.current = false;
        return;
      }

      const now = Date.now();
      if (stalledSince.current == null) stalledSince.current = now;
      const timeout = current.currentTime <= 1 ? 20_000 : item.live ? 12_000 : 25_000;
      if (now - stalledSince.current < timeout) return;

      stalledSince.current = now;
      setSnapshot(value => ({
        ...value,
        status: "error",
        buffering: false,
        error: "A reprodução ultrapassou o tempo limite de carregamento."
      }));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [item.id, item.live]);

  useEffect(() => {
    if (snapshot.status !== "error" || terminalFailureReported.current || networkOffline || !navigator.onLine) return;
    terminalFailureReported.current = true;
    onTerminalPlaybackFailure?.(snapshot.error || "A lista ativa não conseguiu reproduzir o conteúdo.");
  }, [networkOffline, onTerminalPlaybackFailure, snapshot.error, snapshot.status]);

  useEffect(() => {
    const resumeFrom = !item.live
      ? (reloadAttempt > 0 ? snapshotRef.current.currentTime : item.startTime) || 0
      : 0;
    setSnapshot({ ...initial, currentTime: resumeFrom, sourceCount: Math.max(1, item.urls.length) });
    terminalFailureReported.current = false;
    stalledSince.current = null;
    lastPosition.current = resumeFrom;
    document.body.classList.add("playback-active");
    if (platform === "tizen") {
      try {
        (window.tizen as { tvinputdevice?: { registerKeyBatch: (keys: string[]) => void } })
          .tvinputdevice?.registerKeyBatch(["MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward"]);
      } catch { /* controles básicos continuam disponíveis */ }
    }
    const player = createPlayer(patch => setSnapshot(current => ({ ...current, ...patch })));
    adapter.current = player;
    try {
      player.mount();
      void player.load(item.urls, item.live).then(async () => {
        if (!item.live && resumeFrom >= 30) {
          player.seek(resumeFrom);
          setSnapshot(current => ({ ...current, currentTime: resumeFrom }));
        }
        await player.play();
        setSnapshot(current => ({ ...current, status: "playing", buffering: false }));
      }).catch(error => setSnapshot(current => ({
        ...current, status: "error", buffering: false,
        error: error instanceof Error ? error.message : "Não foi possível reproduzir."
      })));
    } catch (error) {
      setSnapshot(current => ({ ...current, status: "error", buffering: false, error: error instanceof Error ? error.message : "Player indisponível." }));
    }
    showControls();
    return () => {
      document.body.classList.remove("playback-active");
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      const finalSnapshot = snapshotRef.current;
      if (!item.live && finalSnapshot.currentTime > 0) {
        onProgress?.(finalSnapshot.currentTime, finalSnapshot.duration);
      }
      player.destroy();
      adapter.current = null;
    };
  }, [item, reloadAttempt, showControls]);

  const toggle = useCallback(() => {
    if (snapshot.status === "playing") {
      adapter.current?.pause();
      setSnapshot(current => ({ ...current, status: "paused" }));
    } else {
      void adapter.current?.play().then(() => setSnapshot(current => ({ ...current, status: "playing" })));
    }
    showControls();
  }, [showControls, snapshot.status]);

  useEffect(() => {
    if (snapshot.status !== "playing" || trackPanel || channelPanel || episodePanel || networkOffline) {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setControls(true);
      return;
    }
    showControls();
  }, [channelPanel, episodePanel, networkOffline, showControls, snapshot.status, trackPanel]);

  useEffect(() => {
    let lostConnection = !navigator.onLine;
    const saveProgress = () => {
      const current = snapshotRef.current;
      if (!item.live && current.currentTime > 0) onProgress?.(current.currentTime, current.duration);
    };
    const handleOffline = () => {
      lostConnection = true;
      wasPlayingBeforeHidden.current = snapshotRef.current.status === "playing";
      adapter.current?.pause();
      setNetworkOffline(true);
      setControls(true);
      setSnapshot(current => ({ ...current, status: "paused", buffering: false }));
      saveProgress();
    };
    const handleOnline = () => {
      if (!lostConnection) return;
      lostConnection = false;
      setNetworkOffline(false);
      setReloadAttempt(value => value + 1);
    };
    const handleVisibility = () => {
      if (document.hidden) {
        wasPlayingBeforeHidden.current = snapshotRef.current.status === "playing";
        adapter.current?.pause();
        setSnapshot(current => current.status === "playing" ? { ...current, status: "paused" } : current);
        saveProgress();
      } else if (wasPlayingBeforeHidden.current && navigator.onLine) {
        wasPlayingBeforeHidden.current = false;
        void adapter.current?.play().then(() => setSnapshot(current => ({ ...current, status: "playing" })));
      }
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", saveProgress);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", saveProgress);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [item.live, onProgress]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      showControls();
      if (isBackKey(event) || event.keyCode === 413) {
        event.preventDefault();
        if (trackPanel) setTrackPanel(false);
        else if (channelPanel) setChannelPanel(false);
        else if (episodePanel) setEpisodePanel(false);
        else onClose();
        return;
      }
      const directions: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"
      };
      const direction = directions[event.key];
      if (trackPanel || channelPanel || episodePanel) {
        if (direction) { event.preventDefault(); moveFocus(direction); }
        return;
      }
      if (event.keyCode === 415) {
        event.preventDefault();
        void adapter.current?.play().then(() => setSnapshot(current => ({ ...current, status: "playing" })));
        return;
      }
      if (event.keyCode === 19) {
        event.preventDefault();
        adapter.current?.pause();
        setSnapshot(current => ({ ...current, status: "paused" }));
        return;
      }
      if (event.keyCode === 10252) {
        event.preventDefault();
        toggle();
        return;
      }
      if (event.keyCode === 412 || event.keyCode === 417) {
        event.preventDefault();
        if (!item.live) adapter.current?.seek(event.keyCode === 412 ? -10 : 10);
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (direction) {
        event.preventDefault();
        if (!controls) focusControls();
        else if (active?.matches("[data-tv-focusable='true']")) moveFocus(direction);
        else if (!item.live && (direction === "left" || direction === "right")) adapter.current?.seek(direction === "left" ? -10 : 10);
        else focusControls();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        if (active?.matches("[data-tv-focusable='true']")) return;
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channelPanel, controls, episodePanel, focusControls, item.live, onClose, showControls, toggle, trackPanel]);

  useEffect(() => {
    if (!trackPanel && !channelPanel && !episodePanel) return;
    const selector = trackPanel ? ".track-panel" : episodePanel ? ".episode-panel" : ".channel-panel";
    window.setTimeout(() => document.querySelector<HTMLElement>(`${selector} [data-autofocus='true']`)?.focus(), 0);
  }, [channelPanel, episodePanel, trackPanel]);

  const progress = snapshot.duration > 0 ? Math.min(100, snapshot.currentTime / snapshot.duration * 100) : 0;
  return (
    <main className="player-screen">
      {networkOffline && <section className="player-network">
        <span>SEM INTERNET</span><h2>A conexão foi interrompida</h2>
        <p>A reprodução continuará automaticamente quando a internet voltar.</p>
      </section>}
      {snapshot.buffering && !networkOffline && <div className="player-loading"><span className="spinner" /><p>Carregando...</p></div>}
      {nextEpisodeCountdown != null && <section className="next-episode-card">
        <small>PRÓXIMO EPISÓDIO</small>
        <h2>{seriesQueue[seriesQueueIndex + 1]?.name}</h2>
        <p>Iniciando em {nextEpisodeCountdown} segundo{nextEpisodeCountdown === 1 ? "" : "s"}.</p>
        <div><button data-tv-focusable="true" data-autofocus="true" onClick={() => changeEpisode(seriesQueueIndex + 1)}>Assistir agora</button>
          <button data-tv-focusable="true" onClick={() => setNextEpisodeCountdown(null)}>Cancelar</button></div>
      </section>}
      {snapshot.status === "error" && <section className="player-error">
        <h2>Ativando a lista reserva</h2>
        <p>{snapshot.error}</p>
        <span className="source-retry"><i className="spinner" /> Substituindo o catálogo com segurança...</span>
      </section>}
      <section className={`player-overlay ${controls || snapshot.status === "error" ? "visible" : ""}`}>
        <header><button data-tv-focusable="true" data-autofocus="true" onClick={onClose}>‹</button><div><small>{item.live ? "TV AO VIVO" : "RONECAPLAYTV"}</small><strong>{item.name}</strong>
          {item.live && programs[0] && <span className="player-program"><b>AGORA</b> {programs[0].title}
            {programs[1] && <em>DEPOIS • {programs[1].title}</em>}
          </span>}
        </div>
          {snapshot.sourceCount > 1 && <span className={`source-badge ${snapshot.sourceIndex > 0 ? "alternative" : ""}`}>{snapshot.sourceIndex > 0 ? "ORIGEM ALTERNATIVA" : "ORIGEM PRINCIPAL"}</span>}
        </header>
        {snapshot.status !== "error" && <footer>
          <button data-tv-focusable="true" className="play-control" onClick={toggle}>{snapshot.status === "playing" ? "Ⅱ" : "▶"}</button>
          {!item.live && <button data-tv-focusable="true" className="player-seek-control" onClick={() => adapter.current?.seek(-10)}>↶ 10s</button>}
          {!item.live && <div className="timeline"><div><i style={{ width: `${progress}%` }} /></div><span>{time(snapshot.currentTime)} / {time(snapshot.duration)}</span></div>}
          {!item.live && <button data-tv-focusable="true" className="player-seek-control" onClick={() => adapter.current?.seek(10)}>10s ↷</button>}
          {item.live && <div className="live-badge"><i /> AO VIVO</div>}
          {item.live && channels.length > 1 && <button data-tv-focusable="true" className="track-control channel-control" onClick={() => setChannelPanel(true)}>☰ Canais</button>}
          {item.kind === "episode" && seriesQueue.length > 1 && <button data-tv-focusable="true" className="track-control channel-control" onClick={() => setEpisodePanel(true)}>☰ Episódios</button>}
          <button data-tv-focusable="true" className="track-control" onClick={() => setTrackPanel(true)}>♪ Áudio e legendas</button>
        </footer>}
      </section>
      {channelPanel && <aside className="channel-panel">
        <header><div><p className="eyebrow">TV AO VIVO</p><h2>{item.meta || "Canais"}</h2><small>{channels.length} canais nesta categoria</small></div><button data-tv-focusable="true" onClick={() => setChannelPanel(false)}>×</button></header>
        <section>{channels.map((channel, index) => <button key={channel.id} data-tv-focusable="true" data-autofocus={channel.id === item.id || index === 0 ? "true" : undefined}
          className={channel.id === item.id ? "selected" : ""}
          onClick={() => { onChangeChannel?.(channel); setChannelPanel(false); }}>
          <span>{channel.logo ? <img src={channel.logo} alt="" /> : <b>R</b>}</span>
          <span><strong>{channel.name}</strong><small>{channel.groupTitle || "TV ao vivo"}</small></span>
          <b>{channel.id === item.id ? "NO AR" : "▶"}</b>
        </button>)}</section>
      </aside>}
      {episodePanel && <aside className="channel-panel episode-panel">
        <header><div><p className="eyebrow">SÉRIE</p><h2>Temporadas e episódios</h2><small>{item.meta || item.name} • episódio atual primeiro</small></div><button data-tv-focusable="true" onClick={() => setEpisodePanel(false)}>×</button></header>
        <section>{seriesQueue.map((entry, index) => <button key={entry.id} data-tv-focusable="true"
          data-autofocus={index === seriesQueueIndex || (seriesQueueIndex < 0 && index === 0) ? "true" : undefined}
          className={index === seriesQueueIndex ? "selected" : ""}
          onClick={() => { setEpisodePanel(false); changeEpisode(index); }}>
          <span><b>{entry.episodeNumber}</b></span>
          <span><strong>{entry.name}</strong><small>Temporada {entry.seasonNumber} • Episódio {entry.episodeNumber}</small></span>
          <b>{index === seriesQueueIndex ? "NO AR" : "▶"}</b>
        </button>)}</section>
      </aside>}
      {trackPanel && <aside className="track-panel">
        <header><div><p className="eyebrow">REPRODUÇÃO</p><h2>Áudio e legendas</h2></div><button data-tv-focusable="true" onClick={() => setTrackPanel(false)}>×</button></header>
        <section><h3>Faixa de áudio</h3>
          {snapshot.audioTracks.length === 0 && <p>Nenhuma faixa alternativa foi informada pelo conteúdo.</p>}
          {snapshot.audioTracks.map((track, index) => <button
            key={`audio:${track.index}`} data-tv-focusable="true" data-autofocus={index === 0 ? "true" : undefined}
            className={snapshot.selectedAudioTrack === track.index ? "selected" : ""}
            onClick={() => adapter.current?.selectTrack("audio", track.index)}
          ><span>♪</span><strong>{track.label}</strong><small>{track.language?.toUpperCase() || "ÁUDIO"}</small></button>)}
        </section>
        <section><h3>Legendas</h3>
          <button data-tv-focusable="true" data-autofocus={snapshot.audioTracks.length === 0 ? "true" : undefined}
            className={snapshot.selectedTextTrack == null ? "selected" : ""}
            onClick={() => adapter.current?.selectTrack("text", null)}
          ><span>CC</span><strong>Desativadas</strong><small>SEM LEGENDA</small></button>
          {snapshot.textTracks.map(track => <button
            key={`text:${track.index}`} data-tv-focusable="true"
            className={snapshot.selectedTextTrack === track.index ? "selected" : ""}
            onClick={() => adapter.current?.selectTrack("text", track.index)}
          ><span>CC</span><strong>{track.label}</strong><small>{track.language?.toUpperCase() || "LEGENDA"}</small></button>)}
        </section>
      </aside>}
    </main>
  );
}
