import type { PlayerAdapter, PlayerLoadOptions, PlayerTrack, SnapshotListener } from "./types";

interface AvPlayTrackInfo {
  index: number;
  type: "AUDIO" | "VIDEO" | "TEXT";
  extra_info?: string;
}

interface AvPlay {
  open(url: string): void;
  close(): void;
  prepareAsync(success: () => void, error: (error: unknown) => void): void;
  setDisplayRect(x: number, y: number, width: number, height: number): void;
  setDisplayMethod(method: string): void;
  setListener(listener: Record<string, (...args: never[]) => void>): void;
  setBufferingParam?(option: string, unit: string, amount: number): void;
  play(): void;
  pause(): void;
  stop(): void;
  jumpForward(milliseconds: number): void;
  jumpBackward(milliseconds: number): void;
  getDuration(): number;
  getTotalTrackInfo(): AvPlayTrackInfo[];
  setSelectTrack(type: "AUDIO" | "TEXT", index: number): void;
  setSilentSubtitle(silent: boolean): void;
}

declare global {
  interface Window { webapis?: { avplay: AvPlay }; }
}

export class TizenPlayer implements PlayerAdapter {
  private avplay: AvPlay | null = null;
  private tryingSource = false;
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
      onerror: () => {
        if (this.tryingSource) return;
        this.update({ status: "error", buffering: false, error: "A origem ativa parou de responder na Samsung." });
      }
    });
  }

  async load(urls: string[], _live: boolean, options?: PlayerLoadOptions) {
    let lastError: unknown;
    for (let index = 0; index < urls.length; index += 1) {
      try {
        this.update({ sourceIndex: index, sourceCount: urls.length, error: null });
        await this.trySource(urls[index], options?.bufferSeconds || 5);
        return;
      } catch (error) { lastError = error; this.tryingSource = false; this.safeClose(); }
    }
    throw lastError || new Error("Nenhuma origem de vídeo pôde ser aberta.");
  }

  private trySource(url: string, bufferSeconds: number) {
    const avplay = this.avplay!;
    this.tryingSource = true;
    avplay.open(url);
    avplay.setDisplayRect(0, 0, 1920, 1080);
    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
    try {
      avplay.setBufferingParam?.("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", bufferSeconds);
      avplay.setBufferingParam?.("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", Math.max(2, Math.min(10, bufferSeconds)));
    } catch { /* modelos antigos continuam com o buffer padrão */ }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        this.tryingSource = false;
        callback();
      };
      const timeout = window.setTimeout(
        () => done(() => reject(new Error("A Samsung demorou demais para preparar o vídeo."))),
        Math.max(20_000, Math.min(45_000, bufferSeconds * 4_000))
      );
      avplay.prepareAsync(() => done(() => {
        this.update({ duration: Math.max(0, avplay.getDuration() / 1000) });
        this.publishTracks();
        resolve();
      }), () => done(() => reject(new Error("Formato ou endereço não suportado nesta Samsung."))));
    });
  }

  async play() { this.avplay?.play(); }
  pause() { this.avplay?.pause(); }
  seek(seconds: number) {
    if (!this.avplay) return;
    if (seconds >= 0) this.avplay.jumpForward(seconds * 1000);
    else this.avplay.jumpBackward(Math.abs(seconds) * 1000);
  }
  selectTrack(kind: "audio" | "text", index: number | null) {
    if (!this.avplay) return;
    if (kind === "text" && index == null) {
      this.avplay.setSilentSubtitle(true);
      this.update({ selectedTextTrack: null });
      return;
    }
    if (index == null) return;
    if (kind === "text") this.avplay.setSilentSubtitle(false);
    this.avplay.setSelectTrack(kind === "audio" ? "AUDIO" : "TEXT", index);
    this.update(kind === "audio" ? { selectedAudioTrack: index } : { selectedTextTrack: index });
  }
  stop() {
    try { this.avplay?.stop(); } catch { /* o estado pode já estar fechado */ }
    this.safeClose();
  }
  destroy() { this.stop(); this.avplay = null; }
  private safeClose() { try { this.avplay?.close(); } catch { /* o estado pode já estar NONE */ } }

  private publishTracks() {
    if (!this.avplay) return;
    let info: AvPlayTrackInfo[] = [];
    try { info = this.avplay.getTotalTrackInfo(); } catch { return; }
    const convert = (track: AvPlayTrackInfo, kind: "audio" | "text"): PlayerTrack => {
      let extra: Record<string, unknown> = {};
      try { extra = JSON.parse(track.extra_info || "{}") as Record<string, unknown>; } catch { /* rótulo padrão */ }
      const language = String(extra.language || extra.lang || "").trim();
      return {
        index: track.index,
        kind,
        language: language || undefined,
        label: language || `${kind === "audio" ? "Áudio" : "Legenda"} ${track.index + 1}`
      };
    };
    const audioTracks = info.filter(track => track.type === "AUDIO").map(track => convert(track, "audio"));
    const textTracks = info.filter(track => track.type === "TEXT").map(track => convert(track, "text"));
    this.update({
      audioTracks,
      textTracks,
      selectedAudioTrack: audioTracks[0]?.index ?? null,
      selectedTextTrack: null
    });
  }
}
