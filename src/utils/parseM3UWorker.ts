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

const WORKER_TIMEOUT_MS = 180_000;
const MAX_MAIN_THREAD_PARSE_BYTES = 1_500_000;

function canUseWorker() {
  return typeof Worker !== 'undefined';
}

function getUtf8Size(content: string) {
  return new TextEncoder().encode(content).byteLength;
}

function parseOnMainThread(content: string, playlistId: string, sourceUrl: string) {
  const sizeBytes = getUtf8Size(content);

  if (sizeBytes > MAX_MAIN_THREAD_PARSE_BYTES) {
    throw new Error(
      'A lista é grande demais para ser processada com segurança na interface. ' +
      'Tente novamente em um aparelho com suporte a Web Worker ou use o cache do painel.',
    );
  }

  return parseM3U(content, playlistId, sourceUrl);
}

export function parseM3UOffMainThread(
  content: string,
  playlistId = 'local-m3u',
  sourceUrl = '',
): Promise<ParsedM3UResult> {
  if (!canUseWorker()) {
    try {
      return Promise.resolve(parseOnMainThread(content, playlistId, sourceUrl));
    } catch (error) {
      return Promise.reject(error);
    }
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
          resolve(parseOnMainThread(content, playlistId, sourceUrl));
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Falha desconhecida.';

          reject(new Error(
            `Não foi possível processar a lista em segundo plano (${reason}). ${detail}`,
          ));
        }
      });
    };

    try {
      worker = new Worker(new URL('../workers/m3uParser.worker.ts', import.meta.url), {
        type: 'module',
      });

      timeout = globalThis.setTimeout(() => {
        fallbackToMainThread('tempo limite do Web Worker');
      }, WORKER_TIMEOUT_MS);

      worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
        const payload = event.data;

        if (!payload || payload.requestId !== requestId) return;

        if (payload.ok) {
          finish(() => resolve(payload.result));
          return;
        }

        fallbackToMainThread(payload.error || 'falha interna do Web Worker');
      };

      worker.onerror = event => {
        fallbackToMainThread(event.message || 'erro ao carregar o Web Worker');
      };

      worker.onmessageerror = () => {
        fallbackToMainThread('erro de comunicação com o Web Worker');
      };

      worker.postMessage({
        requestId,
        content,
        playlistId,
        sourceUrl,
      });
    } catch (error) {
      fallbackToMainThread(
        error instanceof Error ? error.message : 'Web Worker não pôde ser iniciado',
      );
    }
  });
}
