import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { AppState } from '@/types';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[data-tv-focusable="true"]',
].join(',');

const ROOT_SCREENS = new Set<AppState>([
  'home',
  'splash',
  'activation',
  'expired',
  'blocked',
  'nointernet',
]);

const INVALID_BACK_DESTINATIONS = new Set<AppState>([
  'player',
  'splash',
  'activation',
  'expired',
  'blocked',
  'nointernet',
]);

type Direction = 'up' | 'down' | 'left' | 'right';

type NavigationZone =
  | 'sidebar'
  | 'header'
  | 'categories'
  | 'feature-actions'
  | 'content'
  | 'detail-topbar'
  | 'detail-actions'
  | 'seasons'
  | 'episodes'
  | 'recommendations'
  | 'footer'
  | 'other';

interface FocusCache {
  elements: HTMLElement[];
  valid: boolean;
  rafId: number | null;
}

interface FocusMemory {
  key: string;
  zone: NavigationZone;
}

const ZONE_SELECTORS: Array<[NavigationZone, string]> = [
  ['sidebar', '.stream-sidebar'],
  ['detail-topbar', '.movie-detail-topbar, .series-detail-topbar'],
  ['detail-actions', '.movie-detail-actions, .series-detail-actions'],
  ['seasons', '.series-season-strip'],
  ['episodes', '.series-episode-list'],
  ['recommendations', '.movie-recommendations-rail, .series-recommendations-rail'],
  ['categories', '.movies-category-strip, .series-category-strip, .live-category-strip'],
  ['feature-actions', '.live-feature-actions, .stream-hero-actions'],
  ['content', '.movies-grid, .series-grid, .live-channel-grid'],
  [
    'header',
    '.movies-header, .series-header, .live-header, .stream-home-header, .library-header, .global-search-header',
  ],
  ['footer', '.movies-load-more, .series-load-more, .live-load-more'],
];

const HORIZONTAL_SEQUENTIAL_ZONES = new Set<NavigationZone>([
  'categories',
  'feature-actions',
  'detail-actions',
  'seasons',
  'recommendations',
  'header',
]);

const VERTICAL_SEQUENTIAL_ZONES = new Set<NavigationZone>([
  'sidebar',
  'episodes',
]);

function isVisible(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    el.getAttribute('aria-hidden') !== 'true'
  );
}

function collectFocusableElements() {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(isVisible);
}

function prepareElements(elements: HTMLElement[]) {
  for (const el of elements) {
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    el.classList.add('tv-focusable');
  }

  return elements;
}

function refreshFocusableCache(cache: FocusCache) {
  cache.elements = prepareElements(collectFocusableElements());
  cache.valid = true;
  cache.rafId = null;
  return cache.elements;
}

function getFocusableElements(cache: FocusCache) {
  if (!cache.valid) return refreshFocusableCache(cache);

  const connected = cache.elements.filter(el => el.isConnected && isVisible(el));
  if (connected.length !== cache.elements.length) cache.elements = connected;
  return cache.elements;
}

function invalidateFocusableCache(cache: FocusCache) {
  cache.valid = false;
  if (cache.rafId !== null) return;

  cache.rafId = window.requestAnimationFrame(() => {
    refreshFocusableCache(cache);
  });
}

function getElementZone(el: HTMLElement): NavigationZone {
  const explicitZone = el.closest<HTMLElement>('[data-tv-zone]')?.dataset.tvZone;
  if (explicitZone) return explicitZone as NavigationZone;

  for (const [zone, selector] of ZONE_SELECTORS) {
    if (el.closest(selector)) return zone;
  }

  return 'other';
}

function normalizeElementLabel(value: string | null | undefined) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function getElementBaseKey(el: HTMLElement) {
  const explicitId = el.dataset.tvFocusId;
  if (explicitId) return `focus-id:${explicitId}`;
  if (el.id) return `id:${el.id}`;

  const ariaLabel = normalizeElementLabel(el.getAttribute('aria-label'));
  if (ariaLabel) return `aria:${ariaLabel}`;

  const title = normalizeElementLabel(el.getAttribute('title'));
  if (title) return `title:${title}`;

  const name = normalizeElementLabel(el.getAttribute('name'));
  if (name) return `name:${name}`;

  const text = normalizeElementLabel(el.textContent);
  if (text) return `text:${text}`;

  return `tag:${el.tagName.toLowerCase()}`;
}

