import { Link, useLocation } from 'react-router-dom';
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
  MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  const { isOnTrial, searchesRemaining, dailyLimit, isStripeTrialing, isLoading: isTrialLoading } = useTrial();
  const { avatarUrl } = useAvatar();
  const { user } = useAuth();
  const isCollapsed = state === 'collapsed';
  
  // Show trial badge for free trial users only (not Stripe trialing or subscribed)
  // Also wait for loading to complete to prevent flickering
  const showTrialBadge = !isSubscriptionLoading && !isTrialLoading && isOnTrial && !subscribed && !isStripeTrialing;

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
        
        {/* Trial Status Badge */}
        {showTrialBadge && (
          <div className="mt-3">
            <TrialStatusBadge 
              searchesRemaining={searchesRemaining} 
              dailyLimit={dailyLimit}
              isCollapsed={isCollapsed}
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
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
