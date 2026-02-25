import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { UserMenu } from '@/components/UserMenu';
import { AccentColorPicker } from '@/components/AccentColorPicker';
import { TrialStatusBadge } from '@/components/TrialStatusBadge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { useAvatar } from '@/hooks/useAvatar';
import { useAuth } from '@/hooks/useAuth';
import { 
  LayoutDashboard, 
  Search, 
  ClipboardList, 
  FileText,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  DollarSign,
  HelpCircle,
  Users,
  MessageSquare,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import appLogo from '@/assets/logo.png';

const navItems = [
  { 
    title: 'Dashboard', 
    url: '/', 
    icon: LayoutDashboard,
    description: 'Overview & today\'s tasks'
  },
  { 
    title: 'Find Leads', 
    url: '/find-leads', 
    icon: Search,
    description: 'Search for businesses'
  },
  { 
    title: 'Outreach CRM', 
    url: '/outreach', 
    icon: ClipboardList,
    description: 'Cold call & gather numbers'
  },
  { 
    title: 'Track Leads', 
    url: '/potential-work',
    icon: Briefcase,
    description: 'Leads who want to work'
  },
  { 
    title: 'Paid Clients', 
    url: '/paid-clients', 
    icon: DollarSign,
    description: 'Completed payments'
  },
  { 
    title: 'Templates', 
    url: '/templates', 
    icon: FileText,
    description: 'Text & voice scripts'
  },
  { 
    title: 'How to Use', 
    url: '/how-to-use', 
    icon: HelpCircle,
    description: 'Step-by-step guide'
  },
  { 
    title: 'Feedback', 
    url: '/feedback', 
    icon: MessageSquare,
    description: 'Share your thoughts'
  },
];

const adminItems = [
  { 
    title: 'Dashboard', 
    url: '/admin', 
    icon: ShieldCheck,
    description: 'User metrics & analytics'
  },
  { 
    title: 'Affiliates', 
    url: '/admin/affiliates', 
    icon: Users,
    description: 'Manage affiliate partners'
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { isAdmin, subscribed, isLoading: isSubscriptionLoading } = useSubscription();
  const { isOnTrial, searchesRemaining, dailyLimit, isStripeTrialing, isLoading: isTrialLoading, freeSearchCount } = useTrial();
  const { avatarUrl } = useAvatar();
  const { user } = useAuth();
  const isCollapsed = state === 'collapsed';

  // Walkthrough step 1 pulse + step 3 CRM pulse + step 6 track pulse
  let searchPulse = false;
  let crmPulseWalkthrough = false;
  let trackPulseWalkthrough = false;
  try {
    const { state: demoState, isDemoUser } = useDemoChecklist();
    searchPulse = isDemoUser && !demoState.searchDone;
    crmPulseWalkthrough = isDemoUser && demoState.addedToCrm && !demoState.contactAttempted;
    trackPulseWalkthrough = isDemoUser && demoState.leadTracked && !demoState.followUpSet;
  } catch {}

  // Flash state for sidebar icons (mirrors mobile bottom nav behavior)
  const [flashCRM, setFlashCRM] = useState(false);
  const [flashTrack, setFlashTrack] = useState(false);
  const [flashSearch, setFlashSearch] = useState(false);

  useEffect(() => {
    const onCRMAdded = () => {
      setFlashCRM(true);
      setTimeout(() => setFlashCRM(false), 2000);
    };
    const onTrackAdded = () => {
      setFlashTrack(true);
      setTimeout(() => setFlashTrack(false), 2000);
    };
    const onSearchPulse = () => {
      setFlashSearch(true);
      setTimeout(() => setFlashSearch(false), 4000);
    };
    window.addEventListener('crm-lead-added', onCRMAdded);
    window.addEventListener('track-lead-added', onTrackAdded);
    window.addEventListener('pulse-search-nav', onSearchPulse);
    return () => {
      window.removeEventListener('crm-lead-added', onCRMAdded);
      window.removeEventListener('track-lead-added', onTrackAdded);
      window.removeEventListener('pulse-search-nav', onSearchPulse);
    };
  }, []);
  
  // Pro access = active, trialing, past_due, or admin
  const { status: subStatus } = useSubscription();
  const hasProAccess = subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin';
  const isFreeUser = !hasProAccess;
  
  // Free users: show remaining free searches out of 5
  const effectiveSearchesRemaining = isFreeUser ? Math.max(0, 5 - (freeSearchCount ?? 0)) : searchesRemaining;
  const effectiveDailyLimit = isFreeUser ? 5 : dailyLimit;
  
  // Show badge for free users who haven't paid
  const showTrialBadge = !isSubscriptionLoading && !isTrialLoading && isFreeUser && !subscribed;

  return (
    <Sidebar 
      className="border-r border-sidebar-border bg-sidebar"
      collapsible="icon"
    >
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
          {!isCollapsed && (
            <div className="overflow-hidden">
              <h1 className="text-lg font-bold tracking-tight truncate">
                Lead<span className="text-sidebar-primary">Finder</span> Pro
              </h1>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                All-in-one CRM
              </p>
            </div>
          )}
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
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={isCollapsed ? item.title : undefined}
                    >
                      <Link 
                          to={item.url}
                          data-walkthrough-step={item.url === '/potential-work' ? 'track-leads' : item.url === '/outreach' ? 'outreach-crm' : undefined}
                          data-walkthrough={item.url === '/find-leads' ? 'search-nav' : item.url === '/outreach' ? 'crm-nav' : item.url === '/potential-work' ? 'track-nav' : undefined}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium' 
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                          )}
                        >
                          <item.icon className={cn(
                            'h-5 w-5 shrink-0 transition-colors duration-300',
                            isFlashing ? `${flashColor} animate-pulse` : isActive ? 'text-sidebar-primary' : ''
                          )} style={isFlashing ? { filter: `drop-shadow(0 0 6px currentColor)` } : undefined} />
                          {!isCollapsed && (
                            <div className="flex flex-col overflow-hidden">
                              <span className="truncate">{item.title}</span>
                              <span className="text-xs text-sidebar-foreground/50 truncate">
                                {item.description}
                              </span>
                            </div>
                          )}
                        </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Section - Only visible to admins */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              {!isCollapsed && (
                <div className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                  Admin
                </div>
              )}
              <SidebarMenu>
                {adminItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={isCollapsed ? item.title : undefined}
                      >
                        <Link 
                          to={item.url}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                            isActive 
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium' 
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                          )}
                        >
                          <item.icon className={cn(
                            'h-5 w-5 shrink-0',
                            isActive ? 'text-sidebar-primary' : ''
                          )} />
                          {!isCollapsed && (
                            <div className="flex flex-col overflow-hidden">
                              <span className="truncate">{item.title}</span>
                              <span className="text-xs text-sidebar-foreground/50 truncate">
                                {item.description}
                              </span>
                            </div>
                          )}
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

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className={cn(
          'flex items-center',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}>
          <div className="flex items-center gap-2">
            {!isCollapsed && (
              <Avatar className="h-8 w-8">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt="Profile" />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            )}
            {!isCollapsed && <UserMenu />}
          </div>
          <div className="flex items-center gap-1">
            <AccentColorPicker />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
