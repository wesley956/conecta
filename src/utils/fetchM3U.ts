export async function fetchM3UContent(url: string): Promise<string> {
  const cleanUrl = url.trim();

  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error('A URL precisa começar com http:// ou https://');
  }

  // Primeiro tenta direto. Pode funcionar se o servidor liberar CORS.
  try {
    const directResponse = await fetch(cleanUrl, {
      method: 'GET',
      cache: 'no-store',
    });

    if (directResponse.ok) {
      return await directResponse.text();
    }
  } catch {
    // Se falhar por CORS/Mixed Content/rede, tenta proxy dev abaixo.
  }

  // Proxy local do Vite/Codespace para desenvolvimento.
  const proxyResponse = await fetch(`/api/dev-m3u-proxy?url=${encodeURIComponent(cleanUrl)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!proxyResponse.ok) {
    const message = await proxyResponse.text().catch(() => '');
    throw new Error(message || `Não foi possível buscar a lista. HTTP ${proxyResponse.status}`);
  }

  return await proxyResponse.text();
}
