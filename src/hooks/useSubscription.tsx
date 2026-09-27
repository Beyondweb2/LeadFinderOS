import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { AppRole } from '@/lib/access';

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
  /** The caller's team role from the server (public.my_role()): 'admin', 'sales', or null. */
  role: AppRole | null;
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

const FULL_ACCESS: Omit<SubscriptionState, 'isAdmin' | 'isLoading' | 'role'> = {
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
  const [role, setRole] = useState<AppRole | null>(null);
  const isAdmin = role === 'admin';
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setRole(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    (async () => {
      /* ⛔ THE ROLE IS THE SERVER'S ANSWER (public.my_role(), from user_roles — which no signed-in
         role can write). Positive match: only 'admin' or 'sales' is a role; anything else is none.
         If the RPC itself fails, fall back to the original admin-row read, so a transient error can
         never lock the admin out — and never grants sales anything it could not already read. */
      try {
        const { data, error } = await supabase.rpc('my_role' as never);
        const r = error ? null : (data as unknown);
        if (r === 'admin' || r === 'sales') {
          if (!cancelled) setRole(r);
        } else if (error) {
          const { data: adminRow, error: adminErr } = await supabase
            .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
          if (!cancelled) setRole(!adminErr && adminRow !== null ? 'admin' : null);
        } else if (!cancelled) {
          setRole(null);
        }
      } catch {
        if (!cancelled) setRole(null);
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
    role,
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
