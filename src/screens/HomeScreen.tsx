import { useMemo, type CSSProperties } from 'react';
import { Film, Play, Tv } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import {
  getPlaybackEntry,
  isContinuableProgress,
  usePlaybackStore,
  withMoviePlaybackProgress,
  type PlaybackProgressEntry,
} from '@/stores/playbackStore';
import { StreamingShell } from '@/components/layout/StreamingShell';
import { MediaRail } from '@/components/media/MediaRail';
import { PosterCard } from '@/components/media/PosterCard';
import { ChannelCard } from '@/components/live/ChannelCard';
import { getMergedSeriesCatalog } from '@/utils/mergedSeriesCatalog';
import type { Episode, Movie, Season, Series } from '@/types';

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

type HomeMediaItem = {
  type: 'movie' | 'series';
  id: string;
  title: string;
  image?: string;
  meta: string;
  favorite?: boolean;
  progress?: number;
  watchedAt?: string;
  resumeEntry?: PlaybackProgressEntry;
  source: Movie | Series;
};

interface SeriesEpisodeMatch {
  season: Season;
  episode: Episode;
}

function findEpisodeForEntry(item: Series, entry: PlaybackProgressEntry): SeriesEpisodeMatch | null {
  for (const season of item.seasons) {
    const episodeById = season.episodes.find(episode => episode.id === entry.contentId);
    if (episodeById) return { season, episode: episodeById };
  }

  if (entry.seasonNumber === undefined || entry.episodeNumber === undefined) return null;

  const season = item.seasons.find(candidate => candidate.number === entry.seasonNumber);
  const episode = season?.episodes.find(candidate => candidate.number === entry.episodeNumber);
  return season && episode ? { season, episode } : null;
}

function makeEpisodeMovie(
  item: Series,
  match: SeriesEpisodeMatch,
  entry: PlaybackProgressEntry,
): Movie {
  return {
    id: match.episode.id,
    name: `${item.name} - T${match.season.number}E${match.episode.number}`,
    year: 0,
    duration: match.episode.duration,
    synopsis: item.synopsis,
    cover: item.cover,
    category: item.category,
    url: match.episode.url,
    playbackUrls: match.episode.playbackUrls,
    progress: entry.progress,
    isFavorite: item.isFavorite,
  };
}

