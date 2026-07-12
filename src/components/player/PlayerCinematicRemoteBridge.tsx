import { useInsertionEffect } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input[type="range"]:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const BACK_KEYS = new Set(['Escape', 'Backspace', 'GoBack']);
const SELECT_KEYS = new Set(['Enter', 'NumpadEnter', ' ']);
const MENU_KEYS = new Set(['Menu', 'ContextMenu', 'Settings']);

function isVisible(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element || !element.isConnected) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0 ||
      current.hidden ||
      current.getAttribute('aria-hidden') === 'true'
    ) {
      return false;
    }

    current = current.parentElement;
  }

  return true;
}

function getFocusableElements(container: ParentNode) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisible);
}

function focusElement(element: HTMLElement | null) {
  if (!isVisible(element)) return;

  element.focus({ preventScroll: true });
  element.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: 'auto',
  });
}

function focusAfterRender(findTarget: () => HTMLElement | null) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      focusElement(findTarget());
    });
  });
}

function stopEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function centerOf(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function findSpatialTarget(
  elements: HTMLElement[],
  current: HTMLElement | null,
  direction: Direction,
) {
  if (elements.length === 0) return null;
  if (!current || !elements.includes(current)) return elements[0] ?? null;

  const origin = centerOf(current);
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of elements) {
    if (candidate === current) continue;

    const point = centerOf(candidate);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    if (direction === 'right' && dx <= 6) continue;
    if (direction === 'left' && dx >= -6) continue;
    if (direction === 'down' && dy <= 6) continue;
    if (direction === 'up' && dy >= -6) continue;

    const primary = direction === 'left' || direction === 'right'
      ? Math.abs(dx)
      : Math.abs(dy);

    const secondary = direction === 'left' || direction === 'right'
      ? Math.abs(dy)
      : Math.abs(dx);

    const score = primary * 1.1 + secondary * 2.8;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best ?? current;
}

function findSequentialTarget(
  elements: HTMLElement[],
  current: HTMLElement | null,
  step: 1 | -1,
) {
  if (elements.length === 0) return null;

  const index = current ? elements.indexOf(current) : -1;
  if (index < 0) return elements[0] ?? null;

  const nextIndex = Math.min(
    elements.length - 1,
    Math.max(0, index + step),
  );

  return elements[nextIndex] ?? current;
}

function getPreferredPanelFocus(panel: HTMLElement) {
  return (
    panel.querySelector<HTMLElement>(
      '.player-cinematic-episode-row.is-current',
    ) ??
    panel.querySelector<HTMLElement>(
      '.player-cinematic-rate-grid button.is-selected',
    ) ??
    panel.querySelector<HTMLElement>(
      '.player-cinematic-panel-close',
    ) ??
    getFocusableElements(panel)[0] ??
    null
  );
}

function getPreferredBaseFocus() {
  return (
    document.querySelector<HTMLElement>(
      '.roneca-exoplayer-center-controls button[aria-label="Pausar"]',
    ) ??
    document.querySelector<HTMLElement>(
      '.roneca-exoplayer-center-controls button[aria-label="Reproduzir"]',
    ) ??
    document.querySelector<HTMLElement>(
      '.player-bottom-panel input[type="range"]',
    ) ??
    null
  );
}

function focusOpenCinematicPanel() {
  focusAfterRender(() => {
    const panel = document.querySelector<HTMLElement>(
      '.player-cinematic-side-panel',
    );

    return panel ? getPreferredPanelFocus(panel) : null;
  });
}

export function PlayerCinematicRemoteBridge() {
  useInsertionEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const shell = document.querySelector<HTMLElement>(
        '.roneca-exoplayer-shell',
      );

      if (!shell) return;

      const active = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

      const directions: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };

      const direction = directions[event.key];
      const isBack = BACK_KEYS.has(event.key);
      const isSelect = SELECT_KEYS.has(event.key);
      const isMenu = MENU_KEYS.has(event.key);

      const openPanel = document.querySelector<HTMLElement>(
        '.player-cinematic-side-panel',
      );

      if (isVisible(openPanel)) {
        const options = getFocusableElements(openPanel);

        if (isBack) {
          stopEvent(event);
          openPanel
            .querySelector<HTMLButtonElement>(
              '.player-cinematic-panel-close',
            )
            ?.click();
          return;
        }

        if (isSelect) {
          stopEvent(event);
          if (event.repeat) return;

          if (active && options.includes(active)) {
            active.click();
          } else {
            focusElement(getPreferredPanelFocus(openPanel));
          }

          return;
        }

        if (direction) {
          stopEvent(event);
          focusElement(findSpatialTarget(options, active, direction));
          return;
        }

        return;
      }

      const quickActions = document.querySelector<HTMLElement>(
        '.player-cinematic-quick-actions',
      );
      const settingsButton = quickActions?.querySelector<HTMLButtonElement>(
        '[aria-controls="player-cinematic-settings"]',
      ) ?? null;

      // Menu pertence exclusivamente ao painel cinematográfico. O botão pode
      // estar visualmente oculto junto dos controles, mas continua disponível
      // para abrir a gaveta e restaurar o foco corretamente.
      if (isMenu && settingsButton) {
        stopEvent(event);
        if (event.repeat) return;

        settingsButton.click();
        focusOpenCinematicPanel();
        return;
      }

      if (!isVisible(quickActions)) return;

      const quickButtons = getFocusableElements(quickActions);
      const activeInQuickActions = Boolean(
        active && quickActions.contains(active),
      );

      if (activeInQuickActions) {
        if (isBack) {
          stopEvent(event);
          focusElement(getPreferredBaseFocus());
          return;
        }

        if (isSelect) {
          stopEvent(event);
          if (event.repeat) return;

          active?.click();
          focusOpenCinematicPanel();
          return;
        }

        if (direction === 'left' || direction === 'right') {
          stopEvent(event);
          focusElement(findSequentialTarget(
            quickButtons,
            active,
            direction === 'left' ? -1 : 1,
          ));
          return;
        }

        if (direction === 'up') {
          stopEvent(event);
          focusElement(
            document.querySelector<HTMLElement>(
              '.player-bottom-panel input[type="range"]',
            ) ?? getPreferredBaseFocus(),
          );
          return;
        }

        if (direction === 'down') {
          stopEvent(event);
          return;
        }
      }

      if (
        direction === 'down' &&
        active?.closest('.player-bottom-panel') &&
        quickButtons.length > 0
      ) {
        stopEvent(event);
        focusElement(quickButtons[0] ?? null);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  return null;
}
