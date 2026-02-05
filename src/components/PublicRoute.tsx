 import { ReactNode } from 'react';
 import { Navigate } from 'react-router-dom';
 import { useAuth } from '@/hooks/useAuth';
 import { Loader2 } from 'lucide-react';
 
 interface PublicRouteProps {
   children: ReactNode;
 }
 
 export function PublicRoute({ children }: PublicRouteProps) {
   const { user, isLoading } = useAuth();
 
   if (isLoading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
   }
 
   // If user is authenticated, redirect to the app
   if (user) {
     return <Navigate to="/" replace />;
   }
 
   return <>{children}</>;
 }