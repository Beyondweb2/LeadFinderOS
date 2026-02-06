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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

  // Parse HSL to individual values for color picker
  const parseHsl = (hsl: string) => {
    const parts = hsl.split(' ');
    return {
      h: parseInt(parts[0]) || 0,
      s: parseInt(parts[1]) || 0,
      l: parseInt(parts[2]) || 0,
    };
  };

  const hslToHex = (hsl: string) => {
    const { h, s, l } = parseHsl(hsl);
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
      <SheetContent className="w-[340px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Theme Customizer
          </SheetTitle>
          <SheetDescription>
            Customize the look and feel of LeadFinder Pro
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="presets" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="presets">Presets</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="presets" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {presets.map((preset, index) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetSelect(index)}
                  className={cn(
                    'relative p-3 rounded-lg border-2 transition-all text-left',
                    activePreset === index
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-6 h-6 rounded-full border border-border/50"
                      style={{ backgroundColor: `hsl(${preset.colors.primary})` }}
                    />
                    <div
                      className="w-4 h-4 rounded-full border border-border/50"
                      style={{ backgroundColor: `hsl(${preset.colors.background})` }}
                    />
                  </div>
                  <span className="text-xs font-medium">{preset.name}</span>
                  {activePreset === index && (
                    <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="mt-4 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Primary Color (Buttons, Accents)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={hslToHex(theme.primary)}
                    onChange={(e) => updateTheme({ primary: hexToHsl(e.target.value) })}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <div 
                    className="flex-1 h-10 rounded-md border border-border"
                    style={{ backgroundColor: `hsl(${theme.primary})` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Background Color</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={hslToHex(theme.background)}
                    onChange={(e) => updateTheme({ background: hexToHsl(e.target.value) })}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <div 
                    className="flex-1 h-10 rounded-md border border-border"
                    style={{ backgroundColor: `hsl(${theme.background})` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Card Background</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={hslToHex(theme.card)}
                    onChange={(e) => updateTheme({ card: hexToHsl(e.target.value) })}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <div 
                    className="flex-1 h-10 rounded-md border border-border"
                    style={{ backgroundColor: `hsl(${theme.card})` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Accent Color</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={hslToHex(theme.accent)}
                    onChange={(e) => updateTheme({ accent: hexToHsl(e.target.value) })}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <div 
                    className="flex-1 h-10 rounded-md border border-border"
                    style={{ backgroundColor: `hsl(${theme.accent})` }}
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 pt-4 border-t border-border">
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
