import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
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
} from '@/components/ui/sidebar';
import { UserMenu } from '@/components/UserMenu';
import { AccentColorPicker } from '@/components/AccentColorPicker';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSubscription } from '@/hooks/useSubscription';
import { useAvatar } from '@/hooks/useAvatar';
import { useAuth } from '@/hooks/useAuth';
import { 
  LayoutDashboard, 
  Search, 
  ClipboardList, 
  FileText,
  Briefcase,
  DollarSign,
  HelpCircle,
  Users,
  MessageSquare,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import appLogo from '@/assets/logo.png';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, description: 'Overview & today\'s tasks' },
  { title: 'Find Leads', url: '/find-leads', icon: Search, description: 'Search for businesses' },
  { title: 'Outreach', url: '/outreach', icon: ClipboardList, description: 'Cold call & gather numbers' },
  { title: 'Track Leads', url: '/potential-work', icon: Briefcase, description: 'Leads who want to work' },
  { title: 'Paid Clients', url: '/paid-clients', icon: DollarSign, description: 'Completed payments' },
  { title: 'Templates', url: '/templates', icon: FileText, description: 'Text & voice scripts' },
  { title: 'How to Use', url: '/how-to-use', icon: HelpCircle, description: 'Step-by-step guide' },
  { title: 'Feedback', url: '/feedback', icon: MessageSquare, description: 'Share your thoughts' },
];

const adminItems = [
  { title: 'Dashboard', url: '/admin', icon: ShieldCheck, description: 'User metrics & analytics' },
  { title: 'Affiliates', url: '/admin/affiliates', icon: Users, description: 'Manage affiliate partners' },
];

export function AppSidebar() {
  const location = useLocation();
  const { isAdmin } = useSubscription();
  const { avatarUrl } = useAvatar();
  const { user } = useAuth();

  // Walkthrough pulse states
  let searchPulse = false;
  let crmPulseWalkthrough = false;
  let trackPulseWalkthrough = false;
  try {
    const { state: demoState, isDemoUser, isOpen: walkthroughActive } = useDemoChecklist();
    searchPulse = isDemoUser && walkthroughActive && !demoState.searchDone;
    crmPulseWalkthrough = isDemoUser && walkthroughActive && demoState.addedToCrm && !demoState.firstContactMade;
    trackPulseWalkthrough = isDemoUser && walkthroughActive && demoState.threeContactsMade && !demoState.viewedProgress;
  } catch {}

  // Flash state for sidebar icons
  const [flashCRM, setFlashCRM] = useState(false);
  const [flashTrack, setFlashTrack] = useState(false);
  const [flashSearch, setFlashSearch] = useState(false);

  useEffect(() => {
    const onCRMAdded = () => { setFlashCRM(true); setTimeout(() => setFlashCRM(false), 800); };
    const onTrackAdded = () => { setFlashTrack(true); setTimeout(() => setFlashTrack(false), 2000); };
    const onSearchPulse = () => { setFlashSearch(true); setTimeout(() => setFlashSearch(false), 4000); };
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
    <Sidebar 
      className="border-r border-sidebar-border bg-sidebar"
      collapsible="none"
    >
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold tracking-tight truncate">
              Lead<span className="text-sidebar-primary">Finder</span> Pro
            </h1>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              All-in-one CRM
            </p>
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
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
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
                        <div className="flex flex-col overflow-hidden">
                          <span className="truncate">{item.title}</span>
                          <span className="text-xs text-sidebar-foreground/50 truncate">
                            {item.description}
                          </span>
                        </div>
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
                Admin
              </div>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
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
                          <div className="flex flex-col overflow-hidden">
                            <span className="truncate">{item.title}</span>
                            <span className="text-xs text-sidebar-foreground/50 truncate">
                              {item.description}
                            </span>
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

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt="Profile" />
              ) : null}
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
