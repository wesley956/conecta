import { useCallback, useEffect, useState } from "react";
import {
  readAspectModePreference,
  setAspectModePreference,
  type SmartTvAspectMode
} from "../playerSettings";

const modes: SmartTvAspectMode[] = ["Original", "Preencher", "Estender"];

function applyAspect(mode: SmartTvAspectMode) {
  document.body.setAttribute("data-player-aspect", mode);
}

export function PlayerAspectControl() {
  const [mode, setMode] = useState<SmartTvAspectMode>(() => readAspectModePreference());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    applyAspect(mode);
  }, [mode]);

  useEffect(() => {
    const syncVisibility = () => {
      const playing = document.body.classList.contains("playback-active");
      const chromeVisible = Boolean(document.querySelector(".player-overlay.visible"));
      const blockingPanel = Boolean(document.querySelector(".track-panel, .channel-panel, .episode-panel, .player-error, .player-network"));
      setVisible(playing && chromeVisible && !blockingPanel);
    };

    syncVisibility();
    const observer = new MutationObserver(syncVisibility);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    return () => observer.disconnect();
  }, []);

  const cycle = useCallback(() => {
    setMode(current => {
      const index = modes.indexOf(current);
      const next = modes[(index + 1) % modes.length];
      setAspectModePreference(next);
      applyAspect(next);
      return next;
    });
  }, []);

  return <button
    type="button"
    className={`player-aspect-control ${visible ? "visible" : ""}`}
    data-tv-focusable="true"
    aria-label={`Aspecto da imagem: ${mode}. Pressione para alterar.`}
    tabIndex={visible ? 0 : -1}
    onClick={cycle}
  >
    <small>ASPECTO</small>
    <strong>{mode}</strong>
  </button>;
}
