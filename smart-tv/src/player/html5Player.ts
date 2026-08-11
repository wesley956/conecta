import type { PlayerAdapter, PlayerLoadOptions, PlayerTrack, SnapshotListener } from "./types";

interface HtmlAudioTrack {
  enabled: boolean;
  id?: string;
  kind?: string;
  label?: string;
  language?: string;
}

interface HtmlVideoWithTracks extends HTMLVideoElement {
  audioTracks?: ArrayLike<HtmlAudioTrack>;
}

const AUTO_RESUME_WINDOW_MS = 60_000;
const TIMEUPDATE_PUBLISH_INTERVAL_MS = 500;

export class Html5Player implements PlayerAdapter {
  private video: HTMLVideoElement | null = null;
  private cleanups: Array<() => void> = [];
  private tryingSource = false;
  private activeUrl: string | null = null;
  private suspended = false;
  private suspendedAt = 0;
  private suspendedPosition = 0;
  private wasPlayingBeforeSuspend = false;
  private allowLifecycleAutoPlay = false;
  private lifecyclePlayRequested = false;
  private lastTimePublishedAt = 0;

  constructor(private readonly update: SnapshotListener) {}

  mount() {
    const video = document.createElement("video");
    video.className = "native-video";
    video.autoplay = false;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("webkit-playsinline", "true");
    document.body.prepend(video);
    this.video = video;
    this.lastTimePublishedAt = 0;
    const on = (name: keyof HTMLMediaElementEventMap, handler: EventListener) => {
      video.addEventListener(name, handler);
      this.cleanups.push(() => video.removeEventListener(name, handler));
    };
    on("playing", () => this.update({ status: "playing", buffering: false }));
    on("pause", () => { if (!video.ended && !this.suspended) this.update({ status: "paused", buffering: false }); });
    on("waiting", () => { if (!this.suspended) this.update({ buffering: true }); });
    on("stalled", () => { if (!this.suspended) this.update({ buffering: true }); });
    on("canplay", () => { if (!this.suspended) this.update({ buffering: false }); });
    on("timeupdate", () => {
      if (this.suspended) return;
      const now = Date.now();
      if (now - this.lastTimePublishedAt < TIMEUPDATE_PUBLISH_INTERVAL_MS && !video.ended) return;
      this.lastTimePublishedAt = now;
      this.update({ currentTime: video.currentTime || 0 });
    });
    on("durationchange", () => this.update({ duration: Number.isFinite(video.duration) ? video.duration : 0 }));
    on("loadedmetadata", () => this.publishTracks());
    on("ended", () => {
      this.lastTimePublishedAt = 0;
      this.update({ status: "ended", currentTime: video.currentTime || 0, buffering: false });
    });
    on("error", () => {
      if (this.tryingSource || this.suspended) return;
      const code = video.error?.code;
      const detail = code === 3 ? "O formato de vídeo não pôde ser decodificado."
        : code === 4 ? "O formato ou endereço não é suportado nesta LG."
          : "A origem ativa parou de responder.";
      this.update({ status: "error", buffering: false, error: detail });
    });

    const handleVisibility = () => {
      if (document.hidden) this.suspendForLifecycle();
      else void this.restoreAfterLifecycle();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", handleVisibility));
  }

  async load(urls: string[], _live: boolean, options?: PlayerLoadOptions) {
    if (!this.video) throw new Error("Player não inicializado.");
    let lastError: unknown;
    for (let index = 0; index < urls.length; index += 1) {
      try {
        this.update({ sourceIndex: index, sourceCount: urls.length, error: null });
        await this.trySource(urls[index], options?.bufferSeconds || 5);
        this.activeUrl = urls[index];
        return;
      } catch (error) { lastError = error; this.tryingSource = false; }
    }
    throw lastError || new Error("Nenhuma origem de vídeo pôde ser aberta.");
  }

  private trySource(url: string, bufferSeconds: number) {
    const video = this.video!;
    this.tryingSource = true;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (callback: () => void) => {
        if (settled) return;
        settled = true;
        this.tryingSource = false;
        video.removeEventListener("canplay", ready);
        video.removeEventListener("error", failed);
        window.clearTimeout(timeout);
        callback();
      };
      const ready = () => done(resolve);
      const failed = () => done(() => reject(new Error("Formato ou endereço não suportado nesta TV.")));
      const timeoutMs = Math.max(20_000, Math.min(45_000, bufferSeconds * 4_000));
      const timeout = window.setTimeout(() => done(() => reject(new Error("Tempo esgotado ao abrir o vídeo."))), timeoutMs);
      video.addEventListener("canplay", ready);
      video.addEventListener("error", failed);
      video.src = url;
      video.load();
    });
  }

  async play() {
    if (this.suspended) {
      this.lifecyclePlayRequested = true;
      return;
    }
    await this.video?.play();
  }

  pause() {
    if (this.suspended) return;
    this.lifecyclePlayRequested = false;
    this.video?.pause();
  }

  seek(seconds: number) {
    if (!this.video || !Number.isFinite(this.video.duration)) return;
    this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
    this.lastTimePublishedAt = 0;
  }

  selectTrack(kind: "audio" | "text", index: number | null) {
    if (!this.video) return;
    if (kind === "audio") {
      const tracks = (this.video as HtmlVideoWithTracks).audioTracks;
      if (tracks) Array.from(tracks).forEach((track, position) => { track.enabled = position === index; });
      this.update({ selectedAudioTrack: index });
      return;
    }
    Array.from(this.video.textTracks).forEach((track, position) => {
      track.mode = position === index ? "showing" : "disabled";
    });
    this.update({ selectedTextTrack: index });
  }

  stop() {
    if (!this.video) return;
    this.lifecyclePlayRequested = false;
    this.suspended = false;
    this.lastTimePublishedAt = 0;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }

  destroy() {
    this.stop();
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    this.video?.remove();
    this.video = null;
    this.activeUrl = null;
    this.lastTimePublishedAt = 0;
  }

  private suspendForLifecycle() {
    const video = this.video;
    if (!video || this.suspended || !this.activeUrl) return;
    this.suspended = true;
    this.suspendedAt = Date.now();
    this.suspendedPosition = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    this.wasPlayingBeforeSuspend = !video.paused && !video.ended;
    this.allowLifecycleAutoPlay = false;
    this.lifecyclePlayRequested = this.wasPlayingBeforeSuspend;
    this.lastTimePublishedAt = 0;
    video.pause();
    video.removeAttribute("src");
    video.load();
    this.update({
      status: "paused",
      currentTime: this.suspendedPosition,
      buffering: false
    });
  }

  private async restoreAfterLifecycle() {
    const video = this.video;
    if (!video || !this.suspended || !this.activeUrl) return;
    const elapsed = Date.now() - this.suspendedAt;
    this.allowLifecycleAutoPlay = this.wasPlayingBeforeSuspend && elapsed <= AUTO_RESUME_WINDOW_MS;
    const shouldPlay = this.allowLifecycleAutoPlay && this.lifecyclePlayRequested;
    const position = this.suspendedPosition;
    const url = this.activeUrl;
    this.update({ status: "loading", currentTime: position, buffering: true, error: null });

    await new Promise<void>(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", ready);
        video.removeEventListener("canplay", ready);
        resolve();
      };
      const ready = () => {
        if (Number.isFinite(video.duration) && video.duration > 0 && position > 0) {
          video.currentTime = Math.max(0, Math.min(video.duration, position));
        }
        finish();
      };
      const timeout = window.setTimeout(finish, 12_000);
      video.addEventListener("loadedmetadata", ready);
      video.addEventListener("canplay", ready);
      video.src = url;
      video.load();
    });

    this.suspended = false;
    this.lastTimePublishedAt = 0;
    this.update({ currentTime: position, buffering: false, status: shouldPlay ? "loading" : "paused" });
    if (shouldPlay) {
      try { await video.play(); }
      catch { this.update({ status: "paused", buffering: false }); }
    }
    this.lifecyclePlayRequested = false;
  }

  private publishTracks() {
    if (!this.video) return;
    const audioSource = (this.video as HtmlVideoWithTracks).audioTracks;
    const audioTracks: PlayerTrack[] = audioSource ? Array.from(audioSource).map((track, index) => ({
      index,
      kind: "audio",
      label: track.label || track.language || `Áudio ${index + 1}`,
      language: track.language || undefined
    })) : [];
    const textTracks: PlayerTrack[] = Array.from(this.video.textTracks).map((track, index) => ({
      index,
      kind: "text",
      label: track.label || track.language || `Legenda ${index + 1}`,
      language: track.language || undefined
    }));
    const selectedAudioTrack = audioSource
      ? Array.from(audioSource).findIndex(track => track.enabled)
      : null;
    const selectedTextTrack = Array.from(this.video.textTracks).findIndex(track => track.mode === "showing");
    this.update({
      audioTracks,
      textTracks,
      selectedAudioTrack: selectedAudioTrack != null && selectedAudioTrack >= 0 ? selectedAudioTrack : null,
      selectedTextTrack: selectedTextTrack >= 0 ? selectedTextTrack : null
    });
  }
}