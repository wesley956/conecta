import type { PlayerAdapter, PlayerTrack, SnapshotListener } from "./types";

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

export class Html5Player implements PlayerAdapter {
  private video: HTMLVideoElement | null = null;
  private cleanups: Array<() => void> = [];
  private tryingSource = false;

  constructor(private readonly update: SnapshotListener) {}

  mount() {
    const video = document.createElement("video");
    video.className = "native-video";
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    document.body.prepend(video);
    this.video = video;
    const on = (name: keyof HTMLMediaElementEventMap, handler: EventListener) => {
      video.addEventListener(name, handler);
      this.cleanups.push(() => video.removeEventListener(name, handler));
    };
    on("playing", () => this.update({ status: "playing", buffering: false }));
    on("pause", () => { if (!video.ended) this.update({ status: "paused", buffering: false }); });
    on("waiting", () => this.update({ buffering: true }));
    on("timeupdate", () => this.update({ currentTime: video.currentTime || 0 }));
    on("durationchange", () => this.update({ duration: Number.isFinite(video.duration) ? video.duration : 0 }));
    on("loadedmetadata", () => this.publishTracks());
    on("ended", () => this.update({ status: "ended", buffering: false }));
    on("error", () => {
      if (this.tryingSource) return;
      this.update({ status: "error", buffering: false, error: "A origem ativa parou de responder." });
    });
  }

  async load(urls: string[]) {
    if (!this.video) throw new Error("Player não inicializado.");
    let lastError: unknown;
    for (let index = 0; index < urls.length; index += 1) {
      try {
        this.update({ sourceIndex: index, sourceCount: urls.length, error: null });
        await this.trySource(urls[index]);
        return;
      } catch (error) { lastError = error; this.tryingSource = false; }
    }
    throw lastError || new Error("Nenhuma origem de vídeo pôde ser aberta.");
  }

  private trySource(url: string) {
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
      const timeout = window.setTimeout(() => done(() => reject(new Error("Tempo esgotado ao abrir o vídeo."))), 20_000);
      video.addEventListener("canplay", ready);
      video.addEventListener("error", failed);
      video.src = url;
      video.load();
    });
  }

  async play() { await this.video?.play(); }
  pause() { this.video?.pause(); }
  seek(seconds: number) {
    if (!this.video || !Number.isFinite(this.video.duration)) return;
    this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
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
