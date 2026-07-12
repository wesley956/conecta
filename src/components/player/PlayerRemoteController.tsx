import { useLayoutEffect, useRef } from 'react';

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
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(isVisible);
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
    window.requestAnimationFrame(() => focusElement(findTarget()));
  });
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
  if (!current || !elements.includes(current)) return elements[0];

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
  const currentIndex = current ? elements.indexOf(current) : -1;
  if (currentIndex < 0) return elements[0];
  const nextIndex = Math.min(elements.length - 1, Math.max(0, currentIndex + step));
  return elements[nextIndex] ?? current;
}

function findButtonByText(container: ParentNode, text: string) {
  const normalized = text.trim().toLowerCase();
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button.textContent?.trim().toLowerCase() === normalized) ?? null;
}

function stopEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function updateRangeFromRemote(input: HTMLInputElement, direction: 'left' | 'right') {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const step = Number(input.step || 1) || 1;
  const current = Number(input.value || min);
  const next = Math.min(max, Math.max(min, current + (direction === 'right' ? step : -step)));

  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function showPlayerControls(shell: HTMLElement) {
  shell.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX: 1,
    clientY: 1,
  }));
}

function getPreferredBaseControl(shell: HTMLElement, direction?: Direction) {
  if (direction === 'up') {
    return shell.querySelector<HTMLElement>('.roneca-exoplayer-top button');
  }

  if (direction === 'down') {
    return shell.querySelector<HTMLElement>('.player-bottom-panel button');
  }

  return shell.querySelector<HTMLElement>(
    'button[aria-label="Pausar"], button[aria-label="Reproduzir"], .player-bottom-panel button',
  );
}

function getBaseControls(shell: HTMLElement) {
  return getFocusableElements(shell).filter(element => (
    !element.closest('.player-channel-drawer') &&
    !element.closest('.player-settings-extension') &&
    !element.closest('.player-next-episode-card') &&
    !element.closest('[data-player-error-layer="true"]')
  ));
}

