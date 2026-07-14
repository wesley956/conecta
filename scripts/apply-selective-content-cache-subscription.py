from pathlib import Path

store_path = Path('src/stores/appStore.ts')
store_source = store_path.read_text(encoding='utf-8')

old_import = "import { persist, createJSONStorage } from 'zustand/middleware';"
new_import = "import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware';"
if old_import not in store_source:
    raise SystemExit('Import de middleware Zustand não encontrado.')
store_source = store_source.replace(old_import, new_import, 1)

old_create = """export const useAppStore = create<AppStore>()(
  persist("""
new_create = """export const useAppStore = create<AppStore>()(
  subscribeWithSelector(
    persist("""
if old_create not in store_source:
    raise SystemExit('Início da criação da store não encontrado.')
store_source = store_source.replace(old_create, new_create, 1)

old_end = """    }
  )
);"""
new_end = """    }
  )
  )
);"""
if old_end not in store_source:
    raise SystemExit('Fim da criação da store não encontrado.')
store_source = store_source.replace(old_end, new_end, 1)
store_path.write_text(store_source, encoding='utf-8')

app_path = Path('src/App.tsx')
app_source = app_path.read_text(encoding='utf-8')

start_marker = """  useEffect(() => {
    let saveTimer: number | undefined;
    let previousSignature = buildContentCacheSignature();

    const unsubscribe = useAppStore.subscribe(() => {"""
end_marker = """    return () => {
      unsubscribe();

      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }
    };
  }, []);"""

start = app_source.find(start_marker)
if start < 0:
    raise SystemExit('Início da assinatura global do cache não encontrado.')
end = app_source.find(end_marker, start)
if end < 0:
    raise SystemExit('Fim da assinatura global do cache não encontrado.')
end += len(end_marker)

replacement = """  useEffect(() => {
    let saveTimer: number | undefined;

    const unsubscribe = useAppStore.subscribe(
      state => ({
        channels: state.channels,
        movies: state.movies,
        series: state.series,
        playlists: state.playlists,
      }),
      snapshot => {
        if (saveTimer) {
          window.clearTimeout(saveTimer);
        }

        saveTimer = window.setTimeout(() => {
          void saveContentCache(snapshot);
        }, 2500);
      },
      {
        equalityFn: (previous, next) => (
          previous.channels === next.channels &&
          previous.movies === next.movies &&
          previous.series === next.series &&
          previous.playlists === next.playlists
        ),
      },
    );

    return () => {
      unsubscribe();

      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }
    };
  }, []);"""

app_source = app_source[:start] + replacement + app_source[end:]
app_path.write_text(app_source, encoding='utf-8')

print('Assinatura seletiva do cache aplicada.')
