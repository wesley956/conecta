import { useDeferredValue, useMemo, useState } from 'react';
import { Film, Search, Tv, X } from 'lucide-react';
import { StreamingShell } from '@/components/layout/StreamingShell';
import { ChannelCard } from '@/components/live/ChannelCard';
import { CatalogPosterCard } from '@/components/media/CatalogPosterCard';
import { useAppStore } from '@/stores/appStore';
import { getMergedSeriesCatalog } from '@/utils/mergedSeriesCatalog';
import type { Channel, Movie, Series } from '@/types';
import '@/styles/library.css';

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

type SearchFilter = 'all' | 'channels' | 'movies' | 'series';

export function SearchScreen() {
  const channels = useAppStore(state => state.channels);
  const movies = useAppStore(state => state.movies);
  const series = useAppStore(state => state.series);
  const playlists = useAppStore(state => state.playlists);
  const setScreen = useAppStore(state => state.setScreen);
  const setCurrentChannel = useAppStore(state => state.setCurrentChannel);
  const setCurrentMovie = useAppStore(state => state.setCurrentMovie);
  const setCurrentSeries = useAppStore(state => state.setCurrentSeries);

  const [query, setQuery] = useState(() => window.sessionStorage.getItem('roneca:search:query') ?? '');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearch(deferredQuery);
  const allSeries = useMemo(() => getMergedSeriesCatalog(series, playlists), [playlists, series]);

  const results = useMemo(() => {
    if (!normalizedQuery) {
      return { channels: [] as Channel[], movies: [] as Movie[], series: [] as Series[] };
    }

    return {
      channels: channels.filter(item => (
        normalizeSearch(`${item.name} ${item.groupTitle || ''} ${item.group || ''}`).includes(normalizedQuery)
      )).slice(0, 30),
      movies: movies.filter(item => (
        normalizeSearch(`${item.name} ${item.category || ''} ${item.year || ''} ${item.synopsis || ''}`).includes(normalizedQuery)
      )).slice(0, 30),
      series: allSeries.filter(item => (
        normalizeSearch(`${item.name} ${item.category || ''} ${item.synopsis || ''}`).includes(normalizedQuery)
      )).slice(0, 30),
    };
  }, [allSeries, channels, movies, normalizedQuery]);

  const visibleChannels = filter === 'all' || filter === 'channels';
  const visibleMovies = filter === 'all' || filter === 'movies';
  const visibleSeries = filter === 'all' || filter === 'series';
  const totalResults = results.channels.length + results.movies.length + results.series.length;

  const updateQuery = (value: string) => {
    setQuery(value);
    window.sessionStorage.setItem('roneca:search:query', value);
  };

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

  const filters: Array<{ id: SearchFilter; label: string; count: number }> = [
    { id: 'all', label: 'Tudo', count: totalResults },
    { id: 'channels', label: 'Canais', count: results.channels.length },
    { id: 'movies', label: 'Filmes', count: results.movies.length },
    { id: 'series', label: 'Séries', count: results.series.length },
  ];

  return (
    <StreamingShell>
      <div className="global-search-page">
        <div className="global-search-inner">
          <header className="global-search-header">
            <div>
              <p className="stream-kicker">Pesquisa global</p>
              <h1>Buscar</h1>
              <p>Encontre canais, filmes e séries da lista vinculada.</p>
            </div>
          </header>

          <label className="global-search-field">
            <Search aria-hidden="true" size={22} strokeWidth={2.1} />
            <input
              value={query}
              onChange={event => updateQuery(event.target.value)}
              autoFocus
              placeholder="Digite o nome de um canal, filme ou série"
              aria-label="Buscar em todo o aplicativo"
            />
            {query ? (
              <button type="button" onClick={() => updateQuery('')} aria-label="Limpar busca">
                <X aria-hidden="true" size={17} strokeWidth={2.4} />
              </button>
            ) : null}
          </label>

          {normalizedQuery ? (
            <nav className="global-search-filters" aria-label="Filtrar resultados">
              {filters.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? 'is-active' : ''}
                  onClick={() => setFilter(item.id)}
                >
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </button>
              ))}
            </nav>
          ) : null}

          {!normalizedQuery ? (
            <section className="global-search-welcome">
              <Search aria-hidden="true" size={52} strokeWidth={1.3} />
              <h2>O que você quer assistir?</h2>
              <p>A busca procura simultaneamente em TV ao vivo, filmes e séries.</p>
            </section>
          ) : totalResults === 0 ? (
            <section className="global-search-welcome">
              <X aria-hidden="true" size={52} strokeWidth={1.3} />
              <h2>Nenhum resultado encontrado</h2>
              <p>Tente uma palavra menor ou confira a grafia.</p>
            </section>
          ) : (
            <div className="global-search-results">
              {visibleChannels && results.channels.length > 0 ? (
                <section className="library-section">
                  <div className="library-section-heading">
                    <div>
                      <h2>TV ao vivo</h2>
                      <p>Canais encontrados</p>
                    </div>
                    <span>{results.channels.length}</span>
                  </div>

                  <div className="library-channel-grid">
                    {results.channels.map(channel => (
                      <ChannelCard
                        key={channel.id}
                        logo={getSafeImageUrl(channel.logo)}
                        name={channel.name}
                        group={channel.groupTitle || channel.group || 'TV ao vivo'}
                        favorite={channel.isFavorite}
                        onClick={() => playChannel(channel)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {visibleMovies && results.movies.length > 0 ? (
                <section className="library-section">
                  <div className="library-section-heading">
                    <div>
                      <h2>Filmes</h2>
                      <p>Títulos encontrados</p>
                    </div>
                    <span>{results.movies.length}</span>
                  </div>

                  <div className="library-poster-grid">
                    {results.movies.map(movie => (
                      <CatalogPosterCard
                        key={movie.id}
                        image={getSafeImageUrl(movie.cover)}
                        title={movie.name}
                        meta={[movie.year > 0 ? movie.year : null, movie.category || null].filter(Boolean).join(' • ') || 'Filme'}
                        progress={movie.progress}
                        favorite={movie.isFavorite}
                        badge="Filme"
                        onClick={() => playMovie(movie)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {visibleSeries && results.series.length > 0 ? (
                <section className="library-section">
                  <div className="library-section-heading">
                    <div>
                      <h2>Séries</h2>
                      <p>Séries encontradas</p>
                    </div>
                    <span>{results.series.length}</span>
                  </div>

                  <div className="library-poster-grid">
                    {results.series.map(item => (
                      <CatalogPosterCard
                        key={item.id}
                        image={getSafeImageUrl(item.cover)}
                        title={item.name}
                        meta={item.category || 'Série'}
                        progress={item.progress}
                        favorite={item.isFavorite}
                        badge={item.seasons.length > 0 ? `${item.seasons.length} temp.` : 'Série'}
                        onClick={() => openSeries(item)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}

          {normalizedQuery && totalResults > 0 ? (
            <div className="global-search-total">
              <Tv aria-hidden="true" size={14} /> {results.channels.length} canais
              <Film aria-hidden="true" size={14} /> {results.movies.length} filmes
              <span>{results.series.length} séries</span>
            </div>
          ) : null}
        </div>
      </div>
    </StreamingShell>
  );
}
