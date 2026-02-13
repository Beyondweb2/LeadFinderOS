import { useState, useEffect, useCallback } from 'react';

// Theme mode types
export type ThemeMode = 'dark' | 'light';

// Theme presets with background/surface colors
export interface ThemePreset {
  id: string;
  name: string;
  mode: ThemeMode;
  background: string;
  card: string;
  popover: string;
  secondary: string;
  muted: string;
  foreground: string;
  mutedForeground: string;
  secondaryForeground: string;
  border: string;
  input: string;
  preview: string; // hex for preview swatch
}

// 6 Dark themes
export const DARK_THEMES: ThemePreset[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    background: '222 47% 4%',
    card: '220 40% 6%',
    popover: '220 40% 8%',
    secondary: '220 40% 10%',
    muted: '220 40% 8%',
    foreground: '210 40% 98%',
    mutedForeground: '215 20% 50%',
    secondaryForeground: '210 40% 95%',
    border: '220 30% 12%',
    input: '220 30% 10%',
    preview: '#05070B',
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    mode: 'dark',
    background: '0 0% 7%',
    card: '0 0% 10%',
    popover: '0 0% 12%',
    secondary: '0 0% 14%',
    muted: '0 0% 12%',
    foreground: '0 0% 98%',
    mutedForeground: '0 0% 55%',
    secondaryForeground: '0 0% 90%',
    border: '0 0% 18%',
    input: '0 0% 14%',
    preview: '#121212',
  },
  {
    id: 'slate',
    name: 'Slate',
    mode: 'dark',
    background: '215 25% 8%',
    card: '215 25% 11%',
    popover: '215 25% 13%',
    secondary: '215 20% 16%',
    muted: '215 25% 13%',
    foreground: '210 30% 98%',
    mutedForeground: '215 15% 55%',
    secondaryForeground: '210 20% 90%',
    border: '215 20% 20%',
    input: '215 25% 14%',
    preview: '#111827',
  },
  {
    id: 'navy',
    name: 'Navy',
    mode: 'dark',
    background: '230 35% 6%',
    card: '230 35% 9%',
    popover: '230 35% 11%',
    secondary: '230 30% 14%',
    muted: '230 35% 11%',
    foreground: '220 30% 98%',
    mutedForeground: '230 15% 55%',
    secondaryForeground: '220 25% 90%',
    border: '230 25% 18%',
    input: '230 35% 12%',
    preview: '#0A0F1F',
  },
  {
    id: 'forest',
    name: 'Forest',
    mode: 'dark',
    background: '160 25% 5%',
    card: '160 25% 8%',
    popover: '160 25% 10%',
    secondary: '160 20% 13%',
    muted: '160 25% 10%',
    foreground: '150 20% 98%',
    mutedForeground: '160 15% 50%',
    secondaryForeground: '150 15% 90%',
    border: '160 20% 16%',
    input: '160 25% 11%',
    preview: '#0A1410',
  },
  {
    id: 'plum',
    name: 'Plum',
    mode: 'dark',
    background: '280 25% 6%',
    card: '280 25% 9%',
    popover: '280 25% 11%',
    secondary: '280 20% 14%',
    muted: '280 25% 11%',
    foreground: '270 20% 98%',
    mutedForeground: '280 15% 50%',
    secondaryForeground: '270 15% 90%',
    border: '280 20% 18%',
    input: '280 25% 12%',
    preview: '#120A18',
  },
];

