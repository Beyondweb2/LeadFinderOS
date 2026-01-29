import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';

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
        
        <AppSidebar />
        
        <main className="flex-1 relative z-10 overflow-auto">
          <div className="container py-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
