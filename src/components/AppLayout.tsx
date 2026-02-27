import { useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { CheckoutActivationOverlay } from '@/components/CheckoutActivationOverlay';
import { DemoChecklistProvider } from '@/contexts/DemoChecklistContext';
import { DemoChecklistPanel } from '@/components/DemoChecklistPanel';
import { PaymentFailureDialog } from '@/components/PaymentFailureDialog';
import { WalkthroughOverlay } from '@/components/WalkthroughOverlay';
import { SkipWalkthroughButton } from '@/components/SkipWalkthroughButton';
import { WelcomeWalkthroughModal } from '@/components/WelcomeWalkthroughModal';
import { Challenge10Modal } from '@/components/Challenge10Modal';
import { useAuth } from '@/hooks/useAuth';
import { usePersistLastRoute } from '@/hooks/usePersistLastRoute';
import { usePersistedScroll } from '@/hooks/usePersistedScroll';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { useChallenge10 } from '@/hooks/useChallenge10';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const { isStripeTrialing, isLoading: isTrialLoading } = useTrial();
  const { status: subStatus, isLoading: isSubLoading } = useSubscription();
  const isLoaded = !isTrialLoading && !isSubLoading;
  const hasProAccess = subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin';
  const isDemoUser = isLoaded && !hasProAccess && !isStripeTrialing;
  const isTrialingUser = isLoaded && subStatus === 'trialing';
  const showWalkthrough = isDemoUser || isTrialingUser;
  const challenge = useChallenge10();

  // Listen for walkthrough completion events to trigger the 10 Business Challenge modal
  // Only triggers once — for users completing the walkthrough for the first time after this feature ships
  useEffect(() => {
    if (challenge.isLoading || challenge.modalShown) return;

    const handleWalkthroughDone = () => {
      // Small delay to let walkthrough UI dismiss first
      setTimeout(() => {
        challenge.triggerModal();
      }, 1500);
    };

    // Listen for both skip and natural completion
    window.addEventListener('walkthrough-all-done', handleWalkthroughDone);
    window.addEventListener('skip-walkthrough', handleWalkthroughDone);
    return () => {
      window.removeEventListener('walkthrough-all-done', handleWalkthroughDone);
      window.removeEventListener('skip-walkthrough', handleWalkthroughDone);
    };
  }, [challenge.isLoading, challenge.modalShown, challenge.triggerModal]);




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
            {/* Skip walkthrough link — top-right, outside modals */}
            <div className="flex justify-end px-4 sm:px-6 lg:px-8 pt-2">
              <SkipWalkthroughButton />
            </div>
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
          <WalkthroughOverlay />
          <WelcomeWalkthroughModal />
          <Challenge10Modal
            open={challenge.showModal}
            onStart={challenge.startChallenge}
            onSkip={challenge.skipChallenge}
          />

        </div>
      </SidebarProvider>
    </DemoChecklistProvider>
  );
}

