from pathlib import Path
import re


def replace_once(path, old, new):
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path}: esperado 1 trecho, encontrado {count}: {old[:90]!r}')
    file.write_text(source.replace(old, new, 1))


def replace_all_exact(path, old, new, expected):
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != expected:
        raise SystemExit(f'{path}: esperado {expected} trechos, encontrado {count}: {old[:90]!r}')
    file.write_text(source.replace(old, new))


def regex_once(path, pattern, replacement):
    file = Path(path)
    source = file.read_text()
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: regex não encontrou exatamente um trecho: {pattern[:90]!r}')
    file.write_text(updated)


device = 'supabase/functions/device-config-qualified/index.ts'
relation = '''playlist:panel_playlists(
          id,
          playlist_url,
          playlist_type,
          active,
          tls_mode,
          tls_allowed_hosts,
          tls_allow_subdomains,
          tls_allow_redirect_hosts,
          tls_scope_validation,
          tls_scope_cache,
          tls_scope_catalog,
          tls_scope_playback,
          connection_profile:panel_playlist_connection_profiles(
            custom_ca_pem,
            request_headers,
            timeout_ms,
            follow_redirects
          )
        )'''
replace_once(device, 'playlist:panel_playlists(id, playlist_url, playlist_type, active),', relation + ',')
replace_once(device, 'playlist:panel_playlists(id, playlist_url, playlist_type, active)\n      )', relation + '\n      )')
replace_once(device, '''      playlist_updated_at,
      playlist_direct_confirmed_device_id
''', '''      playlist_updated_at,
      playlist_direct_confirmed_device_id,
      tls_mode,
      tls_allowed_hosts,
      tls_allow_subdomains,
      tls_allow_redirect_hosts,
      tls_scope_validation,
      tls_scope_cache,
      tls_scope_catalog,
      tls_scope_playback,
      connection_profile:panel_playlist_connection_profiles(
        custom_ca_pem,
        request_headers,
        timeout_ms,
        follow_redirects
      )
''')
helpers = r'''
const BLOCKED_SOURCE_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'proxy-connection',
  'upgrade',
]);

function connectionProfile(playlist: any) {
  const raw = playlist?.connection_profile;
  return Array.isArray(raw) ? raw[0] || null : raw || null;
}

function sourceHost(sourceUrl: unknown) {
  try {
    const parsed = new URL(String(sourceUrl || ''));
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

function safeSourceHeaders(profile: any) {
  const raw = profile?.request_headers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const header = String(name || '').trim();
    const normalized = header.toLowerCase();
    const content = String(value ?? '').trim();
    if (!/^[A-Za-z0-9-]{1,80}$/.test(header)) continue;
    if (BLOCKED_SOURCE_HEADERS.has(normalized) || !content) continue;
    result[header] = content.slice(0, 2048);
  }
  return result;
}

function playlistNetworkPolicy(playlist: any) {
  const profile = connectionProfile(playlist);
  const requestedMode = text(playlist?.tls_mode) || 'strict';
  const tlsMode = ['strict', 'custom_ca', 'insecure'].includes(requestedMode)
    ? requestedMode
    : 'strict';
  const hosts = new Set<string>();
  for (const raw of Array.isArray(playlist?.tls_allowed_hosts) ? playlist.tls_allowed_hosts : []) {
    const host = String(raw || '').trim().toLowerCase().split(':')[0];
    if (host) hosts.add(host);
  }
  const originHost = sourceHost(playlist?.playlist_url);
  if (originHost) hosts.add(originHost);

  return {
    tlsMode,
    allowedHosts: [...hosts],
    allowSubdomains: playlist?.tls_allow_subdomains === true,
    allowRedirectHosts: playlist?.tls_allow_redirect_hosts === true,
    scopes: {
      validation: playlist?.tls_scope_validation !== false,
      cache: playlist?.tls_scope_cache !== false,
      catalog: playlist?.tls_scope_catalog !== false,
      playback: playlist?.tls_scope_playback !== false,
    },
    customCaPem: tlsMode === 'custom_ca' ? text(profile?.custom_ca_pem) : null,
    requestHeaders: safeSourceHeaders(profile),
    followRedirects: profile?.follow_redirects !== false,
    timeoutMs: Math.max(1000, Math.min(180000, Number(profile?.timeout_ms) || 45000)),
  };
}
'''
replace_once(device, '''function directParts(sourceUrl: string) {
  const marked = `${sourceUrl.split(DIRECT_MARKER)[0]}${DIRECT_MARKER}`;
  return {
    manifestUrl: null,
    channelsUrl: marked,
    moviesUrl: marked,
    seriesUrl: marked,
  };
}
''', '''function directParts(sourceUrl: string) {
  const marked = `${sourceUrl.split(DIRECT_MARKER)[0]}${DIRECT_MARKER}`;
  return {
    manifestUrl: null,
    channelsUrl: marked,
    moviesUrl: marked,
    seriesUrl: marked,
  };
}
''' + helpers)
new_source_functions = r'''function sourceMap(device: any) {
  const sources = new Map<string, { url: string; type: string; networkPolicy: Record<string, unknown> }>();
  const legacy = Array.isArray(device?.playlist) ? device.playlist[0] : device?.playlist;
  if (legacy?.id && legacy?.active !== false && text(legacy.playlist_url)) {
    sources.set(String(legacy.id), {
      url: String(legacy.playlist_url),
      type: text(legacy.playlist_type) || 'm3u',
      networkPolicy: playlistNetworkPolicy(legacy),
    });
  }
  for (const assignment of device?.device_playlists || []) {
    if (assignment?.active === false) continue;
    const playlist = Array.isArray(assignment?.playlist) ? assignment.playlist[0] : assignment?.playlist;
    if (!playlist?.id || playlist.active === false || !text(playlist.playlist_url)) continue;
    sources.set(String(playlist.id), {
      url: String(playlist.playlist_url),
      type: text(playlist.playlist_type) || 'm3u',
      networkPolicy: playlistNetworkPolicy(playlist),
    });
  }
  return sources;
}

function injectCommercialDirectSources(payload: any, device: any) {
  const sources = sourceMap(device);
  const playlists = Array.isArray(payload.playlists)
    ? payload.playlists.map((item: any) => {
        const id = text(item?.id);
        const source = id ? sources.get(id) : null;
        if (!source) return item;
        const enriched = {
          ...item,
          type: text(item?.type) || source.type,
          networkPolicy: source.networkPolicy,
        };
        const cacheReady = item?.cacheReady === true
          || Boolean(item?.cacheParts?.channelsUrl || item?.cacheSnapshotUrl);
        if (cacheReady || item?.accessMode !== 'direct') return enriched;
        return {
          ...enriched,
          type: source.type,
          cacheParts: directParts(source.url),
          cacheReady: true,
          directFallback: true,
        };
      })
    : [];
  const selectedId = text(payload.selectedPlaylistId);
  const selected = selectedId ? playlists.find((item: any) => String(item?.id) === selectedId) : null;
  const usingDirect = playlists.some((item: any) => item?.directFallback === true);
  return {
    ...payload,
    playlists,
    cacheParts: selected?.cacheParts || payload.cacheParts || null,
    directPlaylistFallbackAllowed: usingDirect,
    message: usingDirect
      ? 'Cache indisponível neste provedor. O aplicativo usará a conexão direta homologada.'
      : payload.message,
  };
}
'''
regex_once(device, r'function sourceMap\(device: any\) \{.*?\n\}\n\nfunction injectCommercialDirectSources\(payload: any, device: any\) \{.*?\n\}\n', new_source_functions)
replace_once(device, '''        directFallback: true,
        cacheParts: parts,
''', '''        directFallback: true,
        cacheParts: parts,
        networkPolicy: playlistNetworkPolicy(playlist),
''')