// 6 Light themes - high-contrast, clean SaaS
export const LIGHT_THEMES: ThemePreset[] = [
  {
    id: 'blush',
    name: 'Blush',
    mode: 'light',
    background: '350 30% 95%',
    card: '0 0% 100%',
    popover: '0 0% 100%',
    secondary: '350 20% 91%',
    muted: '350 15% 93%',
    foreground: '350 20% 10%',
    mutedForeground: '350 10% 42%',
    secondaryForeground: '350 15% 18%',
    border: '350 15% 85%',
    input: '350 20% 92%',
    preview: '#F5ECEE',
  },
  {
    id: 'peach',
    name: 'Peach',
    mode: 'light',
    background: '30 35% 95%',
    card: '0 0% 100%',
    popover: '0 0% 100%',
    secondary: '30 25% 91%',
    muted: '30 18% 93%',
    foreground: '25 25% 10%',
    mutedForeground: '25 12% 42%',
    secondaryForeground: '25 18% 18%',
    border: '30 18% 84%',
    input: '30 25% 92%',
    preview: '#F5EEE6',
  },
  {
    id: 'baby-blue',
    name: 'Baby Blue',
    mode: 'light',
    background: '210 30% 95%',
    card: '0 0% 100%',
    popover: '0 0% 100%',
    secondary: '210 22% 91%',
    muted: '210 16% 93%',
    foreground: '215 25% 10%',
    mutedForeground: '215 12% 42%',
    secondaryForeground: '215 18% 18%',
    border: '210 18% 84%',
    input: '210 22% 92%',
    preview: '#ECF1F7',
  },
  {
    id: 'mint',
    name: 'Mint',
    mode: 'light',
    background: '160 28% 94%',
    card: '0 0% 100%',
    popover: '0 0% 100%',
    secondary: '160 20% 90%',
    muted: '160 14% 92%',
    foreground: '165 22% 10%',
    mutedForeground: '165 10% 42%',
    secondaryForeground: '165 16% 18%',
    border: '160 15% 83%',
    input: '160 20% 91%',
    preview: '#E6F3EE',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    mode: 'light',
    background: '265 28% 95%',
    card: '0 0% 100%',
    popover: '0 0% 100%',
    secondary: '265 20% 91%',
    muted: '265 14% 93%',
    foreground: '270 22% 12%',
    mutedForeground: '270 10% 42%',
    secondaryForeground: '270 16% 20%',
    border: '265 16% 84%',
    input: '265 20% 92%',
    preview: '#EFEBF5',
  },
  {
    id: 'cloud',
    name: 'Cloud',
    mode: 'light',
    background: '220 16% 94%',
    card: '0 0% 100%',
    popover: '0 0% 100%',
    secondary: '220 12% 90%',
    muted: '220 10% 92%',
    foreground: '225 18% 10%',
    mutedForeground: '225 8% 42%',
    secondaryForeground: '225 14% 18%',
    border: '220 12% 84%',
    input: '220 14% 91%',
    preview: '#EDEEF2',
  },
];

// Curated cool-spectrum accent presets
export const ACCENT_PRESETS = [
  { 
    name: 'Electric Blue', 
    hsl: '210 100% 50%',
    hex: '#0080FF',
    description: 'Default accent'
  },
  { 
    name: 'Ice Blue', 
    hsl: '195 100% 50%',
    hex: '#00BFFF',
    description: 'Clean & modern'
  },
  { 
    name: 'Cyan', 
    hsl: '173 80% 45%',
    hex: '#1FE3D3',
    description: 'Bold & energetic'
  },
  { 
    name: 'Teal', 
    hsl: '180 70% 40%',
    hex: '#1FA3A3',
    description: 'Professional'
  },
  { 
    name: 'Violet Blue', 
    hsl: '250 70% 60%',
    hex: '#7B68EE',
    description: 'Creative edge'
  },
  { 
    name: 'Sapphire', 
    hsl: '225 80% 55%',
    hex: '#3366CC',
    description: 'Classic tech'
  },
] as const;

const DEFAULT_ACCENT = ACCENT_PRESETS[0].hsl;
const DEFAULT_THEME_ID = 'midnight';
const STORAGE_KEY = 'leadfinder-theme';

// Color validation and correction utilities
function parseHSL(hsl: string): { h: number; s: number; l: number } {
  const parts = hsl.split(' ');
  return {
    h: parseInt(parts[0]) || 0,
    s: parseInt(parts[1]) || 0,
    l: parseInt(parts[2]) || 0,
  };
}

