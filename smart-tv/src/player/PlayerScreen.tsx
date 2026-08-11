import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "../catalog";
import { fetchChannelEpg, reportPlaybackDiagnostic } from "../deviceSession";
import type { ChannelEpgProgram, PlaybackDiagnosticReport } from "../deviceSession";
import { moveFocus } from "../focus";
import { SMART_TV_PERFORMANCE_PROFILE } from "../performanceProfile";
import { isBackKey, platform } from "../platform";
import { createPlayer } from "./createPlayer";
import {
  classifyPlaybackFailure,
  retryDelayMs,
  STABLE_PLAYBACK_WINDOW_MS,
  STABLE_PROGRESS_SECONDS
} from "./failurePolicy";
import type { PlaybackItem, PlaybackSnapshot, PlayerAdapter } from "./types";

const initial: PlaybackSnapshot = {
  status: "loading", currentTime: 0, duration: 0, buffering: true, error: null,
  sourceIndex: 0, sourceCount: 1, audioTracks: [], textTracks: [],
  selectedAudioTrack: null, selectedTextTrack: null
};

type RecoveryState = "idle" | "retrying" | "source_switching" | "playlist_switching" | "failed";

function time(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  return [hours, minutes, seconds].filter((_, index) => hours > 0 || index > 0)
    .map(part => String(part).padStart(2, "0")).join(":");
}

function probableSource(reason: string, offline: boolean): PlaybackDiagnosticReport["probableSource"] {
  if (offline) return "network";
  if (/decod|codec|formato|suport/i.test(reason)) return "content";
  if (/tempo|origem|servidor|responder|carreg|manifest|segment/i.test(reason)) return "playlist";
  return "unknown";
}

function eventId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `smart-tv:${platform}:${random}`.slice(0, 180);
}

