// Espelha native-android/.../ui/splash/LaunchVideoTransitionPolicy.kt para manter
// paridade exata de tempos entre o app Android e a Smart TV (LG webOS / Samsung Tizen).
export const CROSSFADE_START_MILLIS = 6_500;
export const EXPECTED_VIDEO_DURATION_MILLIS = 8_057;
export const POSITION_POLL_MILLIS = 40;
export const WATCHDOG_MILLIS = 12_000;

export function shouldStartTransition(positionMillis: number): boolean {
  return positionMillis >= CROSSFADE_START_MILLIS;
}

export function transitionDurationMillis(positionMillis: number, reportedDurationMillis: number): number {
  const endMillis = Number.isFinite(reportedDurationMillis) && reportedDurationMillis > CROSSFADE_START_MILLIS
    ? reportedDurationMillis
    : EXPECTED_VIDEO_DURATION_MILLIS;
  const effectiveStart = Math.max(positionMillis, CROSSFADE_START_MILLIS);
  return Math.max(endMillis - effectiveStart, 0);
}
