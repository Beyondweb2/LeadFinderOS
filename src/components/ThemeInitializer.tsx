import { useEffect } from 'react';

const STORAGE_KEY = 'leadfinder-theme';
const DEFAULT_BACKGROUND = '222 47% 6%';

interface ThemeColors {
  primary: string;
  background: string;
}

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
  const bg = colors.background || DEFAULT_BACKGROUND;
  root.style.setProperty('--background', bg);
  
  // Derive other colors from background
  const bgParts = bg.split(' ');
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

export function ThemeInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    if (savedTheme) {
      try {
        const parsed = JSON.parse(savedTheme);
        // Migrate old theme format
        if (!parsed.background) {
          parsed.background = DEFAULT_BACKGROUND;
        }
        applyThemeToDocument(parsed);
      } catch (e) {
        console.error('Failed to parse saved theme:', e);
      }
    }
  }, []);

  return <>{children}</>;
}
