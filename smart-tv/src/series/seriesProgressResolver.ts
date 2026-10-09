// Espelha native-android/.../ui/series/SeriesProgressResolver.kt: entre todos os
// episódios de todas as temporadas carregadas, acha o de progresso salvo mais
// recente (maior updatedAt), pra pré-selecionar a temporada certa e oferecer um
// atalho "Continuar" na tela de detalhe da série — igual ao Android.
import type { Season, Series } from "../catalog";
import { episodeContentKey } from "../contentIdentity";
import type { LibraryItem } from "../mediaLibrary";
import { resumableProgress } from "../mediaLibrary";

export interface SeriesResumeTarget {
  season: Season;
  episode: Season["episodes"][number];
  progress: LibraryItem;
}

export function resolveSeriesResumeTarget(
  series: Series,
  seasons: Season[],
  history: LibraryItem[]
): SeriesResumeTarget | null {
  let best: SeriesResumeTarget | null = null;
  for (const season of seasons) {
    for (const episode of season.episodes) {
      const contentKey = episodeContentKey(series.name, season, episode);
      const saved = history.find(item =>
        item.kind === "episode" && (item.contentKey === contentKey || (!item.contentKey && item.id === episode.id))
      );
      if (!saved || !resumableProgress(saved)) continue;
      if (!best || saved.updatedAt > best.progress.updatedAt) {
        best = { season, episode, progress: saved };
      }
    }
  }
  return best;
}

export function formatPlaybackPosition(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
