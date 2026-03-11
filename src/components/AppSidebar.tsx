import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from '@/components/ui/sidebar';
import { UserMenu } from '@/components/UserMenu';
import { AccentColorPicker } from '@/components/AccentColorPicker';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSubscription } from '@/hooks/useSubscription';
import { useAvatar } from '@/hooks/useAvatar';
import { useAuth } from '@/hooks/useAuth';
import { 
  LayoutDashboard, Search, ClipboardList, FileText, Star,
  DollarSign, HelpCircle, Users, MessageSquare, ShieldCheck, Lightbulb, StickyNote
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { NotepadModal } from '@/components/NotepadModal';
import appLogo from '@/assets/logo.png';

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAdmin } = useSubscription();
  const { avatarUrl } = useAvatar();
  const { user } = useAuth();
  const [notepadOpen, setNotepadOpen] = useState(false);

  const navItems = [
    { title: t('nav.dashboard'), url: '/', icon: LayoutDashboard, description: t('nav.dashboardDesc') },
    { title: t('nav.findLeads'), url: '/find-leads', icon: Search, description: t('nav.findLeadsDesc') },
    { title: t('nav.outreachCRM'), url: '/outreach', icon: ClipboardList, description: t('nav.outreachCRMDesc') },
    { title: t('nav.trackLeads'), url: '/potential-work', icon: Star, description: t('nav.trackLeadsDesc') },
    { title: t('nav.paidClients'), url: '/paid-clients', icon: DollarSign, description: t('nav.paidClientsDesc') },
    { title: t('nav.templates'), url: '/templates', icon: FileText, description: t('nav.templatesDesc') },
    { title: 'Playbook', url: '/playbook', icon: Lightbulb, description: 'Closing tips & tactics' },
    { title: t('nav.howToUse'), url: '/how-to-use', icon: HelpCircle, description: t('nav.howToUseDesc') },
    { title: t('nav.feedback'), url: '/feedback', icon: MessageSquare, description: t('nav.feedbackDesc') },
  ];

  const adminItems = [
    { title: t('nav.adminDashboard'), url: '/admin', icon: ShieldCheck, description: t('nav.adminDashboardDesc') },
    { title: t('nav.affiliates'), url: '/admin/affiliates', icon: Users, description: t('nav.affiliatesDesc') },
  ];

  let searchPulse = false;
  let crmPulseWalkthrough = false;
  let trackPulseWalkthrough = false;
  try {
    const { state: demoState, isDemoUser, isOpen: walkthroughActive } = useDemoChecklist();
    searchPulse = isDemoUser && walkthroughActive && !demoState.searchDone;
    crmPulseWalkthrough = isDemoUser && walkthroughActive && demoState.addedToCrm && !demoState.firstContactMade;
    trackPulseWalkthrough = isDemoUser && walkthroughActive && demoState.contactPanelClosed && !demoState.viewedProgress;
  } catch {}

  const [flashCRM, setFlashCRM] = useState(false);
  const [flashTrack, setFlashTrack] = useState(false);
  const [flashSearch, setFlashSearch] = useState(false);
  const [searchTooltip, setSearchTooltip] = useState(false);

  useEffect(() => {
    const onCRMAdded = () => { setFlashCRM(true); setTimeout(() => setFlashCRM(false), 600); };
    const onTrackAdded = () => { setFlashTrack(true); setTimeout(() => setFlashTrack(false), 600); };
    const onSearchPulse = () => { setFlashSearch(true); setSearchTooltip(true); setTimeout(() => setFlashSearch(false), 1200); setTimeout(() => setSearchTooltip(false), 2500); };
    window.addEventListener('crm-lead-added', onCRMAdded);
    window.addEventListener('track-lead-added', onTrackAdded);
    window.addEventListener('pulse-search-nav', onSearchPulse);
    return () => {
      window.removeEventListener('crm-lead-added', onCRMAdded);
      window.removeEventListener('track-lead-added', onTrackAdded);
      window.removeEventListener('pulse-search-nav', onSearchPulse);
    };
  }, []);

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar" collapsible="none">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold tracking-tight truncate">
              Lead<span className="text-sidebar-primary">Finder</span> Pro
            </h1>
            <p className="text-xs text-sidebar-foreground/60 truncate">{t('nav.allInOneCRM')}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location.pathname === item.url;
                const isFlashing = 
                  (item.url === '/outreach' && (flashCRM || crmPulseWalkthrough)) || 
                  (item.url === '/potential-work' && (flashTrack || trackPulseWalkthrough)) ||
                  (item.url === '/find-leads' && (searchPulse || flashSearch));
                const flashColor = item.url === '/outreach' ? 'text-green-400' : (item.url === '/potential-work' || item.url === '/find-leads') ? 'text-yellow-400' : '';
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link 
                        to={item.url}
                        onClick={() => {
                          if (item.url === '/potential-work') {
                            window.dispatchEvent(new CustomEvent('demo-checklist-track-pressed'));
                          }
                        }}
                        data-walkthrough-step={item.url === '/potential-work' ? 'track-leads' : item.url === '/outreach' ? 'outreach-crm' : undefined}
                        data-walkthrough={item.url === '/find-leads' ? 'search-nav' : item.url === '/outreach' ? 'crm-nav' : item.url === '/potential-work' ? 'track-nav' : undefined}
                        className={cn(
                          'relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                          isActive ? 'bg-sidebar-accent text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )}
                      >
                        <item.icon className={cn(
                          'h-5 w-5 shrink-0 transition-colors duration-300',
                          isFlashing ? `${flashColor} animate-pulse` : isActive ? 'text-sidebar-primary' : ''
                        )} style={isFlashing ? { filter: `drop-shadow(0 0 6px currentColor)` } : undefined} />
                        <div className="flex flex-col overflow-hidden">
                          <span className="truncate">{item.title}</span>
                          <span className="text-xs text-sidebar-foreground/50 truncate">{item.description}</span>
                        </div>
                        {item.url === '/find-leads' && searchTooltip && (
                          <span className="absolute -top-1 right-2 whitespace-nowrap text-[10px] font-medium text-amber-400 bg-card/95 border border-amber-500/30 rounded-md px-2 py-1 shadow-lg animate-bounce z-50">
                            {t('completion.findMoreLeads')}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                {t('common.admin')}
              </div>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link to={item.url} className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                          isActive ? 'bg-sidebar-accent text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )}>
                          <item.icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-sidebar-primary' : '')} />
                          <div className="flex flex-col overflow-hidden">
                            <span className="truncate">{item.title}</span>
                            <span className="text-xs text-sidebar-foreground/50 truncate">{item.description}</span>
                          </div>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 mt-auto shrink-0 space-y-2">
        <button
          onClick={() => setNotepadOpen(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground w-full"
        >
          <StickyNote className="h-5 w-5 shrink-0" />
          <span className="text-sm">Notepad</span>
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="Profile" /> : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <UserMenu />
          </div>
          <AccentColorPicker />
        </div>
      </SidebarFooter>
      <NotepadModal open={notepadOpen} onOpenChange={setNotepadOpen} />
    </Sidebar>
  );
}
