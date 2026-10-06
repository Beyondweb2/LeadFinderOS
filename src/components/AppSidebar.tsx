import { Link, useLocation } from 'react-router-dom';
import { Fragment, useState, useEffect } from 'react';
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
import { canOpenRoute, orderNavForRole, SALES_SECONDARY_NAV } from '@/lib/access';
import { useWhatsAppUnread } from '@/hooks/useWhatsAppUnread';
import {
  LayoutDashboard, Search, ClipboardList, FileText, UsersRound,
  Inbox, Sparkles, Map, Users,
  BarChart3, MessageCircle, MessageSquarePlus,
} from 'lucide-react';
import { FeedbackNewsButtons } from '@/components/FeedbackAndNews';
import { PaletteButton } from '@/components/CommandPalette';
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
    { title: 'Admin dashboard', url: '/', icon: LayoutDashboard, description: 'The business at a glance' },
    { title: t('nav.findLeads'), url: '/find-leads', icon: Search, description: role === 'sales' ? 'Search for new businesses' : t('nav.findLeadsDesc') },
    { title: t('nav.outreachCRM'), url: '/outreach', icon: ClipboardList, description: role === 'sales' ? 'Your leads and pipeline' : t('nav.outreachCRMDesc') },
    { title: 'Coverage', url: '/coverage', icon: Map, description: 'Which towns are done, per trade' },
    /* ⛔ Sales: the item SAYS WhatsApp (Paul, 2026-09-28: "I should not have to know that Inbox means
       WhatsApp"). Same route, same page, same conversations — one conversation system. */
    { title: role === 'sales' ? 'WhatsApp' : 'Inbox', url: '/inbox', icon: role === 'sales' ? MessageCircle : Inbox, description: role === 'sales' ? 'Your WhatsApp conversations' : 'WhatsApp conversations' },
    /* Sales + Earnings are one page (2026-10-01); Focus Mode is retired (its parts are in the lead popup).
       2026-10-02: named "Sales dashboard" everywhere, beside the "Admin dashboard" — two dashboards, one product. */
    { title: 'Sales dashboard', url: '/sales-dashboard', icon: BarChart3, description: role === 'sales' ? 'Your month, commission and next steps' : "Each salesperson's month and commission" },
    { title: 'Paid clients', url: '/paid-clients', icon: UsersRound, description: 'Client hubs, pages and review replies' },
    { title: 'AI Audit', url: '/ai-audit', icon: Sparkles, description: 'AI visibility audit' },
    /* 2026-10-06 (Paul): Review replies, Page generator and Page plan are no longer menu items — they live
       inside Paid clients (its Tools tab, and each client's Pages & reviews). Their old URLs redirect there. */
    { title: t('nav.templates'), url: '/templates', icon: FileText, description: t('nav.templatesDesc') },
    { title: 'Team', url: '/team', icon: Users, description: 'Salespeople, invites and lead ownership' },
    { title: 'Feedback inbox', url: '/feedback', icon: MessageSquarePlus, description: 'Team feedback and template requests' },
  ];
  /* ⛔ The matrix decides WHAT is shown (src/lib/access.ts); this decides the ORDER. The admin keeps
     every item in the list order above (Admin dashboard, Find Leads, Outreach, Coverage directly below it,
     then Inbox…). A salesperson's order, Paul 2026-10-02: Sales dashboard → Outreach → WhatsApp → Find
     Leads, Coverage under More (SALES_NAV_ORDER). Presentation only. */
  const ordered = orderNavForRole(allNavItems.filter((item) => canOpenRoute(role, item.url)), role);
  /* A salesperson's secondary items (Coverage) sit under "More", after the main list. */
  const isSecondary = (url: string) => role === 'sales' && SALES_SECONDARY_NAV.includes(url);
  const navItems = [...ordered.filter((i) => !isSecondary(i.url)), ...ordered.filter((i) => isSecondary(i.url))];
  const firstSecondary = navItems.findIndex((i) => isSecondary(i.url));

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
        <div className="px-1 pb-2 pt-1"><PaletteButton /></div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item, idx) => {
                const isActive = location.pathname === item.url;
                const isFlashing =
                  (item.url === '/outreach' && flashCRM) ||
                  (item.url === '/find-leads' && flashSearch);
                const flashColor = item.url === '/outreach' ? 'text-green-400' : (item.url === '/find-leads') ? 'text-yellow-400' : '';
                return (
                  <Fragment key={item.url}>
                  {idx === firstSecondary && <li className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50" data-testid="nav-more">More</li>}
                  <SidebarMenuItem>
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
                  </Fragment>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 mt-auto shrink-0 space-y-2">
        <FeedbackNewsButtons />
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
