export const CACHE_BUCKET = 'playlist-cache';
export const DEMO_PLAYLIST_NAME = 'LG Review Demo';
export const DEMO_PLAYLIST_URL = 'https://conecta-five-iota.vercel.app/lg-review/demo.m3u';
export const DEMO_VERSION = 'lg-review-v2';
const APP_ORIGIN = 'https://conecta-five-iota.vercel.app';

async function uploadJson(supabase: any, path: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const { error } = await supabase.storage.from(CACHE_BUCKET).upload(path, body, {
    contentType: 'application/json',
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw new Error(`Falha ao publicar cache de homologação: ${error.message}`);
  return new TextEncoder().encode(body).byteLength;
}

function buildDemoSnapshot(playlistId: string) {
  const generatedAt = new Date().toISOString();
  const liveLogo = `${APP_ORIGIN}/lg-review/assets/live-demo.svg`;
  const bunnyCover = `${APP_ORIGIN}/lg-review/assets/big-buck-bunny.svg`;
  const sintelCover = `${APP_ORIGIN}/lg-review/assets/sintel.svg`;
  const hlsUrl = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8';
  const bunnyUrl = 'https://video.blender.org/object-storage/web_videos/bf1f3fb5-b119-4f9f-9930-8e20e892b898-480.mp4';
  const sintelUrl = 'https://video.blender.org/object-storage/web_videos/0eb052d0-fd51-43e6-aa33-ecdbf77a5d40-480.mp4';

  const channels = [{
    id: `${playlistId}-ch-1`,
    name: 'HLS Demonstration Channel',
    group: 'lg-review-live',
    groupTitle: 'LG Review — Live Demo',
    url: hlsUrl,
    playbackUrls: [hlsUrl],
    logo: liveLogo,
    epgId: 'lg-review-demo-live',
    isFavorite: false,
  }];

  const movies = [
    {
      id: `${playlistId}-mv-1`,
      name: 'Big Buck Bunny',
      year: 2008,
      duration: '09:56',
      synopsis: 'Open movie used only for LG quality-assurance playback tests. © Blender Foundation — peach.blender.org — CC BY 3.0.',
      cover: bunnyCover,
      category: 'Open Movies',
      url: bunnyUrl,
      playbackUrls: [bunnyUrl],
      isFavorite: false,
      progress: 0,
    },
    {
      id: `${playlistId}-mv-2`,
      name: 'Sintel',
      year: 2010,
      duration: '14:48',
      synopsis: 'Open movie used only for LG quality-assurance playback tests. © Blender Foundation — sintel.org — CC BY 3.0.',
      cover: sintelCover,
      category: 'Open Movies',
      url: sintelUrl,
      playbackUrls: [sintelUrl],
      isFavorite: false,
      progress: 0,
    },
  ];

  const series = [{
    id: `${playlistId}-sr-1`,
    name: 'RonecaPlayTV Review Series',
    cover: bunnyCover,
    category: 'Demonstration',
    synopsis: 'A two-episode demonstration collection prepared exclusively for the LG app review workflow.',
    seasons: [{
      number: 1,
      episodes: [
        {
          id: `${playlistId}-sr-1-ep-1`,
          number: 1,
          name: 'RonecaPlayTV Review Series S01E01 — Big Buck Bunny',
          url: bunnyUrl,
          playbackUrls: [bunnyUrl],
          duration: '09:56',
          progress: 0,
        },
        {
          id: `${playlistId}-sr-1-ep-2`,
          number: 2,
          name: 'RonecaPlayTV Review Series S01E02 — Sintel',
          url: sintelUrl,
          playbackUrls: [sintelUrl],
          duration: '14:48',
          progress: 0,
        },
      ],
    }],
    isFavorite: false,
    progress: 0,
  }];

  const playlists = [{
    id: playlistId,
    name: DEMO_PLAYLIST_NAME,
    type: 'local',
    url: DEMO_PLAYLIST_URL,
    status: 'active',
    channelCount: channels.length,
    movieCount: movies.length,
    seriesCount: series.length,
    lastSync: generatedAt,
  }];

  return { generatedAt, channels, movies, series, playlists };
}

export async function ensureDemoCache(supabase: any, playlistId: string, force = false) {
  if (!force) {
    const { data: current, error: currentError } = await supabase
      .from('panel_playlists')
      .select('playlist_cache_status, playlist_cache_version, playlist_cache_manifest_path, playlist_cache_channels_path, playlist_cache_movies_path, playlist_cache_series_path')
      .eq('id', playlistId)
      .maybeSingle();
    if (currentError) throw new Error(`Falha ao verificar catálogo de homologação: ${currentError.message}`);
    const ready = current?.playlist_cache_status === 'ready'
      && String(current?.playlist_cache_version || '').includes(DEMO_VERSION)
      && current?.playlist_cache_manifest_path
      && current?.playlist_cache_channels_path
      && current?.playlist_cache_movies_path
      && current?.playlist_cache_series_path;
    if (ready) return { reused: true, version: current.playlist_cache_version };
  }

  const snapshot = buildDemoSnapshot(playlistId);
  const manifestPath = `${playlistId}/manifest-${DEMO_VERSION}.json`;
  const channelsPath = `${playlistId}/channels-${DEMO_VERSION}.json`;
  const moviesPath = `${playlistId}/movies-${DEMO_VERSION}.json`;
  const seriesPath = `${playlistId}/series-${DEMO_VERSION}.json`;
  const itemCount = snapshot.channels.length + snapshot.movies.length + snapshot.series.length;
  const version = `${snapshot.generatedAt}-${DEMO_VERSION}`;

  const manifest = {
    schemaVersion: 2,
    generatedAt: snapshot.generatedAt,
    playlistId,
    playlistName: DEMO_PLAYLIST_NAME,
    playlistUrl: DEMO_PLAYLIST_URL,
    version,
    counts: { channels: 1, movies: 2, series: 1, total: itemCount },
    files: { manifest: manifestPath, channels: channelsPath, movies: moviesPath, series: seriesPath },
  };

  const [manifestBytes, channelsBytes, moviesBytes, seriesBytes] = await Promise.all([
    uploadJson(supabase, manifestPath, manifest),
    uploadJson(supabase, channelsPath, {
      schemaVersion: 2,
      generatedAt: snapshot.generatedAt,
      playlistId,
      playlistName: DEMO_PLAYLIST_NAME,
      playlistUrl: DEMO_PLAYLIST_URL,
      playlists: snapshot.playlists,
      channels: snapshot.channels,
    }),
    uploadJson(supabase, moviesPath, {
      schemaVersion: 2,
      generatedAt: snapshot.generatedAt,
      playlistId,
      playlistName: DEMO_PLAYLIST_NAME,
      playlistUrl: DEMO_PLAYLIST_URL,
      movies: snapshot.movies,
    }),
    uploadJson(supabase, seriesPath, {
      schemaVersion: 2,
      generatedAt: snapshot.generatedAt,
      playlistId,
      playlistName: DEMO_PLAYLIST_NAME,
      playlistUrl: DEMO_PLAYLIST_URL,
      series: snapshot.series,
    }),
  ]);

  const sizeBytes = manifestBytes + channelsBytes + moviesBytes + seriesBytes;
  const { error } = await supabase.from('panel_playlists').update({
    playlist_cache_status: 'ready',
    playlist_cache_path: manifestPath,
    playlist_cache_manifest_path: manifestPath,
    playlist_cache_channels_path: channelsPath,
    playlist_cache_movies_path: moviesPath,
    playlist_cache_series_path: seriesPath,
    playlist_cache_version: version,
    playlist_cache_updated_at: snapshot.generatedAt,
    playlist_cache_item_count: itemCount,
    playlist_cache_size_bytes: sizeBytes,
    playlist_cache_error: null,
    playlist_updated_at: snapshot.generatedAt,
  }).eq('id', playlistId);
  if (error) throw new Error(`Falha ao concluir catálogo de homologação: ${error.message}`);

  return { reused: false, itemCount, sizeBytes, version };
}
