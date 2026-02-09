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
      setState(prev => ({ ...prev, isLoading: false, subscribed: false, status: null, trialEnd: null, isPaidSubscriber: false, isStripeTrialing: false }));
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
        });
        return;
      }
      
      // First check local database for cached subscription (faster)
      if (!skipLocalCheck) {
        const { data: localSub, error: localError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (!localError && localSub) {
          const validStatuses = ['active', 'trialing', 'past_due'];
          const isValid = validStatuses.includes(localSub.status);
          const isPaid = ['active', 'past_due'].includes(localSub.status);
          const isTrialing = localSub.status === 'trialing';
          
          setState({
            subscribed: isValid,
            productId: null,
            subscriptionEnd: localSub.current_period_end,
            trialEnd: null, // Will be populated from Stripe check
            isLoading: false,
            error: null,
            status: localSub.status,
            isAdmin: false,
            isPaidSubscriber: isPaid,
            isStripeTrialing: isTrialing,
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
        });
          return;
        }
        throw error;
      }

      const subStatus = data.subscription_status ?? null;
      const isPaid = ['active', 'past_due'].includes(subStatus);
      const isTrialing = subStatus === 'trialing';
      
      setState({
        subscribed: data.subscribed ?? false,
        productId: data.product_id ?? null,
        subscriptionEnd: data.subscription_end ?? null,
        trialEnd: data.trial_end ?? null,
        isLoading: false,
        error: null,
        status: subStatus,
        isAdmin: false,
        isPaidSubscriber: isPaid,
        isStripeTrialing: isTrialing,
      });
    } catch (err) {
      console.error('Subscription check failed:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to check subscription',
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