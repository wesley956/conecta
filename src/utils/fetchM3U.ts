import { Capacitor, CapacitorHttp } from '@capacitor/core';

function isNativeRuntime() {
  if (typeof window === 'undefined') return false;

  const runtime = Capacitor?.getPlatform?.();
  const capacitor = (window as any).Capacitor;

  return (
    runtime === 'android' ||
    runtime === 'ios' ||
    Boolean(Capacitor?.isNativePlatform?.()) ||
    Boolean(capacitor?.isNativePlatform?.())
  );
}

function looksLikeM3U(content: string) {
  return content.includes('#EXTM3U') || content.includes('#EXTINF');
}

function previewText(content: string) {
  return content
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

async function fetchM3UWithCapacitorHttp(url: string) {
  if (!isNativeRuntime()) return null;

  const response = await CapacitorHttp.get({
    url,
    responseType: 'text' as any,
    headers: {
      Accept: '*/*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
  });

  const status = Number(response.status ?? 0);
  const content =
    typeof response.data === 'string'
      ? response.data
      : typeof response.data === 'object'
        ? JSON.stringify(response.data)
        : String(response.data ?? '');

  if (status < 200 || status >= 300) {
    throw new Error(`A URL respondeu HTTP ${status}. O servidor não entregou a lista M3U no APK.`);
  }

  if (!looksLikeM3U(content)) {
    throw new Error(
      `A URL respondeu, mas não parece uma lista M3U. Início da resposta: "${previewText(content)}"`
    );
  }

  return content;
}



function buildCandidateUrls(rawUrl: string): string[] {
  const cleanUrl = rawUrl.trim();

  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error('A URL precisa começar com http:// ou https://');
  }

  const candidates = new Set<string>();
  candidates.add(cleanUrl);

  try {
    const parsed = new URL(cleanUrl);

    // Muitos painéis Xtream usam porta 80 com HTTP.
    // Se o usuário colar https://host:80, a conexão costuma cair/resetar.
    if (parsed.protocol === 'https:' && parsed.port === '80') {
      parsed.protocol = 'http:';
      candidates.add(parsed.toString());
    }

    // Caso inverso menos comum: porta 443 com http.
    if (parsed.protocol === 'http:' && parsed.port === '443') {
      parsed.protocol = 'https:';
      candidates.add(parsed.toString());
    }
  } catch {
    throw new Error('URL inválida.');
  }

  return [...candidates];
}

async function fetchDirect(url: string): Promise<string | null> {
  // Em página HTTPS, o navegador bloqueia HTTP direto.
  // Nesse caso, pula direto para o proxy dev.
  if (window.location.protocol === 'https:' && url.startsWith('http://')) {
    return null;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    });

    if (response.ok) return await response.text();
    return null;
  } catch {
    return null;
  }
}

async function fetchViaDevProxy(url: string): Promise<string> {
  const response = await fetch(`/api/dev-m3u-proxy?url=${encodeURIComponent(url)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Não foi possível buscar a lista. HTTP ${response.status}`);
  }

  return await response.text();
}



export async function fetchM3UContent(url: string): Promise<string> {
  const nativeContent = await fetchM3UWithCapacitorHttp(url);

  if (nativeContent) {
    return nativeContent;
  }



  const candidates = buildCandidateUrls(url);
  const errors: string[] = [];

  for (const candidate of candidates) {
    const directContent = await fetchDirect(candidate);
    if (directContent) return directContent;

    try {
      return await fetchViaDevProxy(candidate);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Falha desconhecida.');
    }
  }

  throw new Error(
    [
      'Não foi possível buscar a lista.',
      'Se a URL usa porta 80, tente HTTP em vez de HTTPS.',
      'Exemplo: http://servidor:80/get.php?...',
      errors.length ? `Detalhe: ${errors[errors.length - 1]}` : '',
    ].filter(Boolean).join(' ')
  );
}
