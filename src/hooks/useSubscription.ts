 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from './useAuth';
 
 interface SubscriptionState {
   subscribed: boolean;
   productId: string | null;
   subscriptionEnd: string | null;
   isLoading: boolean;
   error: string | null;
 }
 
 export function useSubscription() {
   const { user, session } = useAuth();
   const [state, setState] = useState<SubscriptionState>({
     subscribed: false,
     productId: null,
     subscriptionEnd: null,
     isLoading: true,
     error: null,
   });
 
   const checkSubscription = useCallback(async () => {
     if (!session?.access_token) {
       setState(prev => ({ ...prev, isLoading: false, subscribed: false }));
       return;
     }
 
     try {
       setState(prev => ({ ...prev, isLoading: true, error: null }));
       
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
       });
     } catch (err) {
       console.error('Subscription check failed:', err);
       setState(prev => ({
         ...prev,
         isLoading: false,
         error: err instanceof Error ? err.message : 'Failed to check subscription',
       }));
     }
   }, [session?.access_token]);
 
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
       });
     }
   }, [user, checkSubscription]);
 
   // Periodic refresh every 60 seconds
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