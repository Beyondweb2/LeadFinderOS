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

/** How many times the role is asked for before the screen says it could not be checked. */
const ROLE_READ_TRIES = 3;

interface SubscriptionContextType extends SubscriptionState {
  /** The server did not answer the role read (after retries). role is null, but that is "unknown", not "none". */
  roleError: boolean;
  /** Ask for the role again (the "Try again" button on the could-not-check screen). */
  retryRole: () => void;
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
  /* The role could not be READ (the server never answered): not the same as having no role. */
  const [roleError, setRoleError] = useState(false);
  const [roleNonce, setRoleNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setRole(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setRoleError(false);
    (async () => {
      /* ⛔ THE ROLE IS THE SERVER'S ANSWER (public.my_role(), from user_roles — which no signed-in
         role can write). Positive match: only 'admin' or 'sales' is a role; anything else is none.
         If the RPC itself fails, fall back to the original admin-row read, so a transient error can
         never lock the admin out — and never grants sales anything it could not already read.
         ⛔ "COULD NOT READ" IS NOT "NO ROLE" (2026-11-10). One failed read (a timeout at sign-in, a dropped
         connection) used to leave role null, and a salesperson was shown "No access… ask the admin" with only
         a Sign out button. Now the read is tried ROLE_READ_TRIES times, and if the server never answered the
         state is roleError: the screen says so and offers Try again. A role is still only ever the server's
         positive answer: an error grants nothing. */
      try {
        let answered = false;
        for (let attempt = 0; attempt < ROLE_READ_TRIES && !cancelled && !answered; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
          let data: unknown = null; let failed = false;
          try { const res = await supabase.rpc('my_role' as never); data = res.data; failed = !!res.error; } catch { failed = true; }
          if (cancelled) return;
          if (failed) continue;
          answered = true;
          setRole(data === 'admin' || data === 'sales' ? data : null);
        }
        if (!answered && !cancelled) {
          const { data: adminRow, error: adminErr } = await supabase
            .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
          if (cancelled) return;
          if (!adminErr && adminRow !== null) setRole('admin');
          else { setRole(null); setRoleError(true); }
        }
      } catch {
        if (!cancelled) { setRole(null); setRoleError(true); }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, roleNonce]);

  const retryRole = useCallback(() => setRoleNonce((n) => n + 1), []);

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
    roleError,
    retryRole,
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
