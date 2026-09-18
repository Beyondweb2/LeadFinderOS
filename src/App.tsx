import { useEffect, Component, type ReactNode, lazy, Suspense } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireAdmin } from "@/components/RequireAdmin";
import { AppLayout } from "@/components/AppLayout";
import { AccentInitializer } from "@/components/AccentInitializer";

import { LeadSearchProvider } from "./contexts/LeadSearchContext";
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
const BaselinePage = lazy(() => import("./pages/Baseline"));
const PaidBaselineSetup = lazy(() => import("./pages/PaidBaselineSetup"));
const ComparePage = lazy(() => import("./pages/CompareMeasurements"));
const PlaybookPage = lazy(() => import("./pages/Playbook"));
const AdminApiUsage = lazy(() => import("./pages/AdminApiUsage"));
const Inbox = lazy(() => import("./pages/Inbox"));
const AiAudit = lazy(() => import("./pages/AiAudit"));
const Coverage = lazy(() => import("./pages/Coverage"));
/* THE MOCKUP PICKER. Operator-only like every other page here: the pool carries a prospect's
   own photos and the row is a DRAFT that must never be public (Step 1 proved anon reads only
   published rows). Nothing on this screen sends or publishes anything. */
const Mockups = lazy(() => import("./pages/Mockups"));
const ReviewReply = lazy(() => import("./pages/ReviewReply"));
const PageGenerator = lazy(() => import("./pages/PageGenerator"));
const PagePlanQueue = lazy(() => import("./pages/PagePlanQueue"));

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

/* ⛔ THE BARBER / SALON SITE PRODUCT IS GONE (2026-09-09, Paul's call: "all dead, delete it").
   What used to sit above this component: a hostname check that rendered a barber's own site on
   <label>.yoursites.uk, and a second that rendered the booking surface on bookmybarber.uk — both
   BEFORE the router, so every operator page load paid for them. With them went /p/:slug, /s/:token,
   /claim/:token, /login, /barber, /sites/:id and the whole /admin/sites* tree, plus the marketing
   pages for LeadFinder-as-a-product (/landing, /start, /find-clients/:city, /terms, /guide).
   ⚠️ SIGNED-OUT NOW MEANS /auth, NOT /landing. Four places used to send an unauthenticated or
   non-admin visitor to a marketing page that no longer exists (ProtectedRoute's default, useAuth's
   sign-out, RequireAdmin's diversion, Auth's back button); they all land on the login screen now,
   which is the only public surface this app still has. */
const App = () => {
  useGlobalErrorGuard();

  return (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
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
            {/* ══ THE OPERATOR SHELL — ONE layout route, not fifteen wrappers ═══════════════════
                Every operator page used to carry its own <ProtectedRoute><SubscriptionGate>
                <AppLayout> stack, so EVERY navigation unmounted and remounted the whole shell —
                sidebar, scroll container, providers — and nothing inside a page could survive by
                staying mounted (§6c's root cause, half two). The shell now mounts ONCE and the
                pages render through <Outlet/>. Collapsed 2026-08-28 after checking all fifteen
                wrappers were BYTE-IDENTICAL (no route passed AppLayout any props).
                ⚠️ usePersistedScroll keys on the pathname and now sees route changes WITHOUT a
                remount — it restores per-route scroll on the key change, and resets to top for a
                route with nothing stored (see the stored===null branch it gained with this).
                ⚠️ SubscriptionGate is gone as a wrapper: it only ever delegated to RequireAdmin,
                which is now named directly rather than through a shell that pretended billing
                existed. */}
            <Route
              element={
                <ProtectedRoute>
                  <RequireAdmin>
                    <AppLayout>
                      <Outlet />
                    </AppLayout>
                  </RequireAdmin>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<FirstTimeRedirect> <Dashboard /> </FirstTimeRedirect>} />
              <Route path="/find-leads" element={<Index />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/outreach" element={<Outreach />} />
              {/* Archive route removed - merged into Outreach */}
              {/* Track Leads route removed - folded into Outreach (row-click detail modal) */}
              {/* OPERATOR baseline view. Inside ProtectedRoute + RequireAdmin like every other
              operator page - deliberately NOT public: the client gets a week-4 before-and-after,
              not the working detail. */}
              <Route path="/baseline/:auditId" element={<BaselinePage />} />
              <Route path="/baseline-setup/:leadId" element={<PaidBaselineSetup />} />
              {/* BEFORE/AFTER. Operator-side like the baseline it hangs off: the noise band and the
              unproven markings are part of the document, so it is shown WITH them or not at all. */}
              <Route path="/compare/:auditId" element={<ComparePage />} />
              {/* OPERATOR delivery checklist. Same shell as /baseline/:auditId and for the same reason:
              WHO'S WINNING is the client's competitor list, which is working intelligence, not
              something the client is shown. The id resolves as an AUDIT id first — see usePlaybook. */}
              <Route path="/playbook/:id" element={<PlaybookPage />} />
              {/* /paid-clients is GONE (2026-08-12). Paying customers live in Outreach (the
              "Paid (money in)" filter, keyed on amount_paid > 0) and in the Inbox (paid
              conversations are exempt from the status filter). */}
              {/* THE MOCKUP PICKER — one screen per business.
                  /mockups      the mockups-waiting list (in the app rather than in SQL, Paul's ask)
                  /mockups/:id  place the images for one business
                  ⛔ The slot targets are read from the TEMPLATE, never hardcoded, so a new slot in
                  Paul's template appears here with no code change. */}
              <Route path="/mockups" element={<Mockups />} />
              <Route path="/mockups/:id" element={<Mockups />} />
              <Route path="/templates" element={<Templates />} />
              {/* WhatsApp Inbox — operator-gated + in-app (each operator sees only their own) */}
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/coverage" element={<Coverage />} />
              {/* Stateless review-reply generator — paste a Google review in, copy a reply out (or a
              don't-reply verdict). No Google API, no storage; see src/pages/ReviewReply.tsx. */}
              <Route path="/review-replies" element={<ReviewReply />} />
              {/* Delivery page generator — service+town pages from the questionnaire × baseline
              overlap, paste-ready per page. See src/pages/PageGenerator.tsx + src/lib/pagePlan.ts. */}
              <Route path="/page-generator" element={<PageGenerator />} />
              {/* Page-plan queue — measured questions clustered into distinct-job pages, scored,
              waved, stored + editable. See src/pages/PagePlanQueue.tsx + src/lib/pagePlanQueue.ts. */}
              <Route path="/page-plan" element={<PagePlanQueue />} />
              <Route path="/ai-audit" element={<AiAudit />} />
              <Route path="/admin/api-usage" element={<AdminApiUsage />} />
            </Route>
            {/* The standalone admin hub is a zone on /dashboard. */}
            <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
            {/* The market view is a MODE on Find Leads now, not a page of its own. Kept as a
                redirect so an old bookmark or link lands somewhere sensible instead of a 404. */}
            <Route path="/market" element={<Navigate to="/find-leads" replace />} />
            {/* Retired routes from the barber/site product and the LeadFinder marketing pages —
                redirected rather than 404'd so an old bookmark lands on the app. */}
            <Route path="/landing" element={<Navigate to="/auth" replace />} />
            <Route path="/login" element={<Navigate to="/auth" replace />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
              </Suspense>
            </BrowserRouter>
          </LeadSearchProvider>
        </TooltipProvider>
      </AccentInitializer>
      </SubscriptionProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;
