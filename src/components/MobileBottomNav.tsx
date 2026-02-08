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
  HelpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AccentColorPicker } from './AccentColorPicker';
import { useAuth } from '@/hooks/useAuth';

const mainNavItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Search', url: '/find-leads', icon: Search },
  { title: 'CRM', url: '/outreach', icon: ClipboardList },
  { title: 'Track', url: '/potential-work', icon: Briefcase },
];

const moreNavItems = [
  { title: 'Templates', url: '/templates', icon: FileText },
  { title: 'Paid Clients', url: '/paid-clients', icon: DollarSign },
  { title: 'How to Use', url: '/how-to-use', icon: HelpCircle },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { signOut } = useAuth();
  const isMoreActive = moreNavItems.some(item => location.pathname === item.url);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-xl border-t border-border safe-area-pb">
      <div className="flex items-center justify-around h-16 px-2">
        {mainNavItems.map((item) => {
          const isActive = location.pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px]',
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn(
                'h-5 w-5',
                isActive && 'drop-shadow-[0_0_8px_hsl(var(--primary))]'
              )} />
              <span className="text-[10px] font-medium">{item.title}</span>
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
              <MoreHorizontal className={cn(
                'h-5 w-5',
                isMoreActive && 'drop-shadow-[0_0_8px_hsl(var(--primary))]'
              )} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 mb-2">
            {moreNavItems.map((item) => {
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
            <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
              <div className="flex items-center gap-3 cursor-pointer">
                <Palette className="h-4 w-4" />
                <span>Theme Color</span>
                <div className="ml-auto">
                  <AccentColorPicker />
                </div>
              </div>
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
  );
}
