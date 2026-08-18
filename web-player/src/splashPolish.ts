const SPLASH_SELECTOR = '.launch-splash';
const VIDEO_SELECTOR = '.launch-splash-video';
const AUDIO_CLASS = 'launch-splash-audio';
const AUDIO_DATA_KEY = 'splashAudio';
const REVEAL_AT_SECONDS = 5.9;
const MAX_SYNC_DRIFT_SECONDS = 0.22;
const PRIMED_VOLUME = 0.0001;

let splashAudio: HTMLAudioElement | null = null;
let activeSplash: HTMLElement | null = null;
let detachActiveSplash: (() => void) | null = null;
let audioUnlockedByGesture = false;

function splashAssetUrl() {
  return new URL('brand/roneca_launch_video.mp4', document.baseURI).href;
}

function setAudioState(state: 'idle' | 'primed' | 'playing' | 'video' | 'silent' | 'fallback' | 'reduced') {
  document.documentElement.dataset[AUDIO_DATA_KEY] = state;
}

function ensureSplashAudio() {
  if (splashAudio?.isConnected) return splashAudio;

  const audio = document.createElement('audio');
  audio.className = AUDIO_CLASS;
  audio.hidden = true;
  audio.preload = 'auto';
  audio.src = splashAssetUrl();
  audio.setAttribute('aria-hidden', 'true');
  audio.tabIndex = -1;
  document.body.append(audio);
  splashAudio = audio;
  return audio;
}

function resetAudio(audio: HTMLAudioElement) {
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Alguns engines lançam ao reposicionar antes de metadata; o próximo play sincroniza novamente.
  }
  audio.loop = false;
  audio.volume = 1;
  audio.muted = false;
  audioUnlockedByGesture = false;
}

function primeSplashAudioFromGesture(event: Event) {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form?.closest('.experience-login-card')) return;

  const audio = ensureSplashAudio();
  resetAudio(audio);

  // Mobile Safari/Chrome exigem que o play audível nasça diretamente do gesto.
  // Mantemos ESTE MESMO playback vivo, em volume praticamente inaudível e em loop,
  // durante a autenticação. Quando o splash monta, apenas sincronizamos e elevamos
  // o volume — sem depender de um segundo play fora da ativação do usuário.
  audio.loop = true;
  audio.volume = PRIMED_VOLUME;
  audio.muted = false;

  const started = audio.play();
  if (!started) {
    audioUnlockedByGesture = true;
    setAudioState('primed');
    return;
  }

  void started.then(() => {
    audioUnlockedByGesture = true;
    if (!activeSplash) setAudioState('primed');
  }).catch(() => {
    resetAudio(audio);
    setAudioState('fallback');
  });
}

function syncAudioToVideo(audio: HTMLAudioElement, video: HTMLVideoElement, force = false) {
  if (!Number.isFinite(video.currentTime)) return;
  const drift = Math.abs(audio.currentTime - video.currentTime);
  if (!force && drift <= MAX_SYNC_DRIFT_SECONDS) return;
  try {
    audio.currentTime = Math.max(0, video.currentTime);
  } catch {
    // Metadata pode ainda não estar pronta; o próximo timeupdate tenta novamente.
  }
}

function attachSplash(splash: HTMLElement) {
  if (splash.classList.contains('reduced')) {
    setAudioState('reduced');
    return () => undefined;
  }

  const video = splash.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
  if (!video) return () => undefined;

  const audio = ensureSplashAudio();
  let disposed = false;
  let separateAudioPlaying = false;

  document.body.classList.add('splash-polish-active');
  document.body.classList.remove('splash-polish-reveal');

  // O vídeo permanece mudo para impedir áudio duplicado. O elemento de áudio usa
  // exatamente o mesmo MP4 e, quando possível, já vem tocando desde o gesto do login.
  video.defaultMuted = true;
  video.muted = true;

  const revealHome = () => {
    if (disposed) return;
    splash.classList.add('is-polish-revealing');
    document.body.classList.add('splash-polish-reveal');
  };

  const tryVideoAudioFallback = async () => {
    if (disposed) return;
    resetAudio(audio);
    separateAudioPlaying = false;
    video.defaultMuted = false;
    video.muted = false;
    video.removeAttribute('muted');
    try {
      await video.play();
      if (!disposed) setAudioState('video');
    } catch {
      video.defaultMuted = true;
      video.muted = true;
      if (!disposed) setAudioState('silent');
    }
  };

  const promotePrimedAudio = () => {
    if (!audioUnlockedByGesture || audio.paused || audio.ended) return false;
    audio.loop = false;
    syncAudioToVideo(audio, video, true);
    audio.volume = 1;
    audio.muted = false;
    separateAudioPlaying = true;
    setAudioState('playing');
    return true;
  };

  const startAudio = async () => {
    if (disposed || video.ended || separateAudioPlaying) return;
    video.defaultMuted = true;
    video.muted = true;

    // Caminho principal no mobile: não há um novo play; só promovemos o playback
    // que já estava autorizado pelo toque em Entrar.
    if (promotePrimedAudio()) return;

    audio.loop = false;
    syncAudioToVideo(audio, video, true);
    audio.volume = 1;
    audio.muted = false;
    try {
      await audio.play();
      if (disposed) return;
      audioUnlockedByGesture = true;
      separateAudioPlaying = true;
      setAudioState('playing');
    } catch {
      await tryVideoAudioFallback();
    }
  };

  const onPlaying = () => {
    if (!separateAudioPlaying) void startAudio();
  };
  const onTimeUpdate = () => {
    if (video.currentTime >= REVEAL_AT_SECONDS) revealHome();
    if (separateAudioPlaying) syncAudioToVideo(audio, video);
  };
  const onSeeking = () => {
    if (separateAudioPlaying) syncAudioToVideo(audio, video, true);
  };
  const onPause = () => {
    if (!video.ended && separateAudioPlaying) audio.pause();
  };
  const onEnded = () => {
    revealHome();
    resetAudio(audio);
    separateAudioPlaying = false;
  };

  video.addEventListener('playing', onPlaying);
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('seeking', onSeeking);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onEnded);

  // O autoplay mudo do componente pode já ter iniciado antes do observer anexar.
  if (!video.paused) void startAudio();
  else queueMicrotask(() => {
    if (!disposed && video.isConnected) void startAudio();
  });

  return () => {
    disposed = true;
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('seeking', onSeeking);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('ended', onEnded);
    resetAudio(audio);
    document.body.classList.remove('splash-polish-active', 'splash-polish-reveal');
  };
}

function scanForSplash() {
  const nextSplash = document.querySelector<HTMLElement>(SPLASH_SELECTOR);
  if (nextSplash === activeSplash) return;

  detachActiveSplash?.();
  detachActiveSplash = null;
  activeSplash = nextSplash;

  if (nextSplash) detachActiveSplash = attachSplash(nextSplash);
}

export function installSplashPolish() {
  setAudioState('idle');
  document.addEventListener('submit', primeSplashAudioFromGesture, true);

  const observer = new MutationObserver(scanForSplash);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scanForSplash();

  return () => {
    observer.disconnect();
    document.removeEventListener('submit', primeSplashAudioFromGesture, true);
    detachActiveSplash?.();
    detachActiveSplash = null;
    activeSplash = null;
    if (splashAudio) {
      resetAudio(splashAudio);
      splashAudio.remove();
      splashAudio = null;
    }
    delete document.documentElement.dataset[AUDIO_DATA_KEY];
  };
}
