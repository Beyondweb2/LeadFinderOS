import { useState, useEffect, useCallback } from 'react';

export interface ThemeColors {
  primary: string;
}

const DEFAULT_THEME: ThemeColors = {
  primary: '173 80% 45%', // Teal/cyan
};

const PRESET_THEMES: { name: string; colors: ThemeColors }[] = [
  { name: 'Teal', colors: { primary: '173 80% 45%' } },
  { name: 'Ocean Blue', colors: { primary: '210 100% 50%' } },
  { name: 'Purple', colors: { primary: '270 70% 55%' } },
  { name: 'Orange', colors: { primary: '25 95% 55%' } },
  { name: 'Emerald', colors: { primary: '142 76% 45%' } },
  { name: 'Rose', colors: { primary: '350 80% 60%' } },
  { name: 'Gold', colors: { primary: '45 95% 50%' } },
  { name: 'Cyan', colors: { primary: '185 100% 50%' } },
];

const STORAGE_KEY = 'leadfinder-theme';

function applyThemeToDocument(colors: ThemeColors) {
  const root = document.documentElement;
  
  // Only update primary/accent colors - background stays dark
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--ring', colors.primary);
  root.style.setProperty('--sidebar-primary', colors.primary);
  root.style.setProperty('--sidebar-ring', colors.primary);
  
  // Derive accent from primary (slightly darker/muted version)
  const parts = colors.primary.split(' ');
  const h = parts[0];
  const s = parseInt(parts[1]) - 20;
  const l = parseInt(parts[2]) - 10;
  root.style.setProperty('--accent', `${h} ${s}% ${l}%`);
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    if (savedTheme) {
      try {
        const parsed = JSON.parse(savedTheme);
        setTheme(parsed);
        applyThemeToDocument(parsed);
      } catch (e) {
        console.error('Failed to parse saved theme:', e);
      }
    }
    setIsLoaded(true);
  }, []);

  const updateTheme = useCallback((newColors: Partial<ThemeColors>) => {
    setTheme(prev => {
      const updated = { ...prev, ...newColors };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      applyThemeToDocument(updated);
      return updated;
    });
  }, []);

  const setPreset = useCallback((presetIndex: number) => {
    const preset = PRESET_THEMES[presetIndex];
    if (preset) {
      setTheme(preset.colors);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preset.colors));
      applyThemeToDocument(preset.colors);
    }
  }, []);

  const resetTheme = useCallback(() => {
    setTheme(DEFAULT_THEME);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_THEME));
    applyThemeToDocument(DEFAULT_THEME);
  }, []);

  return {
    theme,
    presets: PRESET_THEMES,
    isLoaded,
    updateTheme,
    setPreset,
    resetTheme,
  };
}
