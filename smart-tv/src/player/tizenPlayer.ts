import type { PlayerAdapter, SnapshotListener } from "./types";

interface AvPlay {
  open(url: string): void;
  close(): void;
  prepareAsync(success: () => void, error: (error: unknown) => void): void;
  setDisplayRect(x: number, y: number, width: number, height: number): void;
  setDisplayMethod(method: string): void;
  setListener(listener: Record<string, (...args: never[]) => void>): void;
  play(): void;
  pause(): void;
  stop(): void;
  jumpForward(milliseconds: number): void;
  jumpBackward(milliseconds: number): void;
  getDuration(): number;
}

declare global {
  interface Window { webapis?: { avplay: AvPlay }; }
}

export class TizenPlayer implements PlayerAdapter {
  private avplay: AvPlay | null = null;
  constructor(private readonly update: SnapshotListener) {}

  mount() {
    const avplay = window.webapis?.avplay;
    if (!avplay) throw new Error("AVPlay não está disponível nesta Samsung.");
    this.avplay = avplay;
    avplay.setListener({
      onbufferingstart: () => this.update({ buffering: true }),
      onbufferingcomplete: () => this.update({ buffering: false }),
      oncurrentplaytime: (milliseconds: never) => this.update({ currentTime: Number(milliseconds) / 1000 }),
      onstreamcompleted: () => this.update({ status: "ended", buffering: false }),
      onerror: () => this.update({ status: "error", buffering: false, error: "A Samsung não conseguiu reproduzir este conteúdo." })
    });
  }

  async load(urls: string[]) {
    let lastError: unknown;
    for (const url of urls) {
      try { await this.trySource(url); return; }
      catch (error) { lastError = error; this.safeClose(); }
    }
    throw lastError || new Error("Nenhuma origem de vídeo pôde ser aberta.");
  }

  private trySource(url: string) {
    const avplay = this.avplay!;
    avplay.open(url);
    avplay.setDisplayRect(0, 0, 1920, 1080);
    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
    return new Promise<void>((resolve, reject) => {
      avplay.prepareAsync(() => {
        this.update({ duration: Math.max(0, avplay.getDuration() / 1000) });
        resolve();
      }, () => reject(new Error("Formato ou endereço não suportado nesta Samsung.")));
    });
  }

  async play() { this.avplay?.play(); }
  pause() { this.avplay?.pause(); }
  seek(seconds: number) {
    if (!this.avplay) return;
    if (seconds >= 0) this.avplay.jumpForward(seconds * 1000);
    else this.avplay.jumpBackward(Math.abs(seconds) * 1000);
  }
  stop() {
    try { this.avplay?.stop(); } catch { /* o estado pode já estar fechado */ }
    this.safeClose();
  }
  destroy() { this.stop(); this.avplay = null; }
  private safeClose() { try { this.avplay?.close(); } catch { /* o estado pode já estar NONE */ } }
}
