import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, LogOut } from "lucide-react";
import { publicSiteUrl, publicSiteLabel } from "@/config/publicSite";
import { useBarberBranding } from "@/hooks/useBarberBranding";
import { BarberShell, type OwnedSite } from "@/components/barber/BarberShell";
import "@/templates/barber/fonts.css";

/**
 * /barber entry point.
 *
 *  - owns exactly 1 site → straight into the app-shell dashboard for that site;
 *  - owns 2+ sites (admin) → a site picker; choosing a site enters the same
 *    app-shell for it, with "All sites" to return to the picker.
 *
 * The shell (sidebar nav + Dashboard / Calendar / Edit Site / Settings) lives in
 * <BarberShell>; this file only handles auth, loading and site selection.
 */
const SHELL_BG =
  "radial-gradient(1100px 600px at 85% -8%, rgba(230,162,75,0.10), transparent 60%)," +
  "radial-gradient(800px 500px at -10% 8%, rgba(230,162,75,0.05), transparent 55%)";

const statusBadge = (status: string) =>
  `rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
    status === "published" ? "border-amber/30 bg-amber/15 text-amber-soft" : "border-line bg-white/[0.05] text-zinc-400"
  }`;

export default function BarberDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const [sites, setSites] = useState<OwnedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OwnedSite | null>(null);

  useBarberBranding("Your website");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content, is_paid")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      setSites((data ?? []) as unknown as OwnedSite[]);
      setLoading(false);
    })();
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/barber-login";
  };

  // Keep the local copy fresh when the shell saves content / toggles publish.
  const updateSite = (updated: OwnedSite) => {
    setSites((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setSelected((sel) => (sel && sel.id === updated.id ? updated : sel));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  // Admins don't belong here; a non-owner who landed here goes home.
  if (sites.length === 0) return <Navigate to={isAdmin ? "/admin" : "/"} replace />;

  // Single-site owner → straight into the shell (welcome enabled).
  if (sites.length === 1) {
    return <BarberShell site={sites[0]} onSiteUpdate={updateSite} onSignOut={handleSignOut} welcome />;
  }

  // Multi-site: a chosen site → its shell, with a way back to the picker.
  if (selected) {
    return (
      <BarberShell
        site={selected}
        onSiteUpdate={updateSite}
        onSignOut={handleSignOut}
        onBackToSites={() => setSelected(null)}
      />
    );
  }

  // Multi-site picker (owner of 2+ sites / admin).
  return (
    <div className="min-h-screen bg-ink font-body text-zinc-300 antialiased p-4 md:p-8" style={{ backgroundImage: SHELL_BG }}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl uppercase tracking-wide text-white">Your sites</h1>
            <p className="mt-1 text-sm text-zinc-400">Pick a site to open its dashboard.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>

        {sites.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-ink-card p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-bold text-white">{s.content?.businessName || s.site_name}</span>
                <span className={statusBadge(s.status)}>{s.status}</span>
              </div>
              <span className="font-mono text-xs text-zinc-500">{publicSiteLabel(s.site_name)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={publicSiteUrl(s.site_name)} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="icon" title="View your site" className="text-zinc-400 hover:bg-white/[0.04] hover:text-amber">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
              <Button size="sm" onClick={() => setSelected(s)} className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft">
                Open
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
