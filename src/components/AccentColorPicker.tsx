import { useState } from 'react';
import { Palette, RotateCcw, Check, Sparkles } from 'lucide-react';
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
import { useAccentColor, ACCENT_PRESETS, hexToHSL, hslToHex } from '@/hooks/useAccentColor';
import { cn } from '@/lib/utils';

export function AccentColorPicker() {
  const { accent, presets, updateAccent, setPreset, resetToDefault } = useAccentColor();
  const [activePreset, setActivePreset] = useState<number | null>(() => {
    // Find if current accent matches a preset
    const idx = presets.findIndex(p => p.hsl === accent);
    return idx >= 0 ? idx : null;
  });

  const handlePresetSelect = (index: number) => {
    setActivePreset(index);
    setPreset(index);
  };

  const handleCustomColor = (hex: string) => {
    setActivePreset(null);
    const hsl = hexToHSL(hex);
    updateAccent(hsl);
  };

  const handleReset = () => {
    setActivePreset(0);
    resetToDefault();
  };

  const currentHex = hslToHex(accent);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Palette className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[320px] sm:w-[360px] bg-card border-border">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
            Accent Color
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-sm">
            Personalize your interface with a custom accent color. Core UI colors remain locked for optimal readability.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Live Preview */}
          <div className="rounded-xl p-4 border border-border bg-background/50">
            <Label className="text-xs font-medium text-muted-foreground mb-3 block">
              Live Preview
            </Label>
            <div className="flex items-center gap-3">
              <Button size="sm" className="text-xs">
                Primary Button
              </Button>
              <div 
                className="h-8 w-8 rounded-lg glow-effect"
                style={{ backgroundColor: `hsl(${accent})` }}
              />
              <div 
                className="flex-1 h-2 rounded-full"
                style={{ 
                  background: `linear-gradient(90deg, hsl(${accent}), hsl(210 100% 50%))` 
                }}
              />
            </div>
          </div>

          {/* Curated Presets */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground">
              Curated Presets
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset, index) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetSelect(index)}
                  className={cn(
                    'group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200',
                    activePreset === index
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border hover:border-primary/40 bg-background/50 hover:bg-background'
                  )}
                  title={preset.description}
                >
                  <div 
                    className="w-8 h-8 rounded-lg shadow-md flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ 
                      backgroundColor: preset.hex,
                      boxShadow: activePreset === index 
                        ? `0 0 16px ${preset.hex}40` 
                        : undefined
                    }}
                  >
                    {activePreset === index && (
                      <Check className="h-4 w-4 text-white drop-shadow-md" />
                    )}
                  </div>
                  <span className="text-[10px] font-medium text-foreground/80 truncate w-full text-center">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Color Picker */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground">
              Custom Accent
            </Label>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Input
                  type="color"
                  value={currentHex}
                  onChange={(e) => handleCustomColor(e.target.value)}
                  className="w-14 h-12 p-1 cursor-pointer rounded-lg border-border"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Input
                  type="text"
                  value={currentHex.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                      handleCustomColor(val);
                    }
                  }}
                  placeholder="#1FE3D3"
                  className="font-mono text-xs h-8 bg-background"
                />
                <p className="text-[10px] text-muted-foreground">
                  Cool colors only (blue, cyan, teal, violet)
                </p>
              </div>
            </div>
          </div>

          {/* Info Notice */}
          <div className="rounded-lg p-3 bg-secondary/50 border border-border">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground/80">Note:</strong> Warm colors (red, orange, yellow) are automatically adjusted to maintain the professional dark theme aesthetic.
            </p>
          </div>

          {/* Reset Button */}
          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full border-border bg-background hover:bg-secondary"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
