import { useEffect } from 'react';

type SectionId = 'home' | 'search' | 'live' | 'movies' | 'series' | 'library';
type SectionState = { scrollY: number; focusLabel?: string };
type NavigationState = Partial<Record<SectionId, SectionState>>;

const STORAGE_KEY = 'roneca.web.navigation-state.v1';

function readState(): NavigationState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NavigationState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(state: NavigationState) {
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* progressive enhancement */ }
}

function currentSection(): SectionId | null {
  const label = document.querySelector<HTMLButtonElement>('.side-nav nav button.active')?.textContent?.trim().toLocaleLowerCase('pt-BR') || '';
  if (label.includes('início') || label.includes('inicio')) return 'home';
  if (label.includes('buscar')) return 'search';
  if (label === 'tv' || label.includes('tv')) return 'live';
  if (label.includes('filmes')) return 'movies';
  if (label.includes('séries') || label.includes('series')) return 'series';
  if (label.includes('lista')) return 'library';
  return null;
}

function focusLabelFrom(target: EventTarget | null) {
  if (!(target instanceof Element)) return undefined;
  const focusable = target.closest<HTMLElement>('.poster-card[aria-label], .channel-card[aria-label]');
  return focusable?.getAttribute('aria-label') || undefined;
}

function restoreFocus(label?: string) {
  if (!label) return;
  const candidate = [...document.querySelectorAll<HTMLElement>('.poster-card[aria-label], .channel-card[aria-label]')]
    .find(element => element.getAttribute('aria-label') === label);
  candidate?.focus({ preventScroll: true });
}

export function NavigationStateRestorer() {
  useEffect(() => {
    let section = currentSection();
    let state = readState();
    let raf = 0;
    let restoreTimer = 0;

    const save = (focusLabel?: string) => {
      if (!section) return;
      const previous = state[section] || { scrollY: 0 };
      state = {
        ...state,
        [section]: {
          scrollY: Math.max(0, window.scrollY),
          focusLabel: focusLabel ?? previous.focusLabel,
        },
      };
      writeState(state);
    };

    const scheduleScrollSave = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        save();
      });
    };

    const restore = (next: SectionId) => {
      const target = state[next];
      if (!target) return;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: Math.max(0, target.scrollY), behavior: 'auto' });
          restoreTimer = window.setTimeout(() => restoreFocus(target.focusLabel), 90);
        });
      });
    };

    const detectSection = () => {
      const next = currentSection();
      if (!next || next === section) return;
      save();
      section = next;
      state = readState();
      restore(next);
    };

    const onFocusOrClick = (event: Event) => {
      const label = focusLabelFrom(event.target);
      if (label) save(label);
    };

    const observer = new MutationObserver(detectSection);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
    window.addEventListener('scroll', scheduleScrollSave, { passive: true });
    window.addEventListener('focusin', onFocusOrClick, true);
    window.addEventListener('click', onFocusOrClick, true);
    window.addEventListener('pagehide', () => save());

    if (section) restore(section);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', scheduleScrollSave);
      window.removeEventListener('focusin', onFocusOrClick, true);
      window.removeEventListener('click', onFocusOrClick, true);
      if (raf) window.cancelAnimationFrame(raf);
      if (restoreTimer) window.clearTimeout(restoreTimer);
      save();
    };
  }, []);

  return null;
}
