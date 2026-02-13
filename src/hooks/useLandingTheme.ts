import { useEffect } from 'react';

/**
 * Forces the dark brand theme on the landing page.
 * Saves current theme, applies brand theme, restores on unmount.
 */
export function useLandingTheme() {
  useEffect(() => {
    const root = document.documentElement;
    
    // Save current CSS variable values to restore later
    const savedVars: Record<string, string> = {};
    const varsToSave = [
      '--background', '--foreground', '--card', '--card-foreground',
      '--popover', '--popover-foreground', '--secondary', '--secondary-foreground',
      '--muted', '--muted-foreground', '--border', '--input', '--ring',
      '--primary', '--primary-foreground', '--accent', '--accent-foreground',
      '--sidebar-background', '--sidebar-foreground', '--sidebar-primary',
      '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
      '--sidebar-border', '--sidebar-ring', '--gradient-primary', '--gradient-glow',
      '--shadow-glow', '--shadow-glow-lg', '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-card'
    ];
    
    varsToSave.forEach(varName => {
      savedVars[varName] = root.style.getPropertyValue(varName);
    });
    
    const hadDarkClass = root.classList.contains('dark');
    
    // Apply the locked dark brand theme
    root.classList.add('dark');
    
    // Dark brand foundation (Midnight theme)
    root.style.setProperty('--background', '218 70% 8%');
    root.style.setProperty('--foreground', '210 40% 98%');
    root.style.setProperty('--card', '218 60% 10%');
    root.style.setProperty('--card-foreground', '210 40% 98%');
    root.style.setProperty('--popover', '218 60% 11%');
    root.style.setProperty('--popover-foreground', '210 40% 98%');
    root.style.setProperty('--secondary', '218 55% 13%');
    root.style.setProperty('--secondary-foreground', '210 40% 95%');
    root.style.setProperty('--muted', '218 50% 12%');
    root.style.setProperty('--muted-foreground', '215 20% 50%');
    root.style.setProperty('--border', '218 45% 15%');
    root.style.setProperty('--input', '218 50% 13%');
    
    // Brand blue accent (HSL 210 100% 50%)
    root.style.setProperty('--primary', '210 100% 50%');
    root.style.setProperty('--primary-foreground', '220 40% 4%');
    root.style.setProperty('--ring', '210 100% 50%');
    root.style.setProperty('--accent', '210 100% 50%');
    root.style.setProperty('--accent-foreground', '210 40% 98%');
    
    // Sidebar
    root.style.setProperty('--sidebar-background', '218 60% 9%');
    root.style.setProperty('--sidebar-foreground', '210 40% 98%');
    root.style.setProperty('--sidebar-primary', '210 100% 50%');
    root.style.setProperty('--sidebar-primary-foreground', '220 40% 4%');
    root.style.setProperty('--sidebar-accent', '218 55% 13%');
    root.style.setProperty('--sidebar-accent-foreground', '210 40% 98%');
    root.style.setProperty('--sidebar-border', '218 45% 15%');
    root.style.setProperty('--sidebar-ring', '210 100% 50%');
    
    // Brand gradients and shadows
    root.style.setProperty('--gradient-primary', 'linear-gradient(135deg, hsl(210 100% 50%), hsl(210 100% 50%))');
    root.style.setProperty('--gradient-glow', 'radial-gradient(ellipse at center, hsl(210 100% 50% / 0.15), transparent 70%)');
    root.style.setProperty('--shadow-glow', '0 0 20px hsl(210 100% 50% / 0.25), 0 0 40px hsl(210 100% 50% / 0.1)');
    root.style.setProperty('--shadow-glow-lg', '0 0 60px hsl(210 100% 50% / 0.2), 0 0 120px hsl(210 100% 50% / 0.1)');
    root.style.setProperty('--shadow-sm', '0 1px 2px hsl(0 0% 0% / 0.4)');
    root.style.setProperty('--shadow-md', '0 4px 12px hsl(0 0% 0% / 0.5)');
    root.style.setProperty('--shadow-lg', '0 10px 40px hsl(0 0% 0% / 0.6)');
    root.style.setProperty('--shadow-card', 'none');
    
    // Cleanup: restore user's theme when leaving landing page
    return () => {
      varsToSave.forEach(varName => {
        if (savedVars[varName]) {
          root.style.setProperty(varName, savedVars[varName]);
        } else {
          root.style.removeProperty(varName);
        }
      });
      
      if (!hadDarkClass) {
        root.classList.remove('dark');
      } else {
        root.classList.add('dark');
      }
    };
  }, []);
}
