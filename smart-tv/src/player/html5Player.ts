import type { PlayerAdapter, SnapshotListener } from "./types";

export class Html5Player implements PlayerAdapter {
  private video: HTMLVideoElement | null = null;
  private cleanups: Array<() => void> = [];
  constructor(private readonly update: SnapshotListener) {}
  mount() {
    const video = document.createElement("video");
    video.className = "native-video"; video.autoplay = true; video.playsInline = true; video.preload = "auto";
    document.body.prepend(video); this.video = video;
    const on = (name: keyof HTMLMediaElementEventMap, handler: EventListener) => {
      video.addEventListener(name, handler); this.cleanups.push(() => video.removeEventListener(name, handler));
    };
    on("playing", () => this.update({ status: "playing", buffering: false }));
    on("pause", () => { if (!video.ended) this.update({ status: "paused", buffering: false }); });
    on("waiting", () => this.update({ buffering: true }));
    on("timeupdate", () => this.update({ currentTime: video.currentTime || 0 }));
    on("durationchange", () => this.update({ duration: Number.isFinite(video.duration) ? video.duration : 0 }));
    on("ended", () => this.update({ status: "ended", buffering: false }));
    on("error", () => this.update({ status: "error", buffering: false, error: "A origem ativa parou de responder." }));
  }
  async load(urls: string[]) {
    if (!this.video) throw new Error("Player não inicializado.");
    let lastError: unknown;
    for (let index = 0; index < urls.length; index += 1) {
      try {
        this.update({ sourceIndex: index, sourceCount: urls.length, error: null });
        await this.trySource(urls[index]); return;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error("Nenhuma origem de vídeo pôde ser aberta.");
  }
  private trySource(url: string) {
    const video = this.video!;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (callback: () => void) => {
        if (settled) return; settled = true;
        video.removeEventListener("canplay", ready); video.removeEventListener("error", failed);
        window.clearTimeout(timeout); callback();
      };
      const ready = () => done(resolve);
      const failed = () => done(() => reject(new Error("Formato ou endereço não suportado nesta TV.")));
      const timeout = window.setTimeout(() => done(() => reject(new Error("Tempo esgotado ao abrir o vídeo."))), 20_000);
      video.addEventListener("canplay", ready); video.addEventListener("error", failed);
      video.src = url; video.load();
    });
  }
  async play() { await this.video?.play(); }
  pause() { this.video?.pause(); }
  seek(seconds: number) {
    if (!this.video || !Number.isFinite(this.video.duration)) return;
    this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
  }
  stop() { if (!this.video) return; this.video.pause(); this.video.removeAttribute("src"); this.video.load(); }
  destroy() { this.stop(); this.cleanups.forEach(cleanup => cleanup()); this.cleanups = []; this.video?.remove(); this.video = null; }
}
