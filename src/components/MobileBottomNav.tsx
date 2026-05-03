import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, Search, ClipboardList, FileText, Star,
  DollarSign, MoreHorizontal, Palette, LogOut, HelpCircle,
  MessageSquare, Users, ShieldCheck, CreditCard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { NotepadModal } from '@/components/NotepadModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAccentColor, hexToHSL, hslToHex, ThemePreset } from '@/hooks/useAccentColor';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { Check, Sparkles, Sun, Moon, RotateCcw, StickyNote } from 'lucide-react';

function MobileThemeGrid({ themes, activeThemeId, onSelect }: { themes: ThemePreset[]; activeThemeId: string; onSelect: (id: string) => void; }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {themes.map((theme) => (
        <button key={theme.id} onClick={() => onSelect(theme.id)}
          className={cn(
            'group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200',
            activeThemeId === theme.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40 bg-background/50 hover:bg-background'
          )} title={theme.name}>
          <div className="w-8 h-8 rounded-lg shadow-md flex items-center justify-center transition-transform group-hover:scale-110 border border-white/10"
            style={{ backgroundColor: theme.preview, boxShadow: activeThemeId === theme.id ? `0 0 16px ${theme.preview}40` : undefined }}>
            {activeThemeId === theme.id && (
              <Check className={cn("h-4 w-4 drop-shadow-md", theme.mode === 'light' ? 'text-foreground' : 'text-primary-foreground')} />
            )}
          </div>
          <span className="text-[10px] font-medium text-foreground/80 truncate w-full text-center">{theme.name}</span>
        </button>
      ))}
    </div>
  );
}

