import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { trackInitiateCheckout } from '@/lib/fbPixel';

interface SubscriptionState {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  trialEnd: string | null;
  isLoading: boolean;
  error: string | null;
  status: string | null;
  isAdmin: boolean;
  isPaidSubscriber: boolean;  // true only for 'active' (not trialing, not past_due)
  isStripeTrialing: boolean;  // true when status is 'trialing'
  paymentFailureCount: number;
  lastPaymentFailedAt: string | null;
  firstPaymentFailedAt: string | null;
  isPaymentPaused: boolean;   // true when grace period expired — blocks features
  isInGracePeriod: boolean;   // true when payment failed but within 7-day grace
  isGracePeriodExpired: boolean; // true when 7-day grace period has passed
}

interface SubscriptionContextType extends SubscriptionState {
  checkSubscription: (skipLocalCheck?: boolean) => Promise<void>;
  createCheckout: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    productId: null,
    subscriptionEnd: null,
    trialEnd: null,
    isLoading: true,
    error: null,
    status: null,
    isAdmin: false,
    isPaidSubscriber: false,
    isStripeTrialing: false,
    paymentFailureCount: 0,
    lastPaymentFailedAt: null,
    firstPaymentFailedAt: null,
    isPaymentPaused: false,
    isInGracePeriod: false,
    isGracePeriodExpired: false,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Stabilize user ID reference to prevent unnecessary effect re-runs
  const userIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  // Cache edge function result for 5 minutes to avoid repeated calls on route changes
  const edgeCacheRef = useRef<{ data: any; timestamp: number; userId: string } | null>(null);
  const CACHE_TTL_MS = 5 * 60 * 1000;

