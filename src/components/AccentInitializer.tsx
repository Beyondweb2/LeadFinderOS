import { useEffect } from 'react';

const STORAGE_KEY = 'leadfinder-accent';
const DEFAULT_ACCENT = '210 100% 50%'; // Electric Blue - brand default

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

function validateAndCorrectColor(hsl: string): string {
  const { h, s, l } = parseHSL(hsl);
  const corrected = correctColor(h, s, l);
  return hslToString(corrected.h, corrected.s, corrected.l);
}

function applyAccentToDocument(accentHSL: string) {
  const root = document.documentElement;
  const { h, s, l } = parseHSL(accentHSL);
  const foreground = l > 50 ? '220 40% 4%' : '210 40% 98%';
  
  // Apply accent colors only
  root.style.setProperty('--primary', accentHSL);
  root.style.setProperty('--primary-foreground', foreground);
  root.style.setProperty('--ring', accentHSL);
  root.style.setProperty('--accent', accentHSL);
  root.style.setProperty('--accent-foreground', '210 40% 98%');
  
  // Sidebar accent
  root.style.setProperty('--sidebar-primary', accentHSL);
  root.style.setProperty('--sidebar-primary-foreground', foreground);
  root.style.setProperty('--sidebar-ring', accentHSL);
  
  // Gradients and glows
  root.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${accentHSL}), hsl(210 100% 50%))`);
  root.style.setProperty('--gradient-glow', `radial-gradient(ellipse at center, hsl(${h} ${s}% ${l}% / 0.15), transparent 70%)`);
  root.style.setProperty('--shadow-glow', `0 0 20px hsl(${h} ${s}% ${l}% / 0.25), 0 0 40px hsl(${h} ${s}% ${l}% / 0.1)`);
  root.style.setProperty('--shadow-glow-lg', `0 0 60px hsl(${h} ${s}% ${l}% / 0.2), 0 0 120px hsl(210 100% 50% / 0.1)`);
}

export function AccentInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validated = validateAndCorrectColor(parsed.accent || DEFAULT_ACCENT);
        applyAccentToDocument(validated);
      } catch {
        applyAccentToDocument(DEFAULT_ACCENT);
      }
    } else {
      applyAccentToDocument(DEFAULT_ACCENT);
    }
  }, []);

  return <>{children}</>;
}
