import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { shouldShowCategorySearch } from './sectionNavigation';

type CatalogSection = 'live' | 'movies' | 'series' | null;

function currentCatalogSection(root: Element | null): CatalogSection {
  const active = root?.querySelector<HTMLButtonElement>('.side-nav nav button.active');
  const label = active?.textContent?.toLocaleLowerCase('pt-BR') || '';
  if (label.includes('tv')) return 'live';
  if (label.includes('filmes')) return 'movies';
  if (label.includes('séries') || label.includes('series')) return 'series';
  return null;
}

function currentFilterStrip(root: Element | null) {
  return root?.querySelector<HTMLElement>('.main-content > .page-section > .filter-strip') || null;
}

export function SectionNavigationEnhancer() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [strip, setStrip] = useState<HTMLElement | null>(null);
  const [section, setSection] = useState<CatalogSection>(null);
  const [menuRevealed, setMenuRevealed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const sync = () => {
      const nextRoot = document.querySelector<HTMLElement>('.app-shell');
      const nextSection = currentCatalogSection(nextRoot);
      const nextStrip = currentFilterStrip(nextRoot);
      setRoot(nextRoot);
      setStrip(nextStrip);
      setSection(current => {
        if (current !== nextSection) {
          setMenuRevealed(false);
          setCollapsed(false);
          setQuery('');
        }
        return nextSection;
      });
      setRevision(value => value + 1);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', sync, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  const desktop = useMemo(() => window.matchMedia('(min-width: 641px)').matches, [revision]);
  const categoryButtons = useMemo(() => (
    strip ? [...strip.querySelectorAll<HTMLButtonElement>('button:not(.category-runtime-control)')] : []
  ), [revision, strip]);
  const searchable = shouldShowCategorySearch(categoryButtons.length);

  useEffect(() => {
    if (!root) return;
    const activeMode = Boolean(section && strip && desktop && !menuRevealed);
    root.classList.toggle('category-mode', activeMode);
    root.classList.toggle('category-sidebar-collapsed', activeMode && collapsed);
    return () => {
      root.classList.remove('category-mode', 'category-sidebar-collapsed');
    };
  }, [collapsed, desktop, menuRevealed, root, section, strip]);

  useEffect(() => {
    if (!strip) return;
    const term = query.trim().toLocaleLowerCase('pt-BR');
    const buttons = [...strip.querySelectorAll<HTMLButtonElement>('button:not(.category-runtime-control)')];
    for (const button of buttons) {
      button.hidden = Boolean(term && !button.textContent?.toLocaleLowerCase('pt-BR').includes(term));
    }
    return () => {
      for (const button of buttons) button.hidden = false;
    };
  }, [query, revision, strip]);

  useEffect(() => {
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const navButton = target?.closest('.side-nav nav button');
      if (!navButton) return;
      window.setTimeout(() => {
        const nextSection = currentCatalogSection(root);
        if (nextSection) {
          setMenuRevealed(false);
          setCollapsed(false);
        }
      }, 0);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [root]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!desktop || !root?.classList.contains('category-mode') || event.key !== 'ArrowLeft') return;
      const target = event.target as Element | null;
      if (!target?.closest('.filter-strip')) return;
      const button = target.closest<HTMLButtonElement>('button:not(.category-runtime-control)');
      const visibleButtons = categoryButtons.filter(item => !item.hidden);
      if (!button || visibleButtons[0] !== button) return;
      event.preventDefault();
      setMenuRevealed(true);
      window.setTimeout(() => root.querySelector<HTMLButtonElement>('.side-nav nav button.active')?.focus(), 0);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [categoryButtons, desktop, root]);

  if (!strip || !section) return null;

  return createPortal(
    <>
      <button type="button" className="category-runtime-control category-menu-button" onClick={() => {
        setMenuRevealed(true);
        window.setTimeout(() => root?.querySelector<HTMLButtonElement>('.side-nav nav button.active')?.focus(), 0);
      }}>‹ Menu principal</button>
      {desktop ? <button type="button" className="category-runtime-control category-collapse-button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expandir categorias' : 'Recolher categorias'}>{collapsed ? '›' : '‹'}</button> : null}
      {searchable && !collapsed ? <label className="category-runtime-control category-search"><span className="sr-only">Buscar categoria</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar categoria…" /></label> : null}
    </>,
    strip,
  );
}
