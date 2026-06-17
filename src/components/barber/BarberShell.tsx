import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LayoutDashboard, CalendarDays, Pencil, Settings as SettingsIcon, LogOut, Menu, X,
  ExternalLink, Globe, EyeOff, Loader2, Sparkles, Check, ArrowLeft, Smartphone, Monitor, Share,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SiteEditor } from "@/components/SiteEditor";
import { StaffManager } from "@/components/StaffManager";
import { BookingsManager } from "@/components/BookingsManager";
import { WeekCalendar } from "@/components/barber/WeekCalendar";
import { BookingUpsell } from "@/components/barber/BookingUpsell";
import { publicSiteUrl, publicSiteLabel } from "@/config/publicSite";
import { londonInstant, londonYMD } from "@/components/barber/london";
import { recordSiteEvent } from "@/lib/siteTracking";
import type { BarberSiteContent } from "@/templates/barber/types";

export type OwnedSite = { id: string; site_name: string; status: string; content: BarberSiteContent; is_paid?: boolean; share_token?: string; addon_interest_at?: string | null };

const SHELL_BG =
  "radial-gradient(1100px 600px at 85% -8%, rgba(230,162,75,0.10), transparent 60%)," +
  "radial-gradient(800px 500px at -10% 8%, rgba(230,162,75,0.05), transparent 55%)";

type PageKey = "dashboard" | "calendar" | "edit" | "settings";
const NAV: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "edit", label: "Edit Site", icon: Pencil },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];
const PAGE_TITLE: Record<PageKey, string> = {
  dashboard: "Dashboard", calendar: "Calendar", edit: "Edit Site", settings: "Settings",
};

const statusBadge = (status: string) =>
  `rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
    status === "published" ? "border-amber/30 bg-amber/15 text-amber-soft" : "border-line bg-white/[0.05] text-zinc-400"
  }`;

