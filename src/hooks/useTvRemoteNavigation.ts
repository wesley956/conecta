import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[data-tv-focusable="true"]',
].join(',');

type Direction = 'up' | 'down' | 'left' | 'right';

interface FocusCache {
  elements: HTMLElement[];
  valid: boolean;
  rafId: number | null;
}

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
    if (!el.hasAttribute('tabindex')) {
      el.tabIndex = 0;
    }

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

  // Não consulta layout/computedStyle de todos os cards a cada seta. A cache é
  // invalidada quando a estrutura ou os atributos de acessibilidade mudam.
  const connected = cache.elements.filter(el => el.isConnected);
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

function centerOf(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function focusElement(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: 'auto',
  });
}

function findNextElement(elements: HTMLElement[], current: HTMLElement, direction: Direction) {
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
    const score = primary * 1.2 + secondary * 2.4;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
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

export function useTvRemoteNavigation() {
  const currentScreen = useAppStore(state => state.currentScreen);
  const setScreen = useAppStore(state => state.setScreen);
  const focusCacheRef = useRef<FocusCache>({ elements: [], valid: false, rafId: null });

  useEffect(() => {
    const cache = focusCacheRef.current;

    // O player possui listeners próprios. Antes, o observador global continuava
    // reagindo à atualização da barra de progresso e varria o DOM durante o vídeo.
    if (currentScreen === 'player') {
      cache.elements = [];
      cache.valid = false;
      if (cache.rafId !== null) {
        window.cancelAnimationFrame(cache.rafId);
        cache.rafId = null;
      }
      return;
    }

    const prepare = () => {
      const elements = refreshFocusableCache(cache);
      const active = document.activeElement as HTMLElement | null;

      if (
        shouldAutoFocusForRemote() &&
        (!active || active === document.body || !active.isConnected || !isVisible(active))
      ) {
        const first = elements[0];
        if (first) window.setTimeout(() => focusElement(first), 90);
      }
    };

    cache.valid = false;
    prepare();

    const observer = new MutationObserver(() => invalidateFocusableCache(cache));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      // Alterações de style acontecem constantemente em barras de progresso.
      // A estrutura e estes atributos bastam para manter a navegação correta.
      attributeFilter: ['disabled', 'aria-hidden', 'hidden', 'tabindex'],
    });

    window.addEventListener('resize', prepare);
    window.addEventListener('orientationchange', prepare);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', prepare);
      window.removeEventListener('orientationchange', prepare);

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
      if (isTypingElement(active)) return;

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
        const current = active && elements.includes(active) ? active : elements[0];
        if (!current) return;

        const next = findNextElement(elements, current, direction);
        focusElement(next ?? current);
        return;
      }

      if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === ' ') {
        if (active && isVisible(active)) {
          event.preventDefault();
          active.click();
        }
        return;
      }

      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'GoBack') {
        const localBackTarget = document.querySelector<HTMLElement>('[data-tv-back-target="true"]');

        if (localBackTarget && isVisible(localBackTarget)) {
          event.preventDefault();
          event.stopPropagation();
          (event as KeyboardEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
          localBackTarget.click();
          return;
        }

        if (currentScreen !== 'home' && currentScreen !== 'activation') {
          event.preventDefault();
          setScreen('home');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [currentScreen, setScreen]);
}
