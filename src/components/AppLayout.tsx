import { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { CheckoutActivationOverlay } from '@/components/CheckoutActivationOverlay';
import { DemoChecklistProvider } from '@/contexts/DemoChecklistContext';
import { DemoChecklistPanel } from '@/components/DemoChecklistPanel';
import { PaymentFailureDialog } from '@/components/PaymentFailureDialog';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Search, Sparkles, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePersistLastRoute } from '@/hooks/usePersistLastRoute';
import { usePersistedScroll } from '@/hooks/usePersistedScroll';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mainRef = useRef<HTMLElement>(null);
  const { isStripeTrialing, isLoading: isTrialLoading } = useTrial();
  const { status: subStatus, isLoading: isSubLoading } = useSubscription();
  const hasProAccess = subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin';
  const isDemoUser = !isTrialLoading && !isSubLoading && !hasProAccess && !isStripeTrialing;
  const isTrialingUser = !isTrialLoading && !isSubLoading && subStatus === 'trialing';
  const showWalkthrough = isDemoUser || isTrialingUser;

  // Demo welcome popup (shown when redirected from /unlock via back button)
  const [showDemoWelcome, setShowDemoWelcome] = useState(false);

  useEffect(() => {
    if (searchParams.get('welcome') === 'demo') {
      setShowDemoWelcome(true);
      // Clean the URL param without adding history entry
      searchParams.delete('welcome');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  const pathKey = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.pathname, location.search, location.hash]
  );

  // Persist last visited in-app route (so we can resume after idle refresh)
  usePersistLastRoute({
    userId: user?.id,
    path: pathKey,
    enabled: !!user,
  });

  // Persist scroll position of the main content container per route
  usePersistedScroll({
    containerRef: mainRef,
    userId: user?.id,
    routeKey: pathKey,
    enabled: !!user,
  });

  return (
    <DemoChecklistProvider isDemoUser={showWalkthrough}>
      <SidebarProvider defaultOpen={true}>
        <div className="min-h-screen flex w-full bg-background">

          {/* Desktop sidebar - hidden on mobile */}
          <div className="hidden md:block">
            <AppSidebar />
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col min-w-0 relative z-10">
            <main ref={mainRef} className="flex-1 overflow-auto pb-20 md:pb-0">
              <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
                {children}
              </div>
            </main>
          </div>

          {/* Mobile bottom navigation */}
          <MobileBottomNav />
          <CheckoutActivationOverlay />
          <PaymentFailureDialog />
          <DemoChecklistPanel />

          {/* Demo welcome popup */}
          <Dialog open={showDemoWelcome} onOpenChange={setShowDemoWelcome}>
            <DialogContent className="sm:max-w-sm border-primary/30 bg-card/95 backdrop-blur-xl">
              <DialogTitle className="sr-only">Welcome to the demo</DialogTitle>
              <div className="flex flex-col items-center py-4 gap-4 text-center">
                <div className="inline-flex p-3 rounded-full bg-primary/10 border border-primary/20">
                  <Search className="h-7 w-7 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold">Welcome to Your Free Demo</h3>
                  <p className="text-sm text-muted-foreground">
                    You have <span className="font-semibold text-foreground">1 free search</span> to try the full lead-finding system — no card required.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Search for any business type in any location and see real results instantly. Follow the walkthrough to explore the CRM & outreach tools.
                  </p>
                </div>
                <Button
                  className="w-full btn-premium font-semibold"
                  onClick={() => setShowDemoWelcome(false)}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Start My Free Search
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </SidebarProvider>
    </DemoChecklistProvider>
  );
}

