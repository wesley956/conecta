import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { shouldShowCategorySearch } from './sectionNavigation';
import './ui430-live-tv.css';

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

function labelLiveChannelCount(root: Element | null, section: CatalogSection) {
  if (!root || section !== 'live') return;
  const badge = root.querySelector<HTMLElement>('.main-content > .page-section .page-heading .count-badge');
  if (!badge) return;
  // Lê o texto renderizado pelo React primeiro: depois que a lista é filtrada por
  // categoria, o React escreve a nova contagem crua no mesmo nó (ex.: "120"), e
  // priorizar dataset.channelCount aqui manteria a legenda travada na contagem antiga.
  const numericText = badge.textContent || badge.dataset.channelCount || '0';
  const count = Number.parseInt(numericText.replace(/\D/g, ''), 10);
  if (!Number.isFinite(count)) return;
  // Varredura completa: `textContent = ...` sempre troca o nó de texto, mesmo quando a
  // string final é igual à atual — e essa troca é uma mutação childList, exatamente o que
  // o MutationObserver abaixo observa (subtree + childList em document.body). Sem este
  // guard, toda vez que a aba "TV" roda este label ela gera uma mutação, que dispara sync()
  // de novo, que chama este label de novo, que gera outra mutação — um laço infinito de
  // microtasks que nunca cede a vez a paint/input, travando a aba por completo (reproduzido
  // isoladamente: o clique na aba TV nunca retornava e a página ficava 100% sem resposta).
  // Só escreve quando o valor realmente muda, para a mutação não se automanter.
  const nextText = `${count.toLocaleString('pt-BR')} ${count === 1 ? 'canal' : 'canais'}`;
  if (badge.dataset.channelCount === String(count) && badge.textContent === nextText) return;
  badge.dataset.channelCount = String(count);
  badge.textContent = nextText;
  badge.setAttribute('aria-label', `${count.toLocaleString('pt-BR')} ${count === 1 ? 'canal disponível' : 'canais disponíveis'}`);
}

export function SectionNavigationEnhancer() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [strip, setStrip] = useState<HTMLElement | null>(null);
  const [section, setSection] = useState<CatalogSection>(null);
  const [menuRevealed, setMenuRevealed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
          setMobileOpen(false);
          setQuery('');
        }
        return nextSection;
      });
      labelLiveChannelCount(nextRoot, nextSection);
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

  useEffect(() => {
    labelLiveChannelCount(root, section);
  }, [revision, root, section]);

  const desktop = useMemo(() => window.matchMedia('(min-width: 641px)').matches, [revision]);
  const categoryButtons = useMemo(() => (
    strip ? [...strip.querySelectorAll<HTMLButtonElement>('button:not(.category-runtime-control)')] : []
  ), [revision, strip]);
  const searchable = shouldShowCategorySearch(categoryButtons.length);
  const activeCategory = categoryButtons.find(button => button.classList.contains('active'))?.textContent?.trim() || 'Todos';
  const filteredMobileButtons = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    if (!term) return categoryButtons;
    return categoryButtons.filter(button => button.textContent?.toLocaleLowerCase('pt-BR').includes(term));
  }, [categoryButtons, query]);

  useEffect(() => {
    if (!root) return;
    const activeMode = Boolean(section && strip && desktop && !menuRevealed);
    root.classList.toggle('category-mode', activeMode);
    root.classList.toggle('category-sidebar-collapsed', activeMode && collapsed);
    root.classList.toggle('mobile-category-mode', Boolean(section && strip && !desktop));
    return () => {
      root.classList.remove('category-mode', 'category-sidebar-collapsed', 'mobile-category-mode');
    };
  }, [collapsed, desktop, menuRevealed, root, section, strip]);

  useEffect(() => {
    if (!strip || !desktop) return;
    const term = query.trim().toLocaleLowerCase('pt-BR');
    const buttons = [...strip.querySelectorAll<HTMLButtonElement>('button:not(.category-runtime-control)')];
    for (const button of buttons) {
      button.hidden = Boolean(term && !button.textContent?.toLocaleLowerCase('pt-BR').includes(term));
    }
    return () => {
      for (const button of buttons) button.hidden = false;
    };
  }, [desktop, query, revision, strip]);

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
      if (event.key === 'Escape' && mobileOpen) {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
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
  }, [categoryButtons, desktop, mobileOpen, root]);

  if (!strip || !section) return null;

  const stripControls = createPortal(
    <>
      {desktop ? (
        <>
          <button type="button" className="category-runtime-control category-menu-button" onClick={() => {
            setMenuRevealed(true);
            window.setTimeout(() => root?.querySelector<HTMLButtonElement>('.side-nav nav button.active')?.focus(), 0);
          }}>‹ Menu principal</button>
          <button type="button" className="category-runtime-control category-collapse-button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expandir categorias' : 'Recolher categorias'}>
            <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
            <span>{collapsed ? 'Expandir categorias' : 'Recolher categorias'}</span>
          </button>
          {searchable && !collapsed ? <label className="category-runtime-control category-search"><span className="sr-only">Buscar categoria</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar categoria…" /></label> : null}
        </>
      ) : (
        <button type="button" className="category-runtime-control category-mobile-toggle" onClick={() => { setQuery(''); setMobileOpen(true); }} aria-expanded={mobileOpen}>
          <span>Categorias</span><strong>{activeCategory}</strong><span aria-hidden="true">⌄</span>
        </button>
      )}
    </>,
    strip,
  );

  const mobileSheet = !desktop && mobileOpen ? createPortal(
    <div className="category-mobile-overlay" role="dialog" aria-modal="true" aria-label="Categorias" onMouseDown={event => {
      if (event.target === event.currentTarget) setMobileOpen(false);
    }}>
      <section className="category-mobile-sheet">
        <header><div><span className="eyebrow">NAVEGAÇÃO</span><h2>Categorias</h2></div><button type="button" className="icon-button" onClick={() => setMobileOpen(false)} aria-label="Fechar categorias">✕</button></header>
        {searchable ? <label className="category-mobile-search"><span className="sr-only">Buscar categoria</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar categoria…" /></label> : null}
        <div className="category-mobile-list">
          {filteredMobileButtons.map((button, index) => {
            const label = button.textContent?.trim() || `Categoria ${index + 1}`;
            const active = button.classList.contains('active');
            return <button type="button" key={`${label}:${index}`} className={active ? 'active' : ''} aria-current={active ? 'true' : undefined} onClick={() => { button.click(); setMobileOpen(false); setQuery(''); }}>{label}</button>;
          })}
          {!filteredMobileButtons.length ? <p className="muted">Nenhuma categoria encontrada.</p> : null}
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  return <>{stripControls}{mobileSheet}</>;
}
