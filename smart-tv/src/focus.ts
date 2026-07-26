const selector = "[data-tv-focusable='true']:not([disabled])";

type Direction = "up" | "down" | "left" | "right";

function center(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function moveFocus(direction: Direction): void {
  const current = document.activeElement as HTMLElement | null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (!candidates.length) return;

  if (!current || !candidates.includes(current)) {
    candidates[0].focus();
    candidates[0].scrollIntoView({ block: "nearest", inline: "nearest" });
    return;
  }

  const origin = center(current);
  const ranked = candidates
    .filter((candidate) => candidate !== current)
    .map((candidate) => {
      const target = center(candidate);
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const valid =
        (direction === "left" && dx < -2) ||
        (direction === "right" && dx > 2) ||
        (direction === "up" && dy < -2) ||
        (direction === "down" && dy > 2);
      const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
      const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      return { candidate, valid, score: primary + secondary * 2.8 };
    })
    .filter(({ valid }) => valid)
    .sort((a, b) => a.score - b.score);

  const next = ranked[0]?.candidate;
  next?.focus();
  next?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
