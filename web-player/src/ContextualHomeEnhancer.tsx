import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchCatalog, fetchLibrary, getActiveAccessToken } from './api';
import {
  buildContextualShelves,
  type ContextualOrigin,
  type ContextualShelf,
  type InterestSignal,
} from './contextualDiscovery';
import type { Catalog, LibrarySnapshot } from './types';

const REFRESH_THROTTLE_MS = 12_000;
const EMPTY_CATALOG: Catalog = {
  sourceRole: 'primary',
  usingBackup: false,
  channels: [],
  movies: [],
  series: [],
};

function seriesKeyFromEpisodeKey(contentKey: string) {
  const match = /^episode:(.+):s\d+:e\d+$/.exec(contentKey);
  return match?.[1] ? `series:${match[1]}` : null;
}

function buildSignals(catalog: Catalog, library: LibrarySnapshot): InterestSignal[] {
  const moviesByKey = new Map(catalog.movies.map(item => [item.contentKey, item]));
  const seriesByKey = new Map(catalog.series.map(item => [item.contentKey, item]));
  const signals: InterestSignal[] = [];

  for (const progress of library.progress) {
    let origin: ContextualOrigin | undefined;
    if (progress.contentType === 'movie') {
      origin = moviesByKey.get(progress.contentKey);
    } else {
      const seriesKey = seriesKeyFromEpisodeKey(progress.contentKey);
      if (seriesKey) origin = seriesByKey.get(seriesKey);
    }
    if (!origin) continue;

    const progressRatio = progress.completed
      ? 1
      : progress.durationMs > 0
        ? Math.max(0, Math.min(1, progress.positionMs / progress.durationMs))
        : 0;

    signals.push({
      origin,
      progressRatio,
      completed: progress.completed,
      updatedAt: progress.updatedAt,
    });
  }

  return signals;
}

function visibleHomeAnchor() {
  const main = document.querySelector<HTMLElement>('.main-content');
  const hero = main?.querySelector<HTMLElement>('.experience-hero');
  if (!main || !hero) return null;

  let anchor = main.querySelector<HTMLElement>('#roneca-contextual-home-anchor');
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.id = 'roneca-contextual-home-anchor';
    anchor.className = 'contextual-home-anchor';
  }

  const shelves = [...main.querySelectorAll<HTMLElement>('.shelf')];
  const continueShelf = shelves.find(shelf => shelf.querySelector('h2')?.textContent?.trim() === 'Continuar assistindo');
  const insertionPoint = continueShelf || hero;
  if (anchor.previousElementSibling !== insertionPoint) insertionPoint.after(anchor);
  return anchor;
}

function findNavigationButton(label: 'Filmes' | 'Séries') {
  const candidates = [...document.querySelectorAll<HTMLButtonElement>('.side-nav nav button, .bottom-nav button')];
  return candidates.find(button => button.textContent?.trim().toLocaleLowerCase('pt-BR').includes(label.toLocaleLowerCase('pt-BR'))) || null;
}

function findPosterByTitle(title: string) {
  const cards = [...document.querySelectorAll<HTMLElement>('.poster-card')];
  return cards.find(card => {
    const strong = card.querySelector('strong')?.textContent?.trim();
    return strong === title;
  }) || null;
}

async function openCatalogItem(item: ContextualOrigin) {
  const nav = findNavigationButton(item.type === 'movie' ? 'Filmes' : 'Séries');
  if (!nav) return;
  nav.click();

  const deadline = Date.now() + 2_500;
  await new Promise<void>(resolve => {
    const attempt = () => {
      const card = findPosterByTitle(item.title);
      if (card) {
        card.click();
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        resolve();
        return;
      }
      window.setTimeout(attempt, 60);
    };
    window.setTimeout(attempt, 0);
  });
}

function ContextualCard({ item }: { item: ContextualOrigin }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article
      className="poster-card contextual-poster-card"
      tabIndex={0}
      role="button"
      aria-label={`Abrir detalhes de ${item.title}`}
      onClick={() => void openCatalogItem(item)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void openCatalogItem(item);
        }
      }}
    >
      <div className="poster-art">
        {item.cover && !imageFailed
          ? <img src={item.cover} alt={`Capa de ${item.title}`} loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
          : <div className="media-placeholder poster" aria-hidden="true"><img src="/brand/ronecaplaytv-symbol.svg" alt="" /></div>}
      </div>
      <div className="card-copy">
        <strong>{item.title}</strong>
        <small>{item.category || (item.type === 'movie' ? 'Filme' : 'Série')}</small>
      </div>
    </article>
  );
}

function ContextualShelfView({ shelf }: { shelf: ContextualShelf }) {
  return (
    <section className="shelf contextual-shelf" data-contextual-origin={shelf.origin.contentKey}>
      <div className="section-heading">
        <button type="button" className="contextual-shelf-title" onClick={() => void openCatalogItem(shelf.origin)}>
          <h2>{shelf.title}</h2>
        </button>
      </div>
      <div className="horizontal-list">
        {shelf.items.map(item => <ContextualCard key={item.contentKey || item.contentId} item={item} />)}
      </div>
    </section>
  );
}

export function ContextualHomeEnhancer() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [shelves, setShelves] = useState<ContextualShelf[]>([]);
  const lastRefresh = useRef(0);
  const refreshBusy = useRef(false);
  const playerWasOpen = useRef(false);
  const refreshTimer = useRef<number | null>(null);

  const refresh = useCallback(async (force = false) => {
    const target = visibleHomeAnchor();
    setAnchor(target);
    if (!target) return;

    const token = getActiveAccessToken();
    if (!token) {
      setShelves([]);
      return;
    }
    if (refreshBusy.current) return;
    if (!force && Date.now() - lastRefresh.current < REFRESH_THROTTLE_MS) return;

    refreshBusy.current = true;
    try {
      const [catalog, library] = await Promise.all([
        fetchCatalog(token).catch(() => EMPTY_CATALOG),
        fetchLibrary(token),
      ]);
      const next = buildContextualShelves(buildSignals(catalog, library), catalog.movies, catalog.series);
      setShelves(next);
      lastRefresh.current = Date.now();
    } catch {
      setShelves([]);
    } finally {
      refreshBusy.current = false;
    }
  }, []);

  useEffect(() => {
    const schedule = (force = false) => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        const playerOpen = Boolean(document.querySelector('.player-overlay'));
        const playbackJustEnded = playerWasOpen.current && !playerOpen;
        playerWasOpen.current = playerOpen;
        void refresh(force || playbackJustEnded);
      }, 180);
    };

    schedule(true);
    const observer = new MutationObserver(() => schedule(false));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('focus', () => schedule(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedule(false);
    });

    return () => {
      observer.disconnect();
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, [refresh]);

  const content = useMemo(() => {
    if (!anchor || !shelves.length) return null;
    return <div className="contextual-home-shelves">{shelves.map(shelf => <ContextualShelfView key={shelf.key} shelf={shelf} />)}</div>;
  }, [anchor, shelves]);

  if (!anchor || !content) return null;
  return createPortal(content, anchor);
}
