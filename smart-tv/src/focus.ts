const selector = "[data-tv-focusable='true']:not([disabled])";

type Direction = "up" | "down" | "left" | "right";

const focusMemory = new Map<string, string>();

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function candidates(root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
}

function center(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { rect, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function focusElement(element: HTMLElement | null | undefined) {
  if (!element || !isVisible(element)) return false;
  element.focus();
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  return document.activeElement === element;
}

export function rememberFocus(scope: string): void {
  const current = document.activeElement as HTMLElement | null;
  const key = current?.dataset.focusKey;
  if (key) focusMemory.set(scope, key);
}

export function restoreFocus(scope: string, root: ParentNode = document): boolean {
  const key = focusMemory.get(scope);
  if (!key) return false;
  const available = candidates(root);
  let match: HTMLElement | null = null;
  for (let index = 0; index < available.length; index += 1) {
    if (available[index].dataset.focusKey === key) { match = available[index]; break; }
  }
  if (!match) return false;
  focusMemory.delete(scope);
  return focusElement(match);
}

export function clearRememberedFocus(scope: string): void {
  focusMemory.delete(scope);
}

export function focusAutofocus(root: ParentNode = document): boolean {
  const preferred = root.querySelector<HTMLElement>("[data-autofocus='true']");
  if (focusElement(preferred)) return true;
  return focusElement(candidates(root)[0]);
}

export function moveFocus(direction: Direction, root: ParentNode = document): void {
  const current = document.activeElement as HTMLElement | null;
  const available = candidates(root);
  if (!available.length) return;

  if (!current || available.indexOf(current) < 0) {
    focusElement(available[0]);
    return;
  }

  const origin = center(current);
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const horizontal = direction === "left" || direction === "right";

  for (let index = 0; index < available.length; index += 1) {
    const candidate = available[index];
    if (candidate === current) continue;
    const target = center(candidate);
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const valid =
      (direction === "left" && dx < -2) ||
      (direction === "right" && dx > 2) ||
      (direction === "up" && dy < -2) ||
      (direction === "down" && dy > 2);
    if (!valid) continue;

    const primary = horizontal ? Math.abs(dx) : Math.abs(dy);
    const secondary = horizontal ? Math.abs(dy) : Math.abs(dx);
    const crossOverlap = horizontal
      ? target.rect.bottom >= origin.rect.top && target.rect.top <= origin.rect.bottom
      : target.rect.right >= origin.rect.left && target.rect.left <= origin.rect.right;
    const lanePenalty = crossOverlap ? 0 : 180;
    const secondaryWeight = crossOverlap ? 0.45 : 2.6;
    const score = primary + secondary * secondaryWeight + lanePenalty;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  focusElement(best);
}