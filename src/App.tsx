import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Outreach from "./pages/Outreach";
import Dashboard from "./pages/Dashboard";
import Templates from "./pages/Templates";
import NotFound from "./pages/NotFound";
 import ArchivePage from "./pages/Archive";
 import PotentialWorkPage from "./pages/PotentialWork";
 import { LeadSearchProvider } from "./contexts/LeadSearchContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <LeadSearchProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Index />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Dashboard />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/outreach" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Outreach />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/archive" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ArchivePage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/potential-work" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <PotentialWorkPage />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/templates" 
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Templates />
                  </AppLayout>
                </ProtectedRoute>
              } 
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
        </LeadSearchProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;