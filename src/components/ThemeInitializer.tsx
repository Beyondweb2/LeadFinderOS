import { useEffect } from 'react';

const STORAGE_KEY = 'leadfinder-theme';

interface ThemeColors {
  primary: string;
  background: string;
  card: string;
  accent: string;
}

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
  const bgHue = colors.background.split(' ')[0];
  root.style.setProperty('--secondary', `${bgHue} 47% 14%`);
  root.style.setProperty('--muted', `${bgHue} 47% 12%`);
  root.style.setProperty('--border', `${bgHue} 30% 18%`);
  root.style.setProperty('--input', `${bgHue} 30% 15%`);
  root.style.setProperty('--sidebar-accent', `${bgHue} 47% 14%`);
  root.style.setProperty('--sidebar-border', `${bgHue} 30% 18%`);
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
