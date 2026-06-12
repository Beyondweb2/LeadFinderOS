import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Loader2, ExternalLink, LogOut, ArrowLeft, Globe, EyeOff, Sparkles, Check,
  Bell, Calendar, MessageSquare, type LucideIcon,
} from "lucide-react";
import { SiteEditor } from "@/components/SiteEditor";
import { StaffManager } from "@/components/StaffManager";
import { BookingsManager } from "@/components/BookingsManager";
import { publicSiteUrl, publicSiteLabel } from "@/config/publicSite";
import type { BarberSiteContent } from "@/templates/barber/types";
import { useBarberBranding } from "@/hooks/useBarberBranding";
import "@/templates/barber/fonts.css";

/**
 * Barber dashboard. Lists the site(s) the logged-in barber owns (RLS only returns
 * their own rows). Navigation:
 *   - owns 1 site  → land straight on that site's dashboard;
 *   - owns 2+ sites → a picker; clicking a site opens that SAME single-site
 *     dashboard (with a "back to all sites" control);
 *   - from a site's dashboard, "Edit my site" opens the shared editor.
 * Barber-branded (ink + amber).
 */
type OwnedSite = { id: string; site_name: string; status: string; content: BarberSiteContent };

const SHELL_BG =
  "radial-gradient(1100px 600px at 85% -8%, rgba(230,162,75,0.10), transparent 60%)," +
  "radial-gradient(800px 500px at -10% 8%, rgba(230,162,75,0.05), transparent 55%)";

const statusBadge = (status: string) =>
  `rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
    status === "published"
      ? "border-amber/30 bg-amber/15 text-amber-soft"
      : "border-line bg-white/[0.05] text-zinc-400"
  }`;

/** One-time, friendly welcome shown the first time a barber opens /barber after
 *  claiming. Ink/amber, modal, with their real public URL and clear next steps. */
function WelcomeOverlay({
  site,
  onClose,
  onEdit,
}: {
  site: OwnedSite;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/85 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber/30 bg-ink-card p-6 shadow-accent-lg sm:p-8"
        style={{ backgroundImage: SHELL_BG }}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-soft">
          <Sparkles className="h-3.5 w-3.5" /> Welcome
        </div>
        <h2 className="mt-4 font-display text-3xl uppercase tracking-wide text-white sm:text-4xl">
          Your site is live 🎉
        </h2>
        <p className="mt-2 text-sm text-zinc-400">It's online now at your own link:</p>
        <a
          href={publicSiteUrl(site.site_name)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex max-w-full items-center gap-2 rounded-lg border border-line bg-white/[0.04] px-3 py-2 font-mono text-sm text-amber-soft transition-colors hover:border-amber/50 hover:text-amber"
        >
          <span className="truncate">{publicSiteLabel(site.site_name)}</span>
          <ExternalLink className="h-4 w-4 shrink-0" />
        </a>

        <ul className="mt-5 space-y-2 text-sm text-zinc-300">
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <span>
              Edit your text, services, prices, hours, photos, logo and accent colour anytime — just
              tap <span className="font-semibold text-white">Edit my site</span>.
            </span>
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <span>Share your link with customers so they can find and book you.</span>
          </li>
        </ul>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white"
          >
            Got it
          </Button>
          <Button onClick={onEdit} className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft">
            Edit my site
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Fire `inView` once the element first scrolls into view (so counters animate
 *  when seen, not on mount while off-screen). */
function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** Eased count-up from 0 → `to`, started when `start` flips true. Uses the rAF
 *  timestamp (no wall-clock), cleaned up on unmount. */
function CountUp({ to, suffix = "", duration = 1400, start }: {
  to: number;
  suffix?: string;
  duration?: number;
  start: boolean;
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    let t0 = 0;
    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to, duration]);
  return <>{val}{suffix}</>;
}

/** A single "coming feature" pill for the booking upsell. */
function FeaturePill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-zinc-200">
      <Icon className="h-4 w-4 text-amber" />
      {label}
    </span>
  );
}

/** Secondary cited stat (smaller than the benefit headline) for the upsell. */
function MiniStat({ prefix, to, suffix, label, start }: {
  prefix?: string;
  to: number;
  suffix: string;
  label: string;
  start: boolean;
}) {
  return (
    <div>
      <div className="font-display text-2xl text-amber sm:text-3xl">
        {prefix ? <span className="mr-1 align-middle text-base text-amber-soft sm:text-lg">{prefix}</span> : null}
        <CountUp to={to} suffix={suffix} start={start} />
      </div>
      <div className="mt-0.5 text-xs text-zinc-400">{label}</div>
    </div>
  );
}

/** Honest "coming soon" upsell for online booking + SMS reminders. Register-
 *  interest only (no buy-now). Stats are general appointment-reminder research,
 *  clearly cited and labelled as not barbershop-specific. */
