import { useState } from 'react';
import { Palette, RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

export function ThemeCustomizer() {
  const { theme, presets, updateTheme, setPreset, resetTheme } = useTheme();
  const [activePreset, setActivePreset] = useState<number | null>(null);

  const handlePresetSelect = (index: number) => {
    setActivePreset(index);
    setPreset(index);
  };

  const handleReset = () => {
    setActivePreset(0);
    resetTheme();
  };

  const hslToHex = (hsl: string) => {
    const parts = hsl.split(' ');
    const h = parseInt(parts[0]) || 0;
    const s = (parseInt(parts[1]) || 0) / 100;
    const l = (parseInt(parts[2]) || 0) / 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    
    let r = 0, g = 0, b = 0;
    
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const hexToHsl = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '173 80% 45%';
    
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Palette className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[340px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Theme Colors
          </SheetTitle>
          <SheetDescription>
            Customize your app's accent and background colors
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Preset Colors */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Presets</Label>
            <div className="grid grid-cols-4 gap-2">
              {presets.map((preset, index) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetSelect(index)}
                  className={cn(
                    'relative aspect-square rounded-lg border-2 transition-all flex items-center justify-center overflow-hidden',
                    activePreset === index
                      ? 'border-foreground scale-105'
                      : 'border-border hover:border-foreground/50'
                  )}
                  title={preset.name}
                >
                  {/* Background color bottom half */}
                  <div 
                    className="absolute inset-0"
                    style={{ backgroundColor: `hsl(${preset.colors.background})` }}
                  />
                  {/* Primary color top half diagonal */}
                  <div 
                    className="absolute inset-0"
                    style={{ 
                      backgroundColor: `hsl(${preset.colors.primary})`,
                      clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 100%)'
                    }}
                  />
                  {activePreset === index && (
                    <Check className="relative z-10 h-4 w-4 text-white drop-shadow-md" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color Picker */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Accent Color (Buttons, Icons)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="color"
                value={hslToHex(theme.primary)}
                onChange={(e) => {
                  setActivePreset(null);
                  updateTheme({ primary: hexToHsl(e.target.value) });
                }}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <div 
                className="flex-1 h-10 rounded-md border border-border"
                style={{ backgroundColor: `hsl(${theme.primary})` }}
              />
            </div>
          </div>

          {/* Background Color Picker */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Background Color</Label>
            <div className="flex items-center gap-3">
              <Input
                type="color"
                value={hslToHex(theme.background)}
                onChange={(e) => {
                  setActivePreset(null);
                  updateTheme({ background: hexToHsl(e.target.value) });
                }}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <div 
                className="flex-1 h-10 rounded-md border border-border"
                style={{ backgroundColor: `hsl(${theme.background})` }}
              />
            </div>
          </div>

          {/* Reset Button */}
          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
