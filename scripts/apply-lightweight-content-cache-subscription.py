from pathlib import Path

app_path = Path('src/App.tsx')
source = app_path.read_text(encoding='utf-8')

signature_start = source.find('function buildContentCacheSignature() {')
signature_end = source.find('\n\n// ===== CONTENT CACHE HYDRATOR =====', signature_start)
if signature_start < 0 or signature_end < 0:
    raise SystemExit('Função antiga de assinatura do cache não encontrada.')
source = source[:signature_start] + source[signature_end + 2:]

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

start = source.find(start_marker)
if start < 0:
    raise SystemExit('Início da assinatura global do cache não encontrado.')
end = source.find(end_marker, start)
if end < 0:
    raise SystemExit('Fim da assinatura global do cache não encontrado.')
end += len(end_marker)

replacement = """  useEffect(() => {
    let saveTimer: number | undefined;
    const initial = useAppStore.getState();
    let previousContent = {
      channels: initial.channels,
      movies: initial.movies,
      series: initial.series,
      playlists: initial.playlists,
    };

    const unsubscribe = useAppStore.subscribe(state => {
      const contentChanged =
        state.channels !== previousContent.channels ||
        state.movies !== previousContent.movies ||
        state.series !== previousContent.series ||
        state.playlists !== previousContent.playlists;

      if (!contentChanged) return;

      previousContent = {
        channels: state.channels,
        movies: state.movies,
        series: state.series,
        playlists: state.playlists,
      };

      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }

      saveTimer = window.setTimeout(() => {
        void saveContentCache(previousContent);
      }, 2500);
    });

    return () => {
      unsubscribe();

      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }
    };
  }, []);"""

source = source[:start] + replacement + source[end:]
app_path.write_text(source, encoding='utf-8')
print('Assinatura leve do cache aplicada.')