function BookingUpsell({ onNotify, interested }: { onNotify: () => void; interested: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-2xl border border-amber/25 bg-ink-card p-6 sm:p-8"
      style={{ backgroundImage: SHELL_BG }}
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-soft">
        Coming soon
      </div>

      {/* Punchy benefit line, then the three features at a glance. */}
      <h2 className="mt-4 font-display text-3xl uppercase tracking-wide text-white sm:text-4xl">
        Get more clients, stop the no-shows
      </h2>

      <div className="mt-5 flex flex-wrap gap-2">
        <FeaturePill icon={Globe} label="Custom domain" />
        <FeaturePill icon={Calendar} label="Online booking (24/7)" />
        <FeaturePill icon={MessageSquare} label="SMS reminders" />
      </div>

      {/* Supporting evidence — secondary, not the headline. */}
      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
        <MiniStat prefix="up to" to={38} suffix="%" start={inView} label="fewer no-shows with SMS reminders" />
        <MiniStat prefix="~" to={34} suffix="%" start={inView} label="average drop in missed appointments" />
      </div>

      <div className="mt-6">
        <Button
          onClick={onNotify}
          disabled={interested}
          className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft disabled:opacity-100"
        >
          {interested ? (
            <><Check className="mr-2 h-4 w-4" /> We'll notify you</>
          ) : (
            <><Bell className="mr-2 h-4 w-4" /> I'm interested — notify me</>
          )}
        </Button>
      </div>

      {/* Honesty small-print — present but unobtrusive. */}
      <p className="mt-5 text-[11px] leading-snug text-zinc-600">
        Figures are from general appointment-reminder research, not barbershop-specific — Imperial
        College London study; systematic review of reminder studies.
      </p>
    </div>
  );
}

