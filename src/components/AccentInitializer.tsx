import { useEffect } from 'react';

const STORAGE_KEY = 'leadfinder-theme';
const DEFAULT_ACCENT = '210 100% 50%';
const DEFAULT_THEME_ID = 'midnight';

// Minimal theme data for initialization (before full hook loads)
const THEMES: Record<string, { mode: 'dark' | 'light'; background: string; card: string; popover: string; secondary: string; muted: string; foreground: string; mutedForeground: string; secondaryForeground: string; border: string; input: string }> = {
  // Dark themes
  midnight: { mode: 'dark', background: '222 47% 4%', card: '220 40% 6%', popover: '220 40% 8%', secondary: '220 40% 10%', muted: '220 40% 8%', foreground: '210 40% 98%', mutedForeground: '215 20% 50%', secondaryForeground: '210 40% 95%', border: '220 30% 12%', input: '220 30% 10%' },
  charcoal: { mode: 'dark', background: '0 0% 7%', card: '0 0% 10%', popover: '0 0% 12%', secondary: '0 0% 14%', muted: '0 0% 12%', foreground: '0 0% 98%', mutedForeground: '0 0% 55%', secondaryForeground: '0 0% 90%', border: '0 0% 18%', input: '0 0% 14%' },
  slate: { mode: 'dark', background: '215 25% 8%', card: '215 25% 11%', popover: '215 25% 13%', secondary: '215 20% 16%', muted: '215 25% 13%', foreground: '210 30% 98%', mutedForeground: '215 15% 55%', secondaryForeground: '210 20% 90%', border: '215 20% 20%', input: '215 25% 14%' },
  navy: { mode: 'dark', background: '230 35% 6%', card: '230 35% 9%', popover: '230 35% 11%', secondary: '230 30% 14%', muted: '230 35% 11%', foreground: '220 30% 98%', mutedForeground: '230 15% 55%', secondaryForeground: '220 25% 90%', border: '230 25% 18%', input: '230 35% 12%' },
  forest: { mode: 'dark', background: '160 25% 5%', card: '160 25% 8%', popover: '160 25% 10%', secondary: '160 20% 13%', muted: '160 25% 10%', foreground: '150 20% 98%', mutedForeground: '160 15% 50%', secondaryForeground: '150 15% 90%', border: '160 20% 16%', input: '160 25% 11%' },
  plum: { mode: 'dark', background: '280 25% 6%', card: '280 25% 9%', popover: '280 25% 11%', secondary: '280 20% 14%', muted: '280 25% 11%', foreground: '270 20% 98%', mutedForeground: '280 15% 50%', secondaryForeground: '270 15% 90%', border: '280 20% 18%', input: '280 25% 12%' },
  // Light themes
  snow: { mode: 'light', background: '0 0% 100%', card: '0 0% 98%', popover: '0 0% 100%', secondary: '0 0% 96%', muted: '0 0% 96%', foreground: '0 0% 9%', mutedForeground: '0 0% 45%', secondaryForeground: '0 0% 20%', border: '0 0% 90%', input: '0 0% 92%' },
  pearl: { mode: 'light', background: '210 20% 98%', card: '210 20% 96%', popover: '210 20% 98%', secondary: '210 15% 93%', muted: '210 15% 93%', foreground: '220 30% 10%', mutedForeground: '215 15% 45%', secondaryForeground: '220 25% 25%', border: '210 15% 88%', input: '210 20% 90%' },
  cream: { mode: 'light', background: '40 30% 97%', card: '40 25% 95%', popover: '40 30% 97%', secondary: '40 20% 92%', muted: '40 20% 92%', foreground: '30 20% 12%', mutedForeground: '35 15% 45%', secondaryForeground: '30 15% 25%', border: '40 15% 86%', input: '40 25% 90%' },
  mint: { mode: 'light', background: '150 25% 97%', card: '150 20% 95%', popover: '150 25% 97%', secondary: '150 15% 92%', muted: '150 15% 92%', foreground: '160 25% 10%', mutedForeground: '155 15% 42%', secondaryForeground: '160 20% 22%', border: '150 15% 86%', input: '150 20% 90%' },
  lavender: { mode: 'light', background: '270 25% 98%', card: '270 20% 96%', popover: '270 25% 98%', secondary: '270 15% 93%', muted: '270 15% 93%', foreground: '280 25% 12%', mutedForeground: '275 15% 45%', secondaryForeground: '280 20% 25%', border: '270 15% 88%', input: '270 20% 91%' },
  sky: { mode: 'light', background: '200 30% 98%', card: '200 25% 96%', popover: '200 30% 98%', secondary: '200 20% 93%', muted: '200 20% 93%', foreground: '210 30% 10%', mutedForeground: '205 15% 45%', secondaryForeground: '210 25% 22%', border: '200 15% 87%', input: '200 25% 90%' },
};

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
  return { h: correctedH, s: Math.max(40, Math.min(100, s)), l: Math.max(35, Math.min(65, l)) };
}

