const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/screens/PlayerScreen.tsx');
let src = fs.readFileSync(file, 'utf8');

const oldBlock = `  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncPlaybackState = () => {
      const safeCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const safeDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

      setCurrentTime(safeCurrentTime);
      setDuration(safeDuration);
      setIsPlaying(!video.paused && !video.ended);
      setVolume(video.volume);
      setMuted(video.muted);
      setPlaybackRate(video.playbackRate || 1);
    };

    video.addEventListener('timeupdate', syncPlaybackState);
    video.addEventListener('durationchange', syncPlaybackState);
    video.addEventListener('loadedmetadata', syncPlaybackState);
    video.addEventListener('play', syncPlaybackState);
    video.addEventListener('pause', syncPlaybackState);
    video.addEventListener('volumechange', syncPlaybackState);
    video.addEventListener('ended', syncPlaybackState);

    syncPlaybackState();

    return () => {
      video.removeEventListener('timeupdate', syncPlaybackState);
      video.removeEventListener('durationchange', syncPlaybackState);
      video.removeEventListener('loadedmetadata', syncPlaybackState);
      video.removeEventListener('play', syncPlaybackState);
      video.removeEventListener('pause', syncPlaybackState);
      video.removeEventListener('volumechange', syncPlaybackState);
      video.removeEventListener('ended', syncPlaybackState);
    };
  }, [content?.id, streamUrl]);`;

const newBlock = `  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let lastTimeSyncAt = 0;
    let lastCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    let lastDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    let lastIsPlaying = !video.paused && !video.ended;
    let lastVolume = video.volume;
    let lastMuted = video.muted;
    let lastPlaybackRate = video.playbackRate || 1;

    const syncTimeState = (force = false) => {
      const now = performance.now();

      // timeupdate pode disparar muitas vezes. Em TV Box fraca, limitar a UI
      // para ~2 atualizações por segundo ajuda sem mudar a reprodução real.
      if (!force && now - lastTimeSyncAt < 450) return;

      lastTimeSyncAt = now;

      const safeCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const safeDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

      if (force || Math.abs(safeCurrentTime - lastCurrentTime) >= 0.25) {
        lastCurrentTime = safeCurrentTime;
        setCurrentTime(safeCurrentTime);
      }

      if (force || Math.abs(safeDuration - lastDuration) >= 0.25) {
        lastDuration = safeDuration;
        setDuration(safeDuration);
      }
    };

    const syncPlaybackFlags = () => {
      const nextIsPlaying = !video.paused && !video.ended;

      if (nextIsPlaying !== lastIsPlaying) {
        lastIsPlaying = nextIsPlaying;
        setIsPlaying(nextIsPlaying);
      }
    };

    const syncMediaSettings = () => {
      const nextVolume = video.volume;
      const nextMuted = video.muted;
      const nextPlaybackRate = video.playbackRate || 1;

      if (Math.abs(nextVolume - lastVolume) >= 0.01) {
        lastVolume = nextVolume;
        setVolume(nextVolume);
      }

      if (nextMuted !== lastMuted) {
        lastMuted = nextMuted;
        setMuted(nextMuted);
      }

      if (Math.abs(nextPlaybackRate - lastPlaybackRate) >= 0.01) {
        lastPlaybackRate = nextPlaybackRate;
        setPlaybackRate(nextPlaybackRate);
      }
    };

    const syncAllState = () => {
      syncTimeState(true);
      syncPlaybackFlags();
      syncMediaSettings();
    };

    const handleTimeUpdate = () => syncTimeState(false);
    const handleMetadata = () => syncAllState();
    const handlePlayPause = () => {
      syncPlaybackFlags();
      syncTimeState(true);
    };
    const handleVolumeChange = () => syncMediaSettings();

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleMetadata);
    video.addEventListener('loadedmetadata', handleMetadata);
    video.addEventListener('play', handlePlayPause);
    video.addEventListener('pause', handlePlayPause);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('ended', handlePlayPause);

    syncAllState();

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleMetadata);
      video.removeEventListener('loadedmetadata', handleMetadata);
      video.removeEventListener('play', handlePlayPause);
      video.removeEventListener('pause', handlePlayPause);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('ended', handlePlayPause);
    };
  }, [content?.id, streamUrl]);`;

if (src.includes(newBlock)) {
  console.log('OK: patch seguro de timeupdate já aplicado.');
  process.exit(0);
}

if (!src.includes(oldBlock)) {
  console.error('ERRO: bloco original do timeupdate não foi encontrado. Nenhuma alteração feita.');
  process.exit(1);
}

src = src.replace(oldBlock, newBlock);
fs.writeFileSync(file, src);
console.log('Aplicado: timeupdate do PlayerScreen otimizado com throttle seguro.');
