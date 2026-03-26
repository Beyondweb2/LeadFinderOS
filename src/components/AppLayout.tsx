import { useMemo, useRef, useEffect, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { CheckoutActivationOverlay } from '@/components/CheckoutActivationOverlay';
import { DemoChecklistProvider } from '@/contexts/DemoChecklistContext';
import { DemoChecklistPanel } from '@/components/DemoChecklistPanel';
import { PaymentFailureDialog } from '@/components/PaymentFailureDialog';
import { PaymentWarningBanner } from '@/components/PaymentWarningBanner';
import { OnboardingPopups } from '@/components/OnboardingPopups';
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
  const isSimulatingNewUser = (() => {
    try {
      return user?.id ? localStorage.getItem(`simulate_new_user_${user.id}`) === 'true' : false;
    } catch { return false; }
  })();
  const showWalkthrough = isDemoUser || isTrialingUser || isSimulatingNewUser;
  const challenge = useChallenge10();

  // Listen for walkthrough completion — set pending flag only for subscribed users
  useEffect(() => {
    const handleReady = () => {
      if (!hasProAccess && !isStripeTrialing) return;
      try {
        const key = user?.id ? `challenge_10_pending_${user.id}` : 'challenge_10_pending';
        localStorage.setItem(key, 'true');
      } catch {}
    };

    window.addEventListener('walkthrough-dismissed', handleReady);
    window.addEventListener('skip-walkthrough', handleReady);
    return () => {
      window.removeEventListener('walkthrough-dismissed', handleReady);
      window.removeEventListener('skip-walkthrough', handleReady);
    };
  }, [user?.id, hasProAccess, isStripeTrialing]);

  // Once challenge state loads, check if there's a pending trigger
  useEffect(() => {
    if (challenge.isLoading || challenge.modalShown) return;

    const key = user?.id ? `challenge_10_pending_${user.id}` : 'challenge_10_pending';
    try {
      if (localStorage.getItem(key) === 'true' && location.pathname === '/find-leads') {
        localStorage.removeItem(key);
        setTimeout(() => challenge.triggerModal(), 300);
      }
    } catch {}

    const handleTrigger = () => challenge.triggerModal();
    window.addEventListener('trigger-challenge-10-modal', handleTrigger);
    return () => window.removeEventListener('trigger-challenge-10-modal', handleTrigger);
  }, [challenge.isLoading, challenge.modalShown, user?.id, challenge.triggerModal, location.pathname]);

  const pathKey = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.pathname, location.search, location.hash]
  );

  usePersistLastRoute({
    userId: user?.id,
    path: pathKey,
    enabled: !!user,
  });

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
          <div className="hidden md:block h-screen sticky top-0">
            <AppSidebar />
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col min-w-0 relative z-10">
            {/* Payment warning banner */}
            <PaymentWarningBanner />
            <main ref={mainRef} className="flex-1 overflow-auto pb-20 md:pb-0">
              <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
                <Suspense fallback={
                  <div className="flex items-center justify-center py-32">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                }>
                  {children}
                </Suspense>
              </div>
            </main>
          </div>

          {/* Mobile bottom navigation */}
          <MobileBottomNav />
          <CheckoutActivationOverlay />
          <PaymentFailureDialog />
          <DemoChecklistPanel />
          <OnboardingPopups />
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