function hslToString(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function isCoolColor(hue: number): boolean {
  return (hue >= 140 && hue <= 300);
}

function correctColor(h: number, s: number, l: number): { h: number; s: number; l: number } {
  let correctedH = h;
  if (!isCoolColor(h)) {
    if (h < 140) correctedH = 180;
    else if (h > 300) correctedH = 270;
  }
  return { 
    h: correctedH, 
    s: Math.max(40, Math.min(100, s)), 
    l: Math.max(35, Math.min(65, l)) 
  };
}

function generateAccentShades(hsl: string, isLight: boolean) {
  const { h, s, l } = parseHSL(hsl);
  return {
    base: hslToString(h, s, l),
    foreground: isLight ? '0 0% 100%' : (l > 50 ? '220 40% 4%' : '210 40% 98%'),
  };
}

// Apply theme + accent to CSS variables
function applyThemeToDocument(theme: ThemePreset, accentHSL: string) {
  const root = document.documentElement;
  const isLight = theme.mode === 'light';
  const shades = generateAccentShades(accentHSL, isLight);
  const { h, s, l } = parseHSL(accentHSL);
  
  // Apply theme foundation colors
  root.style.setProperty('--background', theme.background);
  root.style.setProperty('--foreground', theme.foreground);
  root.style.setProperty('--card', theme.card);
  root.style.setProperty('--card-foreground', theme.foreground);
  root.style.setProperty('--popover', theme.popover);
  root.style.setProperty('--popover-foreground', theme.foreground);
  root.style.setProperty('--secondary', theme.secondary);
  root.style.setProperty('--secondary-foreground', theme.secondaryForeground);
  root.style.setProperty('--muted', theme.muted);
  root.style.setProperty('--muted-foreground', theme.mutedForeground);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--input', theme.input);
  
  // Apply accent colors
  root.style.setProperty('--primary', shades.base);
  root.style.setProperty('--primary-foreground', shades.foreground);
  root.style.setProperty('--ring', shades.base);
  root.style.setProperty('--accent', shades.base);
  root.style.setProperty('--accent-foreground', isLight ? '0 0% 100%' : '210 40% 98%');
  
  // Sidebar - slightly darker than main bg in light mode
  if (isLight) {
    const bgParts = theme.background.split(' ');
    const bgH = parseInt(bgParts[0]) || 220;
    const bgS = parseInt(bgParts[1]) || 16;
    const bgL = parseInt(bgParts[2]) || 94;
    root.style.setProperty('--sidebar-background', hslToString(bgH, bgS, Math.max(bgL - 4, 85)));
  } else {
    root.style.setProperty('--sidebar-background', theme.card);
  }
  root.style.setProperty('--sidebar-foreground', theme.foreground);
  root.style.setProperty('--sidebar-primary', shades.base);
  root.style.setProperty('--sidebar-primary-foreground', shades.foreground);
  root.style.setProperty('--sidebar-accent', theme.secondary);
  root.style.setProperty('--sidebar-accent-foreground', theme.foreground);
  root.style.setProperty('--sidebar-border', theme.border);
  root.style.setProperty('--sidebar-ring', shades.base);
  
  // Clean gradients — no glow
  root.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${accentHSL}), hsl(210 100% 50%))`);
  root.style.setProperty('--gradient-glow', 'none');
  
  // Clean shadows — no glow
  if (isLight) {
    root.style.setProperty('--shadow-sm', '0 1px 2px hsl(0 0% 0% / 0.05), 0 1px 3px hsl(0 0% 0% / 0.08)');
    root.style.setProperty('--shadow-md', '0 2px 4px hsl(0 0% 0% / 0.04), 0 4px 12px hsl(0 0% 0% / 0.08)');
    root.style.setProperty('--shadow-lg', '0 4px 8px hsl(0 0% 0% / 0.04), 0 12px 32px hsl(0 0% 0% / 0.1)');
    root.style.setProperty('--shadow-card', '0 1px 3px hsl(0 0% 0% / 0.06), 0 4px 12px hsl(0 0% 0% / 0.06)');
  } else {
    root.style.setProperty('--shadow-sm', '0 1px 2px hsl(0 0% 0% / 0.4)');
    root.style.setProperty('--shadow-md', '0 4px 12px hsl(0 0% 0% / 0.5)');
    root.style.setProperty('--shadow-lg', '0 10px 40px hsl(0 0% 0% / 0.6)');
    root.style.setProperty('--shadow-card', 'none');
  }
  
  // Toggle dark class on html element
  if (isLight) {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }
}

export function validateAndCorrectColor(hsl: string): string {
  const { h, s, l } = parseHSL(hsl);
  const corrected = correctColor(h, s, l);
  return hslToString(corrected.h, corrected.s, corrected.l);
}

export function hexToHSL(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return DEFAULT_ACCENT;
  
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return hslToString(h * 360, s * 100, l * 100);
}

export function hslToHex(hsl: string): string {
  const { h, s, l } = parseHSL(hsl);
  const sNorm = s / 100;
  const lNorm = l / 100;
  
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lNorm - c / 2;
  
  let r = 0, g = 0, b = 0;
  
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getThemeById(id: string): ThemePreset {
  return [...DARK_THEMES, ...LIGHT_THEMES].find(t => t.id === id) || DARK_THEMES[0];
}

export function useAccentColor() {
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT);
  const [themeId, setThemeId] = useState<string>(DEFAULT_THEME_ID);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme + accent on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validatedAccent = validateAndCorrectColor(parsed.accent || DEFAULT_ACCENT);
        const savedThemeId = parsed.themeId || DEFAULT_THEME_ID;
        const theme = getThemeById(savedThemeId);
        
        setAccent(validatedAccent);
        setThemeId(savedThemeId);
        applyThemeToDocument(theme, validatedAccent);
      } catch {
        const theme = getThemeById(DEFAULT_THEME_ID);
        applyThemeToDocument(theme, DEFAULT_ACCENT);
      }
    } else {
      const theme = getThemeById(DEFAULT_THEME_ID);
      applyThemeToDocument(theme, DEFAULT_ACCENT);
    }
    setIsLoaded(true);
  }, []);

  const saveAndApply = useCallback((newAccent: string, newThemeId: string) => {
    const theme = getThemeById(newThemeId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: newAccent, themeId: newThemeId }));
    applyThemeToDocument(theme, newAccent);
  }, []);

  const updateAccent = useCallback((newAccent: string) => {
    const validated = validateAndCorrectColor(newAccent);
    setAccent(validated);
    saveAndApply(validated, themeId);
  }, [themeId, saveAndApply]);

  const setAccentPreset = useCallback((presetIndex: number) => {
    const preset = ACCENT_PRESETS[presetIndex];
    if (preset) {
      setAccent(preset.hsl);
      saveAndApply(preset.hsl, themeId);
    }
  }, [themeId, saveAndApply]);

  const setTheme = useCallback((newThemeId: string) => {
    setThemeId(newThemeId);
    saveAndApply(accent, newThemeId);
  }, [accent, saveAndApply]);

  const resetToDefault = useCallback(() => {
    setAccent(DEFAULT_ACCENT);
    setThemeId(DEFAULT_THEME_ID);
    saveAndApply(DEFAULT_ACCENT, DEFAULT_THEME_ID);
  }, [saveAndApply]);

  const currentTheme = getThemeById(themeId);

  return {
    accent,
    themeId,
    currentTheme,
    accentPresets: ACCENT_PRESETS,
    darkThemes: DARK_THEMES,
    lightThemes: LIGHT_THEMES,
    isLoaded,
    updateAccent,
    setAccentPreset,
    setTheme,
    resetToDefault,
  };
}
