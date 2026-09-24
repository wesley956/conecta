import { useEffect, useRef, useState } from "react";
import { readSmartTvPlayerSettings } from "./playerSettings";

const CROSSFADE_START_SECONDS = 6.5;
const EXPECTED_DURATION_SECONDS = 8.057;
const SAFETY_TIMEOUT_MILLIS = 12_000;

export function LaunchVideoOverlay() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const completed = useRef(false);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const finish = () => {
      if (completed.current) return;
      completed.current = true;
      setVisible(false);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    const updateTransition = () => {
      if (video.currentTime >= CROSSFADE_START_SECONDS) setFading(true);
    };
    let fallbackTimer: number | null = null;
    const showFallback = () => {
      if (completed.current) return;
      setFallback(true);
      video.pause();
      fallbackTimer = window.setTimeout(finish, 1_500);
    };
    const timer = window.setTimeout(finish, SAFETY_TIMEOUT_MILLIS);
    video.muted = !readSmartTvPlayerSettings().launchSoundEnabled;
    const playback = video.play();
    if (playback) void playback.catch(showFallback);
    video.addEventListener("timeupdate", updateTransition);
    video.addEventListener("ended", finish);
    video.addEventListener("error", showFallback);
    return () => {
      window.clearTimeout(timer);
      if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
      video.removeEventListener("timeupdate", updateTransition);
      video.removeEventListener("ended", finish);
      video.removeEventListener("error", showFallback);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  useEffect(() => {
    if (!fading) return;
    const video = videoRef.current;
    const duration = Number.isFinite(video?.duration) && (video?.duration || 0) > CROSSFADE_START_SECONDS
      ? video!.duration
      : EXPECTED_DURATION_SECONDS;
    document.documentElement.style.setProperty(
      "--launch-crossfade-duration",
      `${Math.max(0, duration - (video?.currentTime || CROSSFADE_START_SECONDS))}s`
    );
  }, [fading]);

  useEffect(() => {
    if (!visible) return;
    const block = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Backspace", "Escape", "BrowserBack"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, [visible]);

  if (!visible) return null;
  return <div className={`launch-video-overlay${fading ? " fading" : ""}${fallback ? " fallback" : ""}`} aria-hidden="true">
    <video
      ref={videoRef}
      className="launch-video"
      src="./roneca_launch_video.mp4"
      preload="auto"
      playsInline
    />
    {fallback && <div className="launch-video-fallback" />}
  </div>;
}