function validateAndCorrectColor(hsl: string): string {
  const { h, s, l } = parseHSL(hsl);
  const corrected = correctColor(h, s, l);
  return hslToString(corrected.h, corrected.s, corrected.l);
}

function applyThemeToDocument(themeId: string, accentHSL: string) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME_ID];
  const root = document.documentElement;
  const isLight = theme.mode === 'light';
  const { h, s, l } = parseHSL(accentHSL);
  const foreground = isLight ? '0 0% 100%' : (l > 50 ? '220 40% 4%' : '210 40% 98%');
  
  // Foundation
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
  
  // Accent
  root.style.setProperty('--primary', accentHSL);
  root.style.setProperty('--primary-foreground', foreground);
  root.style.setProperty('--ring', accentHSL);
  root.style.setProperty('--accent', accentHSL);
  root.style.setProperty('--accent-foreground', isLight ? '0 0% 100%' : '210 40% 98%');
  
  // Sidebar
  root.style.setProperty('--sidebar-background', theme.card);
  root.style.setProperty('--sidebar-foreground', theme.foreground);
  root.style.setProperty('--sidebar-primary', accentHSL);
  root.style.setProperty('--sidebar-primary-foreground', foreground);
  root.style.setProperty('--sidebar-accent', theme.secondary);
  root.style.setProperty('--sidebar-accent-foreground', theme.foreground);
  root.style.setProperty('--sidebar-border', theme.border);
  root.style.setProperty('--sidebar-ring', accentHSL);
  
  // Glows
  const glowOpacity = isLight ? 0.12 : 0.25;
  const glowOpacity2 = isLight ? 0.06 : 0.1;
  root.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${accentHSL}), hsl(210 100% 50%))`);
  root.style.setProperty('--gradient-glow', `radial-gradient(ellipse at center, hsl(${h} ${s}% ${l}% / ${isLight ? 0.08 : 0.15}), transparent 70%)`);
  root.style.setProperty('--shadow-glow', `0 0 20px hsl(${h} ${s}% ${l}% / ${glowOpacity}), 0 0 40px hsl(${h} ${s}% ${l}% / ${glowOpacity2})`);
  root.style.setProperty('--shadow-glow-lg', `0 0 60px hsl(${h} ${s}% ${l}% / ${isLight ? 0.1 : 0.2}), 0 0 120px hsl(210 100% 50% / ${isLight ? 0.05 : 0.1})`);
  
  // Shadows
  if (isLight) {
    root.style.setProperty('--shadow-sm', '0 1px 2px hsl(0 0% 0% / 0.05)');
    root.style.setProperty('--shadow-md', '0 4px 12px hsl(0 0% 0% / 0.08)');
    root.style.setProperty('--shadow-lg', '0 10px 40px hsl(0 0% 0% / 0.12)');
  } else {
    root.style.setProperty('--shadow-sm', '0 1px 2px hsl(0 0% 0% / 0.4)');
    root.style.setProperty('--shadow-md', '0 4px 12px hsl(0 0% 0% / 0.5)');
    root.style.setProperty('--shadow-lg', '0 10px 40px hsl(0 0% 0% / 0.6)');
  }
  
  // Dark class
  if (isLight) {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }
}

export function AccentInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validated = validateAndCorrectColor(parsed.accent || DEFAULT_ACCENT);
        const themeId = parsed.themeId || DEFAULT_THEME_ID;
        applyThemeToDocument(themeId, validated);
      } catch {
        applyThemeToDocument(DEFAULT_THEME_ID, DEFAULT_ACCENT);
      }
    } else {
      applyThemeToDocument(DEFAULT_THEME_ID, DEFAULT_ACCENT);
    }
  }, []);

  return <>{children}</>;
}
