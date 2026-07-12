import { useAppStore } from '@/stores/appStore';

type PlaylistUrlInput =
  | string
  | null
  | undefined
  | Array<string | null | undefined>;

interface IdleDeadlineLike {
  didTimeout: boolean;
  timeRemaining: () => number;
}

type RequestIdleCallbackLike = (
  callback: (deadline: IdleDeadlineLike) => void,
  options?: {
    timeout?: number;
  },
) => number;

const INITIAL_DELAY_MS = 4_000;
const BUSY_RETRY_DELAY_MS = 10_000;
const IDLE_TIMEOUT_MS = 7_000;

const scheduledUrls = new Set<string>();
const completedUrls = new Set<string>();

const BUSY_SCREENS = new Set([
  'splash',
  'activation',
  'blocked',
  'expired',
  'nointernet',
  'player',
  'series',
]);

function normalizeCandidates(input: PlaylistUrlInput) {
  const values = Array.isArray(input) ? input : [input];

  return values
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function isXtreamPlaylistUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.toLowerCase();

    const supportedEndpoint =
      path.endsWith('/get.php') ||
      path.endsWith('/player_api.php');

    return (
      supportedEndpoint &&
      Boolean(url.searchParams.get('username')) &&
      Boolean(url.searchParams.get('password'))
    );
  } catch {
    return false;
  }
}

function shouldWaitForApp() {
  if (
    typeof document !== 'undefined' &&
    document.hidden
  ) {
    return true;
  }

  const currentScreen =
    useAppStore.getState().currentScreen;

  return BUSY_SCREENS.has(currentScreen);
}

function getRequestIdleCallback():
  | RequestIdleCallbackLike
  | undefined {

  if (typeof window === 'undefined') {
    return undefined;
  }

  return (
    window as unknown as {
      requestIdleCallback?: RequestIdleCallbackLike;
    }
  ).requestIdleCallback;
}

function queueXtreamPrewarm(
  playlistUrl: string,
  delayMs: number,
) {
  if (
    typeof window === 'undefined' ||
    completedUrls.has(playlistUrl) ||
    scheduledUrls.has(playlistUrl)
  ) {
    return;
  }

  scheduledUrls.add(playlistUrl);

  window.setTimeout(() => {
    const run = () => {
      scheduledUrls.delete(playlistUrl);

      if (shouldWaitForApp()) {
        queueXtreamPrewarm(
          playlistUrl,
          BUSY_RETRY_DELAY_MS,
        );
        return;
      }

      void import('@/utils/xtreamSeries')
        .then(async module => {
          const cached =
            module.getCachedXtreamSeriesCatalog(
              playlistUrl,
            );

          if (cached) {
            completedUrls.add(playlistUrl);
            return;
          }

          await module.fetchXtreamSeriesCatalog(
            playlistUrl,
          );

          completedUrls.add(playlistUrl);
        })
        .catch(() => {
          // O catálogo continuará disponível pelo
          // carregamento normal ao abrir Séries.
        });
    };

    const requestIdleCallback =
      getRequestIdleCallback();

    if (requestIdleCallback) {
      requestIdleCallback(
        () => run(),
        {
          timeout: IDLE_TIMEOUT_MS,
        },
      );
      return;
    }

    window.setTimeout(run, 0);
  }, delayMs);
}

export function scheduleXtreamSeriesPrewarm(
  input: PlaylistUrlInput,
) {
  const playlistUrl = normalizeCandidates(input)
    .find(isXtreamPlaylistUrl);

  if (!playlistUrl) return;

  queueXtreamPrewarm(
    playlistUrl,
    INITIAL_DELAY_MS,
  );
}
