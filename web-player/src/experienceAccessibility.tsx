import { useEffect } from 'react';

function asHTMLElement(value: Element | null): HTMLElement | null {
  return value instanceof HTMLElement ? value : null;
}

function visibleDialog() {
  return asHTMLElement(document.querySelector('.detail-overlay[role="dialog"]'));
}

function closeHoverPreview() {
  const preview = asHTMLElement(document.querySelector('.hover-preview'));
  if (!preview) return false;
  preview.dispatchEvent(new MouseEvent('mouseout', {
    bubbles: true,
    cancelable: true,
    relatedTarget: document.body,
  }));
  return true;
}

function moveTab(current: HTMLElement, direction: 1 | -1 | 'first' | 'last') {
  const tablist = current.closest('[role="tablist"]');
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')];
  const index = tabs.indexOf(current);
  if (index < 0 || !tabs.length) return;
  const nextIndex = direction === 'first'
    ? 0
    : direction === 'last'
      ? tabs.length - 1
      : (index + direction + tabs.length) % tabs.length;
  const next = tabs[nextIndex];
  next?.focus();
  next?.click();
}

export function ExperienceAccessibilityController() {
  useEffect(() => {
    let lastFocused: HTMLElement | null = null;
    let dialogOpen = false;
    let previousOverflow = '';

    const syncDialog = () => {
      const dialog = visibleDialog();
      if (dialog && !dialogOpen) {
        const active = asHTMLElement(document.activeElement);
        if (active && active !== document.body && !dialog.contains(active)) lastFocused = active;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogOpen = true;
        window.requestAnimationFrame(() => {
          const close = asHTMLElement(dialog.querySelector('.detail-close'));
          if (close && !dialog.contains(document.activeElement)) close.focus();
        });
        return;
      }
      if (!dialog && dialogOpen) {
        dialogOpen = false;
        document.body.style.overflow = previousOverflow;
        const target = lastFocused;
        lastFocused = null;
        if (target?.isConnected) window.requestAnimationFrame(() => target.focus());
      }
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    syncDialog();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const dialog = visibleDialog();
        if (dialog) {
          const close = asHTMLElement(dialog.querySelector('.detail-close'));
          if (close) {
            event.preventDefault();
            event.stopPropagation();
            close.click();
            return;
          }
        }
        if (closeHoverPreview()) {
          event.preventDefault();
          return;
        }
      }

      const target = asHTMLElement(event.target as Element | null);
      if (!target?.matches('[role="tab"]')) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveTab(target, 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveTab(target, -1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        moveTab(target, 'first');
      } else if (event.key === 'End') {
        event.preventDefault();
        moveTab(target, 'last');
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown, true);
      if (dialogOpen) document.body.style.overflow = previousOverflow;
    };
  }, []);

  return null;
}
