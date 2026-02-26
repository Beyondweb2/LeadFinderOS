import { useEffect, Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { PublicRoute } from "@/components/PublicRoute";
import { AppLayout } from "@/components/AppLayout";
import { AccentInitializer } from "@/components/AccentInitializer";
import { RefSourceCapture } from "@/components/RefSourceCapture";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Subscribe from "./pages/Subscribe";
import BillingSuccess from "./pages/BillingSuccess";
import BillingCancel from "./pages/BillingCancel";
import Outreach from "./pages/Outreach";
import Dashboard from "./pages/Dashboard";
import Templates from "./pages/Templates";
import NotFound from "./pages/NotFound";

import PotentialWorkPage from "./pages/PotentialWork";
import PaidClientsPage from "./pages/PaidClients";
import HowToUse from "./pages/HowToUse";
import AdminAffiliates from "./pages/AdminAffiliates";
import AdminDashboard from "./pages/AdminDashboard";
import AdminFunnel from "./pages/AdminFunnel";
import { LeadSearchProvider } from "./contexts/LeadSearchContext";
import Landing from "./pages/Landing";
import Terms from "./pages/Terms";
import Feedback from "./pages/Feedback";
import AffiliateProgram from "./pages/AffiliateProgram";
import UnlockAccess from "./pages/UnlockAccess";
import Start from "./pages/Start";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

/**
 * React Error Boundary — catches render crashes and shows a fallback
 * instead of a blank screen or infinite refresh loop.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Render crash caught:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui', gap: 12 }}>
          <p style={{ fontSize: 16, color: '#888' }}>Something went wrong.</p>
          <button onClick={() => { this.setState({ hasError: false }); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Global error boundary — catches unhandled promise rejections and errors
 * that would otherwise crash the React tree and cause a blank/refresh.
 */
function useGlobalErrorGuard() {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error('[Global] Unhandled promise rejection caught:', event.reason);
      // Prevent the browser from treating this as a fatal error
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      // ChunkLoadError = Vite HMR / lazy chunk failure — only reload once to avoid loops
      if (event.message?.includes('ChunkLoadError') || event.message?.includes('Failed to fetch dynamically imported module')) {
        const lastReload = sessionStorage.getItem('chunk_reload_at');
        const now = Date.now();
        // Only reload if we haven't reloaded in the last 30 seconds
        if (!lastReload || now - parseInt(lastReload, 10) > 30000) {
          console.warn('[Global] Chunk load error — reloading page (once)');
          sessionStorage.setItem('chunk_reload_at', now.toString());
          window.location.reload();
          return;
        }
        // Already reloaded recently — suppress instead of infinite loop
        console.warn('[Global] Chunk load error suppressed (already reloaded recently)');
        event.preventDefault();
        return;
      }
      console.error('[Global] Uncaught error:', event.error);
      // Prevent the default browser behaviour (which can cause page crashes)
      event.preventDefault();
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);
}

const App = () => {
  useGlobalErrorGuard();
  
  return (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AccentInitializer>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <LeadSearchProvider>
            <BrowserRouter>
              <RefSourceCapture />
          <Routes>
            <Route path="/auth" element={<Auth />} />
             <Route 
               path="/subscribe" 
               element={
                 <ProtectedRoute>
                   <Subscribe />
                 </ProtectedRoute>
               } 
              />
             <Route path="/billing/success" element={<BillingSuccess />} />
             <Route path="/billing/cancel" element={<BillingCancel />} />
             <Route 
               path="/landing" 
              element={
                <PublicRoute>
                  <Landing />
                </PublicRoute>
              } 
             />
             <Route path="/terms" element={<Terms />} />
             <Route path="/feedback" element={<Feedback />} />
             <Route path="/partners" element={<AffiliateProgram />} />
             <Route path="/start" element={<Start />} />
             <Route path="/guide" element={<HowToUse />} />
             <Route 
               path="/unlock" 
               element={
                 <ProtectedRoute>
                   <UnlockAccess />
                 </ProtectedRoute>
               } 
             />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <Dashboard />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/find-leads" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <Index />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <Dashboard />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/outreach" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <Outreach />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
            {/* Archive route removed - merged into Outreach */}
            <Route 
              path="/potential-work" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <PotentialWorkPage />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/paid-clients" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <PaidClientsPage />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/templates" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <Templates />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/how-to-use" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <HowToUse />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
            {/* Admin routes */}
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/affiliates" 
              element={
                <ProtectedRoute>
                  <AdminAffiliates />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/funnel-v2" 
              element={
                <ProtectedRoute>
                  <AdminFunnel />
                </ProtectedRoute>
              } 
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
            </BrowserRouter>
          </LeadSearchProvider>
        </TooltipProvider>
      </AccentInitializer>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;