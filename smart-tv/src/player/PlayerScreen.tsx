import { useCallback, useEffect, useRef, useState } from "react";
import { isBackKey } from "../platform";
import { platform } from "../platform";
import { createPlayer } from "./createPlayer";
import type { PlaybackItem, PlaybackSnapshot, PlayerAdapter } from "./types";

const initial: PlaybackSnapshot = {
  status: "loading", currentTime: 0, duration: 0, buffering: true, error: null
};

function time(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  return [hours, minutes, seconds].filter((_, index) => hours > 0 || index > 0)
    .map(part => String(part).padStart(2, "0")).join(":");
}

export function PlayerScreen({ item, onClose }: { item: PlaybackItem; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [controls, setControls] = useState(true);
  const adapter = useRef<PlayerAdapter | null>(null);
  const hideTimer = useRef<number | null>(null);

  const showControls = useCallback(() => {
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 4_000);
  }, []);

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
      void player.load(item.urls, item.live).then(async () => {
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
  }, [item, showControls]);

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
        event.preventDefault(); onClose(); return;
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
  }, [item.live, onClose, showControls, toggle]);

  const progress = snapshot.duration > 0 ? Math.min(100, snapshot.currentTime / snapshot.duration * 100) : 0;
  return (
    <main className="player-screen">
      {snapshot.buffering && <div className="player-loading"><span className="spinner" /><p>Carregando...</p></div>}
      {snapshot.status === "error" && <section className="player-error"><h2>Não foi possível reproduzir</h2><p>{snapshot.error}</p><button autoFocus onClick={onClose}>Voltar ao catálogo</button></section>}
      <section className={`player-overlay ${controls || snapshot.status === "error" ? "visible" : ""}`}>
        <header><button onClick={onClose}>‹</button><div><small>{item.live ? "TV AO VIVO" : "RONECAPLAYTV"}</small><strong>{item.name}</strong></div></header>
        {snapshot.status !== "error" && <footer>
          <button className="play-control" onClick={toggle}>{snapshot.status === "playing" ? "Ⅱ" : "▶"}</button>
          {!item.live && <div className="timeline"><div><i style={{ width: `${progress}%` }} /></div><span>{time(snapshot.currentTime)} / {time(snapshot.duration)}</span></div>}
          {item.live && <div className="live-badge"><i /> AO VIVO</div>}
        </footer>}
      </section>
    </main>
  );
}