cache = 'supabase/functions/playlist-cache/index.ts'
replace_once(cache, "import { safeFetchPlaylistText } from '../_shared/outboundFetch.ts';\n", "import { fetchUniversalPlaylistText } from '../_shared/universalOutboundFetch.ts';\n")
fetch_block = r'''const BLOCKED_CACHE_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'proxy-connection',
  'upgrade',
]);

function cacheConnectionProfile(playlist: any) {
  const raw = playlist?.connection_profile;
  return Array.isArray(raw) ? raw[0] || null : raw || null;
}

function cacheRequestHeaders(playlist: any, defaults: Record<string, string>) {
  const result: Record<string, string> = { ...defaults };
  const raw = cacheConnectionProfile(playlist)?.request_headers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [name, value] of Object.entries(raw)) {
    const header = String(name || '').trim();
    const normalized = header.toLowerCase();
    const content = String(value ?? '').trim();
    if (!/^[A-Za-z0-9-]{1,80}$/.test(header)) continue;
    if (BLOCKED_CACHE_HEADERS.has(normalized) || !content) continue;
    result[header] = content.slice(0, 2048);
  }
  return result;
}

function cacheFetchOptions(
  playlist: any,
  label: string,
  maxBytes: number,
  defaults: Record<string, string>,
  allowedOrigin?: string,
) {
  const profile = cacheConnectionProfile(playlist);
  const requested = text(playlist?.tls_mode, 'strict');
  const mode = playlist?.tls_scope_cache === false
    ? 'strict'
    : ['strict', 'custom_ca', 'insecure'].includes(requested) ? requested : 'strict';
  const hosts = new Set<string>();
  for (const raw of Array.isArray(playlist?.tls_allowed_hosts) ? playlist.tls_allowed_hosts : []) {
    const host = String(raw || '').trim().toLowerCase().split(':')[0];
    if (host) hosts.add(host);
  }
  try {
    hosts.add(new URL(String(playlist?.playlist_url || '')).hostname.toLowerCase());
  } catch {
    // A validação principal produzirá uma mensagem específica para URL inválida.
  }
  return {
    label,
    timeoutMs: Math.max(1000, Math.min(180000, Number(profile?.timeout_ms) || 60000)),
    maxBytes,
    allowedOrigins: allowedOrigin ? [allowedOrigin] : undefined,
    headers: cacheRequestHeaders(playlist, defaults),
    followRedirects: profile?.follow_redirects !== false,
    tlsMode: mode as 'strict' | 'custom_ca' | 'insecure',
    customCaPem: mode === 'custom_ca' ? text(profile?.custom_ca_pem) || null : null,
    allowedTlsHosts: [...hosts],
    allowSubdomains: playlist?.tls_allow_subdomains === true,
    allowRedirectHosts: playlist?.tls_allow_redirect_hosts === true,
  };
}

async function fetchJson(url: string, label: string, playlist: any, allowedOrigin?: string) {
  const raw = await fetchUniversalPlaylistText(url, cacheFetchOptions(
    playlist,
    label,
    30 * 1024 * 1024,
    {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
    allowedOrigin,
  ));

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label}: resposta não é JSON.`);
  }
}

async function fetchText(url: string, label: string, playlist: any) {
  return await fetchUniversalPlaylistText(url, cacheFetchOptions(
    playlist,
    label,
    80 * 1024 * 1024,
    {
      Accept: '*/*',
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    },
  ));
}
'''
regex_once(cache, r'async function fetchJson\(url: string, label: string, allowedOrigin\?: string\) \{.*?\n\}\n\nasync function fetchText\(url: string, label: string\) \{.*?\n\}\n', fetch_block)
replace_all_exact(cache, "fetchJson(buildXtreamApiUrl(source), 'Login Xtream', source.origin)", "fetchJson(buildXtreamApiUrl(source), 'Login Xtream', playlist, source.origin)", 1)
for action, label in [
    ('get_live_categories', 'Categorias de canais'),
    ('get_vod_categories', 'Categorias de filmes'),
    ('get_series_categories', 'Categorias de séries'),
    ('get_live_streams', 'Canais'),
    ('get_vod_streams', 'Filmes'),
    ('get_series', 'Séries'),
]:
    old = f"fetchJson(buildXtreamApiUrl(source, '{action}'), '{label}', source.origin)"
    new = f"fetchJson(buildXtreamApiUrl(source, '{action}'), '{label}', playlist, source.origin)"
    replace_all_exact(cache, old, new, 1)
