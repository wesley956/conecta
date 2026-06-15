import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav, ProgressBar } from '@/components/shared';

export function FavoritesScreen() {
  const {
    channels,
    movies,
    series,
    setScreen,
    setCurrentChannel,
    setCurrentMovie,
  } = useAppStore();

  const favoriteChannels = channels.filter(item => item.isFavorite);
  const favoriteMovies = movies.filter(item => item.isFavorite);
  const favoriteSeries = series.filter(item => item.isFavorite);

  const playbackMovies = movies.filter(item => (item.progress ?? 0) > 0);
  const playbackSeries = series.filter(item => (item.progress ?? 0) > 0);

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-8">
        <BottomNav />

        <main className="min-w-0 flex-1 overflow-y-auto pr-8">
          <h1 className="clean-tv-title mb-10 text-5xl">Playback</h1>

          <section className="mb-12">
            <h2 className="clean-tv-title mb-5 text-3xl">Ao vivo</h2>

            {favoriteChannels.length === 0 ? (
              <CleanEmpty title="Sem canais favoritos" />
            ) : (
              <div className="grid grid-cols-5 gap-5">
                {favoriteChannels.slice(0, 10).map(channel => (
                  <button
                    key={channel.id}
                    onClick={() => {
                      setCurrentChannel(channel);
                      setScreen('player');
                    }}
                    className="clean-tv-tile rounded-md p-5 text-left"
                  >
                    <p className="text-3xl">▣</p>
                    <p className="mt-5 truncate text-2xl font-light">{channel.name}</p>
                    <p className="mt-2 text-base opacity-55">Canal favorito</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="mb-12">
            <h2 className="clean-tv-title mb-5 text-3xl">Playback & VOD</h2>

            {playbackMovies.length === 0 && playbackSeries.length === 0 ? (
              <CleanEmpty title="Nenhum vídeo em andamento" />
            ) : (
              <div className="grid grid-cols-5 gap-5">
                {playbackMovies.map(movie => (
                  <button
                    key={movie.id}
                    onClick={() => {
                      setCurrentMovie(movie);
                      setScreen('player');
                    }}
                    className="clean-tv-tile rounded-md p-5 text-left"
                  >
                    <p className="text-sm opacity-50">{movie.year}</p>
                    <p className="mt-4 truncate text-3xl font-light">{movie.name}</p>
                    <p className="mt-2 text-base opacity-55">{movie.duration}</p>
                    <ProgressBar progress={movie.progress ?? 0} className="mt-4" />
                  </button>
                ))}

                {playbackSeries.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setScreen('series')}
                    className="clean-tv-tile rounded-md p-5 text-left"
                  >
                    <p className="text-sm opacity-50">{item.seasons.length} temporada(s)</p>
                    <p className="mt-4 truncate text-3xl font-light">{item.name}</p>
                    <p className="mt-2 text-base opacity-55">Série</p>
                    <ProgressBar progress={item.progress ?? 0} className="mt-4" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="clean-tv-title mb-5 text-3xl">Favoritos</h2>

            <div className="grid grid-cols-6 gap-x-10 gap-y-9">
              {favoriteMovies.map(movie => (
                <button
                  key={movie.id}
                  onClick={() => {
                    setCurrentMovie(movie);
                    setScreen('player');
                  }}
                  className="group text-left"
                >
                  <div className="flex h-[210px] items-center justify-center rounded-xl bg-white/[0.045] text-6xl transition-transform group-hover:scale-[1.035]">
                    🎬
                  </div>
                  <p className="mt-3 truncate text-2xl font-light text-white/72 group-hover:text-white">
                    {movie.name}
                  </p>
                </button>
              ))}

              {favoriteSeries.map(item => (
                <button
                  key={item.id}
                  onClick={() => setScreen('series')}
                  className="group text-left"
                >
                  <div className="flex h-[210px] items-center justify-center rounded-xl bg-white/[0.045] text-6xl transition-transform group-hover:scale-[1.035]">
                    🎥
                  </div>
                  <p className="mt-3 truncate text-2xl font-light text-white/72 group-hover:text-white">
                    {item.name}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
    </AppLayout>
  );
}

export function SearchScreen() {
  const {
    channels,
    movies,
    series,
    setScreen,
    setCurrentChannel,
    setCurrentMovie,
  } = useAppStore();

  const [query, setQuery] = useState('');

  const result = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return {
        channels: channels.slice(0, 8),
        movies: movies.slice(0, 8),
        series: series.slice(0, 8),
      };
    }

    return {
      channels: channels.filter(item => item.name.toLowerCase().includes(q)).slice(0, 12),
      movies: movies.filter(item => item.name.toLowerCase().includes(q)).slice(0, 12),
      series: series.filter(item => item.name.toLowerCase().includes(q)).slice(0, 12),
    };
  }, [channels, movies, series, query]);

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-8">
        <BottomNav />

        <main className="min-w-0 flex-1">
          <header className="mb-10 flex items-center gap-6">
            <span className="text-5xl text-white/75">⌕</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              autoFocus
              placeholder="Buscar"
              className="w-full bg-transparent text-5xl font-light text-white/85 outline-none placeholder:text-white/35"
            />
          </header>

          <div className="grid max-h-[calc(100vh-140px)] grid-cols-[1fr_1fr_1fr] gap-10 overflow-y-auto pr-8">
            <SearchColumn title="Canais">
              {result.channels.map(channel => (
                <button
                  key={channel.id}
                  onClick={() => {
                    setCurrentChannel(channel);
                    setScreen('player');
                  }}
                  className="clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <span className="text-3xl">▣</span>
                  <span className="truncate text-2xl font-light">{channel.name}</span>
                </button>
              ))}
            </SearchColumn>

            <SearchColumn title="Filmes">
              {result.movies.map(movie => (
                <button
                  key={movie.id}
                  onClick={() => {
                    setCurrentMovie(movie);
                    setScreen('player');
                  }}
                  className="clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <span className="text-3xl">🎬</span>
                  <span className="truncate text-2xl font-light">{movie.name}</span>
                </button>
              ))}
            </SearchColumn>

            <SearchColumn title="Séries">
              {result.series.map(item => (
                <button
                  key={item.id}
                  onClick={() => setScreen('series')}
                  className="clean-tv-row flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <span className="text-3xl">🎥</span>
                  <span className="truncate text-2xl font-light">{item.name}</span>
                </button>
              ))}
            </SearchColumn>
          </div>
        </main>
      </div>
    </AppLayout>
  );
}

function SearchColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="clean-tv-title mb-5 text-3xl">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function CleanEmpty({ title }: { title: string }) {
  return (
    <div className="clean-tv-tile max-w-[360px] rounded-md p-6">
      <p className="text-3xl">◷</p>
      <p className="mt-4 text-2xl font-light">{title}</p>
      <p className="mt-2 text-base opacity-55">Nada para exibir por enquanto</p>
    </div>
  );
}
