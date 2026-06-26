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

function canUseWorker() {
  return typeof Worker !== 'undefined';
}

export function parseM3UOffMainThread(
  content: string,
  playlistId = 'local-m3u',
  sourceUrl = ''
): Promise<ParsedM3UResult> {
  if (!canUseWorker()) {
    return Promise.resolve(parseM3U(content, playlistId, sourceUrl));
  }

  const requestId = `m3u-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let worker: Worker | null = null;

    const cleanup = () => {
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

    try {
      worker = new Worker(new URL('../workers/m3uParser.worker.ts', import.meta.url), {
        type: 'module',
      });

      const timeout = globalThis.setTimeout(() => {
        finish(() => reject(new Error('Tempo limite ao organizar lista M3U.')));
      }, 120000);

      worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
        const payload = event.data;

        if (!payload || payload.requestId !== requestId) return;

        globalThis.clearTimeout(timeout);

        if (payload.ok) {
          finish(() => resolve(payload.result));
          return;
        }

        finish(() => reject(new Error(payload.error || 'Falha ao organizar lista M3U.')));
      };

      worker.onerror = () => {
        globalThis.clearTimeout(timeout);
        finish(() => reject(new Error('Falha no processador isolado da lista M3U.')));
      };

      worker.postMessage({
        requestId,
        content,
        playlistId,
        sourceUrl,
      });
    } catch {
      cleanup();

      try {
        resolve(parseM3U(content, playlistId, sourceUrl));
      } catch (error) {
        reject(error);
      }
    }
  });
}
