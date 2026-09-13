import { useMemo, useRef, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ReviewQueueTab } from '@/components/ReviewQueueTab';
import { useAuth } from '@/hooks/useAuth';
import { usePersistLastRoute } from '@/hooks/usePersistLastRoute';
import { usePersistedScroll } from '@/hooks/usePersistedScroll';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  const pathKey = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.pathname, location.search, location.hash]
  );

  // Persist last visited in-app route (so we can resume after idle refresh)
  usePersistLastRoute({
    userId: user?.id,
    path: pathKey,
    enabled: !!user,
  });

  // Persist scroll position of the main content container per route
  usePersistedScroll({
    containerRef: mainRef,
    userId: user?.id,
    routeKey: pathKey,
    enabled: !!user,
  });

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">

        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden md:block h-screen sticky top-0">
          <AppSidebar />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          <main ref={mainRef} className="flex-1 overflow-auto pb-20 md:pb-0">
            <div className="container max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
              <Suspense fallback={
                <div className="flex items-center justify-center py-32">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              }>
                {children}
              </Suspense>
            </div>
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <MobileBottomNav />

        {/* ⛔ THE REVIEW QUEUE, HERE BECAUSE THIS SHELL MOUNTS ONCE. It renders nothing at all when
            nobody is waiting, so it costs every other screen a single cheap RLS-scoped read and no
            pixels. It is OUTSIDE <main>, so it never scrolls away and never covers the page. */}
        <ReviewQueueTab />

      </div>
    </SidebarProvider>
  );
}
