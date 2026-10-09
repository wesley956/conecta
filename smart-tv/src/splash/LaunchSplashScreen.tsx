import { useEffect, useRef, useState } from "react";
import {
  POSITION_POLL_MILLIS,
  WATCHDOG_MILLIS,
  shouldStartTransition,
  transitionDurationMillis
} from "../launchVideoTransitionPolicy";

// Mesmo clipe usado no app Android nativo (native-android/.../res/raw/roneca_launch_video.mp4),
// servido como asset estático (não processado pelo bundler) a partir de public/brand.
const LAUNCH_VIDEO_SRC = "/brand/roneca-launch-video.mp4";

export function LaunchSplashScreen({ playAudio, onFinished }: {
  playAudio: boolean;
  onFinished: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const completedRef = useRef(false);
  const [fadeMillis, setFadeMillis] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const complete = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setHidden(true);
      onFinished();
    };

    const video = videoRef.current;
    if (!video) {
      complete();
      return;
    }

    video.muted = !playAudio;
    video.volume = playAudio ? 1 : 0;
    video.play().catch(() => {
      // Algumas TVs bloqueiam autoplay com som; o vídeo segue tocando mudo/parado
      // e o watchdog abaixo garante que o app continue normalmente.
    });

    const handleEnded = () => complete();
    const handleError = () => complete();
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    let pollTimer: number | undefined;
    let transitionStarted = false;
    const poll = () => {
      if (completedRef.current || transitionStarted) return;
      const positionMillis = Math.max(0, video.currentTime * 1000);
      if (shouldStartTransition(positionMillis)) {
        transitionStarted = true;
        const reportedDurationMillis = video.duration * 1000;
        setFadeMillis(transitionDurationMillis(positionMillis, reportedDurationMillis));
        return;
      }
      pollTimer = window.setTimeout(poll, POSITION_POLL_MILLIS);
    };
    pollTimer = window.setTimeout(poll, POSITION_POLL_MILLIS);

    const watchdog = window.setTimeout(complete, WATCHDOG_MILLIS);

    return () => {
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
      if (pollTimer) window.clearTimeout(pollTimer);
      window.clearTimeout(watchdog);
    };
    // playAudio só é lido na montagem (igual ao Android: carregado 1x do ajuste salvo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hidden) return null;

  return (
    <div
      className="launch-splash"
      style={fadeMillis !== null ? { transition: `opacity ${fadeMillis}ms ease-in-out`, opacity: 0 } : undefined}
    >
      <video
        ref={videoRef}
        className="launch-splash-video"
        src={LAUNCH_VIDEO_SRC}
        muted={!playAudio}
        playsInline
        autoPlay
        preload="auto"
      />
    </div>
  );
}
