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
import { useAvatar } from '@/hooks/useAvatar';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { canOpenRoute, orderNavForRole } from '@/lib/access';
import { useWhatsAppUnread } from '@/hooks/useWhatsAppUnread';
import {
  LayoutDashboard, Search, ClipboardList, FileText, FileCode2, ListOrdered, UsersRound,
  MessageSquareQuote, Inbox, Sparkles, Map, Users,
  BarChart3, MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import appLogo from '@/assets/logo.png';

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { avatarUrl } = useAvatar();
  const { user } = useAuth();
  const { role } = useSubscription();
  /* The unread badge (per person, fn my_whatsapp_unread): the one number the dashboard's Today strip
     and the Inbox's Unread filter also read. */
  const unread = useWhatsAppUnread();

  const allNavItems = [
    { title: t('nav.dashboard'), url: '/', icon: LayoutDashboard, description: t('nav.dashboardDesc') },
    { title: t('nav.findLeads'), url: '/find-leads', icon: Search, description: t('nav.findLeadsDesc') },
    { title: t('nav.outreachCRM'), url: '/outreach', icon: ClipboardList, description: t('nav.outreachCRMDesc') },
    { title: 'Coverage', url: '/coverage', icon: Map, description: 'Which towns are done, per trade' },
    /* ⛔ Sales: the item SAYS WhatsApp (Paul, 2026-09-28: "I should not have to know that Inbox means
       WhatsApp"). Same route, same page, same conversations — one conversation system. */
    { title: role === 'sales' ? 'WhatsApp' : 'Inbox', url: '/inbox', icon: role === 'sales' ? MessageCircle : Inbox, description: role === 'sales' ? 'Your WhatsApp conversations' : 'WhatsApp conversations' },
    { title: 'Sales dashboard', url: '/sales-dashboard', icon: BarChart3, description: 'Results by campaign and template' },
    { title: 'Paid clients', url: '/paid-clients', icon: UsersRound, description: 'Client fulfilment hubs' },
    { title: 'AI Audit', url: '/ai-audit', icon: Sparkles, description: 'AI visibility audit' },
    { title: 'Review replies', url: '/review-replies', icon: MessageSquareQuote, description: 'Draft replies to client Google reviews' },
    { title: 'Page generator', url: '/page-generator', icon: FileCode2, description: 'Client delivery pages, aimed at the measured queries' },
    { title: 'Page plan', url: '/page-plan', icon: ListOrdered, description: 'The per-client page queue: distinct jobs, waves, editable' },
    { title: t('nav.templates'), url: '/templates', icon: FileText, description: t('nav.templatesDesc') },
    { title: 'Team', url: '/team', icon: Users, description: 'Salespeople, invites and lead ownership' },
  ];
  /* ⛔ The matrix decides WHAT is shown (src/lib/access.ts); this decides the ORDER. The admin keeps
     every item in the list order above (Dashboard, Find Leads, Outreach, Coverage directly below it,
     then Inbox…). A salesperson's order is the working day, Paul 2026-09-28: results → find leads →
     work the pipeline → market coverage → messages (SALES_NAV_ORDER). Presentation only. */
  const navItems = orderNavForRole(allNavItems.filter((item) => canOpenRoute(role, item.url)), role);

  const [flashCRM, setFlashCRM] = useState(false);
  const [flashSearch, setFlashSearch] = useState(false);
  const [searchTooltip, setSearchTooltip] = useState(false);

  useEffect(() => {
    const onCRMAdded = () => { setFlashCRM(true); setTimeout(() => setFlashCRM(false), 2000); };
    const onSearchPulse = () => { setFlashSearch(true); setSearchTooltip(true); setTimeout(() => setFlashSearch(false), 1200); setTimeout(() => setSearchTooltip(false), 2500); };
    window.addEventListener('crm-lead-added', onCRMAdded);
    window.addEventListener('pulse-search-nav', onSearchPulse);
    return () => {
      window.removeEventListener('crm-lead-added', onCRMAdded);
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
                  (item.url === '/outreach' && flashCRM) ||
                  (item.url === '/find-leads' && flashSearch);
                const flashColor = item.url === '/outreach' ? 'text-green-400' : (item.url === '/find-leads') ? 'text-yellow-400' : '';
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive}>
                    <Link
                        to={item.url}
                        data-walkthrough-step={item.url === '/outreach' ? 'outreach-crm' : undefined}
                        data-walkthrough={item.url === '/find-leads' ? 'search-nav' : item.url === '/outreach' ? 'crm-nav' : undefined}
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
                        {item.url === '/inbox' && unread.count > 0 && (
                          <span className="ml-auto shrink-0 rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums" aria-label={`${unread.count} unread WhatsApp conversations`}>
                            {unread.count > 99 ? '99+' : unread.count}
                          </span>
                        )}
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
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 mt-auto shrink-0 space-y-2">
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
    </Sidebar>
  );
}
