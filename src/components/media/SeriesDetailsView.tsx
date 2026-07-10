import type { CSSProperties } from 'react';
import { ArrowLeft, Clapperboard, Clock3, Layers3, Play, Star } from 'lucide-react';
import type { Episode, Season, Series } from '@/types';
import { CatalogPosterCard } from './CatalogPosterCard';

type SeriesDetailsViewProps = {
  series: Series;
  seasons: Season[];
  selectedSeasonNumber: number | null;
  recommendations: Series[];
  onBack: () => void;
  onSelectSeason: (seasonNumber: number) => void;
  onPlayEpisode: (season: Season, episode: Episode) => void;
  onToggleFavorite: () => void;
  onOpenRecommendation: (series: Series) => void;
};

function getSafeImageUrl(url?: string) {
  if (!url) return undefined;

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return undefined;
  }

  return url;
}

function getEpisodeProgress(episode: Episode) {
  return Math.min(100, Math.max(0, episode.progress ?? 0));
}

export function SeriesDetailsView({
  series,
  seasons,
  selectedSeasonNumber,
  recommendations,
  onBack,
  onSelectSeason,
  onPlayEpisode,
  onToggleFavorite,
  onOpenRecommendation,
}: SeriesDetailsViewProps) {
  const image = getSafeImageUrl(series.cover);
  const selectedSeason = seasons.find(season => season.number === selectedSeasonNumber) ?? seasons[0] ?? null;
  const allEpisodes = seasons.flatMap(season => season.episodes.map(episode => ({ season, episode })));
  const continueEntry = allEpisodes.find(({ episode }) => getEpisodeProgress(episode) > 0);
  const primaryEntry = continueEntry ?? (selectedSeason?.episodes[0] ? { season: selectedSeason, episode: selectedSeason.episodes[0] } : allEpisodes[0]);
  const episodeCount = allEpisodes.length;

  const detailStyle = {
    '--series-detail-image': image ? `url("${image.replace(/"/g, '%22')}")` : 'none',
  } as CSSProperties;

  return (
    <div className="series-detail-page" style={detailStyle} data-stream-detail="series">
      <div className="series-detail-backdrop" aria-hidden="true" />
      <div className="series-detail-shade" aria-hidden="true" />

      <div className="series-detail-scroll">
        <header className="series-detail-topbar">
          <button
            type="button"
            className="series-detail-back"
            onClick={onBack}
            data-tv-back-target="true"
          >
            <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.3} />
            Voltar às séries
          </button>

          <span className="series-detail-type">
            <Clapperboard aria-hidden="true" size={14} strokeWidth={2.2} /> Série
          </span>
        </header>

        <main className="series-detail-main">
          <section className="series-detail-overview">
            <div className="series-detail-poster">
              {image ? (
                <img src={image} alt={series.name} />
              ) : (
                <div className="series-detail-poster-placeholder">
                  <Clapperboard aria-hidden="true" size={54} strokeWidth={1.4} />
                </div>
              )}

              {(series.progress ?? 0) > 0 ? (
                <div className="series-detail-progress">
                  <span style={{ width: `${Math.min(100, Math.max(0, series.progress ?? 0))}%` }} />
                </div>
              ) : null}
            </div>

            <div className="series-detail-copy">
              <p className="stream-kicker">Série em destaque</p>
              <h1 className="series-detail-title">{series.name}</h1>

              <div className="series-detail-meta">
                <span><Layers3 aria-hidden="true" size={12} /> {seasons.length} temporada(s)</span>
                <span>{episodeCount} episódio(s)</span>
                {series.category ? <span>{series.category}</span> : null}
                {series.isFavorite ? <span className="is-gold">Na Minha Lista</span> : null}
              </div>

              <p className="series-detail-synopsis">
                {series.synopsis || 'Sinopse não disponível para esta série. Escolha uma temporada e um episódio para assistir.'}
              </p>

              <div className="series-detail-actions">
                <button
                  type="button"
                  className="stream-primary-button"
                  disabled={!primaryEntry}
                  onClick={() => primaryEntry && onPlayEpisode(primaryEntry.season, primaryEntry.episode)}
                >
                  <Play aria-hidden="true" size={17} fill="currentColor" />
                  {continueEntry ? 'Continuar assistindo' : primaryEntry ? 'Assistir primeiro episódio' : 'Sem episódios'}
                </button>

                <button
                  type="button"
                  className={`stream-secondary-button series-list-button ${series.isFavorite ? 'is-favorite' : ''}`}
                  onClick={onToggleFavorite}
                >
                  <Star
                    aria-hidden="true"
                    size={17}
                    fill={series.isFavorite ? 'currentColor' : 'none'}
                  />
                  {series.isFavorite ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista'}
                </button>
              </div>
            </div>
          </section>

          <aside className="series-episodes-panel">
            <div className="series-episodes-heading">
              <div>
                <p className="stream-kicker">Episódios</p>
                <h2>{selectedSeason ? `Temporada ${selectedSeason.number}` : 'Temporadas'}</h2>
              </div>
              <span>{selectedSeason?.episodes.length ?? 0}</span>
            </div>

            <div className="series-season-strip" aria-label="Temporadas">
              {seasons.map(season => (
                <button
                  key={season.number}
                  type="button"
                  className={`series-season-chip ${selectedSeason?.number === season.number ? 'is-active' : ''}`}
                  onClick={() => onSelectSeason(season.number)}
                >
                  T{season.number}
                </button>
              ))}
            </div>

            <div className="series-episode-list">
              {selectedSeason?.episodes.map(episode => {
                const progress = getEpisodeProgress(episode);

                return (
                  <button
                    key={episode.id}
                    type="button"
                    className="series-episode-card"
                    onClick={() => onPlayEpisode(selectedSeason, episode)}
                  >
                    <span className="series-episode-number">{String(episode.number).padStart(2, '0')}</span>

                    <span className="series-episode-copy">
                      <span className="series-episode-name">{episode.name || `Episódio ${episode.number}`}</span>
                      <span className="series-episode-meta">
                        <Clock3 aria-hidden="true" size={11} />
                        {episode.duration && episode.duration !== '—' ? episode.duration : 'Assistir episódio'}
                        {progress > 0 ? <strong>Continuar</strong> : null}
                      </span>

                      {progress > 0 ? (
                        <span className="series-episode-progress" aria-hidden="true">
                          <span style={{ width: `${progress}%` }} />
                        </span>
                      ) : null}
                    </span>

                    <span className="series-episode-play" aria-hidden="true">
                      <Play size={13} fill="currentColor" />
                    </span>
                  </button>
                );
              })}

              {!selectedSeason?.episodes.length ? (
                <div className="series-episodes-empty">
                  Nenhum episódio encontrado nesta temporada.
                </div>
              ) : null}
            </div>
          </aside>
        </main>

        {recommendations.length > 0 ? (
          <section className="series-recommendations">
            <div className="series-recommendations-heading">
              <div>
                <h2>Também pode gostar</h2>
                <p>Outras séries do seu catálogo</p>
              </div>
            </div>

            <div className="series-recommendations-rail">
              {recommendations.map(item => (
                <CatalogPosterCard
                  key={item.id}
                  image={getSafeImageUrl(item.cover)}
                  title={item.name}
                  meta={item.category || 'Série'}
                  favorite={item.isFavorite}
                  progress={item.progress}
                  badge={item.seasons.length > 0 ? `${item.seasons.length} temp.` : 'Série'}
                  onClick={() => onOpenRecommendation(item)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
