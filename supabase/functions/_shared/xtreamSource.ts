export type XtreamSource = {
  origin: string;
  basePath: string;
  baseUrl: string;
  hostname: string;
  username: string;
  password: string;
  output: string;
};

function normalizedBasePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/g, '');
  if (!normalized || normalized === '/') return '';

  const lastSlash = normalized.lastIndexOf('/');
  const endpoint = normalized.slice(lastSlash + 1).toLowerCase();
  if (endpoint === 'get.php' || endpoint === 'player_api.php') {
    return normalized.slice(0, lastSlash);
  }

  return normalized;
}

export function parseXtreamSource(rawUrl: string): XtreamSource | null {
  try {
    const url = new URL(rawUrl.trim());
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';
    if (!['http:', 'https:'].includes(url.protocol) || !username || !password) return null;

    const basePath = normalizedBasePath(url.pathname);
    return {
      origin: url.origin,
      basePath,
      baseUrl: `${url.origin}${basePath}`,
      hostname: url.hostname,
      username,
      password,
      output: url.searchParams.get('output') || 'mpegts',
    };
  } catch {
    return null;
  }
}

export function buildXtreamApiUrl(
  source: XtreamSource,
  action?: string,
  extra: Record<string, string | number> = {},
) {
  const target = new URL(`${source.baseUrl}/player_api.php`);
  target.searchParams.set('username', source.username);
  target.searchParams.set('password', source.password);
  if (action) target.searchParams.set('action', action);
  for (const [key, value] of Object.entries(extra)) {
    target.searchParams.set(key, String(value));
  }
  return target.toString();
}

export function buildXtreamStreamUrl(
  source: XtreamSource,
  kind: 'live' | 'movie' | 'series' | null,
  streamId: string | number,
  extension: string,
) {
  const safeExtension = String(extension || '')
    .replace(/^\.+/, '')
    .replace(/[^a-z0-9]/gi, '') || 'ts';
  const prefix = kind ? `/${kind}` : '';
  return `${source.baseUrl}${prefix}/${encodeURIComponent(source.username)}/${encodeURIComponent(source.password)}/${encodeURIComponent(String(streamId))}.${safeExtension}`;
}
