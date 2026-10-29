import { ReactNode, Suspense } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Clapperboard, Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUgcAccess } from '@/hooks/useUgc';
import appLogo from '@/assets/logo.png';

/* THE UGC SHELL (docs/ugc-brand-finder.md). Jess's login has no Findable role, so she never gets the operator
 * shell (its sidebar, inbox counts, palette). She gets this: the same look, one page.
 * ⛔ PRESENTATION ONLY. RLS on ugc_* and fn ugc-brands are the boundary; this only avoids showing a page that
 *    would answer with nothing but refusals. */

export function RequireUgcAccess({ children }: { children: ReactNode }) {
  const q = useUgcAccess();
  const { signOut } = useAuth();
  if (q.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (q.isError) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-sm space-y-3 text-center">
      <p className="font-semibold">Couldn’t check your access</p>
      <Button variant="outline" onClick={() => void q.refetch()}>Try again</Button>
    </div></div>;
  }
  if (!q.data?.member && !q.data?.admin) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-sm space-y-4 text-center">
      <h1 className="text-lg font-semibold">No access</h1>
      <p className="text-sm text-muted-foreground">This account does not have access to the UGC page.</p>
      <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
    </div></div>;
  }
  return <>{children}</>;
}

export function UgcLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const access = useUgcAccess();
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/95 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={appLogo} alt="" className="h-7 w-7 shrink-0" />
          <span className="truncate text-sm font-bold tracking-tight">Lead<span className="text-primary">Finder</span></span>
          <span className="hidden items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-inset ring-purple-500/25 dark:text-purple-300 sm:inline-flex">
            <Clapperboard className="h-3 w-3" />UGC
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {access.data?.admin && <Button asChild size="sm" variant="ghost"><Link to="/"><ArrowLeft className="mr-1 h-3.5 w-3.5" />LeadFinder</Link></Button>}
          <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground sm:inline">{access.data?.display_name ?? user?.email}</span>
          {/* ⛔ The app's Sign out is GLOBAL (every session on the account) — the same as everywhere else in LeadFinder. */}
          <Button size="sm" variant="ghost" onClick={() => void signOut()}><LogOut className="mr-1 h-3.5 w-3.5" />Sign out</Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto max-w-screen-2xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <Suspense fallback={<div className="flex justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}

/** Where a signed-in account with no Findable role but UGC access belongs. */
export function UgcHomeRedirect() {
  return <Navigate to="/ugc" replace />;
}
