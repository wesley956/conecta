const URL_PATTERN = /\b(?:https?|xtream):\/\/[^\s<>"']+/gi;
const LABELED_SECRET_PATTERN = /\b(username|user|usuario|password|passwd|senha|token|credential|credencial|secret|apikey|api_key)\s*[:=]\s*[^\s,;]+/gi;

export function safeDiagnosticText(value: unknown, limit = 800): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;

  return normalized
    .replace(URL_PATTERN, '[URL protegida]')
    .replace(LABELED_SECRET_PATTERN, (_match, label: string) => `${label}=[protegido]`)
    .slice(0, limit);
}

export function safeDiagnosticIdentifier(value: unknown, limit = 180): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > limit) return null;
  return /^[a-zA-Z0-9:_-]+$/.test(normalized) ? normalized : null;
}

export function safeDiagnosticJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeDiagnosticJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (/password|passwd|username|credential|secret|token|playlist[_-]?url|m3u[_-]?url/i.test(key)) {
        return [key, '[protegido]'];
      }
      return [key, safeDiagnosticJson(entry)];
    }));
  }
  return typeof value === 'string' ? safeDiagnosticText(value, 1_000) : value;
}