export function PlayerScreen({
  item, playlistId, channels = [], bufferSeconds = 5, automaticReconnect = true,
  backupAvailable = false, onChangeChannel, onChangePlayback, onClose, onProgress,
  onTerminalPlaybackFailure, onStablePlayback
}: {
  item: PlaybackItem;
  playlistId?: string | null;
  channels?: Channel[];
  bufferSeconds?: number;
  automaticReconnect?: boolean;
  backupAvailable?: boolean;
  onChangeChannel?: (channel: Channel) => void;
  onChangePlayback?: (item: PlaybackItem) => void;
  onClose: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onTerminalPlaybackFailure?: (reason: string, currentTime: number, duration: number, clientEventId: string) => Promise<boolean> | boolean;
  onStablePlayback?: (playlistId: string) => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [controls, setControls] = useState(true);
  const [trackPanel, setTrackPanel] = useState(false);
  const [channelPanel, setChannelPanel] = useState(false);
  const [episodePanel, setEpisodePanel] = useState(false);
  const [channelPage, setChannelPage] = useState(0);
  const [episodePanelPage, setEpisodePanelPage] = useState(0);
  const [programs, setPrograms] = useState<ChannelEpgProgram[]>([]);
  const [networkOffline, setNetworkOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [sourceStartIndex, setSourceStartIndex] = useState(0);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<RecoveryState>("idle");
  const [recoveryDetail, setRecoveryDetail] = useState<string | null>(null);
  const adapter = useRef<PlayerAdapter | null>(null);
  const hideTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const lastSavedSecond = useRef(-1);
  const snapshotRef = useRef(initial);
  const lastPosition = useRef(0);
  const stalledSince = useRef<number | null>(null);
  const terminalFailureReported = useRef(false);
  const wasPlayingBeforeHidden = useRef(false);
  const localRetries = useRef(0);
  const retriesBySource = useRef<Record<number, number>>({});
  const recoveryLock = useRef(false);
  const stableStartedAt = useRef<number | null>(null);
  const stableStartPosition = useRef(0);
  const stableConfirmed = useRef(false);
  const activeDiagnosticEvent = useRef<string>(item.diagnosticEventId || eventId());
  const diagnosticPending = useRef(Boolean(item.diagnosticEventId));
  const lastFailureReason = useRef<string | null>(null);
  const lastFailureCode = useRef<string>("PLAYER_UNKNOWN");
  const seriesQueue = item.seriesQueue || [];
  const seriesQueueIndex = item.seriesQueueIndex ?? seriesQueue.findIndex(entry => entry.id === item.id);
  const activeEpisode = seriesQueueIndex >= 0 ? seriesQueue[seriesQueueIndex] : null;
  const channelPageSize = SMART_TV_PERFORMANCE_PROFILE.catalogPageSize;
  const episodeDrawerPageSize = SMART_TV_PERFORMANCE_PROFILE.episodePageSize;
  const channelPageCount = Math.max(1, Math.ceil(channels.length / channelPageSize));
  const safeChannelPage = Math.min(channelPage, channelPageCount - 1);
  const visibleChannels = channels.slice(safeChannelPage * channelPageSize, (safeChannelPage + 1) * channelPageSize);
  const episodePageCount = Math.max(1, Math.ceil(seriesQueue.length / episodeDrawerPageSize));
  const safeEpisodePanelPage = Math.min(episodePanelPage, episodePageCount - 1);
  const visibleEpisodeQueue = seriesQueue.slice(safeEpisodePanelPage * episodeDrawerPageSize, (safeEpisodePanelPage + 1) * episodeDrawerPageSize);

  const diagnosticPayload = useCallback((
    reason: string,
    recovered: boolean,
    recoveryAction: string,
    playerExited = false,
    errorCode?: string
  ): PlaybackDiagnosticReport => ({
    clientEventId: activeDiagnosticEvent.current,
    correlationId: activeDiagnosticEvent.current,
    failoverAttemptId: activeDiagnosticEvent.current,
    playlistId,
    contentType: item.kind ?? (item.live ? "channel" : "unknown"),
    contentTitle: item.name,
    seasonNumber: activeEpisode?.seasonNumber,
    episodeNumber: activeEpisode?.episodeNumber,
    positionMs: Math.round(snapshotRef.current.currentTime * 1000),
    durationMs: Math.round(snapshotRef.current.duration * 1000),
    errorCode: errorCode || (recovered ? "RECOVERY_SUCCESS" : lastFailureCode.current),
    errorMessage: reason,
    severity: recovered ? "medium" : "high",
    probableSource: probableSource(reason, networkOffline),
    recoveryAction,
    recovered,
    playerExited,
    backupAvailable,
    retryCount: localRetries.current,
    occurredAt: new Date().toISOString()
  }), [activeEpisode?.episodeNumber, activeEpisode?.seasonNumber, backupAvailable, item.kind, item.live, item.name, networkOffline, playlistId]);

  const changeEpisode = useCallback((index: number) => {
    const entry = seriesQueue[index];
    if (!entry || !onChangePlayback) return;
    onChangePlayback({
      id: entry.id, contentKey: entry.contentKey, name: entry.name, urls: entry.urls, live: false, kind: "episode",
      image: entry.image, meta: entry.meta, seriesQueue, seriesQueueIndex: index
    });
  }, [onChangePlayback, seriesQueue]);

  useEffect(() => {
    if (!item.live) { setPrograms([]); return; }
    let cancelled = false;
    void fetchChannelEpg(item.id, playlistId).then(value => { if (!cancelled) setPrograms(value); });
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

  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  useEffect(() => {
    if (snapshot.status !== "playing") {
      stableStartedAt.current = null;
      stableConfirmed.current = false;
      return;
    }
    if (stableStartedAt.current == null) {
      stableStartedAt.current = Date.now();
      stableStartPosition.current = snapshotRef.current.currentTime;
    }
    const timer = window.setInterval(() => {
      const current = snapshotRef.current;
      if (current.status !== "playing" || stableConfirmed.current || stableStartedAt.current == null) return;
      const elapsed = Date.now() - stableStartedAt.current;
      const advanced = current.currentTime - stableStartPosition.current >= STABLE_PROGRESS_SECONDS;
      if (elapsed < STABLE_PLAYBACK_WINDOW_MS || !advanced) return;

      stableConfirmed.current = true;
      terminalFailureReported.current = false;
      recoveryLock.current = false;
      stalledSince.current = null;
      retriesBySource.current = {};
      localRetries.current = 0;
      setRecovery("idle");
      setRecoveryDetail(null);

      if (!diagnosticPending.current) return;
      const reason = lastFailureReason.current || "Reprodução estabilizada automaticamente.";
      void reportPlaybackDiagnostic(diagnosticPayload(
        reason, true, "Reprodução comprovada por janela estável de 8 s com avanço real.", false, "RECOVERY_SUCCESS"
      )).catch(() => undefined);
      diagnosticPending.current = false;
      lastFailureReason.current = null;
      lastFailureCode.current = "PLAYER_UNKNOWN";
      if (playlistId) onStablePlayback?.(playlistId);
    }, 500);
    return () => window.clearInterval(timer);
  }, [diagnosticPayload, onStablePlayback, playlistId, snapshot.status]);

  useEffect(() => {
    if (snapshot.status !== "ended" || seriesQueueIndex < 0 || seriesQueueIndex + 1 >= seriesQueue.length) {
      setNextEpisodeCountdown(null);
      return;
    }
    setNextEpisodeCountdown(8);
  }, [item.id, seriesQueue.length, seriesQueueIndex, snapshot.status]);

  useEffect(() => {
    if (nextEpisodeCountdown == null) return;
    if (nextEpisodeCountdown <= 0) { changeEpisode(seriesQueueIndex + 1); return; }
    const timer = window.setTimeout(() => setNextEpisodeCountdown(value => value == null ? null : value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [changeEpisode, nextEpisodeCountdown, seriesQueueIndex]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = snapshotRef.current;
      if (document.hidden || networkOffline || recoveryLock.current) {
        stalledSince.current = null;
        lastPosition.current = current.currentTime;
        return;
      }
      if (["paused", "ended", "error", "idle"].includes(current.status)) {
        stalledSince.current = null;
        lastPosition.current = current.currentTime;
        return;
      }
      if (current.currentTime > lastPosition.current + 0.25) {
        stalledSince.current = null;
        lastPosition.current = current.currentTime;
        return;
      }
      const now = Date.now();
      if (stalledSince.current == null) stalledSince.current = now;
      const baseTimeout = current.currentTime <= 1 ? 20_000 : item.live ? 12_000 : 25_000;
      const timeout = Math.max(baseTimeout, Math.min(45_000, bufferSeconds * 4_000));
      if (now - stalledSince.current < timeout) return;
      stalledSince.current = now;
      setSnapshot(value => ({
        ...value, status: "error", buffering: false,
        error: "PLAYER_STALL: reprodução sem avanço dentro da janela esperada."
      }));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [bufferSeconds, item.id, item.live, networkOffline]);

  useEffect(() => {
    if (snapshot.status !== "error" || terminalFailureReported.current || networkOffline || !navigator.onLine) return;
    if (recoveryLock.current) return;

    recoveryLock.current = true;
    terminalFailureReported.current = true;
    diagnosticPending.current = true;
    stableConfirmed.current = false;
    stableStartedAt.current = null;

    const rawReason = snapshot.error || "A lista ativa não conseguiu reproduzir o conteúdo.";
    const decision = classifyPlaybackFailure(rawReason, false);
    const reason = decision.userMessage;
    const sourceIndex = Math.max(0, Math.min(item.urls.length - 1, snapshotRef.current.sourceIndex));
    const retries = retriesBySource.current[sourceIndex] || 0;
    lastFailureReason.current = reason;
    lastFailureCode.current = decision.code;

    void (async () => {
      if (automaticReconnect && decision.retryableSameSource) {
        const delay = retryDelayMs(retries);
        if (delay != null) {
          const attempt = retries + 1;
          retriesBySource.current[sourceIndex] = attempt;
          localRetries.current = attempt;
          setRecovery("retrying");
          setRecoveryDetail(`Tentativa ${attempt} de 3 na origem ${sourceIndex + 1}. Próxima ação em ${Math.round(delay / 1000)} s.`);
          await reportPlaybackDiagnostic(diagnosticPayload(
            reason, false, `RECOVERY_RETRY: tentativa ${attempt} de 3 após ${delay} ms na mesma origem.`, false, decision.code
          )).catch(() => undefined);
          if (retryTimer.current) window.clearTimeout(retryTimer.current);
          retryTimer.current = window.setTimeout(() => {
            setSourceStartIndex(sourceIndex);
            terminalFailureReported.current = false;
            recoveryLock.current = false;
            setReloadAttempt(value => value + 1);
          }, delay);
          return;
        }
      }

      const nextSource = sourceIndex + 1;
      if (automaticReconnect && nextSource < item.urls.length) {
        localRetries.current = 0;
        setRecovery("source_switching");
        setRecoveryDetail(`A origem ${sourceIndex + 1} foi esgotada. Tentando a origem ${nextSource + 1} de ${item.urls.length}.`);
        await reportPlaybackDiagnostic(diagnosticPayload(
          reason, false, `RECOVERY_SOURCE_SWITCH: origem ${sourceIndex + 1} → ${nextSource + 1}.`, false, decision.code
        )).catch(() => undefined);
        window.setTimeout(() => {
          setSourceStartIndex(nextSource);
          terminalFailureReported.current = false;
          recoveryLock.current = false;
          setReloadAttempt(value => value + 1);
        }, 250);
        return;
      }

      await reportPlaybackDiagnostic(diagnosticPayload(
        reason, false,
        backupAvailable ? "RECOVERY_PLAYLIST_FAILOVER: origens da lista ativa esgotadas." : "RECOVERY_EXHAUSTED: sem lista reserva disponível.",
        false, decision.code
      )).catch(() => undefined);

      if (automaticReconnect && backupAvailable && onTerminalPlaybackFailure) {
        setRecovery("playlist_switching");
        setRecoveryDetail("Todas as origens válidas da lista ativa foram esgotadas. Localizando o mesmo conteúdo na lista reserva...");
        const switched = await onTerminalPlaybackFailure(
          reason, snapshotRef.current.currentTime, snapshotRef.current.duration, activeDiagnosticEvent.current
        );
        if (switched) return;
      }
      recoveryLock.current = false;
      setRecovery("failed");
      setRecoveryDetail(null);
      window.setTimeout(() => document.querySelector<HTMLElement>(".player-error [data-autofocus='true']")?.focus(), 0);
    })();
  }, [automaticReconnect, backupAvailable, diagnosticPayload, item.urls.length, networkOffline, onTerminalPlaybackFailure, snapshot.error, snapshot.status]);

  useEffect(() => {
    const resumeFrom = !item.live
      ? (reloadAttempt > 0 ? snapshotRef.current.currentTime : item.startTime) || 0
      : 0;
    const sourceOffset = Math.max(0, Math.min(sourceStartIndex, Math.max(0, item.urls.length - 1)));
    const urls = item.urls.slice(sourceOffset);
    setSnapshot({
      ...initial,
      currentTime: resumeFrom,
      sourceIndex: sourceOffset,
      sourceCount: Math.max(1, item.urls.length)
    });
    terminalFailureReported.current = false;
    stalledSince.current = null;
    lastPosition.current = resumeFrom;
    stableStartedAt.current = null;
    stableConfirmed.current = false;
    document.body.classList.add("playback-active");
    if (platform === "tizen") {
      try {
        (window.tizen as { tvinputdevice?: { registerKeyBatch: (keys: string[]) => void } })
          .tvinputdevice?.registerKeyBatch(["MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward"]);
      } catch { /* controles básicos continuam disponíveis */ }
    }
    const player = createPlayer(patch => setSnapshot(current => ({
      ...current,
      ...patch,
      sourceIndex: patch.sourceIndex == null ? current.sourceIndex : sourceOffset + patch.sourceIndex,
      sourceCount: Math.max(1, item.urls.length)
    })));
    adapter.current = player;
    try {
      if (!urls.length) throw new Error("Conteúdo sem origem de reprodução disponível.");
      player.mount();
      void player.load(urls, item.live, { bufferSeconds }).then(async () => {
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
      setSnapshot(current => ({
        ...current, status: "error", buffering: false,
        error: error instanceof Error ? error.message : "Player indisponível."
      }));
    }
    showControls();
    return () => {
      document.body.classList.remove("playback-active");
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      const finalSnapshot = snapshotRef.current;
      if (!item.live && finalSnapshot.currentTime > 0) onProgress?.(finalSnapshot.currentTime, finalSnapshot.duration);
      player.destroy();
      adapter.current = null;
    };
  }, [bufferSeconds, item, reloadAttempt, showControls, sourceStartIndex]);

  useEffect(() => () => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
  }, []);

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
      recoveryLock.current = false;
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      saveProgress();
    };
    const handleOnline = () => {
      if (!lostConnection) return;
      lostConnection = false;
      setNetworkOffline(false);
      setSourceStartIndex(snapshotRef.current.sourceIndex);
      terminalFailureReported.current = false;
      recoveryLock.current = false;
      setReloadAttempt(value => value + 1);
    };
    const handleVisibility = () => {
      saveProgress();
      if (platform !== "tizen") return;
      if (document.hidden) {
        wasPlayingBeforeHidden.current = snapshotRef.current.status === "playing";
        adapter.current?.pause();
        setSnapshot(current => current.status === "playing" ? { ...current, status: "paused" } : current);
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

  const closePlayer = useCallback(() => {
    if (diagnosticPending.current && recovery === "failed") {
      const reason = lastFailureReason.current || snapshotRef.current.error || "Reprodução encerrada após falha.";
      void reportPlaybackDiagnostic(diagnosticPayload(
        reason, false, "RECOVERY_EXHAUSTED: usuário saiu do player após falha.", true, lastFailureCode.current
      )).catch(() => undefined);
    }
    onClose();
  }, [diagnosticPayload, onClose, recovery]);

  const retryManually = useCallback(() => {
    retriesBySource.current = {};
    localRetries.current = 0;
    terminalFailureReported.current = false;
    recoveryLock.current = false;
    stableConfirmed.current = false;
    setRecovery("retrying");
    setRecoveryDetail("Nova tentativa solicitada manualmente.");
    setSourceStartIndex(snapshotRef.current.sourceIndex);
    setReloadAttempt(value => value + 1);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      showControls();
      if (isBackKey(event) || event.keyCode === 413) {
        event.preventDefault();
        if (trackPanel) setTrackPanel(false);
        else if (channelPanel) setChannelPanel(false);
        else if (episodePanel) setEpisodePanel(false);
        else closePlayer();
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
      if (event.keyCode === 10252) { event.preventDefault(); toggle(); return; }
      if (event.keyCode === 412 || event.keyCode === 417) {
        event.preventDefault();
        if (!item.live) adapter.current?.seek(event.keyCode === 412 ? -10 : 10);
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (direction) {
        event.preventDefault();
        if (snapshot.status === "error" && recovery === "failed") {
          moveFocus(direction, document.querySelector(".player-error") || document);
        } else if (!controls) focusControls();
        else if (active?.matches("[data-tv-focusable='true']")) moveFocus(direction);
        else if (!item.live && (direction === "left" || direction === "right")) {
          adapter.current?.seek(direction === "left" ? -10 : 10);
        } else focusControls();
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
  }, [channelPanel, closePlayer, controls, episodePanel, focusControls, item.live, recovery, showControls, snapshot.status, toggle, trackPanel]);

  useEffect(() => {
    if (!trackPanel && !channelPanel && !episodePanel) return;
    const selector = trackPanel ? ".track-panel" : episodePanel ? ".episode-panel" : ".channel-panel";
    window.setTimeout(() => document.querySelector<HTMLElement>(`${selector} [data-autofocus='true']`)?.focus(), 0);
  }, [channelPanel, episodePanel, trackPanel]);

  const progress = snapshot.duration > 0 ? Math.min(100, snapshot.currentTime / snapshot.duration * 100) : 0;
  const errorTitle = recovery === "retrying" ? "Reconectando a reprodução"
    : recovery === "source_switching" ? "Alternando origem"
      : recovery === "playlist_switching" ? "Ativando a lista reserva"
        : recovery === "failed" ? "Não foi possível recuperar" : "Analisando a falha";
  const errorAction = recoveryDetail;

  return <main className="player-screen">
    {networkOffline && <section className="player-network"><span>SEM INTERNET</span><h2>A conexão foi interrompida</h2><p>A reprodução continuará automaticamente quando a internet voltar.</p></section>}
    {snapshot.buffering && snapshot.status !== "error" && !networkOffline && <div className="player-loading"><span className="spinner" /><p>Carregando...</p></div>}
    {nextEpisodeCountdown != null && <section className="next-episode-card"><small>PRÓXIMO EPISÓDIO</small><h2>{seriesQueue[seriesQueueIndex + 1]?.name}</h2><p>Iniciando em {nextEpisodeCountdown} segundo{nextEpisodeCountdown === 1 ? "" : "s"}.</p><div><button data-tv-focusable="true" data-autofocus="true" onClick={() => changeEpisode(seriesQueueIndex + 1)}>Assistir agora</button><button data-tv-focusable="true" onClick={() => setNextEpisodeCountdown(null)}>Cancelar</button></div></section>}
    {snapshot.status === "error" && <section className="player-error"><h2>{errorTitle}</h2><p>{snapshot.error}</p>{errorAction && <span className="source-retry"><i className="spinner" /> {errorAction}</span>}{recovery === "failed" && <div className="player-error-actions"><button data-tv-focusable="true" data-autofocus="true" className="primary" onClick={retryManually}>Tentar novamente</button><button data-tv-focusable="true" className="secondary" onClick={closePlayer}>Voltar aos detalhes</button></div>}</section>}
    <section className={`player-overlay ${controls || snapshot.status === "error" ? "visible" : ""}`}>
      <header><button data-tv-focusable="true" data-autofocus={snapshot.status !== "error" ? "true" : undefined} onClick={closePlayer}>‹</button><div><small>{item.live ? "TV AO VIVO" : "RONECA PLAYER TV"}</small><strong>{item.name}</strong>{item.live && programs[0] && <span className="player-program"><b>AGORA</b> {programs[0].title}{programs[1] && <em>DEPOIS • {programs[1].title}</em>}</span>}</div>{snapshot.sourceCount > 1 && <span className={`source-badge ${snapshot.sourceIndex > 0 ? "alternative" : ""}`}>{snapshot.sourceIndex > 0 ? `ORIGEM ${snapshot.sourceIndex + 1}` : "ORIGEM PRINCIPAL"}</span>}</header>
      {snapshot.status !== "error" && <footer><button data-tv-focusable="true" className="play-control" onClick={toggle}>{snapshot.status === "playing" ? "Ⅱ" : "▶"}</button>{!item.live && <button data-tv-focusable="true" className="player-seek-control" onClick={() => adapter.current?.seek(-10)}>↶ 10s</button>}{!item.live && <div className="timeline"><div><i style={{ width: `${progress}%` }} /></div><span>{time(snapshot.currentTime)} / {time(snapshot.duration)}</span></div>}{!item.live && <button data-tv-focusable="true" className="player-seek-control" onClick={() => adapter.current?.seek(10)}>10s ↷</button>}{item.live && <div className="live-badge"><i /> AO VIVO</div>}{item.live && channels.length > 1 && <button data-tv-focusable="true" className="track-control channel-control" onClick={() => { const activeIndex = Math.max(0, channels.findIndex(channel => channel.id === item.id)); setChannelPage(Math.floor(activeIndex / channelPageSize)); setChannelPanel(true); }}>☰ Canais</button>}{item.kind === "episode" && seriesQueue.length > 1 && <button data-tv-focusable="true" className="track-control channel-control" onClick={() => { setEpisodePanelPage(Math.max(0, Math.floor(Math.max(0, seriesQueueIndex) / episodeDrawerPageSize))); setEpisodePanel(true); }}>☰ Episódios</button>}<button data-tv-focusable="true" className="track-control" onClick={() => setTrackPanel(true)}>♪ Áudio e legendas</button></footer>}
    </section>
    {channelPanel && <aside className="channel-panel"><header><div><p className="eyebrow">TV AO VIVO</p><h2>{item.meta || "Canais"}</h2><small>{channels.length} canais nesta categoria • página {safeChannelPage + 1}/{channelPageCount}</small></div><button data-tv-focusable="true" onClick={() => setChannelPanel(false)}>×</button></header><section>{safeChannelPage > 0 && <button data-tv-focusable="true" data-focus-key="player:channels:previous" onClick={() => setChannelPage(value => Math.max(0, value - 1))}><span><b>←</b></span><span><strong>Canais anteriores</strong><small>Carregar a página anterior</small></span><b>VOLTAR</b></button>}{visibleChannels.map((channel, index) => <button key={channel.id} data-tv-focusable="true" data-autofocus={channel.id === item.id || (safeChannelPage === 0 && index === 0) ? "true" : undefined} className={channel.id === item.id ? "selected" : ""} onClick={() => { onChangeChannel?.(channel); setChannelPanel(false); }}><span>{channel.logo ? <img src={channel.logo} alt="" loading="lazy" /> : <b>R</b>}</span><span><strong>{channel.name}</strong><small>{channel.groupTitle || "TV ao vivo"}</small></span><b>{channel.id === item.id ? "NO AR" : "▶"}</b></button>)}{safeChannelPage + 1 < channelPageCount && <button data-tv-focusable="true" data-focus-key="player:channels:next" onClick={() => setChannelPage(value => Math.min(channelPageCount - 1, value + 1))}><span><b>→</b></span><span><strong>Próximos canais</strong><small>Carregar a próxima página</small></span><b>MAIS</b></button>}</section></aside>}
    {episodePanel && <aside className="channel-panel episode-panel"><header><div><p className="eyebrow">SÉRIE</p><h2>Temporadas e episódios</h2><small>{item.meta || item.name} • página {safeEpisodePanelPage + 1}/{episodePageCount}</small></div><button data-tv-focusable="true" onClick={() => setEpisodePanel(false)}>×</button></header><section>{safeEpisodePanelPage > 0 && <button data-tv-focusable="true" data-focus-key="player:episodes:previous" onClick={() => setEpisodePanelPage(value => Math.max(0, value - 1))}><span><b>←</b></span><span><strong>Episódios anteriores</strong><small>Carregar a página anterior</small></span><b>VOLTAR</b></button>}{visibleEpisodeQueue.map((entry, index) => { const absoluteIndex = safeEpisodePanelPage * episodeDrawerPageSize + index; return <button key={entry.id} data-tv-focusable="true" data-autofocus={absoluteIndex === seriesQueueIndex || (seriesQueueIndex < 0 && absoluteIndex === 0) ? "true" : undefined} className={absoluteIndex === seriesQueueIndex ? "selected" : ""} onClick={() => { setEpisodePanel(false); changeEpisode(absoluteIndex); }}><span><b>{entry.episodeNumber}</b></span><span><strong>{entry.name}</strong><small>Temporada {entry.seasonNumber} • Episódio {entry.episodeNumber}</small></span><b>{absoluteIndex === seriesQueueIndex ? "NO AR" : "▶"}</b></button>; })}{safeEpisodePanelPage + 1 < episodePageCount && <button data-tv-focusable="true" data-focus-key="player:episodes:next" onClick={() => setEpisodePanelPage(value => Math.min(episodePageCount - 1, value + 1))}><span><b>→</b></span><span><strong>Próximos episódios</strong><small>Carregar a próxima página</small></span><b>MAIS</b></button>}</section></aside>}
    {trackPanel && <aside className="track-panel"><header><div><p className="eyebrow">REPRODUÇÃO</p><h2>Áudio e legendas</h2></div><button data-tv-focusable="true" onClick={() => setTrackPanel(false)}>×</button></header><section><h3>Faixa de áudio</h3>{snapshot.audioTracks.length === 0 && <p>Nenhuma faixa alternativa foi informada pelo conteúdo.</p>}{snapshot.audioTracks.map((track, index) => <button key={`audio:${track.index}`} data-tv-focusable="true" data-autofocus={index === 0 ? "true" : undefined} className={snapshot.selectedAudioTrack === track.index ? "selected" : ""} onClick={() => adapter.current?.selectTrack("audio", track.index)}><span>♪</span><strong>{track.label}</strong><small>{track.language?.toUpperCase() || "ÁUDIO"}</small></button>)}</section><section><h3>Legendas</h3><button data-tv-focusable="true" data-autofocus={snapshot.audioTracks.length === 0 ? "true" : undefined} className={snapshot.selectedTextTrack == null ? "selected" : ""} onClick={() => adapter.current?.selectTrack("text", null)}><span>CC</span><strong>Desativadas</strong><small>SEM LEGENDA</small></button>{snapshot.textTracks.map(track => <button key={`text:${track.index}`} data-tv-focusable="true" className={snapshot.selectedTextTrack === track.index ? "selected" : ""} onClick={() => adapter.current?.selectTrack("text", track.index)}><span>CC</span><strong>{track.label}</strong><small>{track.language?.toUpperCase() || "LEGENDA"}</small></button>)}</section></aside>}
  </main>;
}
