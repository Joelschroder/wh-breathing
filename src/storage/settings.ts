import { DEFAULT_SETTINGS, type BreathingSettings } from '../types';

const KEY = 'wh-breathing:settings:v1';

export function loadSettings(): BreathingSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<BreathingSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: BreathingSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignorera */
  }
}
