import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

// LeadFinder OS is an internal tool: every logged-in account has full access.
// This provider keeps the same shape the original billing-aware hook exposed so
// the 20+ consumers compile unchanged, but always reports an active
// subscription. Only isAdmin is still looked up for real (user_roles) — admin
// page gating and the barber owner-redirect depend on it.

interface SubscriptionState {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  trialEnd: string | null;
  isLoading: boolean;
  error: string | null;
  status: string | null;
  isAdmin: boolean;
  isPaidSubscriber: boolean;
  isStripeTrialing: boolean;
  paymentFailureCount: number;
  lastPaymentFailedAt: string | null;
  firstPaymentFailedAt: string | null;
  isPaymentPaused: boolean;
  isInGracePeriod: boolean;
  isGracePeriodExpired: boolean;
}

interface SubscriptionContextType extends SubscriptionState {
  checkSubscription: (skipLocalCheck?: boolean) => Promise<void>;
  createCheckout: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
}

const FULL_ACCESS: Omit<SubscriptionState, 'isAdmin' | 'isLoading'> = {
  subscribed: true,
  productId: null,
  subscriptionEnd: null,
  trialEnd: null,
  error: null,
  status: 'active',
  isPaidSubscriber: true,
  isStripeTrialing: false,
  paymentFailureCount: 0,
  lastPaymentFailedAt: null,
  firstPaymentFailedAt: null,
  isPaymentPaused: false,
  isInGracePeriod: false,
  isGracePeriodExpired: false,
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setIsAdmin(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();
        if (!cancelled) setIsAdmin(!error && data !== null);
      } catch {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const checkSubscription = useCallback(async () => {}, []);
  const createCheckout = useCallback(async () => {
    console.warn('[useSubscription] createCheckout is disabled — billing removed in LeadFinder OS');
  }, []);
  const openCustomerPortal = useCallback(async () => {
    console.warn('[useSubscription] openCustomerPortal is disabled — billing removed in LeadFinder OS');
  }, []);

  const value: SubscriptionContextType = {
    ...FULL_ACCESS,
    status: isAdmin ? 'admin' : 'active',
    isAdmin,
    isLoading,
    checkSubscription,
    createCheckout,
    openCustomerPortal,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
