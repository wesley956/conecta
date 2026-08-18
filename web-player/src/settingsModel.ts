import type { CanonicalPreferences } from './types';

export type ReducedMotionPreference = 'system' | 'reduce' | 'allow';

export type LocalWebSettings = {
  autoplayNextEpisode: boolean;
  reducedMotion: ReducedMotionPreference;
};

const SETTINGS_KEY = 'roneca.web.settings.v1';

const defaults: LocalWebSettings = {
  autoplayNextEpisode: false,
  reducedMotion: 'system',
};

export function readLocalWebSettings(): LocalWebSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<LocalWebSettings>;
    return {
      autoplayNextEpisode: parsed.autoplayNextEpisode === true,
      reducedMotion: parsed.reducedMotion === 'reduce' || parsed.reducedMotion === 'allow'
        ? parsed.reducedMotion
        : 'system',
    };
  } catch {
    return defaults;
  }
}

export function writeLocalWebSettings(next: LocalWebSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Preferências locais são progressivas e nunca bloqueiam reprodução.
  }
}

export function patchLocalWebSettings(
  current: LocalWebSettings,
  patch: Partial<LocalWebSettings>,
): LocalWebSettings {
  const next: LocalWebSettings = {
    autoplayNextEpisode: patch.autoplayNextEpisode ?? current.autoplayNextEpisode,
    reducedMotion: patch.reducedMotion ?? current.reducedMotion,
  };
  writeLocalWebSettings(next);
  return next;
}

export function effectiveReducedMotion(
  preference: ReducedMotionPreference,
  systemReducedMotion: boolean,
) {
  if (preference === 'reduce') return true;
  if (preference === 'allow') return false;
  return systemReducedMotion;
}

export type SettingsViewModel = {
  aspectMode: CanonicalPreferences['aspectMode'];
  language: string | null;
  subtitleLanguage: string | null;
  autoplayNextEpisode: boolean;
  reducedMotion: ReducedMotionPreference;
};

export function settingsViewModel(
  canonical: CanonicalPreferences | null,
  local: LocalWebSettings,
): SettingsViewModel {
  return {
    aspectMode: canonical?.aspectMode ?? 'contain',
    language: canonical?.language ?? null,
    subtitleLanguage: canonical?.subtitleLanguage ?? null,
    autoplayNextEpisode: local.autoplayNextEpisode,
    reducedMotion: local.reducedMotion,
  };
}

export function aspectLabel(value: CanonicalPreferences['aspectMode']) {
  if (value === 'cover') return 'Preencher';
  if (value === 'fill') return 'Estender';
  return 'Original';
}

export function languageLabel(value: string | null) {
  if (!value) return 'Automático';
  return value.toLocaleUpperCase('pt-BR');
}

export function subtitleLabel(value: string | null) {
  if (!value) return 'Desativada';
  return value.toLocaleUpperCase('pt-BR');
}
