import { parseM3U, type ParsedM3UResult } from '@/utils/m3u';

type ParseWorkerResponse =
  | {
      requestId: string;
      ok: true;
      result: ParsedM3UResult;
    }
  | {
      requestId: string;
      ok: false;
      error: string;
    };

const WORKER_TIMEOUT_MS = 180000;

function canUseWorker() {
  return typeof Worker !== 'undefined';
}

function parseOnMainThread(content: string, playlistId: string, sourceUrl: string) {
  return parseM3U(content, playlistId, sourceUrl);
}

export function parseM3UOffMainThread(
  content: string,
  playlistId = 'local-m3u',
  sourceUrl = ''
): Promise<ParsedM3UResult> {
  if (!canUseWorker()) {
    return Promise.resolve(parseOnMainThread(content, playlistId, sourceUrl));
  }

  const requestId = `m3u-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let worker: Worker | null = null;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;

    const cleanup = () => {
      if (timeout) {
        globalThis.clearTimeout(timeout);
        timeout = undefined;
      }

      if (worker) {
        worker.terminate();
        worker = null;
      }
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const fallbackToMainThread = (reason: string) => {
      finish(() => {
        try {
          console.warn(`[RonecaPlayTV] Parser Worker indisponível, usando fallback principal: ${reason}`);
          resolve(parseOnMainThread(content, playlistId, sourceUrl));
        } catch (error) {
          reject(error);
        }
      });
    };

    try {
      worker = new Worker(new URL('../workers/m3uParser.worker.ts', import.meta.url), {
        type: 'module',
      });

      timeout = globalThis.setTimeout(() => {
        fallbackToMainThread('tempo limite ao organizar lista M3U');
      }, WORKER_TIMEOUT_MS);

      worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
        const payload = event.data;

        if (!payload || payload.requestId !== requestId) return;

        if (payload.ok) {
          finish(() => resolve(payload.result));
          return;
        }

        fallbackToMainThread(payload.error || 'falha no worker');
      };

      worker.onerror = (event) => {
        fallbackToMainThread(event.message || 'erro ao carregar worker');
      };

      worker.onmessageerror = () => {
        fallbackToMainThread('erro de comunicação com worker');
      };

      worker.postMessage({
        requestId,
        content,
        playlistId,
        sourceUrl,
      });
    } catch (error) {
      fallbackToMainThread(error instanceof Error ? error.message : 'worker não pôde ser iniciado');
    }
  });
}
