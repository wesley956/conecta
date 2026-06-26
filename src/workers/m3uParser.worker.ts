import { parseM3U, type ParsedM3UResult } from '@/utils/m3u';

type ParseRequest = {
  requestId: string;
  content: string;
  playlistId: string;
  sourceUrl: string;
};

type ParseResponse =
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

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { requestId, content, playlistId, sourceUrl } = event.data;

  try {
    const result = parseM3U(content, playlistId, sourceUrl);

    self.postMessage({
      requestId,
      ok: true,
      result,
    } satisfies ParseResponse);
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao organizar lista M3U.',
    } satisfies ParseResponse);
  }
};

export {};