export default function BarberDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sites, setSites] = useState<OwnedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OwnedSite | null>(null);
  const [selected, setSelected] = useState<OwnedSite | null>(null); // multi-site: which site's dashboard is open
  const [savingStatus, setSavingStatus] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useBarberBranding("Your website");

  // First time a barber lands here after claiming, show a one-time welcome.
  // Keyed per user so it never re-shows for them, and never blocks anyone else.
  useEffect(() => {
    if (loading || !user || sites.length === 0) return;
    if (!localStorage.getItem(`barber:welcome:v1:${user.id}`)) setShowWelcome(true);
  }, [loading, user, sites.length]);

  const dismissWelcome = () => {
    if (user) localStorage.setItem(`barber:welcome:v1:${user.id}`, "1");
    setShowWelcome(false);
  };

  const [interested, setInterested] = useState(false);
  // Placeholder — to be wired to the notify edge function next.
  const handleNotifyInterest = () => {
    setInterested(true);
    toast({
      title: "You're on the list",
      description: "We'll email you the moment online booking & SMS reminders go live.",
    });
  };

  // Barber sign-out: clear the session and return to the barber front door —
  // NOT useAuth().signOut(), which redirects to LeadFinder's /landing marketing.
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/barber-login";
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      setSites((data ?? []) as unknown as OwnedSite[]);
      setLoading(false);
    })();
  }, [user]);

  // Fresh /p/:slug after a content or status change.
  const refreshPublic = (siteName: string) =>
    queryClient.invalidateQueries({ queryKey: ["generated-site", siteName] });

  const handleTogglePublish = async (s: OwnedSite) => {
    setSavingStatus(true);
    const next = s.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("generated_sites")
      .update({ status: next as never })
      .eq("id", s.id);
    setSavingStatus(false);
    if (error) {
      toast({ title: "Status change failed", description: error.message, variant: "destructive" });
      return;
    }
    setSites((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: next } : x)));
    setEditing((e) => (e && e.id === s.id ? { ...e, status: next } : e));
    setSelected((sel) => (sel && sel.id === s.id ? { ...sel, status: next } : sel));
    refreshPublic(s.site_name);
    toast({
      title: next === "published" ? "Published" : "Unpublished",
      description:
        next === "published"
          ? "Your site is now live at its link."
          : "Your site is now hidden from the public.",
    });
  };

  // The single-site dashboard landing — reused for both the 1-site owner and the
  // selected site of a multi-site owner. `onBack` (multi-site) returns to the
  // picker; `welcome` enables the one-time claim welcome (single-site only).
  const renderSiteDashboard = (site: OwnedSite, opts?: { onBack?: () => void; welcome?: boolean }) => (
    <div
      className="min-h-screen bg-ink font-body text-zinc-300 antialiased p-4 md:p-8"
      style={{ backgroundImage: SHELL_BG }}
    >
      {opts?.welcome && showWelcome && (
        <WelcomeOverlay
          site={site}
          onClose={dismissWelcome}
          onEdit={() => {
            dismissWelcome();
            setEditing(site);
          }}
        />
      )}

      <div className="barber-surface mx-auto max-w-3xl space-y-6">
        {opts?.onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={opts.onBack}
            className="-ml-2 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> All sites
          </Button>
        )}

        {/* Header: name + status, View site, Edit my site, Sign out */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-3xl uppercase tracking-wide text-white sm:text-4xl">
              {site.content?.businessName || site.site_name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className={statusBadge(site.status)}>{site.status}</span>
              <span className="font-mono text-xs text-zinc-500">{publicSiteLabel(site.site_name)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={publicSiteUrl(site.site_name)} target="_blank" rel="noreferrer">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white"
              >
                <ExternalLink className="h-4 w-4 mr-2" /> View site
              </Button>
            </a>
            <Button
              size="sm"
              onClick={() => setEditing(site)}
              className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
            >
              Edit my site
            </Button>
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
        </div>

        {/* Bookings lead — the daily-check surface. */}
        <BookingsManager siteId={site.id} />

        {/* Coming-soon upsell below. */}
        <BookingUpsell onNotify={handleNotifyInterest} interested={interested} />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  // Admins don't belong here; a non-owner who landed here goes home.
  if (sites.length === 0) return <Navigate to={isAdmin ? "/admin" : "/"} replace />;

  // --- Editor view -----------------------------------------------------------
  if (editing) {
    const published = editing.status === "published";
    return (
      <div
        className="min-h-screen bg-ink font-body text-zinc-300 antialiased p-4 md:p-8"
        style={{ backgroundImage: SHELL_BG }}
      >
        <div className="barber-surface mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                title="Back"
                onClick={() => setEditing(null)}
                className="text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-display text-2xl uppercase tracking-wide text-white">
                  {editing.content?.businessName || editing.site_name}
                </h1>
                <div className="flex items-center gap-2">
                  <span className={statusBadge(editing.status)}>{editing.status}</span>
                  <span className="font-mono text-xs text-zinc-500">{publicSiteLabel(editing.site_name)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href={publicSiteUrl(editing.site_name)} target="_blank" rel="noreferrer">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white"
                >
                  <ExternalLink className="h-4 w-4 mr-2" /> View my site
                </Button>
              </a>
              <Button
                size="sm"
                onClick={() => handleTogglePublish(editing)}
                disabled={savingStatus}
                className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
              >
                {savingStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : published ? (
                  <EyeOff className="h-4 w-4 mr-2" />
                ) : (
                  <Globe className="h-4 w-4 mr-2" />
                )}
                {published ? "Unpublish" : "Publish"}
              </Button>
            </div>
          </div>

          <SiteEditor
            site={editing}
            onSaved={(content) => {
              setEditing((e) => (e ? { ...e, content } : e));
              setSites((prev) => prev.map((x) => (x.id === editing.id ? { ...x, content } : x)));
              setSelected((sel) => (sel && sel.id === editing.id ? { ...sel, content } : sel));
              refreshPublic(editing.site_name);
            }}
          />

          {/* Phase 2: manage booking staff + per-staff weekly hours (own saves). */}
          <StaffManager siteId={editing.id} />

          {/* Phase 4: upcoming bookings — cancel / mark no-show (owner RLS). */}
          <BookingsManager siteId={editing.id} />
        </div>
      </div>
    );
  }

  // --- Single-site owner → straight to their dashboard (welcome enabled) ------
  if (sites.length === 1) {
    return renderSiteDashboard(sites[0], { welcome: true });
  }

  // --- Multi-site: a selected site opens that site's dashboard (+ back) -------
  if (selected) {
    return renderSiteDashboard(selected, { onBack: () => setSelected(null) });
  }

  // --- Multi-site picker (owner of 2+ sites / admin) -------------------------
  // Clicking a site opens its dashboard (NOT the editor) via setSelected.
  return (
    <div
      className="min-h-screen bg-ink font-body text-zinc-300 antialiased p-4 md:p-8"
      style={{ backgroundImage: SHELL_BG }}
    >
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
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-ink-card p-4 sm:p-5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-bold text-white">
                  {s.content?.businessName || s.site_name}
                </span>
                <span className={statusBadge(s.status)}>{s.status}</span>
              </div>
              <span className="font-mono text-xs text-zinc-500">{publicSiteLabel(s.site_name)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={publicSiteUrl(s.site_name)} target="_blank" rel="noreferrer">
                <Button
                  variant="ghost"
                  size="icon"
                  title="View your site"
                  className="text-zinc-400 hover:bg-white/[0.04] hover:text-amber"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
              <Button
                size="sm"
                onClick={() => setSelected(s)}
                className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
              >
                Open
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
