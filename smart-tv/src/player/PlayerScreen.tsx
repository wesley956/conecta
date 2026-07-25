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

export function PlayerScreen({ item, playlistId, channels = [], onChangeChannel, onClose, onProgress }: {
  item: PlaybackItem;
  playlistId?: string | null;
  channels?: Channel[];
  onChangeChannel?: (channel: Channel) => void;
  onClose: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [controls, setControls] = useState(true);
  const [sourceOffset, setSourceOffset] = useState(0);
  const [automaticRecoveries, setAutomaticRecoveries] = useState(0);
  const [trackPanel, setTrackPanel] = useState(false);
  const [channelPanel, setChannelPanel] = useState(false);
  const [programs, setPrograms] = useState<ChannelEpgProgram[]>([]);
  const adapter = useRef<PlayerAdapter | null>(null);
  const hideTimer = useRef<number | null>(null);
  const lastSavedSecond = useRef(-1);

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

  useEffect(() => {
    if (item.live || !onProgress || snapshot.currentTime < 1) return;
    const second = Math.floor(snapshot.currentTime);
    if (lastSavedSecond.current >= 0 && second - lastSavedSecond.current < 15) return;
    lastSavedSecond.current = second;
    onProgress(snapshot.currentTime, snapshot.duration);
  }, [item.live, onProgress, snapshot.currentTime, snapshot.duration]);

  useEffect(() => {
    if (snapshot.status === "playing" && automaticRecoveries > 0) setAutomaticRecoveries(0);
  }, [automaticRecoveries, snapshot.status]);

  useEffect(() => {
    if (snapshot.status !== "error" || item.urls.length < 2 || automaticRecoveries >= item.urls.length - 1) return;
    const timer = window.setTimeout(() => {
      setSnapshot({ ...initial, sourceCount: item.urls.length });
      setSourceOffset(value => (value + 1) % item.urls.length);
      setAutomaticRecoveries(value => value + 1);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [automaticRecoveries, item.urls.length, snapshot.status]);

  useEffect(() => {
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
      const orderedUrls = [...item.urls.slice(sourceOffset), ...item.urls.slice(0, sourceOffset)];
      void player.load(orderedUrls, item.live).then(async () => {
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
      player.destroy();
      adapter.current = null;
    };
  }, [item, showControls, sourceOffset]);

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
    const onKey = (event: KeyboardEvent) => {
      showControls();
      if (isBackKey(event) || event.keyCode === 413) {
        event.preventDefault();
        if (trackPanel) setTrackPanel(false);
        else if (channelPanel) setChannelPanel(false);
        else onClose();
        return;
      }
      if (trackPanel || channelPanel) {
        const directions: Record<string, "up" | "down" | "left" | "right"> = {
          ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"
        };
        const direction = directions[event.key];
        if (direction) { event.preventDefault(); moveFocus(direction); }
        return;
      }
      if (event.key === "Enter" || event.key === " " || event.keyCode === 10252 || event.keyCode === 415 || event.keyCode === 19) {
        event.preventDefault();
        if (event.keyCode === 415) void adapter.current?.play().then(() => setSnapshot(current => ({ ...current, status: "playing" })));
        else if (event.keyCode === 19) { adapter.current?.pause(); setSnapshot(current => ({ ...current, status: "paused" })); }
        else toggle();
      } else if (!item.live && (event.key === "ArrowLeft" || event.keyCode === 412)) {
        event.preventDefault(); adapter.current?.seek(-10);
      } else if (!item.live && (event.key === "ArrowRight" || event.keyCode === 417)) {
        event.preventDefault(); adapter.current?.seek(10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channelPanel, item.live, onClose, showControls, toggle, trackPanel]);

  useEffect(() => {
    if (!trackPanel && !channelPanel) return;
    const selector = trackPanel ? ".track-panel" : ".channel-panel";
    window.setTimeout(() => document.querySelector<HTMLElement>(`${selector} [data-autofocus='true']`)?.focus(), 0);
  }, [channelPanel, trackPanel]);

  const progress = snapshot.duration > 0 ? Math.min(100, snapshot.currentTime / snapshot.duration * 100) : 0;
  return (
    <main className="player-screen">
      {snapshot.buffering && <div className="player-loading"><span className="spinner" /><p>Carregando...</p></div>}
      {snapshot.status === "error" && <section className="player-error">
        <h2>{automaticRecoveries < item.urls.length - 1 ? "Tentando uma origem alternativa" : "Não foi possível reproduzir"}</h2>
        <p>{snapshot.error}</p>
        {automaticRecoveries < item.urls.length - 1
          ? <span className="source-retry"><i className="spinner" /> Recuperando automaticamente...</span>
          : <div className="player-error-actions"><button autoFocus onClick={() => {
              setAutomaticRecoveries(0);
              setSnapshot({ ...initial, sourceCount: item.urls.length });
              setSourceOffset(value => (value + 1) % item.urls.length);
            }}>Tentar novamente</button><button onClick={onClose}>Voltar ao catálogo</button></div>}
      </section>}
      <section className={`player-overlay ${controls || snapshot.status === "error" ? "visible" : ""}`}>
        <header><button onClick={onClose}>‹</button><div><small>{item.live ? "TV AO VIVO" : "RONECAPLAYTV"}</small><strong>{item.name}</strong>
          {item.live && programs[0] && <span className="player-program"><b>AGORA</b> {programs[0].title}
            {programs[1] && <em>DEPOIS • {programs[1].title}</em>}
          </span>}
        </div>
          {snapshot.sourceCount > 1 && <span className={`source-badge ${snapshot.sourceIndex > 0 || sourceOffset > 0 ? "alternative" : ""}`}>{snapshot.sourceIndex > 0 || sourceOffset > 0 ? "ORIGEM ALTERNATIVA" : "ORIGEM PRINCIPAL"}</span>}
        </header>
        {snapshot.status !== "error" && <footer>
          <button className="play-control" onClick={toggle}>{snapshot.status === "playing" ? "Ⅱ" : "▶"}</button>
          {!item.live && <div className="timeline"><div><i style={{ width: `${progress}%` }} /></div><span>{time(snapshot.currentTime)} / {time(snapshot.duration)}</span></div>}
          {item.live && <div className="live-badge"><i /> AO VIVO</div>}
          {item.live && channels.length > 1 && <button data-tv-focusable="true" className="track-control channel-control" onClick={() => setChannelPanel(true)}>☰ Canais</button>}
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
