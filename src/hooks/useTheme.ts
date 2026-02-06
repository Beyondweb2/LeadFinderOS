import { useState, useEffect, useCallback } from 'react';

export interface ThemeColors {
  primary: string;
  background: string;
}

const DEFAULT_THEME: ThemeColors = {
  primary: '173 80% 45%', // Teal/cyan
  background: '222 47% 6%', // Dark blue
};

const PRESET_THEMES: { name: string; colors: ThemeColors }[] = [
  { name: 'Teal', colors: { primary: '173 80% 45%', background: '222 47% 6%' } },
  { name: 'Ocean Blue', colors: { primary: '210 100% 50%', background: '220 40% 8%' } },
  { name: 'Purple', colors: { primary: '270 70% 55%', background: '280 30% 8%' } },
  { name: 'Orange', colors: { primary: '25 95% 55%', background: '20 30% 6%' } },
  { name: 'Emerald', colors: { primary: '142 76% 45%', background: '150 30% 6%' } },
  { name: 'Rose', colors: { primary: '350 80% 60%', background: '340 25% 7%' } },
  { name: 'Gold', colors: { primary: '45 95% 50%', background: '40 30% 6%' } },
  { name: 'Cyan', colors: { primary: '185 100% 50%', background: '200 50% 5%' } },
];

const STORAGE_KEY = 'leadfinder-theme';

function applyThemeToDocument(colors: ThemeColors) {
  const root = document.documentElement;
  
  // Primary/accent colors
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--ring', colors.primary);
  root.style.setProperty('--sidebar-primary', colors.primary);
  root.style.setProperty('--sidebar-ring', colors.primary);
  
  // Derive accent from primary
  const primaryParts = colors.primary.split(' ');
  const pH = primaryParts[0];
  const pS = parseInt(primaryParts[1]) - 20;
  const pL = parseInt(primaryParts[2]) - 10;
  root.style.setProperty('--accent', `${pH} ${Math.max(0, pS)}% ${Math.max(0, pL)}%`);
  
  // Background colors
  root.style.setProperty('--background', colors.background);
  
  // Derive other colors from background
  const bgParts = colors.background.split(' ');
  const bgH = bgParts[0];
  const bgS = parseInt(bgParts[1]);
  const bgL = parseInt(bgParts[2]);
  
  root.style.setProperty('--card', `${bgH} ${bgS}% ${bgL + 2}%`);
  root.style.setProperty('--popover', `${bgH} ${bgS}% ${bgL + 4}%`);
  root.style.setProperty('--sidebar-background', `${bgH} ${bgS}% ${bgL + 2}%`);
  root.style.setProperty('--secondary', `${bgH} ${bgS}% ${bgL + 8}%`);
  root.style.setProperty('--muted', `${bgH} ${bgS}% ${bgL + 6}%`);
  root.style.setProperty('--border', `${bgH} ${Math.max(0, bgS - 17)}% ${bgL + 12}%`);
  root.style.setProperty('--input', `${bgH} ${Math.max(0, bgS - 17)}% ${bgL + 9}%`);
  root.style.setProperty('--sidebar-accent', `${bgH} ${bgS}% ${bgL + 8}%`);
  root.style.setProperty('--sidebar-border', `${bgH} ${Math.max(0, bgS - 17)}% ${bgL + 12}%`);
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
        // Migrate old theme format if needed
        if (!parsed.background) {
          parsed.background = DEFAULT_THEME.background;
        }
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