  // Check if user has admin role
  const checkAdminRole = useCallback(async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    
    return !error && data !== null;
  }, []);

  const checkSubscription = useCallback(async (skipLocalCheck = false) => {
    const userId = userIdRef.current;
    const accessToken = accessTokenRef.current;
    
    if (!accessToken || !userId) {
      setState(prev => {
        if (prev.subscribed || prev.status) {
          return { ...prev, isLoading: false };
        }
        return { ...prev, isLoading: false, subscribed: false, status: null, trialEnd: null, isPaidSubscriber: false, isStripeTrialing: false, paymentFailureCount: 0, lastPaymentFailedAt: null, firstPaymentFailedAt: null, isPaymentPaused: false, isInGracePeriod: false, isGracePeriodExpired: false };
      });
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const isAdmin = await checkAdminRole(userId);
      if (isAdmin) {
        setState({
          subscribed: true,
          productId: null,
          subscriptionEnd: null,
          trialEnd: null,
          isLoading: false,
          error: null,
          status: 'admin',
          isAdmin: true,
          isPaidSubscriber: true,
          isStripeTrialing: false,
          paymentFailureCount: 0,
          lastPaymentFailedAt: null,
          firstPaymentFailedAt: null,
          isPaymentPaused: false,
          isInGracePeriod: false,
          isGracePeriodExpired: false,
        });
        return;
      }
      
      if (!skipLocalCheck) {
        const { data: localSub, error: localError } = await supabase
          .from('user_subscription_status' as any)
          .select('id, user_id, status, current_period_end, created_at, updated_at')
          .eq('user_id', userId)
          .maybeSingle() as { data: { id: string; user_id: string; status: string; current_period_end: string | null; created_at: string; updated_at: string } | null; error: any };

        if (!localError && localSub) {
          const validStatuses = ['active', 'trialing'];
          const isValid = validStatuses.includes(localSub.status);
          const isPaid = localSub.status === 'active';
          const isTrialing = localSub.status === 'trialing';
          const localTrialEnd = isTrialing ? localSub.current_period_end : null;
          
          setState({
            subscribed: isValid,
            productId: null,
            subscriptionEnd: localSub.current_period_end,
            trialEnd: localTrialEnd,
            isLoading: isValid,
            error: null,
            status: localSub.status,
            isAdmin: false,
            isPaidSubscriber: isPaid,
            isStripeTrialing: isTrialing,
            paymentFailureCount: 0,
            lastPaymentFailedAt: null,
            firstPaymentFailedAt: null,
            isPaymentPaused: false,
            isInGracePeriod: false,
            isGracePeriodExpired: false,
          });
          
          if (!isValid) return;
        }
      }
      
      const { data: sessionData } = await supabase.auth.getSession();
      const freshToken = sessionData?.session?.access_token;
      
      if (!freshToken) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }
      
      accessTokenRef.current = freshToken;

      // Use cached edge function result if fresh enough
      const cached = edgeCacheRef.current;
      const now = Date.now();
      let data: any;

      if (cached && cached.userId === userId && (now - cached.timestamp) < CACHE_TTL_MS) {
        data = cached.data;
      } else {
        const { data: freshData, error } = await supabase.functions.invoke('check-subscription', {
          headers: {
            Authorization: `Bearer ${freshToken}`,
          },
        });

        if (error) {
          if (error.message?.includes('Auth') || error.message?.includes('authentication')) {
            setState(prev => ({ ...prev, isLoading: false }));
            return;
          }
          throw error;
        }

        data = freshData;
        edgeCacheRef.current = { data, timestamp: now, userId };
      }

      const subStatus = data.subscription_status ?? null;
      const isPaid = subStatus === 'active';
      const isTrialing = subStatus === 'trialing';
      const failureCount = data.payment_failure_count ?? 0;
      const firstFailedAt = data.first_payment_failed_at ?? null;
      const graceExpired = data.grace_period_expired === true;
      const isPaused = graceExpired || subStatus === 'paused' || subStatus === 'unpaid';
      const inGracePeriod = failureCount > 0 && !graceExpired && !isPaused && (subStatus === 'past_due' || subStatus === 'active');
      
      setState({
        subscribed: data.subscribed ?? false,
        productId: data.product_id ?? null,
        subscriptionEnd: data.subscription_end ?? null,
        trialEnd: data.trial_end ?? null,
        isLoading: false,
        error: null,
        status: subStatus,
        isAdmin: false,
        isPaidSubscriber: isPaid && !isPaused,
        isStripeTrialing: isTrialing,
        paymentFailureCount: failureCount,
        lastPaymentFailedAt: data.last_payment_failed_at ?? null,
        firstPaymentFailedAt: firstFailedAt,
        isPaymentPaused: isPaused,
        isInGracePeriod: inGracePeriod,
        isGracePeriodExpired: graceExpired,
      });
    } catch (err) {
      console.error('Subscription check failed:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [checkAdminRole]);

  // Update refs and check subscription only when user ID actually changes
  useEffect(() => {
    const newUserId = user?.id ?? null;
    const newAccessToken = session?.access_token ?? null;
    
    if (newUserId !== userIdRef.current) {
      userIdRef.current = newUserId;
      accessTokenRef.current = newAccessToken;
      
      if (newUserId) {
        checkSubscription();
      } else {
        setState({
          subscribed: false,
          productId: null,
          subscriptionEnd: null,
          trialEnd: null,
          isLoading: false,
          error: null,
          status: null,
          isAdmin: false,
          isPaidSubscriber: false,
          isStripeTrialing: false,
          paymentFailureCount: 0,
          lastPaymentFailedAt: null,
          firstPaymentFailedAt: null,
          isPaymentPaused: false,
          isInGracePeriod: false,
          isGracePeriodExpired: false,
        });
      }
    } else if (newAccessToken !== accessTokenRef.current) {
      accessTokenRef.current = newAccessToken;
    }
  }, [user?.id, session?.access_token, checkSubscription]);

  // Ensure isLoading resolves for unauthenticated users on initial mount
  useEffect(() => {
    if (!user && !session) {
      setState(prev => prev.isLoading ? { ...prev, isLoading: false } : prev);
    }
  }, [user, session]);

  // Set up realtime subscription for instant updates
  useEffect(() => {
    const userId = userIdRef.current;
    if (!userId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`subscriptions:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Invalidate cache so realtime updates trigger a fresh edge function call
          edgeCacheRef.current = null;
          checkSubscription();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, checkSubscription]);

  // Periodic refresh every 5 minutes as fallback
  useEffect(() => {
    const userId = userIdRef.current;
    if (!userId) return;
    
    const interval = setInterval(() => checkSubscription(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, checkSubscription]);

  const createCheckout = useCallback(async () => {
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase.functions.invoke('create-checkout', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) throw error;
    if (data?.url) {
      if (!sessionStorage.getItem('fb_initiate_checkout_fired')) {
        trackInitiateCheckout();
        sessionStorage.setItem('fb_initiate_checkout_fired', '1');
      }
      window.location.href = data.url;
    }
  }, [session?.access_token]);

  const openCustomerPortal = useCallback(async () => {
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase.functions.invoke('customer-portal', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank') || (window.location.href = data.url);
    }
  }, [session?.access_token]);

  const value: SubscriptionContextType = {
    ...state,
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
