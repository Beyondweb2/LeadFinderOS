import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Search, 
  ClipboardList, 
  FileText,
  Briefcase,
  DollarSign,
  MoreHorizontal,
  Palette,
  LogOut,
  HelpCircle,
  MessageSquare,
  Users,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAccentColor, hexToHSL, hslToHex, ThemePreset } from '@/hooks/useAccentColor';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { Check, Sparkles, Sun, Moon, RotateCcw } from 'lucide-react';

const mainNavItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Search', url: '/find-leads', icon: Search },
  { title: 'Outreach CRM', url: '/outreach', icon: ClipboardList },
  { title: 'Track', url: '/potential-work', icon: Briefcase },
];

const moreNavItems = [
  { title: 'Templates', url: '/templates', icon: FileText },
  { title: 'Paid Clients', url: '/paid-clients', icon: DollarSign },
  { title: 'How to Use', url: '/how-to-use', icon: HelpCircle },
  { title: 'Feedback', url: '/feedback', icon: MessageSquare },
];

function MobileThemeGrid({ 
  themes, 
  activeThemeId, 
  onSelect 
}: { 
  themes: ThemePreset[]; 
  activeThemeId: string; 
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {themes.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onSelect(theme.id)}
          className={cn(
            'group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200',
            activeThemeId === theme.id
              ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
              : 'border-border hover:border-primary/40 bg-background/50 hover:bg-background'
          )}
          title={theme.name}
        >
          <div 
            className="w-8 h-8 rounded-lg shadow-md flex items-center justify-center transition-transform group-hover:scale-110 border border-white/10"
            style={{ 
              backgroundColor: theme.preview,
              boxShadow: activeThemeId === theme.id 
                ? `0 0 16px ${theme.preview}40` 
                : undefined
            }}
          >
            {activeThemeId === theme.id && (
              <Check className={cn(
                "h-4 w-4 drop-shadow-md",
                theme.mode === 'light' ? 'text-foreground' : 'text-primary-foreground'
              )} />
            )}
          </div>
          <span className="text-[10px] font-medium text-foreground/80 truncate w-full text-center">
            {theme.name}
          </span>
        </button>
      ))}
    </div>
  );
}

