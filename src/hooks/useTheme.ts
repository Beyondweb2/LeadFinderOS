import { useState, useEffect, useCallback } from 'react';

export interface ThemeColors {
  primary: string;
  background: string;
  card: string;
  accent: string;
}

const DEFAULT_THEME: ThemeColors = {
  primary: '173 80% 45%', // Teal/cyan
  background: '222 47% 6%', // Dark blue
  card: '222 47% 8%',
  accent: '173 58% 35%',
};

const PRESET_THEMES: { name: string; colors: ThemeColors }[] = [
  {
    name: 'Default Teal',
    colors: DEFAULT_THEME,
  },
  {
    name: 'Ocean Blue',
    colors: {
      primary: '210 100% 50%',
      background: '220 40% 8%',
      card: '220 40% 10%',
      accent: '210 80% 40%',
    },
  },
  {
    name: 'Purple Haze',
    colors: {
      primary: '270 70% 55%',
      background: '280 30% 8%',
      card: '280 30% 10%',
      accent: '270 50% 45%',
    },
  },
  {
    name: 'Sunset Orange',
    colors: {
      primary: '25 95% 55%',
      background: '20 30% 6%',
      card: '20 30% 8%',
      accent: '25 75% 45%',
    },
  },
  {
    name: 'Emerald Green',
    colors: {
      primary: '142 76% 45%',
      background: '150 30% 6%',
      card: '150 30% 8%',
      accent: '142 56% 35%',
    },
  },
  {
    name: 'Rose Pink',
    colors: {
      primary: '350 80% 60%',
      background: '340 25% 7%',
      card: '340 25% 9%',
      accent: '350 60% 50%',
    },
  },
  {
    name: 'Gold Rush',
    colors: {
      primary: '45 95% 50%',
      background: '40 30% 6%',
      card: '40 30% 8%',
      accent: '45 75% 40%',
    },
  },
  {
    name: 'Cyber Cyan',
    colors: {
      primary: '185 100% 50%',
      background: '200 50% 5%',
      card: '200 50% 7%',
      accent: '185 80% 40%',
    },
  },
];

const STORAGE_KEY = 'leadfinder-theme';

function applyThemeToDocument(colors: ThemeColors) {
  const root = document.documentElement;
  
  // Primary colors
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--ring', colors.primary);
  root.style.setProperty('--sidebar-primary', colors.primary);
  root.style.setProperty('--sidebar-ring', colors.primary);
  
  // Background colors
  root.style.setProperty('--background', colors.background);
  
  // Card colors
  root.style.setProperty('--card', colors.card);
  root.style.setProperty('--popover', colors.card);
  root.style.setProperty('--sidebar-background', colors.card);
  
  // Accent colors
  root.style.setProperty('--accent', colors.accent);
  
  // Update derived colors
  const primaryHue = colors.primary.split(' ')[0];
  root.style.setProperty('--secondary', `${colors.background.split(' ')[0]} 47% 14%`);
  root.style.setProperty('--muted', `${colors.background.split(' ')[0]} 47% 12%`);
  root.style.setProperty('--border', `${colors.background.split(' ')[0]} 30% 18%`);
  root.style.setProperty('--input', `${colors.background.split(' ')[0]} 30% 15%`);
  root.style.setProperty('--sidebar-accent', `${colors.background.split(' ')[0]} 47% 14%`);
  root.style.setProperty('--sidebar-border', `${colors.background.split(' ')[0]} 30% 18%`);
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
