export type EncodedCachePart = {
  body: string;
  sizeBytes: number;
  sha256: string;
};

export type UploadedCachePart = Omit<EncodedCachePart, 'body'> & {
  path: string;
};

export type CacheManifestInput = {
  schemaVersion: number;
  generatedAt: string;
  playlistId: string;
  playlistName: string;
  attemptId: string;
  version: string;
  counts: {
    channels: number;
    movies: number;
    series: number;
    total: number;
  };
  channels: UploadedCachePart;
  movies: UploadedCachePart;
  series: UploadedCachePart;
  manifestPath: string;
};

const encoder = new TextEncoder();
const INTERNAL_FALLBACK_TEXTS = new Set([
  'Filme autorizado pelo painel.',
  'Filme importado da lista M3U autorizada.',
]);

function sanitizeCachePayload(value: unknown): unknown {
  if (typeof value === 'string') {
    return INTERNAL_FALLBACK_TEXTS.has(value.trim()) ? '' : value;
  }
  if (Array.isArray(value)) return value.map(sanitizeCachePayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, sanitizeCachePayload(entry)]),
    );
  }
  return value;
}

export async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(hash)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function encodeJsonCachePart(payload: unknown): Promise<EncodedCachePart> {
  const body = typeof payload === 'string'
    ? payload
    : JSON.stringify(sanitizeCachePayload(payload));
  return {
    body,
    sizeBytes: encoder.encode(body).byteLength,
    sha256: await sha256Hex(body),
  };
}

export function buildCacheManifest(input: CacheManifestInput) {
  return {
    schemaVersion: input.schemaVersion,
    generatedAt: input.generatedAt,
    playlistId: input.playlistId,
    playlistName: input.playlistName,
    attemptId: input.attemptId,
    version: input.version,
    counts: input.counts,
    files: {
      manifest: input.manifestPath,
      channels: input.channels.path,
      movies: input.movies.path,
      series: input.series.path,
    },
    integrity: {
      algorithm: 'sha256',
      channels: {
        sha256: input.channels.sha256,
        bytes: input.channels.sizeBytes,
      },
      movies: {
        sha256: input.movies.sha256,
        bytes: input.movies.sizeBytes,
      },
      series: {
        sha256: input.series.sha256,
        bytes: input.series.sizeBytes,
      },
    },
  };
}
