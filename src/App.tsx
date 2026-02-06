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
import { ThemeInitializer } from "@/components/ThemeInitializer";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Subscribe from "./pages/Subscribe";
import Outreach from "./pages/Outreach";
import Dashboard from "./pages/Dashboard";
import Templates from "./pages/Templates";
import NotFound from "./pages/NotFound";
import ArchivePage from "./pages/Archive";
import PotentialWorkPage from "./pages/PotentialWork";
import PaidClientsPage from "./pages/PaidClients";
import { LeadSearchProvider } from "./contexts/LeadSearchContext";
import Landing from "./pages/Landing";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeInitializer>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <LeadSearchProvider>
            <BrowserRouter>
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
               path="/landing" 
              element={
                <PublicRoute>
                  <Landing />
                </PublicRoute>
              } 
             />
            <Route 
              path="/" 
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
            <Route 
              path="/archive" 
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <ArchivePage />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              } 
            />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
            </BrowserRouter>
          </LeadSearchProvider>
        </TooltipProvider>
      </ThemeInitializer>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;