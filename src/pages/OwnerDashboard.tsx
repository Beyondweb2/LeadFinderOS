import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, LogOut } from "lucide-react";
import { publicSiteUrl, publicSiteLabel } from "@/config/publicSite";
import { BarberShell, type OwnedSite } from "@/components/barber/BarberShell";
import { SalonShell } from "@/components/salon/SalonShell";
import "@/templates/barber/fonts.css";
import "@/templates/salon/fonts.css";

/**
 * /barber entry point (the owner dashboard for ALL site owners).
 *
 * Loads the owner's generated_sites and routes EACH site to the dashboard that
 * matches its template:
 *   - template === 'salon'  → <SalonShell>  (light, Sophistikaty-style)
 *   - otherwise (barber)    → <BarberShell> (dark/amber — unchanged)
 *
 * Both shells share one engine (SiteEditor / StaffManager / BookingsManager /
 * WeekCalendar); only the theme differs. Auth, loading and site selection live
 * here; the per-template shell renders the actual dashboard.
 */
type OwnedSiteT = OwnedSite & { template?: string | null };

const isSalon = (s: OwnedSiteT) => (s.template ?? "barber") === "salon";

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const { toast } = useToast();
  const [sites, setSites] = useState<OwnedSiteT[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OwnedSiteT | null>(null);
  const checkoutHandled = useRef(false);

  useEffect(() => { document.title = "Your website"; }, []);

  const loadSites = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const { data } = await (supabase as unknown as import("@supabase/supabase-js").SupabaseClient)
      .from("generated_sites")
      .select("id, site_name, status, content, is_paid, template, share_token, addon_interest_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setSites((data ?? []) as unknown as OwnedSiteT[]);
    if (!silent) setLoading(false);
  }, [user]);

  useEffect(() => { loadSites(); }, [loadSites]);

  // Stripe Checkout return (?checkout=success|cancelled). is_paid is flipped
  // asynchronously by the stripe-webhook, so on success we confirm + silently
  // refetch now and again shortly after to pick it up (the announcement bar then
  // disappears once is_paid=true). Cancel returns quietly. Runs once.
  useEffect(() => {
    if (!user || checkoutHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    checkoutHandled.current = true;
    params.delete("checkout");
    window.history.replaceState({}, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
    if (checkout === "success") {
      toast({ title: "Payment received 🎉", description: "Your add-ons are unlocking — this can take a few seconds." });
      loadSites(true);
      window.setTimeout(() => loadSites(true), 4000);
    }
  }, [user, loadSites, toast]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/barber-login";
  };

  // Orphaned-account guard: an authenticated user who owns NO site and isn't an
  // admin has nowhere valid to land. Sign them out to a clean terminal so the
  // operator gate (RequireAdmin) can never bounce them in a redirect loop
  // (/barber → / → /barber-login → /barber …).
  useEffect(() => {
    if (loading || !user || isAdmin || sites.length > 0) return;
    (async () => {
      await supabase.auth.signOut();
      window.location.href = "/barber-login";
    })();
  }, [loading, user, isAdmin, sites.length]);

  // Keep the local copy fresh when a shell saves content / toggles publish.
  const updateSite = (updated: OwnedSite) => {
    setSites((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    setSelected((sel) => (sel && sel.id === updated.id ? { ...sel, ...updated } : sel));
  };

  const renderShell = (s: OwnedSiteT, opts: { welcome?: boolean; onBack?: () => void } = {}) =>
    isSalon(s) ? (
      <SalonShell site={s} onSiteUpdate={updateSite} onSignOut={handleSignOut} onBackToSites={opts.onBack} />
    ) : (
      <BarberShell site={s} onSiteUpdate={updateSite} onSignOut={handleSignOut} onBackToSites={opts.onBack} welcome={opts.welcome} />
    );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No sites: an admin goes to the admin hub; a non-admin orphan sees a spinner
  // while the effect above signs them out + redirects to /barber-login (no loop).
  if (sites.length === 0) {
    return isAdmin ? (
      <Navigate to="/admin" replace />
    ) : (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Single-site owner → straight into the right shell (welcome enabled).
  if (sites.length === 1) return renderShell(sites[0], { welcome: true });

  // Multi-site: a chosen site → its shell, with a way back to the picker.
  if (selected) return renderShell(selected, { onBack: () => setSelected(null) });

  // Multi-site picker (owner of 2+ sites / admin) — neutral chooser.
  return (
    <div className="min-h-screen bg-background text-foreground antialiased p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Your sites</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pick a site to open its dashboard.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} title="Sign out">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>

        {sites.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-bold">{s.content?.businessName || s.site_name}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.status}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isSalon(s) ? "Salon" : "Barber"}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{publicSiteLabel(s.site_name)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={publicSiteUrl(s.site_name)} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="icon" title="View your site" className="text-muted-foreground">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
              <Button size="sm" onClick={() => setSelected(s)}>Open</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