export function MobileBottomNav() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin } = useSubscription();
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const [crmGlow, setCrmGlow] = useState(false);
  const [trackGlow, setTrackGlow] = useState(false);
  const [searchGlow, setSearchGlow] = useState(false);

  // Walkthrough step 1 pulse + step 3 CRM pulse + step 6 track pulse
  let searchPulse = false;
  let crmPulseWalkthrough = false;
  let trackPulseWalkthrough = false;
  try {
    const { state, isDemoUser, isOpen: walkthroughActive } = useDemoChecklist();
    searchPulse = isDemoUser && walkthroughActive && !state.searchDone;
    crmPulseWalkthrough = isDemoUser && walkthroughActive && state.addedToCrm && !state.firstContactMade;
    trackPulseWalkthrough = isDemoUser && walkthroughActive && state.threeContactsMade && !state.viewedProgress;
  } catch {}

  useEffect(() => {
    const crmHandler = () => {
      setCrmGlow(true);
      setTimeout(() => setCrmGlow(false), 800);
    };
    const trackHandler = () => {
      setTrackGlow(true);
      setTimeout(() => setTrackGlow(false), 2000);
    };
    const searchHandler = () => {
      setSearchGlow(true);
      setTimeout(() => setSearchGlow(false), 4000);
    };
    window.addEventListener('crm-lead-added', crmHandler);
    window.addEventListener('track-lead-added', trackHandler);
    window.addEventListener('pulse-search-nav', searchHandler);
    return () => {
      window.removeEventListener('crm-lead-added', crmHandler);
      window.removeEventListener('track-lead-added', trackHandler);
      window.removeEventListener('pulse-search-nav', searchHandler);
    };
  }, []);
  const allMoreItems = isAdmin 
    ? [...moreNavItems, { title: 'Admin', url: '/admin', icon: ShieldCheck }, { title: 'Affiliates', url: '/admin/affiliates', icon: Users }]
    : moreNavItems;
  const isMoreActive = allMoreItems.some(item => location.pathname === item.url);

  const { 
    accent, 
    themeId, 
    currentTheme,
    accentPresets, 
    darkThemes, 
    lightThemes, 
    updateAccent, 
    setAccentPreset, 
    setTheme,
    resetToDefault 
  } = useAccentColor();
  
  const [activePreset, setActivePreset] = useState<number | null>(() => {
    const idx = accentPresets.findIndex(p => p.hsl === accent);
    return idx >= 0 ? idx : null;
  });

  const handlePresetSelect = (index: number) => {
    setActivePreset(index);
    setAccentPreset(index);
  };

  const handleCustomColor = (hex: string) => {
    setActivePreset(null);
    const hsl = hexToHSL(hex);
    updateAccent(hsl);
  };

  const handleThemeSelect = (newThemeId: string) => {
    setTheme(newThemeId);
  };

  const handleReset = () => {
    setActivePreset(0);
    resetToDefault();
  };

  const currentHex = hslToHex(accent);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-xl border-t border-border safe-area-pb">
        <div className="flex items-center justify-around h-16 px-2">
          {mainNavItems.map((item) => {
            const isActive = location.pathname === item.url;
            
            return (
              <Link
                key={item.url}
                to={item.url}
                data-walkthrough-step={item.url === '/potential-work' ? 'track-leads' : item.url === '/outreach' ? 'outreach-crm' : undefined}
                data-walkthrough={item.url === '/find-leads' ? 'search-nav' : item.url === '/outreach' ? 'crm-nav' : item.url === '/potential-work' ? 'track-nav' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[60px]',
                  item.title === 'Search' && (searchPulse || searchGlow)
                    ? 'text-yellow-400 animate-pulse'
                    : item.url === '/outreach' && crmPulseWalkthrough
                      ? 'text-yellow-400 animate-pulse'
                      : item.url === '/outreach' && crmGlow
                      ? 'text-green-400 animate-pulse'
                      : item.title === 'Track' && (trackGlow || trackPulseWalkthrough)
                        ? 'text-yellow-400 animate-pulse'
                        : isActive 
                          ? 'text-primary' 
                          : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className={cn(
                  'h-5 w-5 transition-all',
                  item.url === '/outreach' && (crmGlow || crmPulseWalkthrough) && 'scale-110',
                  item.title === 'Track' && (trackGlow || trackPulseWalkthrough) && 'scale-110'
                )} />
                <span className={cn(
                  "text-[10px] font-medium",
                  item.url === '/outreach' && crmGlow && 'text-green-400',
                  item.title === 'Track' && trackGlow && 'text-yellow-400'
                )}>{item.title}</span>
              </Link>
            );
          })}
          
          {/* More menu for additional pages */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px]',
                  isMoreActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 mb-2">
              {allMoreItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <DropdownMenuItem key={item.url} asChild>
                    <Link
                      to={item.url}
                      className={cn(
                        'flex items-center gap-3 cursor-pointer',
                        isActive && 'text-primary'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setThemeSheetOpen(true)}
                className="flex items-center gap-3 cursor-pointer"
              >
                <Palette className="h-4 w-4" />
                <span>Theme Color</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => signOut()} 
                className="text-destructive cursor-pointer"
              >
                <LogOut className="h-4 w-4 mr-3" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Theme Sheet - Separate from dropdown */}
      <Sheet open={themeSheetOpen} onOpenChange={setThemeSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl bg-card border-border p-0">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              Theme & Accent
            </SheetTitle>
            <SheetDescription className="text-muted-foreground text-sm">
              Personalize your interface with custom themes and accent colors.
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(85vh-140px)] px-6 pb-6">
            <div className="space-y-6">
              {/* Live Preview */}
              <div className="rounded-xl p-4 border border-border bg-background/50">
                <Label className="text-xs font-medium text-muted-foreground mb-3 block">
                  Live Preview
                </Label>
                <div className="flex items-center gap-3">
                  <Button size="sm" className="text-xs">
                    Primary
                  </Button>
                  <div 
                    className="h-8 w-8 rounded-lg border border-border"
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

              {/* Theme Selection */}
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">
                  Background Theme
                </Label>
                <Tabs defaultValue={currentTheme.mode} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-3">
                    <TabsTrigger value="dark" className="flex items-center gap-1.5 text-xs">
                      <Moon className="h-3.5 w-3.5" />
                      Dark
                    </TabsTrigger>
                    <TabsTrigger value="light" className="flex items-center gap-1.5 text-xs">
                      <Sun className="h-3.5 w-3.5" />
                      Light
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="dark" className="mt-0">
                    <MobileThemeGrid 
                      themes={darkThemes} 
                      activeThemeId={themeId} 
                      onSelect={handleThemeSelect} 
                    />
                  </TabsContent>
                  <TabsContent value="light" className="mt-0">
                    <MobileThemeGrid 
                      themes={lightThemes} 
                      activeThemeId={themeId} 
                      onSelect={handleThemeSelect} 
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Curated Presets */}
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">
                  Accent Color
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {accentPresets.map((preset, index) => (
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
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
