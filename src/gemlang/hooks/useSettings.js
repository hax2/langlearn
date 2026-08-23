import { useState, useCallback } from 'react';

const STORAGE_KEY = 'gemlang-settings';

export const DEFAULT_SETTINGS = {
  challengeInterval: 5,   // sentences between challenges (0 = off)
  speechRate: 0.85,        // TTS speed
  autoPlayAudio: true,     // auto-play on new sentence
  autoRevealSpanish: false, // skip the reveal step
  swipeToNext: true,       // swipe left/right to navigate on mobile
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    /* corrupted data – fall back to defaults */
  }
  return { ...DEFAULT_SETTINGS };
};

const persistSettings = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage full / blocked – silently ignore */
  }
};

export default function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      persistSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    persistSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSetting, resetSettings };
}
