 import { ReactNode } from 'react';
 import { Navigate } from 'react-router-dom';
 import { useSubscription } from '@/hooks/useSubscription';
 import { Loader2 } from 'lucide-react';
 
 interface SubscriptionGateProps {
   children: ReactNode;
 }
 
 export function SubscriptionGate({ children }: SubscriptionGateProps) {
   const { subscribed, isLoading } = useSubscription();
 
   if (isLoading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
   }
 
   if (!subscribed) {
     return <Navigate to="/subscribe" replace />;
   }
 
   return <>{children}</>;
 }