import { useEffect, Component, type ReactNode, lazy, Suspense } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { OwnerProvider } from "@/contexts/OwnerContext";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireAdmin } from "@/components/RequireAdmin";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { PublicRoute } from "@/components/PublicRoute";
import { AppLayout } from "@/components/AppLayout";
import { AccentInitializer } from "@/components/AccentInitializer";

import { LeadSearchProvider } from "./contexts/LeadSearchContext";
import { getBarberSubdomainLabel, isBookingHost } from "@/lib/subdomain";
import { FirstTimeRedirect } from "./components/FirstTimeRedirect";
import { Loader2 } from "lucide-react";

// Eagerly loaded routes (critical path)
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy loaded routes — reduces initial bundle size
const Index = lazy(() => import("./pages/Index"));
const Outreach = lazy(() => import("./pages/Outreach"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Templates = lazy(() => import("./pages/Templates"));
const PaidClientsPage = lazy(() => import("./pages/PaidClients"));
const HowToUse = lazy(() => import("./pages/HowToUse"));
const AdminApiUsage = lazy(() => import("./pages/AdminApiUsage"));
const AdminClients = lazy(() => import("./pages/AdminClients"));
const AdminSiteImages = lazy(() => import("./pages/AdminSiteImages"));
const AdminSitesList = lazy(() => import("./pages/AdminSitesList"));
const AdminSiteManage = lazy(() => import("./pages/AdminSiteManage"));
const AdminDirectory = lazy(() => import("./pages/AdminDirectory"));
const SiteManage = lazy(() => import("./pages/SiteManage"));
const Landing = lazy(() => import("./pages/Landing"));
const Terms = lazy(() => import("./pages/Terms"));
const Feedback = lazy(() => import("./pages/Feedback"));
const Inbox = lazy(() => import("./pages/Inbox"));
const AiAudit = lazy(() => import("./pages/AiAudit"));
const Start = lazy(() => import("./pages/Start"));

const CityLeads = lazy(() => import("./pages/CityLeads"));
const PublicSite = lazy(() => import("./pages/PublicSite"));
const SubdomainSite = lazy(() => import("./pages/SubdomainSite"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const BookingHome = lazy(() => import("./pages/BookingHome"));
const SiteByToken = lazy(() => import("./pages/SiteByToken"));
const OwnerDashboard = lazy(() => import("./pages/OwnerDashboard"));
const Claim = lazy(() => import("./pages/Claim"));
const BarberLogin = lazy(() => import("./pages/BarberLogin"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" style={{ backgroundColor: 'hsl(220, 50%, 6%)' }}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

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

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const App = () => {
  useGlobalErrorGuard();

  // Barber custom subdomain (<label>.yoursites.uk) → render ONLY their site,
  // bypassing the operator app + router. Apex / reserved labels / *.pages.dev /
  // localhost return null here and fall through to the normal operator app below,
  // so nothing existing is affected.
  const subdomainLabel = getBarberSubdomainLabel(typeof window !== "undefined" ? window.location.hostname : "");
  if (subdomainLabel) {
    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Suspense fallback={<FullPageLoader />}>
              <SubdomainSite label={subdomainLabel} />
            </Suspense>
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    );
  }

  // Booking-only domain (bookmybarber.uk) → render ONLY the booking surface,
  // bypassing the operator app. /<slug> → that barber's booking page; bare root →
  // a minimal holding page. Any other host falls through to the operator app.
  if (typeof window !== "undefined" && isBookingHost(window.location.hostname)) {
    const bookingSlug = window.location.pathname.replace(/^\/+/, "").split("/")[0];
    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Suspense fallback={<FullPageLoader />}>
              {bookingSlug ? <BookingPage slug={bookingSlug} /> : <BookingHome />}
            </Suspense>
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    );
  }

  return (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OwnerProvider>
      <SubscriptionProvider>
      <AccentInitializer>
        <TooltipProvider>
          <Toaster />
          <Sonner />
           <LeadSearchProvider>
            <BrowserRouter>
              <ScrollToTop />
              <Suspense fallback={<FullPageLoader />}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
             <Route
               path="/landing"
              element={
                <PublicRoute>
                  <Landing />
                </PublicRoute>
              } 
             />
             <Route path="/terms" element={<Terms />} />
              <Route path="/start" element={<Start />} />
              <Route path="/find-clients/:city" element={<CityLeads />} />
              <Route path="/p/:slug" element={<PublicSite />} />
              <Route path="/s/:token" element={<SiteByToken />} />
              {/* Barber front doors — PUBLIC, neutral-branded, never LeadFinder chrome. */}
              <Route path="/claim/:token" element={<Claim />} />
              {/* Clean, trade-neutral customer login (canonical). */}
              <Route path="/login" element={<BarberLogin />} />
              {/* Legacy alias — kept so old links / bookmarks / in-flight ?next= links don't 404. */}
              <Route path="/barber-login" element={<BarberLogin />} />
             <Route path="/guide" element={<HowToUse />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <SubscriptionGate>
                    <AppLayout>
                      <FirstTimeRedirect>
                        <Dashboard />
                      </FirstTimeRedirect>
                    </AppLayout>
                  </SubscriptionGate>
                </ProtectedRoute>
              }
            />
            <Route
              path="/barber"
              element={
                <ProtectedRoute redirectTo="/login">
                  <OwnerDashboard />
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
            {/* Rep-facing site editor (any authenticated operator; RLS scopes it to
                the lead-owner). Distinct from the admin-only /admin/sites/:id. */}
            <Route
              path="/sites/:id"
              element={
                <ProtectedRoute>
                  <SiteManage />
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
            {/* Track Leads route removed - folded into Outreach (row-click detail modal) */}
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
            {/* WhatsApp Inbox — operator-gated + in-app (each operator sees only their own) */}
            <Route
              path="/inbox"
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <Inbox />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              }
            />
            {/* Team feedback board — operator-gated + in-app (barbers excluded by RLS) */}
            <Route
              path="/feedback"
              element={
                <ProtectedRoute>
                   <SubscriptionGate>
                     <AppLayout>
                       <Feedback />
                     </AppLayout>
                   </SubscriptionGate>
                </ProtectedRoute>
              }
            />
            {/* Admin routes — the standalone admin hub is now a zone on /dashboard */}
            <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/admin/api-usage"
              element={
                <ProtectedRoute>
                  <RequireAdmin>
                    <AdminApiUsage />
                  </RequireAdmin>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/clients"
              element={
                <ProtectedRoute>
                  <RequireAdmin>
                    <AdminClients />
                  </RequireAdmin>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/directory"
              element={
                <ProtectedRoute>
                  <RequireAdmin>
                    <AdminDirectory />
                  </RequireAdmin>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/site-images"
              element={
                <ProtectedRoute>
                  <RequireAdmin>
                    <AdminSiteImages />
                  </RequireAdmin>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/sites"
              element={
                <ProtectedRoute>
                  <RequireAdmin>
                    <AdminSitesList />
                  </RequireAdmin>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/sites/:id"
              element={
                <ProtectedRoute>
                  <RequireAdmin>
                    <AdminSiteManage />
                  </RequireAdmin>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ai-audit"
              element={
                <ProtectedRoute>
                  <SubscriptionGate>
                    <AppLayout>
                      <AiAudit />
                    </AppLayout>
                  </SubscriptionGate>
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
              </Suspense>
            </BrowserRouter>
          </LeadSearchProvider>
        </TooltipProvider>
      </AccentInitializer>
      </SubscriptionProvider>
      </OwnerProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;