const PLAYED_KEY = "roneca.smart-tv.launch-sound-played.v1";

export async function playLaunchSoundOnce(enabled: boolean): Promise<void> {
  if (!enabled) return;
  try {
    if (window.sessionStorage.getItem(PLAYED_KEY) === "1") return;
    window.sessionStorage.setItem(PLAYED_KEY, "1");
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.04);
    master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 2.85);
    master.connect(context.destination);

    const notes = [110, 164.81, 220, 329.63];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.24;
      const end = context.currentTime + 2.65;
      oscillator.type = index < 2 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.015, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(index === 3 ? 0.34 : 0.2, start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(end + 0.05);
    });

    window.setTimeout(() => void context.close(), 3_100);
  } catch {
    // Algumas TVs bloqueiam áudio automático. O aplicativo continua normalmente.
  }
}