export function MobileBottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin, openCustomerPortal } = useSubscription();
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const [notepadOpen, setNotepadOpen] = useState(false);
  const [crmGlow, setCrmGlow] = useState(false);
  const [trackGlow, setTrackGlow] = useState(false);
  const [searchGlow, setSearchGlow] = useState(false);
  const [searchTooltip, setSearchTooltip] = useState(false);

  const mainNavItems = [
    { title: t('nav.dashboard'), url: '/', icon: LayoutDashboard },
    { title: t('nav.search'), url: '/find-leads', icon: Search },
    { title: t('nav.outreach'), url: '/outreach', icon: ClipboardList },
    { title: t('nav.track'), url: '/potential-work', icon: Star },
  ];

  const moreNavItems = [
    { title: t('nav.templates'), url: '/templates', icon: FileText },
    { title: t('nav.paidClients'), url: '/paid-clients', icon: DollarSign },
    { title: t('nav.howToUse'), url: '/how-to-use', icon: HelpCircle },
    { title: t('nav.feedback'), url: '/feedback', icon: MessageSquare },
  ];

  let searchPulse = false;
  let crmPulseWalkthrough = false;
  let trackPulseWalkthrough = false;
  try {
    const { state, isDemoUser, isOpen: walkthroughActive } = useDemoChecklist();
    searchPulse = isDemoUser && walkthroughActive && !state.searchDone;
    crmPulseWalkthrough = isDemoUser && walkthroughActive && state.addedToCrm && !state.firstContactMade;
    trackPulseWalkthrough = isDemoUser && walkthroughActive && state.contactPanelClosed && !state.viewedProgress;
  } catch {}

  useEffect(() => {
    const crmHandler = () => { setCrmGlow(true); setTimeout(() => setCrmGlow(false), 2000); };
    const trackHandler = () => { setTrackGlow(true); setTimeout(() => setTrackGlow(false), 600); };
    const searchHandler = () => { setSearchGlow(true); setSearchTooltip(true); setTimeout(() => setSearchGlow(false), 1200); setTimeout(() => setSearchTooltip(false), 2500); };
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
    ? [...moreNavItems, { title: t('common.admin'), url: '/admin', icon: ShieldCheck }, { title: t('nav.affiliates'), url: '/admin/affiliates', icon: Users }]
    : moreNavItems;
  const isMoreActive = allMoreItems.some(item => location.pathname === item.url);

  const { accent, themeId, currentTheme, accentPresets, darkThemes, lightThemes, updateAccent, setAccentPreset, setTheme, resetToDefault } = useAccentColor();
  
  const [activePreset, setActivePreset] = useState<number | null>(() => {
    const idx = accentPresets.findIndex(p => p.hsl === accent);
    return idx >= 0 ? idx : null;
  });

  const handlePresetSelect = (index: number) => { setActivePreset(index); setAccentPreset(index); };
  const handleCustomColor = (hex: string) => { setActivePreset(null); updateAccent(hexToHSL(hex)); };
  const handleThemeSelect = (newThemeId: string) => { setTheme(newThemeId); };
  const handleReset = () => { setActivePreset(0); resetToDefault(); };
  const currentHex = hslToHex(accent);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-xl border-t border-border safe-area-pb">
        <div className="flex items-center justify-around h-16 px-2">
          {mainNavItems.map((item) => {
            const isActive = location.pathname === item.url;
            return (
              <Link key={item.url} to={item.url}
                onClick={() => {
                  if (item.url === '/potential-work') {
                    window.dispatchEvent(new CustomEvent('demo-checklist-track-pressed'));
                  }
                }}
                data-walkthrough-step={item.url === '/potential-work' ? 'track-leads' : item.url === '/outreach' ? 'outreach-crm' : undefined}
                data-walkthrough={item.url === '/find-leads' ? 'search-nav' : item.url === '/outreach' ? 'crm-nav' : item.url === '/potential-work' ? 'track-nav' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[60px]',
                  item.url === '/find-leads' && (searchPulse || searchGlow) ? 'text-yellow-400 animate-pulse'
                    : item.url === '/outreach' && crmPulseWalkthrough ? 'text-yellow-400 animate-pulse'
                    : item.url === '/outreach' && crmGlow ? 'text-green-400 animate-pulse'
                    : item.url === '/potential-work' && (trackGlow || trackPulseWalkthrough) ? 'text-yellow-400 animate-pulse'
                    : isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}>
                {item.url === '/find-leads' && searchTooltip && (
                  <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-3.5 py-2.5 rounded-xl bg-[hsl(220,50%,7%)] border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)] max-w-[220px] text-center animate-bounce">
                    <div className="text-[13px] text-foreground font-medium leading-relaxed whitespace-nowrap">
                      {t('completion.findMoreLeads')}
                    </div>
                  </div>
                )}
                <item.icon className={cn(
                  'h-5 w-5 transition-all',
                  item.url === '/outreach' && (crmGlow || crmPulseWalkthrough) && 'scale-110',
                  item.url === '/potential-work' && (trackGlow || trackPulseWalkthrough) && 'scale-110'
                )} />
                <span className={cn(
                  "text-[10px] font-medium",
                  item.url === '/outreach' && crmGlow && 'text-green-400',
                  item.url === '/potential-work' && trackGlow && 'text-yellow-400'
                )}>{item.title}</span>
              </Link>
            );
          })}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px]',
                isMoreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}>
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t('common.more')}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 mb-2">
              {allMoreItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <DropdownMenuItem key={item.url} asChild>
                    <Link to={item.url} className={cn('flex items-center gap-3 cursor-pointer', isActive && 'text-primary')}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNotepadOpen(true)} className="flex items-center gap-3 cursor-pointer">
                <StickyNote className="h-4 w-4" />
                <span>Notepad</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                try { openCustomerPortal(); } catch { }
              }} className="flex items-center gap-3 cursor-pointer">
                <CreditCard className="h-4 w-4" />
                <span>{t('userMenu.manageSubscription')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setThemeSheetOpen(true)} className="flex items-center gap-3 cursor-pointer">
                <Palette className="h-4 w-4" />
                <span>{t('theme.themeColor')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive cursor-pointer">
                <LogOut className="h-4 w-4 mr-3" />
                <span>{t('common.signOut')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <NotepadModal open={notepadOpen} onOpenChange={setNotepadOpen} />
      <Sheet open={themeSheetOpen} onOpenChange={setThemeSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl bg-card border-border p-0">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('theme.themeAndAccent')}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground text-sm">
              {t('theme.personalizeInterface')}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(85vh-140px)] px-6 pb-6">
            <div className="space-y-6">
              <div className="rounded-xl p-4 border border-border bg-background/50">
                <Label className="text-xs font-medium text-muted-foreground mb-3 block">{t('theme.livePreview')}</Label>
                <div className="flex items-center gap-3">
                  <Button size="sm" className="text-xs">{t('common.primary')}</Button>
                  <div className="h-8 w-8 rounded-lg border border-border" style={{ backgroundColor: `hsl(${accent})` }} />
                  <div className="flex-1 h-2 rounded-full" style={{ background: `linear-gradient(90deg, hsl(${accent}), hsl(210 100% 50%))` }} />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">{t('theme.backgroundTheme')}</Label>
                <Tabs defaultValue={currentTheme.mode} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-3">
                    <TabsTrigger value="dark" className="flex items-center gap-1.5 text-xs"><Moon className="h-3.5 w-3.5" />{t('theme.dark')}</TabsTrigger>
                    <TabsTrigger value="light" className="flex items-center gap-1.5 text-xs"><Sun className="h-3.5 w-3.5" />{t('theme.light')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="dark" className="mt-0"><MobileThemeGrid themes={darkThemes} activeThemeId={themeId} onSelect={handleThemeSelect} /></TabsContent>
                  <TabsContent value="light" className="mt-0"><MobileThemeGrid themes={lightThemes} activeThemeId={themeId} onSelect={handleThemeSelect} /></TabsContent>
                </Tabs>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">{t('theme.accentColor')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {accentPresets.map((preset, index) => (
                    <button key={preset.name} onClick={() => handlePresetSelect(index)}
                      className={cn('group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200',
                        activePreset === index ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40 bg-background/50 hover:bg-background'
                      )} title={preset.description}>
                      <div className="w-8 h-8 rounded-lg shadow-md flex items-center justify-center transition-transform group-hover:scale-110"
                        style={{ backgroundColor: preset.hex, boxShadow: activePreset === index ? `0 0 16px ${preset.hex}40` : undefined }}>
                        {activePreset === index && <Check className="h-4 w-4 text-white drop-shadow-md" />}
                      </div>
                      <span className="text-[10px] font-medium text-foreground/80 truncate w-full text-center">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">{t('theme.customAccent')}</Label>
                <div className="flex items-center gap-3">
                  <Input type="color" value={currentHex} onChange={(e) => handleCustomColor(e.target.value)} className="w-14 h-12 p-1 cursor-pointer rounded-lg border-border" />
                  <div className="flex-1 space-y-1">
                    <Input type="text" value={currentHex.toUpperCase()}
                      onChange={(e) => { if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) handleCustomColor(e.target.value); }}
                      placeholder="#1FE3D3" className="font-mono text-xs h-8 bg-background" />
                    <p className="text-[10px] text-muted-foreground">{t('theme.coolColorsOnly')}</p>
                  </div>
                </div>
              </div>

              <Button variant="outline" onClick={handleReset} className="w-full border-border bg-background hover:bg-secondary">
                <RotateCcw className="h-4 w-4 mr-2" />{t('common.reset')}
              </Button>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
