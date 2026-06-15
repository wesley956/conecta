import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, BottomNav, ProgressBar } from '@/components/shared';

export function SeriesScreen() {
  const { series, setScreen } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('Destaques');

  const categories = useMemo(() => {
    return ['Destaques', 'Em alta', 'Lançamentos', ...new Set(series.map(item => item.category))];
  }, [series]);

  const filteredSeries = useMemo(() => {
    if (selectedCategory === 'Destaques' || selectedCategory === 'Em alta') return series;
    if (selectedCategory === 'Lançamentos') return series;
    return series.filter(item => item.category === selectedCategory);
  }, [series, selectedCategory]);

  return (
    <AppLayout>
      <div className="clean-tv-page flex h-full px-14 py-7">
        <BottomNav />

        <main className="min-w-0 flex-1">
          <header className="mb-8 flex items-center gap-10">
            <button
              onClick={() => setScreen('search')}
              className="text-5xl text-white/80 transition-colors hover:text-white"
            >
              ⌕
            </button>

            <nav className="flex min-w-0 items-center gap-9 overflow-hidden">
              {categories.slice(0, 7).map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full px-8 py-2 text-2xl font-light transition-all ${
                    selectedCategory === category
                      ? 'border border-white/70 text-white'
                      : 'text-white/42 hover:text-white/75'
                  }`}
                >
                  {category.length > 14 ? `${category.slice(0, 13)}..` : category}
                </button>
              ))}
            </nav>
          </header>

          <div className="mb-8 flex items-center gap-14 pl-16">
            <button className="border-b border-white/35 pb-2 text-2xl font-light text-white/78">
              Populares
            </button>
            <button className="pb-2 text-2xl font-light text-white/42">
              Favoritos
            </button>
          </div>

          <section className="grid max-h-[calc(100vh-165px)] grid-cols-6 gap-x-10 gap-y-9 overflow-y-auto pr-8">
            {filteredSeries.map(item => (
              <button
                key={item.id}
                onClick={() => setScreen('series')}
                className="group text-left"
              >
                <div className="relative h-[230px] overflow-hidden rounded-xl bg-white/[0.045] transition-transform duration-150 group-hover:scale-[1.035] group-focus:scale-[1.035]">
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-white/[0.08] to-white/[0.015] text-6xl">
                    🎥
                  </div>

                  {item.progress !== undefined && item.progress > 0 && (
                    <div className="absolute inset-x-0 bottom-0">
                      <ProgressBar progress={item.progress} />
                    </div>
                  )}

                  <span className="absolute bottom-3 left-3 rounded bg-black/45 px-2 py-1 text-xs text-white/70">
                    {item.seasons.length} temp.
                  </span>
                </div>

                <p className="mt-3 truncate text-2xl font-light text-white/72 group-hover:text-white">
                  {item.name}
                </p>
              </button>
            ))}
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