export function HomeScreen() {
  const {
    channels,
    movies: rawMovies,
    series: rawSeries,
    playlists,
    setScreen,
    setCurrentChannel,
    setCurrentMovie,
    setCurrentSeries,
    deviceCode,
    daysRemaining,
  } = useAppStore();
  const playbackEntries = usePlaybackStore(state => state.entries);

  const movies = useMemo(
    () => rawMovies.map(movie => withMoviePlaybackProgress(movie, playbackEntries)),
    [playbackEntries, rawMovies],
  );
  const series = useMemo(
    () => getMergedSeriesCatalog(rawSeries, playlists, playbackEntries),
    [playbackEntries, playlists, rawSeries],
  );

  const featured = useMemo(() => {
    const movie = movies.find(item => getSafeImageUrl(item.cover));

    if (movie) {
      return {
        type: 'movie' as const,
        title: movie.name,
        description: movie.synopsis || 'Descubra este destaque no catálogo de filmes.',
        image: getSafeImageUrl(movie.cover),
        category: movie.category || 'Filme',
        detail: [movie.year || null, movie.duration || null].filter(Boolean).join(' • '),
      };
    }

    const item = series.find(entry => getSafeImageUrl(entry.cover));

    if (item) {
      return {
        type: 'series' as const,
        title: item.name,
        description: item.synopsis || 'Descubra este destaque no catálogo de séries.',
        image: getSafeImageUrl(item.cover),
        category: item.category || 'Série',
        detail: item.seasons.length > 0 ? `${item.seasons.length} temporada(s)` : 'Catálogo de séries',
      };
    }

    return {
      type: 'channels' as const,
      title: 'Sua programação em um só lugar',
      description: 'Acesse TV ao vivo, filmes, séries e sua lista com uma navegação simples e cinematográfica.',
      image: undefined,
      category: 'RonecaPlayTV',
      detail: `${channels.length} canal(is) disponíveis`,
    };
  }, [channels.length, movies, series]);

  const continueItems = useMemo<HomeMediaItem[]>(() => {
    const movieItems: HomeMediaItem[] = movies.flatMap(item => {
      const entry = getPlaybackEntry(playbackEntries, 'movie', item.id);
      if (!entry || !isContinuableProgress(entry.progress)) return [];

      return [{
        type: 'movie',
        id: item.id,
        title: item.name,
        image: getSafeImageUrl(item.cover),
        meta: item.category || 'Filme',
        favorite: item.isFavorite,
        progress: entry.progress,
        watchedAt: entry.watchedAt,
        resumeEntry: entry,
        source: item,
      }];
    });

    const seriesItems: HomeMediaItem[] = series.flatMap(item => {
      const entry = Object.values(playbackEntries)
        .filter(candidate => (
          candidate.contentType === 'episode' &&
          candidate.seriesId === item.id &&
          isContinuableProgress(candidate.progress)
        ))
        .sort((a, b) => Date.parse(b.watchedAt) - Date.parse(a.watchedAt))[0];

      if (!entry) return [];

      const match = findEpisodeForEntry(item, entry);
      if (!match) return [];

      return [{
        type: 'series',
        id: item.id,
        title: item.name,
        image: getSafeImageUrl(item.cover),
        meta: `T${match.season.number} • E${match.episode.number}`,
        favorite: item.isFavorite,
        progress: entry.progress,
        watchedAt: entry.watchedAt,
        resumeEntry: entry,
        source: item,
      }];
    });

    return [...movieItems, ...seriesItems]
      .sort((a, b) => Date.parse(b.watchedAt || '') - Date.parse(a.watchedAt || ''))
      .slice(0, 14);
  }, [movies, playbackEntries, series]);

  const favoriteItems = useMemo<HomeMediaItem[]>(() => {
    const movieItems: HomeMediaItem[] = movies
      .filter(item => item.isFavorite)
      .map(item => ({
        type: 'movie',
        id: item.id,
        title: item.name,
        image: getSafeImageUrl(item.cover),
        meta: item.category || 'Filme',
        favorite: true,
        progress: item.progress,
        source: item,
      }));

    const seriesItems: HomeMediaItem[] = series
      .filter(item => item.isFavorite)
      .map(item => ({
        type: 'series',
        id: item.id,
        title: item.name,
        image: getSafeImageUrl(item.cover),
        meta: item.category || 'Série',
        favorite: true,
        progress: item.progress,
        source: item,
      }));

    return [...movieItems, ...seriesItems].slice(0, 14);
  }, [movies, series]);

  const openMedia = (item: HomeMediaItem) => {
    if (item.type === 'movie') {
      setCurrentMovie(item.source as Movie);
      setCurrentSeries(null);
      setScreen('movies');
      return;
    }

    setCurrentSeries(item.source as Series);
    setCurrentMovie(null);
    setScreen('series');
  };

  const resumeMedia = (item: HomeMediaItem) => {
    if (item.type === 'movie') {
      setCurrentSeries(null);
      setCurrentMovie(item.source as Movie);
      setScreen('player');
      return;
    }

    const seriesItem = item.source as Series;
    const entry = item.resumeEntry;
    const match = entry ? findEpisodeForEntry(seriesItem, entry) : null;

    if (!entry || !match) {
      openMedia(item);
      return;
    }

    setCurrentSeries(seriesItem);
    setCurrentMovie(makeEpisodeMovie(seriesItem, match, entry));
    setScreen('player');
  };

  const openFeatured = () => {
    if (featured.type === 'movie') {
      setScreen('movies');
      return;
    }

    if (featured.type === 'series') {
      setScreen('series');
      return;
    }

    setScreen('channels');
  };

  const heroStyle = {
    '--stream-hero-image': featured.image ? `url("${featured.image.replace(/"/g, '%22')}")` : 'none',
  } as CSSProperties;

  return (
    <StreamingShell>
      <div className="stream-scroll-page">
        <div className="stream-page-inner">
          <header className="stream-home-header">
            <div>
              <p className="stream-kicker">RonecaPlayTV</p>
              <h1 className="stream-page-title">Início</h1>
            </div>

            <div className="stream-status-chip">
              <span className="stream-status-dot" />
              <span>{deviceCode || 'Aparelho ativo'}</span>
              <span>•</span>
              <span>{daysRemaining > 0 ? `${daysRemaining} dias` : 'Verificar acesso'}</span>
            </div>
          </header>

          <section className="stream-hero" style={heroStyle}>
            <div className="stream-hero-fallback" />

            <div className="stream-hero-content">
              <div className="stream-hero-meta">
                <span>{featured.category}</span>
                <span>{featured.detail}</span>
              </div>

              <h2 className="stream-hero-title">{featured.title}</h2>
              <p className="stream-hero-description">{featured.description}</p>

              <div className="stream-hero-actions">
                <button type="button" className="stream-primary-button" onClick={openFeatured}>
                  <Play aria-hidden="true" size={17} fill="currentColor" />
                  {featured.type === 'channels' ? 'Assistir TV' : 'Explorar catálogo'}
                </button>

                <button type="button" className="stream-secondary-button" onClick={() => setScreen('channels')}>
                  <Tv aria-hidden="true" size={17} />
                  TV ao vivo
                </button>
              </div>
            </div>
          </section>

          {continueItems.length > 0 ? (
            <MediaRail
              title="Continuar assistindo"
              subtitle="Retome de onde parou"
              actionLabel="Ver Minha Lista"
              onAction={() => setScreen('favorites')}
            >
              {continueItems.map(item => (
                <PosterCard
                  key={`${item.type}-${item.id}`}
                  image={item.image}
                  title={item.title}
                  meta={item.meta}
                  favorite={item.favorite}
                  progress={item.progress}
                  badge={item.type === 'movie' ? 'Filme' : 'Série'}
                  onClick={() => resumeMedia(item)}
                />
              ))}
            </MediaRail>
          ) : null}

          <MediaRail
            title="TV ao vivo"
            subtitle="Canais disponíveis na sua lista"
            actionLabel="Ver todos"
            onAction={() => setScreen('channels')}
            className="stream-channel-rail"
            empty={channels.length === 0}
            emptyText="Os canais aparecerão aqui quando a lista estiver carregada."
          >
            {channels.slice(0, 12).map(channel => (
              <ChannelCard
                key={channel.id}
                logo={getSafeImageUrl(channel.logo)}
                name={channel.name}
                group={channel.groupTitle || channel.group}
                favorite={channel.isFavorite}
                onClick={() => {
                  setCurrentChannel(channel);
                  setScreen('player');
                }}
              />
            ))}
          </MediaRail>

          <MediaRail
            title="Filmes"
            subtitle="Destaques do seu catálogo"
            actionLabel="Ver todos"
            onAction={() => setScreen('movies')}
            empty={movies.length === 0}
            emptyText="Os filmes aparecerão aqui quando o catálogo estiver carregado."
          >
            {movies.slice(0, 14).map(movie => (
              <PosterCard
                key={movie.id}
                image={getSafeImageUrl(movie.cover)}
                title={movie.name}
                meta={[movie.year || null, movie.category || null].filter(Boolean).join(' • ') || 'Filme'}
                favorite={movie.isFavorite}
                progress={movie.progress}
                badge="Filme"
                onClick={() => openMedia({
                  type: 'movie',
                  id: movie.id,
                  title: movie.name,
                  image: getSafeImageUrl(movie.cover),
                  meta: movie.category,
                  favorite: movie.isFavorite,
                  progress: movie.progress,
                  source: movie,
                })}
              />
            ))}
          </MediaRail>

          <MediaRail
            title="Séries"
            subtitle="Temporadas e episódios"
            actionLabel="Ver todas"
            onAction={() => setScreen('series')}
            empty={series.length === 0}
            emptyText="As séries aparecerão aqui quando o catálogo estiver carregado."
          >
            {series.slice(0, 14).map(item => (
              <PosterCard
                key={item.id}
                image={getSafeImageUrl(item.cover)}
                title={item.name}
                meta={item.category || 'Série'}
                favorite={item.isFavorite}
                progress={item.progress}
                badge="Série"
                onClick={() => openMedia({
                  type: 'series',
                  id: item.id,
                  title: item.name,
                  image: getSafeImageUrl(item.cover),
                  meta: item.category,
                  favorite: item.isFavorite,
                  progress: item.progress,
                  source: item,
                })}
              />
            ))}
          </MediaRail>

          {favoriteItems.length > 0 ? (
            <MediaRail
              title="Minha Lista"
              subtitle="Seus filmes e séries favoritos"
              actionLabel="Abrir lista"
              onAction={() => setScreen('favorites')}
            >
              {favoriteItems.map(item => (
                <PosterCard
                  key={`${item.type}-${item.id}`}
                  image={item.image}
                  title={item.title}
                  meta={item.meta}
                  favorite
                  progress={item.progress}
                  badge={item.type === 'movie' ? 'Filme' : 'Série'}
                  onClick={() => openMedia(item)}
                />
              ))}
            </MediaRail>
          ) : null}

          <section className="stream-section">
            <div className="stream-section-heading">
              <div>
                <h2 className="stream-section-title">Explorar</h2>
                <p className="stream-section-subtitle">Acesso rápido aos catálogos</p>
              </div>
            </div>

            <div className="stream-hero-actions">
              <button type="button" className="stream-secondary-button" onClick={() => setScreen('movies')}>
                <Film aria-hidden="true" size={17} /> Filmes
              </button>
              <button type="button" className="stream-secondary-button" onClick={() => setScreen('series')}>
                Séries
              </button>
              <button type="button" className="stream-secondary-button" onClick={() => setScreen('favorites')}>
                Minha Lista
              </button>
            </div>
          </section>
        </div>
      </div>
    </StreamingShell>
  );
}
