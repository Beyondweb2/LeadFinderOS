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
import { LeadSearchProvider } from "./contexts/LeadSearchContext";
import Landing from "./pages/Landing";
import Terms from "./pages/Terms";
import Feedback from "./pages/Feedback";
import AffiliateProgram from "./pages/AffiliateProgram";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const App = () => (
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
             <Route 
               path="/billing/success" 
               element={
                 <ProtectedRoute>
                   <BillingSuccess />
                 </ProtectedRoute>
               } 
             />
             <Route 
               path="/billing/cancel" 
               element={
                 <ProtectedRoute>
                   <BillingCancel />
                 </ProtectedRoute>
               } 
             />
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
             <Route path="/guide" element={<HowToUse />} />
             <Route path="/guide" element={<HowToUse />} />
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
              path="/admin/affiliates" 
              element={
                <ProtectedRoute>
                  <AdminAffiliates />
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
);

export default App;