export function PlayerRemoteController() {
  const forwardingLegacyKeyRef = useRef(false);

  useLayoutEffect(() => {
    const forwardToLegacyPlayer = (key: string) => {
      forwardingLegacyKeyRef.current = true;
      try {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        }));
      } finally {
        forwardingLegacyKeyRef.current = false;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (forwardingLegacyKeyRef.current) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const shell = document.querySelector<HTMLElement>('.roneca-exoplayer-shell');
      if (!shell) return;

      const active = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const isBack = BACK_KEYS.has(event.key);
      const isSelect = SELECT_KEYS.has(event.key);
      const isMenu = MENU_KEYS.has(event.key);
      const directions: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const direction = directions[event.key];

      const nextEpisodeCard = document.querySelector<HTMLElement>('.player-next-episode-card');
      if (isVisible(nextEpisodeCard)) {
        const options = getFocusableElements(nextEpisodeCard);

        if (isBack) {
          stopEvent(event);
          findButtonByText(nextEpisodeCard, 'Cancelar')?.click();
          return;
        }

        if (isSelect) {
          stopEvent(event);
          if (event.repeat) return;
          if (active && options.includes(active)) active.click();
          else focusElement(options[0] ?? null);
          return;
        }

        if (direction) {
          stopEvent(event);
          const step = direction === 'left' || direction === 'up' ? -1 : 1;
          focusElement(findSequentialTarget(options, active, step));
          return;
        }
      }

      const advancedOverlay = document.querySelector<HTMLElement>('.player-advanced-overlay');
      if (isVisible(advancedOverlay)) {
        const panel = advancedOverlay.querySelector<HTMLElement>('.player-advanced-panel') ?? advancedOverlay;
        const options = getFocusableElements(panel);

        if (isBack) {
          stopEvent(event);
          panel.querySelector<HTMLButtonElement>('button[aria-label="Fechar opções"]')?.click();
          return;
        }

        if (isSelect) {
          stopEvent(event);
          if (event.repeat) return;
          if (active && options.includes(active)) active.click();
          else focusElement(options[0] ?? null);
          return;
        }

        if (direction) {
          stopEvent(event);
          focusElement(findSpatialTarget(options, active, direction));
          return;
        }
      }

      const channelDrawer = shell.querySelector<HTMLElement>('.player-channel-drawer');
      if (isVisible(channelDrawer)) {
        const channels = getFocusableElements(channelDrawer);

        if (isBack) {
          stopEvent(event);
          findButtonByText(shell, 'Lista')?.click();
          focusAfterRender(() => findButtonByText(shell, 'Lista'));
          return;
        }

        if (isSelect) {
          stopEvent(event);
          if (event.repeat) return;
          if (active && channels.includes(active)) active.click();
          else focusElement(channelDrawer.querySelector<HTMLElement>('.player-channel-row.is-active') ?? channels[0] ?? null);
          return;
        }

        if (direction) {
          stopEvent(event);
          const step = direction === 'up' || direction === 'left' ? -1 : 1;
          focusElement(findSequentialTarget(channels, active, step));
          return;
        }
      }

      const inlineSettings = shell.querySelector<HTMLElement>('.player-settings-extension');
      if (isVisible(inlineSettings)) {
        const options = getFocusableElements(inlineSettings);

        if (isBack) {
          stopEvent(event);
          shell.querySelector<HTMLButtonElement>('button[aria-label="Abrir opções do player"]')?.click();
          focusAfterRender(() => shell.querySelector<HTMLElement>('button[aria-label="Abrir opções do player"]'));
          return;
        }

        if (isSelect) {
          stopEvent(event);
          if (event.repeat) return;
          if (active && options.includes(active)) active.click();
          else focusElement(options[0] ?? null);
          return;
        }

        if (direction) {
          stopEvent(event);
          focusElement(findSpatialTarget(options, active, direction));
          return;
        }
      }

      const errorHeading = Array.from(shell.querySelectorAll<HTMLElement>('h1'))
        .find(element => element.textContent?.trim() === 'Reprodução indisponível');
      const errorLayer = errorHeading?.closest<HTMLElement>('.absolute');
      if (isVisible(errorLayer)) {
        const options = getFocusableElements(errorLayer);

        if (isBack) {
          stopEvent(event);
          findButtonByText(errorLayer, 'Voltar')?.click();
          return;
        }

        if (isSelect) {
          stopEvent(event);
          if (event.repeat) return;
          if (active && options.includes(active)) active.click();
          else focusElement(options[0] ?? null);
          return;
        }

        if (direction) {
          stopEvent(event);
          focusElement(findSpatialTarget(options, active, direction));
          return;
        }
      }

      if (isMenu) {
        stopEvent(event);
        document.querySelector<HTMLButtonElement>('.player-advanced-trigger')?.click();
        focusAfterRender(() => document.querySelector<HTMLElement>('.player-advanced-panel [data-player-option="true"]'));
        return;
      }

      const controls = getBaseControls(shell);
      const controlsVisible = controls.length > 0;

      if (isBack) {
        if (controlsVisible) {
          stopEvent(event);
          active?.blur();
          forwardToLegacyPlayer('ArrowDown');
        }
        return;
      }

      if (isSelect) {
        stopEvent(event);
        if (event.repeat) return;

        if (!controlsVisible) {
          showPlayerControls(shell);
          focusAfterRender(() => getPreferredBaseControl(shell));
          return;
        }

        const target = active && controls.includes(active)
          ? active
          : getPreferredBaseControl(shell);
        target?.click();

        if (target?.textContent?.trim() === 'Lista') {
          focusAfterRender(() => (
            shell.querySelector<HTMLElement>('.player-channel-row.is-active') ??
            shell.querySelector<HTMLElement>('.player-channel-row')
          ));
        } else if (target?.getAttribute('aria-label') === 'Abrir opções do player') {
          focusAfterRender(() => shell.querySelector<HTMLElement>('.player-settings-extension button:not(:disabled)'));
        }
        return;
      }

      if (!direction) return;

      if (!controlsVisible) {
        stopEvent(event);

        if (direction === 'left' || direction === 'right') {
          const seekButton = shell.querySelector<HTMLButtonElement>(
            direction === 'left'
              ? 'button[aria-label="Retroceder 10 segundos"]'
              : 'button[aria-label="Avançar 10 segundos"]',
          );

          if (seekButton) {
            seekButton.click();
            focusAfterRender(() => seekButton);
            return;
          }
        }

        showPlayerControls(shell);
        focusAfterRender(() => getPreferredBaseControl(shell, direction));
        return;
      }

      stopEvent(event);

      if (
        active instanceof HTMLInputElement &&
        active.type === 'range' &&
        (direction === 'left' || direction === 'right')
      ) {
        updateRangeFromRemote(active, direction);
        return;
      }

      const current = active && controls.includes(active) ? active : getPreferredBaseControl(shell, direction);
      focusElement(findSpatialTarget(controls, current, direction));
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return null;
}
