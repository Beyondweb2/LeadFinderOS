import { useState, useEffect, useCallback } from 'react';

// Locked foundational colors - these NEVER change
export const LOCKED_COLORS = {
  // Backgrounds
  background: '222 47% 4%',      // #05070B equivalent
  card: '220 40% 6%',            // #0A0F1A equivalent  
  popover: '220 40% 8%',         // #0F1626 equivalent
  secondary: '220 40% 10%',
  muted: '220 40% 8%',
  
  // Text
  foreground: '210 40% 98%',     // #FFFFFF equivalent
  mutedForeground: '215 20% 50%', // #7F8BA6 equivalent
  secondaryForeground: '210 40% 95%', // #C9D1E4 equivalent
  
  // Borders
  border: '220 30% 12%',         // #1C2742 equivalent
  input: '220 30% 10%',
  
  // Sidebar (locked)
  sidebarBackground: '220 40% 6%',
  sidebarForeground: '210 40% 95%',
  sidebarBorder: '220 30% 12%',
} as const;

// Curated cool-spectrum accent presets
export const ACCENT_PRESETS = [
  { 
    name: 'Cyan', 
    hsl: '173 80% 45%',
    hex: '#1FE3D3',
    description: 'Default accent'
  },
  { 
    name: 'Electric Blue', 
    hsl: '210 100% 50%',
    hex: '#0080FF',
    description: 'Bold & energetic'
  },
  { 
    name: 'Ice Blue', 
    hsl: '195 100% 50%',
    hex: '#00BFFF',
    description: 'Clean & modern'
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
const STORAGE_KEY = 'leadfinder-accent';

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

// Check if color is in cool spectrum (blue, cyan, teal, violet)
// Reject warm hues: red (0-30), orange (30-60), yellow (60-90)
function isCoolColor(hue: number): boolean {
  // Cool colors: 150-300 (cyan, blue, violet) + some teal (140-180)
  return (hue >= 140 && hue <= 300);
}

// Correct a color to be within acceptable range
function correctColor(h: number, s: number, l: number): { h: number; s: number; l: number } {
  let correctedH = h;
  let correctedS = s;
  let correctedL = l;
  
  // If not a cool color, shift to nearest cool hue
  if (!isCoolColor(h)) {
    // Map warm colors to cool alternatives
    if (h < 140) {
      // Warm (red, orange, yellow) -> shift to cyan/teal
      correctedH = 180;
    } else if (h > 300) {
      // Pink/magenta -> shift to violet
      correctedH = 270;
    }
  }
  
  // Clamp saturation (40-100%) for vibrancy without being garish
  correctedS = Math.max(40, Math.min(100, s));
  
  // Clamp lightness (35-65%) for visibility on dark backgrounds
  correctedL = Math.max(35, Math.min(65, l));
  
  return { h: correctedH, s: correctedS, l: correctedL };
}

// Generate derived shades from accent
function generateAccentShades(hsl: string) {
  const { h, s, l } = parseHSL(hsl);
  
  return {
    base: hslToString(h, s, l),
    hover: hslToString(h, Math.min(s + 10, 100), Math.min(l + 8, 70)),
    glow: hslToString(h, s, l), // Used with opacity
    foreground: l > 50 ? '220 40% 4%' : '210 40% 98%',
  };
}

// Apply accent color to CSS variables
function applyAccentToDocument(accentHSL: string) {
  const root = document.documentElement;
  const shades = generateAccentShades(accentHSL);
  
  // Apply accent colors only - foundational colors stay locked
  root.style.setProperty('--primary', shades.base);
  root.style.setProperty('--primary-foreground', shades.foreground);
  root.style.setProperty('--ring', shades.base);
  root.style.setProperty('--accent', shades.base);
  root.style.setProperty('--accent-foreground', '210 40% 98%');
  
  // Sidebar accent
  root.style.setProperty('--sidebar-primary', shades.base);
  root.style.setProperty('--sidebar-primary-foreground', shades.foreground);
  root.style.setProperty('--sidebar-ring', shades.base);
  
  // Update CSS custom properties for gradients and glows
  const { h, s, l } = parseHSL(accentHSL);
  root.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${accentHSL}), hsl(210 100% 50%))`);
  root.style.setProperty('--gradient-glow', `radial-gradient(ellipse at center, hsl(${h} ${s}% ${l}% / 0.15), transparent 70%)`);
  root.style.setProperty('--shadow-glow', `0 0 20px hsl(${h} ${s}% ${l}% / 0.25), 0 0 40px hsl(${h} ${s}% ${l}% / 0.1)`);
  root.style.setProperty('--shadow-glow-lg', `0 0 60px hsl(${h} ${s}% ${l}% / 0.2), 0 0 120px hsl(210 100% 50% / 0.1)`);
}

// Validate and correct user-selected color
export function validateAndCorrectColor(hsl: string): string {
  const { h, s, l } = parseHSL(hsl);
  const corrected = correctColor(h, s, l);
  return hslToString(corrected.h, corrected.s, corrected.l);
}

// Convert hex to HSL
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

// Convert HSL to hex
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

export function useAccentColor() {
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved accent on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validated = validateAndCorrectColor(parsed.accent || DEFAULT_ACCENT);
        setAccent(validated);
        applyAccentToDocument(validated);
      } catch {
        applyAccentToDocument(DEFAULT_ACCENT);
      }
    } else {
      applyAccentToDocument(DEFAULT_ACCENT);
    }
    setIsLoaded(true);
  }, []);

  const updateAccent = useCallback((newAccent: string) => {
    const validated = validateAndCorrectColor(newAccent);
    setAccent(validated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: validated }));
    applyAccentToDocument(validated);
  }, []);

  const setPreset = useCallback((presetIndex: number) => {
    const preset = ACCENT_PRESETS[presetIndex];
    if (preset) {
      setAccent(preset.hsl);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: preset.hsl }));
      applyAccentToDocument(preset.hsl);
    }
  }, []);

  const resetToDefault = useCallback(() => {
    setAccent(DEFAULT_ACCENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: DEFAULT_ACCENT }));
    applyAccentToDocument(DEFAULT_ACCENT);
  }, []);

  return {
    accent,
    presets: ACCENT_PRESETS,
    isLoaded,
    updateAccent,
    setPreset,
    resetToDefault,
    hexToHSL,
    hslToHex,
  };
}
