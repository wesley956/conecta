export type TvPlatform = "webos" | "tizen" | "browser";

declare global {
  interface Window {
    PalmSystem?: unknown;
    tizen?: unknown;
    webOS?: unknown;
  }
}

export const platform: TvPlatform =
  typeof window.tizen !== "undefined"
    ? "tizen"
    : typeof window.PalmSystem !== "undefined" || typeof window.webOS !== "undefined"
      ? "webos"
      : "browser";

export function isBackKey(event: KeyboardEvent): boolean {
  return (
    event.key === "Backspace" ||
    event.key === "Escape" ||
    event.keyCode === 10009 ||
    event.keyCode === 461
  );
}

export function closeApplication(): void {
  if (platform === "tizen") {
    try {
      (window.tizen as { application: { getCurrentApplication: () => { exit: () => void } } })
        .application.getCurrentApplication().exit();
    } catch {
      window.history.back();
    }
    return;
  }

  if (platform === "webos") {
    window.close();
    return;
  }

  window.history.back();
}
