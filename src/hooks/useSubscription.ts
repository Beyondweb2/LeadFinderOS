import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SubscriptionState {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  trialEnd: string | null;
  isLoading: boolean;
  error: string | null;
  status: string | null;
  isAdmin: boolean;
  isPaidSubscriber: boolean;  // true only for 'active' or 'past_due' (not trialing)
  isStripeTrialing: boolean;  // true when status is 'trialing'
  paymentFailureCount: number;
  lastPaymentFailedAt: string | null;
  isPaymentPaused: boolean;   // true when 2+ failures — blocks access
}

export function useSubscription() {
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
    isPaymentPaused: false,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Stabilize user ID reference to prevent unnecessary effect re-runs
  const userIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

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
      setState(prev => ({ ...prev, isLoading: false, subscribed: false, status: null, trialEnd: null, isPaidSubscriber: false, isStripeTrialing: false, paymentFailureCount: 0, lastPaymentFailedAt: null, isPaymentPaused: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // First check if user is admin (bypass subscription check)
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
          isPaymentPaused: false,
        });
        return;
      }
      
      // First check local database for cached subscription (faster)
      if (!skipLocalCheck) {
        const { data: localSub, error: localError } = await supabase
          .from('user_subscription_status' as any)
          .select('id, user_id, status, current_period_end, created_at, updated_at')
          .eq('user_id', userId)
          .maybeSingle() as { data: { id: string; user_id: string; status: string; current_period_end: string | null; created_at: string; updated_at: string } | null; error: any };

      if (!localError && localSub) {
          const validStatuses = ['active', 'trialing', 'past_due'];
          const isValid = validStatuses.includes(localSub.status);
          const isPaid = ['active', 'past_due'].includes(localSub.status);
          const isTrialing = localSub.status === 'trialing';
          
          // For trialing users, use current_period_end as trialEnd fallback
          // so the trial card shows immediately without waiting for Stripe API
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
             isPaymentPaused: false,
           });
          
          if (!isValid) return;
        }
      }
      
      // Get fresh session before calling edge function
      const { data: sessionData } = await supabase.auth.getSession();
      const freshToken = sessionData?.session?.access_token;
      
      if (!freshToken) {
        // Session expired - user needs to re-authenticate
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
             isPaymentPaused: false,
           });
          return;
      }
      
      // Update the ref with fresh token
      accessTokenRef.current = freshToken;
      
      // Fall back to Stripe API check with fresh token
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${freshToken}`,
        },
      });

      if (error) {
        // If auth error, treat as not subscribed rather than showing error
        if (error.message?.includes('Auth') || error.message?.includes('authentication')) {
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
           isPaymentPaused: false,
        });
          return;
        }
        throw error;
      }

      const subStatus = data.subscription_status ?? null;
      const isPaid = ['active', 'past_due'].includes(subStatus);
      const isTrialing = subStatus === 'trialing';
      
       const failureCount = data.payment_failure_count ?? 0;
       const isPaused = subStatus === 'paused' || failureCount >= 2;
       
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
         isPaymentPaused: isPaused,
       });
    } catch (err) {
      console.error('Subscription check failed:', err);
      // Preserve existing state (e.g. local DB trial data) — just stop loading
      setState(prev => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, [checkAdminRole]);

  // Update refs and check subscription only when user ID actually changes
  useEffect(() => {
    const newUserId = user?.id ?? null;
    const newAccessToken = session?.access_token ?? null;
    
    // Only trigger if user ID actually changed (not just token refresh)
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
           isPaymentPaused: false,
         });
      }
    } else if (newAccessToken !== accessTokenRef.current) {
      // Token refreshed but same user - just update ref, no re-fetch needed
      accessTokenRef.current = newAccessToken;
    }
  }, [user?.id, session?.access_token, checkSubscription]);

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
          // Subscription changed - recheck status
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

  // Periodic refresh every 5 minutes as fallback (was 60s - too aggressive)
  useEffect(() => {
    const userId = userIdRef.current;
    if (!userId) return;
    
    const interval = setInterval(() => checkSubscription(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, checkSubscription]);
 
   const createCheckout = async () => {
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
       window.location.href = data.url;
     }
   };
 
    const openCustomerPortal = async () => {
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
        window.location.href = data.url;
      }
    };
 
   return {
     ...state,
     checkSubscription,
     createCheckout,
     openCustomerPortal,
   };
 }