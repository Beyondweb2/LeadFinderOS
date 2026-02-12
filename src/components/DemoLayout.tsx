import { useState, createContext, useContext, useCallback } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { DemoUpgradeDialog } from '@/components/DemoUpgradeDialog';
import type { Lead } from '@/types/lead';
import { useToast } from '@/hooks/use-toast';

interface DemoContextType {
  demoLeads: Lead[];
  addDemoLead: (lead: Lead) => void;
  removeDemoLead: (leadId: string) => void;
  isDemoLeadAdded: (name: string, googleMapsUrl?: string) => boolean;
  demoSearchUsed: boolean;
  markDemoSearchUsed: () => void;
}

const DemoContext = createContext<DemoContextType | null>(null);

export function useDemoContext() {
  return useContext(DemoContext);
}

interface DemoLayoutProps {
  children: React.ReactNode;
}

export function DemoLayout({ children }: DemoLayoutProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [lockedFeature, setLockedFeature] = useState('');
  const [demoLeads, setDemoLeads] = useState<Lead[]>([]);
  const [demoSearchUsed, setDemoSearchUsed] = useState(false);
  const { toast } = useToast();

  const markDemoSearchUsed = useCallback(() => setDemoSearchUsed(true), []);

  const handleLockedClick = (featureName: string) => {
    setLockedFeature(featureName);
    setUpgradeOpen(true);
  };

  const addDemoLead = useCallback((lead: Lead) => {
    setDemoLeads(prev => {
      if (prev.some(l => l.name === lead.name && l.googleMapsUrl === lead.googleMapsUrl)) {
        return prev;
      }
      return [...prev, lead];
    });
    toast({
      title: 'Added to CRM',
      description: `${lead.name} added to your demo CRM.`,
    });
  }, [toast]);

  const removeDemoLead = useCallback((leadId: string) => {
    setDemoLeads(prev => prev.filter(l => l.id !== leadId));
  }, []);

  const isDemoLeadAdded = useCallback((name: string, googleMapsUrl?: string) => {
    return demoLeads.some(l => l.name === name && l.googleMapsUrl === googleMapsUrl);
  }, [demoLeads]);

  return (
    <DemoContext.Provider value={{ demoLeads, addDemoLead, removeDemoLead, isDemoLeadAdded, demoSearchUsed, markDemoSearchUsed }}>
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
    </DemoContext.Provider>
  );
}
