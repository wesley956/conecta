import { useEffect } from 'react';
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

function getFocusableElements() {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(isVisible);
}

function prepareFocusableElements() {
  const elements = getFocusableElements();

  for (const el of elements) {
    if (!el.hasAttribute('tabindex')) {
      el.tabIndex = 0;
    }

    el.classList.add('tv-focusable');
  }

  return elements;
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
    behavior: 'smooth',
  });
}

function findNextElement(current: HTMLElement, direction: 'up' | 'down' | 'left' | 'right') {
  const elements = getFocusableElements();
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

export function useTvRemoteNavigation() {
  const currentScreen = useAppStore((state) => state.currentScreen);
  const setScreen = useAppStore((state) => state.setScreen);

  useEffect(() => {
    const prepare = () => {
      const elements = prepareFocusableElements();
      const active = document.activeElement as HTMLElement | null;

      if (!active || active === document.body || !isVisible(active)) {
        const first = elements[0];

        if (first) {
          setTimeout(() => focusElement(first), 120);
        }
      }
    };

    prepare();

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(prepare);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-hidden'],
    });

    return () => observer.disconnect();
  }, [currentScreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;

      if (isTypingElement(active)) return;

      const directions: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };

      const direction = directions[event.key];

      if (direction) {
        event.preventDefault();

        const elements = prepareFocusableElements();
        const current = active && elements.includes(active) ? active : elements[0];

        if (!current) return;

        const next = findNextElement(current, direction);
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
