import { useEffect } from 'react';

const STORAGE_KEY = 'leadfinder-theme';

interface ThemeColors {
  primary: string;
}

function applyThemeToDocument(colors: ThemeColors) {
  const root = document.documentElement;
  
  // Only update primary/accent colors - background stays dark
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--ring', colors.primary);
  root.style.setProperty('--sidebar-primary', colors.primary);
  root.style.setProperty('--sidebar-ring', colors.primary);
  
  // Derive accent from primary
  const parts = colors.primary.split(' ');
  const h = parts[0];
  const s = parseInt(parts[1]) - 20;
  const l = parseInt(parts[2]) - 10;
  root.style.setProperty('--accent', `${h} ${s}% ${l}%`);
}

export function ThemeInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    if (savedTheme) {
      try {
        const parsed = JSON.parse(savedTheme);
        applyThemeToDocument(parsed);
      } catch (e) {
        console.error('Failed to parse saved theme:', e);
      }
    }
  }, []);

  return <>{children}</>;
}
