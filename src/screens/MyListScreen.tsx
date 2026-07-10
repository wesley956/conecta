import { useMemo } from 'react';
import { Bookmark, Film, Play, Star, Tv } from 'lucide-react';
import { StreamingShell } from '@/components/layout/StreamingShell';
import { ChannelCard } from '@/components/live/ChannelCard';
import { CatalogPosterCard } from '@/components/media/CatalogPosterCard';
import { useAppStore } from '@/stores/appStore';
import {
  isContinuableProgress,
  usePlaybackStore,
  withMoviePlaybackProgress,
} from '@/stores/playbackStore';
import { getMergedSeriesCatalog } from '@/utils/mergedSeriesCatalog';
import type { Channel, Movie, Series } from '@/types';
import '@/styles/library.css';

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

export function MyListScreen() {
  const channels = useAppStore(state => state.channels);
  const rawMovies = useAppStore(state => state.movies);
  const series = useAppStore(state => state.series);
  const playlists = useAppStore(state => state.playlists);
  const setScreen = useAppStore(state => state.setScreen);
  const setCurrentChannel = useAppStore(state => state.setCurrentChannel);
  const setCurrentMovie = useAppStore(state => state.setCurrentMovie);
  const setCurrentSeries = useAppStore(state => state.setCurrentSeries);
  const playbackEntries = usePlaybackStore(state => state.entries);

  const movies = useMemo(
    () => rawMovies.map(movie => withMoviePlaybackProgress(movie, playbackEntries)),
    [playbackEntries, rawMovies],
  );
  const allSeries = useMemo(
    () => getMergedSeriesCatalog(series, playlists, playbackEntries),
    [playbackEntries, playlists, series],
  );
  const favoriteChannels = useMemo(() => channels.filter(item => item.isFavorite), [channels]);
  const favoriteMovies = useMemo(() => movies.filter(item => item.isFavorite), [movies]);
  const favoriteSeries = useMemo(() => allSeries.filter(item => item.isFavorite), [allSeries]);
  const continueMovies = useMemo(() => movies.filter(item => isContinuableProgress(item.progress)), [movies]);
  const continueSeries = useMemo(() => allSeries.filter(item => isContinuableProgress(item.progress)), [allSeries]);

  const savedCount = favoriteChannels.length + favoriteMovies.length + favoriteSeries.length;
  const continueCount = continueMovies.length + continueSeries.length;

  const playChannel = (channel: Channel) => {
    setCurrentChannel(channel);
    setScreen('player');
  };

  const playMovie = (movie: Movie) => {
    setCurrentSeries(null);
    setCurrentMovie(movie);
    setScreen('player');
  };

  const openSeries = (item: Series) => {
    setCurrentMovie(null);
    setCurrentSeries(item);
    setScreen('series');
  };

  return (
    <StreamingShell>
      <div className="library-page">
        <div className="library-page-inner">
          <header className="library-header">
            <div>
              <p className="stream-kicker">Sua seleção</p>
              <h1 className="library-header-title">Minha Lista</h1>
              <p className="library-header-subtitle">
                Favoritos e conteúdos em andamento reunidos em um só lugar.
              </p>
            </div>

            <div className="library-summary">
              <span><Bookmark aria-hidden="true" size={15} /> {savedCount} salvos</span>
              <span><Play aria-hidden="true" size={15} /> {continueCount} em andamento</span>
            </div>
          </header>

          {continueCount > 0 ? (
            <section className="library-section">
              <div className="library-section-heading">
                <div>
                  <h2>Continuar assistindo</h2>
                  <p>Retome de onde parou</p>
                </div>
              </div>

              <div className="library-poster-grid">
                {continueMovies.map(movie => (
                  <CatalogPosterCard
                    key={`continue-movie-${movie.id}`}
                    image={getSafeImageUrl(movie.cover)}
                    title={movie.name}
                    meta={[movie.year > 0 ? movie.year : null, movie.category || null].filter(Boolean).join(' • ') || 'Filme'}
                    progress={movie.progress}
                    favorite={movie.isFavorite}
                    badge="Filme"
                    onClick={() => playMovie(movie)}
                  />
                ))}

                {continueSeries.map(item => (
                  <CatalogPosterCard
                    key={`continue-series-${item.id}`}
                    image={getSafeImageUrl(item.cover)}
                    title={item.name}
                    meta={item.category || 'Série'}
                    progress={item.progress}
                    favorite={item.isFavorite}
                    badge="Série"
                    onClick={() => openSeries(item)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="library-section">
            <div className="library-section-heading">
              <div>
                <h2>Canais favoritos</h2>
                <p>Seus canais salvos</p>
              </div>
              <span>{favoriteChannels.length}</span>
            </div>

            {favoriteChannels.length > 0 ? (
              <div className="library-channel-grid">
                {favoriteChannels.map(channel => (
                  <ChannelCard
                    key={channel.id}
                    logo={getSafeImageUrl(channel.logo)}
                    name={channel.name}
                    group={channel.groupTitle || channel.group || 'TV ao vivo'}
                    favorite
                    onClick={() => playChannel(channel)}
                  />
                ))}
              </div>
            ) : (
              <div className="library-empty-state">
                <Tv aria-hidden="true" size={34} strokeWidth={1.6} />
                <div>
                  <h3>Nenhum canal salvo</h3>
                  <p>Segure um canal na TV ao vivo para adicioná-lo aqui.</p>
                </div>
              </div>
            )}
          </section>

          <section className="library-section">
            <div className="library-section-heading">
              <div>
                <h2>Filmes favoritos</h2>
                <p>Títulos adicionados à sua lista</p>
              </div>
              <span>{favoriteMovies.length}</span>
            </div>

            {favoriteMovies.length > 0 ? (
              <div className="library-poster-grid">
                {favoriteMovies.map(movie => (
                  <CatalogPosterCard
                    key={movie.id}
                    image={getSafeImageUrl(movie.cover)}
                    title={movie.name}
                    meta={[movie.year > 0 ? movie.year : null, movie.category || null].filter(Boolean).join(' • ') || 'Filme'}
                    progress={movie.progress}
                    favorite
                    badge="Filme"
                    onClick={() => playMovie(movie)}
                  />
                ))}
              </div>
            ) : (
              <div className="library-empty-state">
                <Film aria-hidden="true" size={34} strokeWidth={1.6} />
                <div>
                  <h3>Nenhum filme salvo</h3>
                  <p>Adicione filmes pela página de detalhes ou segurando o pôster.</p>
                </div>
              </div>
            )}
          </section>

          <section className="library-section">
            <div className="library-section-heading">
              <div>
                <h2>Séries favoritas</h2>
                <p>Séries marcadas para assistir</p>
              </div>
              <span>{favoriteSeries.length}</span>
            </div>

            {favoriteSeries.length > 0 ? (
              <div className="library-poster-grid">
                {favoriteSeries.map(item => (
                  <CatalogPosterCard
                    key={item.id}
                    image={getSafeImageUrl(item.cover)}
                    title={item.name}
                    meta={item.category || 'Série'}
                    progress={item.progress}
                    favorite
                    badge={item.seasons.length > 0 ? `${item.seasons.length} temp.` : 'Série'}
                    onClick={() => openSeries(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="library-empty-state">
                <Star aria-hidden="true" size={34} strokeWidth={1.6} />
                <div>
                  <h3>Nenhuma série salva</h3>
                  <p>Adicione séries pela página de detalhes ou segurando o pôster.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </StreamingShell>
  );
}
