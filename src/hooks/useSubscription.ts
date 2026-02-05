 import { useState, useEffect, useCallback, useRef } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from './useAuth';
 
 interface SubscriptionState {
   subscribed: boolean;
   productId: string | null;
   subscriptionEnd: string | null;
   isLoading: boolean;
   error: string | null;
   status: string | null;
   isAdmin: boolean;
 }
 
 export function useSubscription() {
   const { user, session } = useAuth();
   const [state, setState] = useState<SubscriptionState>({
     subscribed: false,
     productId: null,
     subscriptionEnd: null,
     isLoading: true,
     error: null,
     status: null,
     isAdmin: false,
   });
   const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
 
   // Check if user has admin role
   const checkAdminRole = useCallback(async (): Promise<boolean> => {
     if (!user?.id) return false;
     
     const { data, error } = await supabase
       .from('user_roles')
       .select('role')
       .eq('user_id', user.id)
       .eq('role', 'admin')
       .maybeSingle();
     
     return !error && data !== null;
   }, [user?.id]);
 
   const checkSubscription = useCallback(async (skipLocalCheck = false) => {
     if (!session?.access_token) {
       setState(prev => ({ ...prev, isLoading: false, subscribed: false, status: null }));
       return;
     }
 
     try {
       setState(prev => ({ ...prev, isLoading: true, error: null }));
       
       // First check if user is admin (bypass subscription check)
       const isAdmin = await checkAdminRole();
       if (isAdmin) {
         setState({
           subscribed: true,
           productId: null,
           subscriptionEnd: null,
           isLoading: false,
           error: null,
           status: 'admin',
           isAdmin: true,
         });
         return;
       }
       
       // First check local database for cached subscription (faster)
       if (!skipLocalCheck && user?.id) {
         const { data: localSub, error: localError } = await supabase
           .from('subscriptions')
           .select('*')
           .eq('user_id', user.id)
           .maybeSingle();
 
         if (!localError && localSub) {
           const validStatuses = ['active', 'trialing', 'past_due'];
           const isValid = validStatuses.includes(localSub.status);
           
           setState({
             subscribed: isValid,
             productId: null,
             subscriptionEnd: localSub.current_period_end,
             isLoading: false,
             error: null,
             status: localSub.status,
             isAdmin: false,
           });
           
           if (!isValid) return;
         }
       }
       
       // Fall back to Stripe API check
       const { data, error } = await supabase.functions.invoke('check-subscription', {
         headers: {
           Authorization: `Bearer ${session.access_token}`,
         },
       });
 
       if (error) throw error;
 
       setState({
         subscribed: data.subscribed ?? false,
         productId: data.product_id ?? null,
         subscriptionEnd: data.subscription_end ?? null,
         isLoading: false,
         error: null,
         status: data.subscription_status ?? null,
         isAdmin: false,
       });
     } catch (err) {
       console.error('Subscription check failed:', err);
       setState(prev => ({
         ...prev,
         isLoading: false,
         error: err instanceof Error ? err.message : 'Failed to check subscription',
       }));
     }
   }, [session?.access_token, user?.id, checkAdminRole]);
 
   // Check subscription on mount and when user changes
   useEffect(() => {
     if (user) {
       checkSubscription();
     } else {
       setState({
         subscribed: false,
         productId: null,
         subscriptionEnd: null,
         isLoading: false,
         error: null,
         status: null,
         isAdmin: false,
       });
     }
   }, [user, checkSubscription]);
 
   // Set up realtime subscription for instant updates
   useEffect(() => {
     if (!user?.id) return;
 
     if (channelRef.current) {
       supabase.removeChannel(channelRef.current);
     }
 
     const channel = supabase
       .channel(`subscriptions:${user.id}`)
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table: 'subscriptions',
           filter: `user_id=eq.${user.id}`,
         },
         (payload) => {
           console.log('Subscription changed via realtime:', payload);
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
 
   // Periodic refresh every 60 seconds as fallback
   useEffect(() => {
     if (!user) return;
     
     const interval = setInterval(checkSubscription, 60000);
     return () => clearInterval(interval);
   }, [user, checkSubscription]);
 
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
       window.open(data.url, '_blank');
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
       window.open(data.url, '_blank');
     }
   };
 
   return {
     ...state,
     checkSubscription,
     createCheckout,
     openCustomerPortal,
   };
 }