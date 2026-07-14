from pathlib import Path

path = Path('src/utils/fetchM3U.ts')
source = path.read_text(encoding='utf-8')

old_constants = """const DOWNLOAD_TIMEOUT_MS = 55_000;
const XTREAM_API_FALLBACK_TIMEOUT_MS = 45_000;"""
new_constants = """const DOWNLOAD_TIMEOUT_MS = 55_000;
const XTREAM_API_FALLBACK_TIMEOUT_MS = 45_000;
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_M3U_BYTES = 80 * 1024 * 1024;
const MAX_JSON_BYTES = 30 * 1024 * 1024;"""
if old_constants not in source:
    raise SystemExit('Bloco de constantes não encontrado.')
source = source.replace(old_constants, new_constants, 1)

helper_marker = '\n\nfunction parseXtreamSource(rawUrl: string): XtreamSourceInfo | null {'
helpers = r'''

function decodeResponseBytes(bytes: Uint8Array, contentType: string | null) {
  const charset = /charset\s*=\s*([^;\s]+)/i
    .exec(contentType || '')?.[1]
    ?.replace(/["']/g, '')
    .toLowerCase();
  const encoding = charset === 'iso-8859-1' ? 'windows-1252' : charset || 'utf-8';

  try {
    const decoded = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '');

    if (encoding === 'utf-8' && decoded.includes('\uFFFD')) {
      return new TextDecoder('windows-1252').decode(bytes).replace(/^\uFEFF/, '');
    }

    return decoded;
  } catch {
    return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  }
}

async function readTextResponse(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get('content-length') || 0);

  if (declaredLength > maxBytes) {
    throw new Error(`Resposta excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      await reader.cancel('response too large');
      throw new Error(`Resposta excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return decodeResponseBytes(bytes, response.headers.get('content-type'));
}

async function fetchWithAbort(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Tempo limite atingido após ${Math.round(timeoutMs / 1000)}s.`);
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
'''
if helper_marker not in source:
    raise SystemExit('Marcador para helpers não encontrado.')
source = source.replace(helper_marker, helpers + helper_marker, 1)

source = source.replace(
    """    responseType: 'text' as any,
    headers: REQUEST_HEADERS,""",
    """    responseType: 'text' as any,
    headers: REQUEST_HEADERS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    readTimeout: XTREAM_API_FALLBACK_TIMEOUT_MS,""",
    1,
)

old_direct_json = """async function fetchJsonDirect<T>(url: string, context: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new SeriesApiError(`${context}: a API respondeu HTTP ${response.status}.`);
  }

  const text = await response.text();
  return parseJsonOrThrow<T>(text, context);
}"""
new_direct_json = """async function fetchJsonDirect<T>(url: string, context: string): Promise<T> {
  const response = await fetchWithAbort(
    url,
    {
      method: 'GET',
      cache: 'no-store',
      headers: REQUEST_HEADERS,
    },
    XTREAM_API_FALLBACK_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new SeriesApiError(`${context}: a API respondeu HTTP ${response.status}.`);
  }

  const text = await readTextResponse(response, MAX_JSON_BYTES);
  return parseJsonOrThrow<T>(text, context);
}"""
if old_direct_json not in source:
    raise SystemExit('fetchJsonDirect não encontrado.')
source = source.replace(old_direct_json, new_direct_json, 1)

native_marker = """    responseType: 'text' as any,
    headers: REQUEST_HEADERS,
  });

  const status = Number(response.status ?? 0);
  const content ="""
native_replacement = """    responseType: 'text' as any,
    headers: REQUEST_HEADERS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    readTimeout: DOWNLOAD_TIMEOUT_MS,
  });

  const status = Number(response.status ?? 0);
  const content ="""
if native_marker not in source:
    raise SystemExit('Opções do download nativo M3U não encontradas.')
source = source.replace(native_marker, native_replacement, 1)

size_marker = """  if (status < 200 || status >= 300) {
    throw new Error(`A URL respondeu HTTP ${status}. O servidor não entregou a lista M3U no APK.`);
  }

  if (!looksLikeM3U(content)) {"""
size_replacement = """  if (status < 200 || status >= 300) {
    throw new Error(`A URL respondeu HTTP ${status}. O servidor não entregou a lista M3U no APK.`);
  }

  const contentBytes = new TextEncoder().encode(content).byteLength;
  if (contentBytes > MAX_M3U_BYTES) {
    throw new Error(`A lista excede o limite de ${Math.round(MAX_M3U_BYTES / 1024 / 1024)} MB.`);
  }

  if (!looksLikeM3U(content)) {"""
if size_marker not in source:
    raise SystemExit('Validação do download nativo não encontrada.')
source = source.replace(size_marker, size_replacement, 1)

fetch_direct_start = source.find('async function fetchDirect(url: string): Promise<string | null> {')
fetch_direct_end = source.find('\n\nexport async function fetchM3UContent', fetch_direct_start)
if fetch_direct_start < 0 or fetch_direct_end < 0:
    raise SystemExit('Bloco fetchDirect/fetchViaDevProxy não encontrado.')

network_block = """async function fetchDirect(url: string): Promise<string | null> {
  if (window.location.protocol === 'https:' && url.startsWith('http://')) {
    return null;
  }

  try {
    const response = await fetchWithAbort(
      url,
      {
        method: 'GET',
        cache: 'no-store',
      },
      DOWNLOAD_TIMEOUT_MS,
    );

    if (!response.ok) return null;
    return await readTextResponse(response, MAX_M3U_BYTES);
  } catch {
    return null;
  }
}

async function fetchViaDevProxy(url: string): Promise<string> {
  const response = await fetchWithAbort(
    `/api/dev-m3u-proxy?url=${encodeURIComponent(url)}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
    DOWNLOAD_TIMEOUT_MS,
  );

  if (!response.ok) {
    const message = await readTextResponse(response, 64 * 1024).catch(() => '');
    throw new Error(message || `Não foi possível buscar a lista. HTTP ${response.status}`);
  }

  return await readTextResponse(response, MAX_M3U_BYTES);
}"""
source = source[:fetch_direct_start] + network_block + source[fetch_direct_end:]

path.write_text(source, encoding='utf-8')
print('Hardening de rede M3U aplicado.')