function getElementMemoryKey(el: HTMLElement, elements: HTMLElement[]) {
  const zone = getElementZone(el);
  const baseKey = getElementBaseKey(el);
  const peers = elements.filter(candidate => (
    getElementZone(candidate) === zone && getElementBaseKey(candidate) === baseKey
  ));
  const ordinal = Math.max(0, peers.indexOf(el));
  return `${zone}|${baseKey}|${ordinal}`;
}

function getNavigationContext(currentScreen: AppState) {
  if (document.querySelector('[data-stream-detail="movie"]')) {
    return `${currentScreen}:movie-detail`;
  }

  if (document.querySelector('[data-stream-detail="series"]')) {
    return `${currentScreen}:series-detail`;
  }

  return currentScreen;
}

function findMemoryElement(elements: HTMLElement[], memory?: FocusMemory | null) {
  if (!memory) return null;

  return elements.find(element => (
    getElementZone(element) === memory.zone &&
    getElementMemoryKey(element, elements) === memory.key
  )) ?? null;
}

function centerOf(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function focusElement(el: HTMLElement) {
  if (!el.isConnected || !isVisible(el)) return;

  el.focus({ preventScroll: true });
  el.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: 'auto',
  });
}

function findDirectionalElement(elements: HTMLElement[], current: HTMLElement, direction: Direction) {
  const currentCenter = centerOf(current);
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of elements) {
    if (candidate === current) continue;

    const candidateCenter = centerOf(candidate);
    const dx = candidateCenter.x - currentCenter.x;
    const dy = candidateCenter.y - currentCenter.y;

    if (direction === 'right' && dx <= 8) continue;
    if (direction === 'left' && dx >= -8) continue;
    if (direction === 'down' && dy <= 8) continue;
    if (direction === 'up' && dy >= -8) continue;

    const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary * 1.15 + secondary * 2.8;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function findSequentialElement(
  elements: HTMLElement[],
  current: HTMLElement,
  direction: Direction,
) {
  const currentIndex = elements.indexOf(current);
  if (currentIndex < 0) return null;

  const step = direction === 'right' || direction === 'down' ? 1 : -1;
  return elements[currentIndex + step] ?? null;
}

function getElementsInZone(elements: HTMLElement[], zone: NavigationZone) {
  return elements.filter(element => getElementZone(element) === zone);
}

function findWithinCurrentZone(
  elements: HTMLElement[],
  current: HTMLElement,
  direction: Direction,
) {
  const zone = getElementZone(current);
  const zoneElements = getElementsInZone(elements, zone);
  const isHorizontal = direction === 'left' || direction === 'right';
  const isVertical = direction === 'up' || direction === 'down';

  if (isHorizontal && HORIZONTAL_SEQUENTIAL_ZONES.has(zone)) {
    return findSequentialElement(zoneElements, current, direction);
  }

  if (isVertical && VERTICAL_SEQUENTIAL_ZONES.has(zone)) {
    return findSequentialElement(zoneElements, current, direction);
  }

  return findDirectionalElement(zoneElements, current, direction);
}

function findNearestInZones(
  elements: HTMLElement[],
  current: HTMLElement,
  direction: Direction,
  zones: NavigationZone[],
) {
  for (const zone of zones) {
    const candidate = findDirectionalElement(getElementsInZone(elements, zone), current, direction);
    if (candidate) return candidate;
  }

  return null;
}

function findActiveSidebarItem(elements: HTMLElement[]) {
  const sidebarElements = getElementsInZone(elements, 'sidebar');
  return sidebarElements.find(element => element.classList.contains('is-active'))
    ?? sidebarElements[0]
    ?? null;
}

function findPreferredInitialElement(elements: HTMLElement[]) {
  const selectors = [
    '.movie-detail-actions button:not([disabled])',
    '.series-detail-actions button:not([disabled])',
    '.live-feature-actions button:not([disabled])',
    '.catalog-poster-card.is-selected',
    '.live-channel-card.is-selected',
    '.movies-category-chip.is-active',
    '.series-category-chip.is-active',
    '.live-category-chip.is-active',
    '.movies-grid .catalog-poster-card',
    '.series-grid .catalog-poster-card',
    '.live-channel-grid .live-channel-card',
    '[data-tv-back-target="true"]',
  ];

  for (const selector of selectors) {
    const candidate = document.querySelector<HTMLElement>(selector);
    if (candidate && elements.includes(candidate) && isVisible(candidate)) return candidate;
  }

  return elements.find(element => getElementZone(element) !== 'sidebar')
    ?? elements[0]
    ?? null;
}

function findTransitionElement(
  elements: HTMLElement[],
  current: HTMLElement,
  direction: Direction,
  lastNonSidebarMemory?: FocusMemory | null,
) {
  const zone = getElementZone(current);

  if (zone === 'sidebar' && direction === 'right') {
    const remembered = findMemoryElement(elements, lastNonSidebarMemory);
    if (remembered) return remembered;

    return findNearestInZones(
      elements,
      current,
      direction,
      ['header', 'categories', 'feature-actions', 'content', 'detail-actions'],
    ) ?? findPreferredInitialElement(elements);
  }

  if (zone === 'header' && direction === 'down') {
    return findNearestInZones(elements, current, direction, ['categories', 'feature-actions', 'content']);
  }

  if (zone === 'categories') {
    if (direction === 'up') {
      return findNearestInZones(elements, current, direction, ['header']);
    }

    if (direction === 'down') {
      return findNearestInZones(elements, current, direction, ['feature-actions', 'content']);
    }
  }

  if (zone === 'feature-actions') {
    if (direction === 'up') {
      return findNearestInZones(elements, current, direction, ['categories', 'header']);
    }

    if (direction === 'down') {
      return findNearestInZones(elements, current, direction, ['content']);
    }

    if (direction === 'left') return findActiveSidebarItem(elements);
  }

  if (zone === 'content') {
    if (direction === 'left') return findActiveSidebarItem(elements);

    if (direction === 'up') {
      return findNearestInZones(elements, current, direction, ['categories', 'feature-actions', 'header']);
    }

    if (direction === 'down') {
      return findNearestInZones(elements, current, direction, ['footer']);
    }
  }

  if (zone === 'detail-topbar' && direction === 'down') {
    return findNearestInZones(elements, current, direction, ['detail-actions', 'seasons', 'episodes']);
  }

  if (zone === 'detail-actions') {
    if (direction === 'up') {
      return findNearestInZones(elements, current, direction, ['detail-topbar']);
    }

    if (direction === 'down') {
      return findNearestInZones(elements, current, direction, ['seasons', 'episodes', 'recommendations']);
    }
  }

  if (zone === 'seasons') {
    if (direction === 'up') {
      return findNearestInZones(elements, current, direction, ['detail-actions', 'detail-topbar']);
    }

    if (direction === 'down') {
      return findNearestInZones(elements, current, direction, ['episodes']);
    }
  }

  if (zone === 'episodes') {
    if (direction === 'up') {
      return findNearestInZones(elements, current, direction, ['seasons', 'detail-actions']);
    }

    if (direction === 'down') {
      return findNearestInZones(elements, current, direction, ['recommendations']);
    }
  }

  if (zone === 'recommendations' && direction === 'up') {
    return findNearestInZones(elements, current, direction, ['episodes', 'detail-actions']);
  }

  if (zone === 'footer' && direction === 'up') {
    return findNearestInZones(elements, current, direction, ['content']);
  }

  if (zone === 'other') {
    return findDirectionalElement(elements, current, direction);
  }

  return null;
}

function isTypingElement(el: Element | null) {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
}

function shouldAutoFocusForRemote() {
  const userAgent = navigator.userAgent.toLowerCase();
  const looksLikeTv = /android tv|google tv|smarttv|smart-tv|aft|bravia|netcast|web0s|tizen/.test(userAgent);
  const roomyLandscape = window.innerWidth >= 720 && window.innerWidth > window.innerHeight;
  return looksLikeTv || roomyLandscape;
}

function getSafeBackDestination(currentScreen: AppState, previousScreen: AppState | null) {
  if (
    previousScreen &&
    previousScreen !== currentScreen &&
    !INVALID_BACK_DESTINATIONS.has(previousScreen)
  ) {
    return previousScreen;
  }

  return 'home' as const;
}

export function useTvRemoteNavigation() {
  const currentScreen = useAppStore(state => state.currentScreen);
  const previousScreen = useAppStore(state => state.previousScreen);
  const setScreen = useAppStore(state => state.setScreen);
  const focusCacheRef = useRef<FocusCache>({ elements: [], valid: false, rafId: null });
  const focusMemoryRef = useRef(new Map<string, FocusMemory>());
  const lastNonSidebarMemoryRef = useRef(new Map<string, FocusMemory>());

  useEffect(() => {
    const cache = focusCacheRef.current;

    if (currentScreen === 'player') {
      cache.elements = [];
      cache.valid = false;
      if (cache.rafId !== null) {
        window.cancelAnimationFrame(cache.rafId);
        cache.rafId = null;
      }
      return;
    }

    let restoreRafId: number | null = null;
    let initialFocusTimer: number | null = null;

    const rememberFocusedElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement) || !isVisible(target)) return;

      const elements = getFocusableElements(cache);
      if (!elements.includes(target)) return;

      const context = getNavigationContext(currentScreen);
      const memory: FocusMemory = {
        key: getElementMemoryKey(target, elements),
        zone: getElementZone(target),
      };

      focusMemoryRef.current.set(context, memory);
      if (memory.zone !== 'sidebar') {
        lastNonSidebarMemoryRef.current.set(context, memory);
      }
    };

    const restoreFocusIfNeeded = () => {
      restoreRafId = null;
      if (!shouldAutoFocusForRemote()) return;

      const elements = getFocusableElements(cache);
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && active.isConnected && isVisible(active) && elements.includes(active)) {
        return;
      }

      const context = getNavigationContext(currentScreen);
      const remembered = findMemoryElement(elements, focusMemoryRef.current.get(context));
      const target = remembered ?? findPreferredInitialElement(elements);
      if (target) focusElement(target);
    };

    const scheduleFocusRestore = () => {
      if (restoreRafId !== null) return;
      restoreRafId = window.requestAnimationFrame(restoreFocusIfNeeded);
    };

    const prepare = () => {
      refreshFocusableCache(cache);
      scheduleFocusRestore();
    };

    cache.valid = false;
    prepare();
    initialFocusTimer = window.setTimeout(scheduleFocusRestore, 100);

    const observer = new MutationObserver(() => {
      invalidateFocusableCache(cache);
      scheduleFocusRestore();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-hidden', 'hidden', 'tabindex', 'class'],
    });

    window.addEventListener('resize', prepare);
    window.addEventListener('orientationchange', prepare);

    const handleFocusIn = (event: FocusEvent) => rememberFocusedElement(event.target);
    document.addEventListener('focusin', handleFocusIn, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', handleFocusIn, true);
      window.removeEventListener('resize', prepare);
      window.removeEventListener('orientationchange', prepare);

      if (restoreRafId !== null) window.cancelAnimationFrame(restoreRafId);
      if (initialFocusTimer !== null) window.clearTimeout(initialFocusTimer);

      if (cache.rafId !== null) {
        window.cancelAnimationFrame(cache.rafId);
        cache.rafId = null;
      }
    };
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen === 'player') return;

    const cache = focusCacheRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isBackKey = event.key === 'Escape' || event.key === 'Backspace' || event.key === 'GoBack';

      if (isTypingElement(active) && !isBackKey) return;

      const directions: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };

      const direction = directions[event.key];

      if (direction) {
        event.preventDefault();
        const elements = getFocusableElements(cache);
        const current = active && elements.includes(active)
          ? active
          : findPreferredInitialElement(elements);
        if (!current) return;

        const context = getNavigationContext(currentScreen);
        const sameZoneTarget = findWithinCurrentZone(elements, current, direction);
        const transitionTarget = sameZoneTarget
          ? null
          : findTransitionElement(
              elements,
              current,
              direction,
              lastNonSidebarMemoryRef.current.get(context),
            );

        focusElement(sameZoneTarget ?? transitionTarget ?? current);
        return;
      }

      if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === ' ') {
        if (event.repeat) {
          event.preventDefault();
          return;
        }

        if (active && isVisible(active)) {
          event.preventDefault();
          active.click();
        }
        return;
      }

      if (isBackKey) {
        if (event.repeat) {
          event.preventDefault();
          return;
        }

        const localBackTarget = document.querySelector<HTMLElement>('[data-tv-back-target="true"]');

        if (localBackTarget && isVisible(localBackTarget)) {
          event.preventDefault();
          event.stopPropagation();
          (event as KeyboardEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
          localBackTarget.click();
          return;
        }

        if (!ROOT_SCREENS.has(currentScreen)) {
          event.preventDefault();
          event.stopPropagation();
          (event as KeyboardEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
          setScreen(getSafeBackDestination(currentScreen, previousScreen));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [currentScreen, previousScreen, setScreen]);
}
