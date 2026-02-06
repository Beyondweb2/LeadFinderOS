import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { TrialBanner } from '@/components/TrialBanner';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex flex-col w-full bg-background">
        {/* Trial banner */}
        <TrialBanner />
        
        <div className="flex flex-1">
          {/* Background glow effect */}
          <div 
            className="fixed inset-0 pointer-events-none opacity-30"
            style={{ background: 'var(--gradient-glow)' }}
          />
          
          {/* Desktop sidebar - hidden on mobile */}
          <div className="hidden md:block">
            <AppSidebar />
          </div>
          
          <main className="flex-1 relative z-10 overflow-auto pb-20 md:pb-0">
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
              {children}
            </div>
          </main>
          
          {/* Mobile bottom navigation */}
          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
}