export function BarberShell({
  site,
  onSiteUpdate,
  onSignOut,
  onBackToSites,
  welcome = false,
}: {
  site: OwnedSite;
  onSiteUpdate: (s: OwnedSite) => void;
  onSignOut: () => void;
  onBackToSites?: () => void;
  welcome?: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [interested, setInterested] = useState(!!site.addon_interest_at);
  const [showAddonConfirm, setShowAddonConfirm] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const shopName = site.content?.businessName || site.site_name;
  const logoUrl = site.content?.logoUrl;
  const published = site.status === "published";

  useEffect(() => {
    if (!welcome) return;
    // One-time welcome after claiming (per site, in this browser).
    if (!localStorage.getItem(`barber:welcome:v2:${site.id}`)) setShowWelcome(true);
  }, [welcome, site.id]);

  const dismissWelcome = () => {
    localStorage.setItem(`barber:welcome:v2:${site.id}`, "1");
    setShowWelcome(false);
  };

  const togglePublish = async () => {
    setSavingStatus(true);
    const next = published ? "draft" : "published";
    const { error } = await supabase.from("generated_sites").update({ status: next as never }).eq("id", site.id);
    setSavingStatus(false);
    if (error) {
      toast({ title: "Status change failed", description: error.message, variant: "destructive" });
      return;
    }
    onSiteUpdate({ ...site, status: next });
    queryClient.invalidateQueries({ queryKey: ["generated-site", site.site_name] });
    toast({
      title: next === "published" ? "Published" : "Unpublished",
      description: next === "published" ? "Your site is now live at its link." : "Your site is now hidden from the public.",
    });
  };

  // Add-on interest CTA (shared by the welcome modal, the announcement bar and
  // the settings upsell card). Records interest against this site's share_token
  // (NO payment) and shows the 24-hour confirmation. Sticky via addon_interest_at.
  const handleNotifyInterest = async () => {
    setInterested(true);
    setShowAddonConfirm(true);
    if (site.share_token) {
      await recordSiteEvent(site.share_token, "addon_interest");
    }
  };

  const go = (k: PageKey) => { setPage(k); setNavOpen(false); };

  const SidebarBody = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        {onBackToSites && (
          <button
            type="button"
            onClick={onBackToSites}
            className="mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All sites
          </button>
        )}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={shopName} className="h-9 w-9 shrink-0 rounded-md object-contain" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber/15 font-display text-lg text-amber-soft">
              {shopName.trim().slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-display text-lg uppercase leading-tight tracking-wide text-white">{shopName}</div>
            <span className={statusBadge(site.status)}>{site.status}</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = page === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item.key)}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 ${
                active
                  ? "border-amber bg-amber/15 text-amber-soft"
                  : "border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="flex min-h-screen bg-ink font-body text-zinc-300 antialiased"
      style={{ backgroundImage: SHELL_BG }}
    >
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-ink-card/60 md:block">
        <div className="sticky top-0 h-screen">{SidebarBody}</div>
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setNavOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-line bg-ink-card">
            <div className="flex justify-end p-2">
              <button type="button" onClick={() => setNavOpen(false)} aria-label="Close menu" className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {SidebarBody}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Upsell announcement bar - shown ONLY to unpaid barbers; paid sites
            never see it. Clicking opens Settings where the full upsell lives. */}
        {!site.is_paid && (
          <button
            type="button"
            onClick={handleNotifyInterest}
            className="flex w-full items-center justify-center gap-2 bg-amber px-4 py-2 text-center text-sm font-semibold text-ink transition-colors hover:bg-amber-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/40"
          >
            <span>Online booking &amp; SMS reminders - get more clients, stop the no-shows</span>
            <span className="rounded-full bg-ink/15 px-2 py-0.5 text-xs font-bold">{interested ? "Requested ✓" : "Get access"}</span>
          </button>
        )}

        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open menu" className="rounded p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display text-xl uppercase tracking-wide text-white">{PAGE_TITLE[page]}</h1>
          </div>
          <a href={publicSiteUrl(site.site_name)} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white">
              <ExternalLink className="h-4 w-4 mr-2" /> View site
            </Button>
          </a>
        </header>

        <main className={`barber-surface mx-auto w-full flex-1 p-4 md:p-8 ${page === "calendar" ? "max-w-none" : "max-w-4xl"}`}>
          {page === "dashboard" && <DashboardPage site={site} />}

          {page === "calendar" && <WeekCalendar siteId={site.id} />}

          {page === "edit" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Your site's content, photos, services and staff. Changes save in place.</p>
                <Button size="sm" onClick={togglePublish} disabled={savingStatus} className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft">
                  {savingStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : published ? <EyeOff className="h-4 w-4 mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
                  {published ? "Unpublish" : "Publish"}
                </Button>
              </div>
              <SiteEditor
                site={site}
                onSaved={(content) => {
                  onSiteUpdate({ ...site, content });
                  queryClient.invalidateQueries({ queryKey: ["generated-site", site.site_name] });
                }}
              />
              <StaffManager siteId={site.id} />
            </div>
          )}

          {page === "settings" && (
            <div className="space-y-6">
              {/* Upsell card - unpaid barbers only; paid never see an upsell. */}
              {!site.is_paid && <BookingUpsell onNotify={handleNotifyInterest} interested={interested} />}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Plan: <span className="font-medium text-zinc-200">{site.is_paid ? "Pro - booking & reminders active" : "Free"}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Your public site link:</div>
                  <a href={publicSiteUrl(site.site_name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono text-sm text-amber-soft hover:text-amber">
                    {publicSiteLabel(site.site_name)} <ExternalLink className="h-4 w-4" />
                  </a>
                  <div>
                    <Button variant="outline" size="sm" onClick={onSignOut} className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white">
                      <LogOut className="h-4 w-4 mr-2" /> Sign out
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Install this app — same steps as the welcome email, for barbers
                  who are already logged in. */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Install this app</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Add this dashboard to your phone or computer so it opens like an app — full-screen,
                    with its own icon, and one tap back to your bookings.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                      <span><span className="font-semibold text-white">iPhone (Safari):</span> tap the <span className="inline-flex items-center gap-1"><Share className="h-3.5 w-3.5" />Share</span> button, scroll down, then tap “Add to Home Screen”.</span>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                      <span><span className="font-semibold text-white">Android (Chrome):</span> tap the menu (⋮, top-right), then tap “Install app” (or “Add to Home screen”).</span>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                      <span>
                        <span className="font-semibold text-white">Desktop (Chrome / Edge):</span> click the install icon at the
                        right-hand end of the address bar (a small <span className="inline-flex items-center gap-1"><Monitor className="h-3.5 w-3.5" />screen</span> icon with a down-arrow).
                        Can’t see it? <span className="text-zinc-200">Chrome:</span> menu (⋮) → “Cast, save, and share” → “Install page as app”.
                        <span className="text-zinc-200"> Edge:</span> menu (⋯) → “Apps” → “Install this site as an app”.
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground/70">
                    The desktop install option doesn’t appear in a private / Incognito window, or if the app is already installed.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </main>

        {/* Persistent, low-key reminder so a barber can always find their way
            back to log in + manage their site (they won't have bookmarked it). */}
        <footer className="border-t border-line px-4 py-3 text-center text-[11px] leading-relaxed text-zinc-500">
          Bookmark this page to manage your site:{" "}
          <a href="https://yoursites.uk/barber" className="text-amber-soft hover:text-amber">yoursites.uk/barber</a>
          {user?.email ? <> — log in anytime with <span className="text-zinc-400">{user.email}</span></> : null}
        </footer>
      </div>

      {/* One-time welcome (single-site owner, first visit) - leads with the upsell. */}
      {showWelcome && (
        <WelcomeOverlay
          site={site}
          interested={interested}
          onClose={dismissWelcome}
          onUpsell={() => { dismissWelcome(); handleNotifyInterest(); }}
        />
      )}

      {/* Add-on interest confirmation (24h message) - shown after any upsell CTA. */}
      <Dialog open={showAddonConfirm} onOpenChange={setShowAddonConfirm}>
        <DialogContent className="max-w-sm rounded-2xl border-line bg-ink-card p-6 text-center text-zinc-200">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber/30 bg-amber/10">
            <Check className="h-6 w-6 text-amber" />
          </div>
          <h2 className="mt-3 text-xl font-bold text-white">Thanks - noted!</h2>
          <p className="mt-1 text-sm text-zinc-300">
            You'll receive a message from us with more info within 24 hours.
          </p>
          <Button onClick={() => setShowAddonConfirm(false)} className="mt-5 w-full rounded-full bg-amber font-bold text-ink hover:bg-amber-soft">
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Dashboard page: quick stats + the existing upcoming-bookings list (which
 *  already carries the "new since last visit" indicator). */
function DashboardPage({ site }: { site: OwnedSite }) {
  const [today, setToday] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { y, mo, da } = londonYMD(new Date());
      const todayStart = londonInstant(y, mo, da, 0, 0);
      const todayEnd = new Date(todayStart.getTime() + 86400000);
      const todayUTC = Date.UTC(y, mo - 1, da);
      const sinceMon = (new Date(todayUTC).getUTCDay() + 6) % 7;
      const mon = new Date(todayUTC - sinceMon * 86400000);
      const weekStart = londonInstant(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate(), 0, 0);
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
      const base = () => supabase.from("bookings").select("id", { count: "exact", head: true }).eq("site_id", site.id).neq("status", "cancelled");
      const [t, w] = await Promise.all([
        base().gte("starts_at", todayStart.toISOString()).lt("starts_at", todayEnd.toISOString()),
        base().gte("starts_at", weekStart.toISOString()).lt("starts_at", weekEnd.toISOString()),
      ]);
      if (cancelled) return;
      setToday(t.count ?? 0);
      setWeek(w.count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [site.id]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <StatCard label="Bookings today" value={today} />
        <StatCard label="This week" value={week} />
      </div>
      <BookingsManager siteId={site.id} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-line bg-ink-card p-4">
      <div className="font-display text-4xl text-amber">{value === null ? "-" : value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

/** One-time first-visit popup after claiming. Welcomes the barber, then leads
 *  with the online-booking + SMS upsell (interest-capture only - no payment).
 *  "Get access" records add-on interest; "Maybe later" dismisses. */
function WelcomeOverlay({ site, interested, onClose, onUpsell }: { site: OwnedSite; interested: boolean; onClose: () => void; onUpsell: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/85 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber/30 bg-ink-card p-6 shadow-accent-lg sm:p-8" style={{ backgroundImage: SHELL_BG }}>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-soft">
          <Sparkles className="h-3.5 w-3.5" /> Your site is live
        </div>
        <h2 className="mt-4 font-display text-3xl uppercase tracking-wide text-white sm:text-4xl">Get more clients, stop no-shows</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Add <span className="font-semibold text-white">online booking (24/7)</span> and <span className="font-semibold text-white">no-show SMS reminders</span> so clients can book themselves and actually turn up.
        </p>
        <ul className="mt-5 space-y-2 text-sm text-zinc-300">
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-amber" /><span>Clients book online any time - no back-and-forth.</span></li>
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-amber" /><span>Automatic SMS reminders cut no-shows.</span></li>
        </ul>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white">Maybe later</Button>
          <Button onClick={onUpsell} disabled={interested} className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft disabled:opacity-100">
            {interested ? <><Check className="mr-2 h-4 w-4" /> Requested</> : "Get access"}
          </Button>
        </div>
      </div>
    </div>
  );
}
