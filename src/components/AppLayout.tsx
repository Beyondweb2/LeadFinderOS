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
      <div className="min-h-screen flex w-full bg-background">
        {/* Background glow effect */}
        <div 
          className="fixed inset-0 pointer-events-none opacity-30"
          style={{ background: 'var(--gradient-glow)' }}
        />
        
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        
        {/* Main content area - includes trial banner */}
        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          {/* Trial banner - now inside main content, respects sidebar */}
          <TrialBanner />
          
          <main className="flex-1 overflow-auto pb-20 md:pb-0">
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
              {children}
            </div>
          </main>
        </div>
        
        {/* Mobile bottom navigation */}
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
