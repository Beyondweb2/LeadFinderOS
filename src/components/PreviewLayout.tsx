import { Suspense } from 'react';
import { PreviewBanner } from '@/components/PreviewBanner';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Loader2 } from 'lucide-react';

interface PreviewLayoutProps {
  children: React.ReactNode;
}

/**
 * Lightweight layout for unauthenticated preview mode.
 * Mirrors the look of AppLayout without auth-dependent features
 * (sidebar user menu, walkthrough, challenge, subscription overlays).
 */
export function PreviewLayout({ children }: PreviewLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <PreviewBanner />
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <Suspense fallback={
            <div className="flex items-center justify-center py-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }>
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
