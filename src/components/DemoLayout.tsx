import { useState } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { DemoUpgradeDialog } from '@/components/DemoUpgradeDialog';

interface DemoLayoutProps {
  children: React.ReactNode;
}

export function DemoLayout({ children }: DemoLayoutProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [lockedFeature, setLockedFeature] = useState('');

  const handleLockedClick = (featureName: string) => {
    setLockedFeature(featureName);
    setUpgradeOpen(true);
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        {/* Background glow effect */}
        <div
          className="fixed inset-0 pointer-events-none opacity-30"
          style={{ background: 'var(--gradient-glow)' }}
        />

        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <AppSidebar isDemo onLockedClick={handleLockedClick} />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          <main className="flex-1 overflow-auto pb-20 md:pb-0">
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
              {children}
            </div>
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <MobileBottomNav isDemo onLockedClick={handleLockedClick} />

        <DemoUpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          featureName={lockedFeature}
        />
      </div>
    </SidebarProvider>
  );
}