replace_once(cache, "const raw = await fetchText(playlist.playlist_url, 'Lista M3U');", "const raw = await fetchText(playlist.playlist_url, 'Lista M3U', playlist);")
old_select = "id, name, playlist_url, playlist_type, active, playlist_updated_at, playlist_cache_status, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path, playlist_cache_item_count"
new_select = "id, name, playlist_url, playlist_type, active, playlist_updated_at, playlist_cache_status, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path, playlist_cache_item_count, tls_mode, tls_allowed_hosts, tls_allow_subdomains, tls_allow_redirect_hosts, tls_scope_cache, connection_profile:panel_playlist_connection_profiles(custom_ca_pem, request_headers, timeout_ms, follow_redirects)"
replace_once(cache, old_select, new_select)
old_all = "id, name, playlist_url, playlist_type, active, playlist_updated_at, playlist_cache_updated_at, playlist_cache_status, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path, playlist_cache_item_count"
new_all = "id, name, playlist_url, playlist_type, active, playlist_updated_at, playlist_cache_updated_at, playlist_cache_status, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path, playlist_cache_item_count, tls_mode, tls_allowed_hosts, tls_allow_subdomains, tls_allow_redirect_hosts, tls_scope_cache, connection_profile:panel_playlist_connection_profiles(custom_ca_pem, request_headers, timeout_ms, follow_redirects)"
replace_once(cache, old_all, new_all)

print('Server network patches applied')
