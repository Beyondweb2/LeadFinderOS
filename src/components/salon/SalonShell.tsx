import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LayoutDashboard, CalendarDays, Pencil, Settings as SettingsIcon, LogOut, Menu, X,
  ExternalLink, Globe, EyeOff, Loader2, ArrowLeft,
} from "lucide-react";
import { SiteEditor } from "@/components/SiteEditor";
import { StaffManager } from "@/components/StaffManager";
import { BookingsManager } from "@/components/BookingsManager";
import { WeekCalendar } from "@/components/barber/WeekCalendar";
import { publicSiteUrl, publicSiteLabel } from "@/config/publicSite";
import { londonInstant, londonYMD } from "@/components/barber/london";
import type { OwnedSite } from "@/components/barber/BarberShell";

/**
 * Salon owner dashboard — the SAME engine as <BarberShell> (SiteEditor /
 * StaffManager / BookingsManager / WeekCalendar are reused unchanged), wrapped
 * in the light, Sophistikaty-style salon theme. The whole shell carries the
 * `.salon-dash` class, which re-themes the shadcn variables + the few barber
 * tokens to salon colours (see index.css). Same nav, same no-reload page switch,
 * same booking/calendar behaviour as barber — just light instead of dark.
 */
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
    status === "published"
      ? "border-salon-rose/40 bg-salon-rose/10 text-salon-rose-deep"
      : "border-salon-line bg-salon-surface text-salon-faint"
  }`;

const SHELL_BG =
  "radial-gradient(1100px 600px at 85% -8%, rgba(192,132,151,0.10), transparent 60%)," +
  "radial-gradient(800px 500px at -10% 8%, rgba(143,169,140,0.06), transparent 55%)";

export function SalonShell({
  site,
  onSiteUpdate,
  onSignOut,
  onBackToSites,
}: {
  site: OwnedSite;
  onSiteUpdate: (s: OwnedSite) => void;
  onSignOut: () => void;
  onBackToSites?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const salonName = site.content?.businessName || site.site_name;
  const logoUrl = site.content?.logoUrl;
  const published = site.status === "published";

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

  const go = (k: PageKey) => { setPage(k); setNavOpen(false); };

  const SidebarBody = (
    <div className="flex h-full flex-col">
      <div className="border-b border-salon-line p-4">
        {onBackToSites && (
          <button
            type="button"
            onClick={onBackToSites}
            className="mb-3 inline-flex items-center gap-1.5 text-xs text-salon-faint transition-colors hover:text-salon-ink focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-salon-rose/50"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All sites
          </button>
        )}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={salonName} className="h-9 w-9 shrink-0 rounded-md object-contain" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-salon-rose/15 font-salon-display text-lg text-salon-rose-deep">
              {salonName.trim().slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-salon-display text-lg leading-tight tracking-tight text-salon-ink">{salonName}</div>
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
              className={`flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-salon-rose/50 ${
                active
                  ? "border-salon-rose bg-salon-rose/10 text-salon-rose-deep"
                  : "border-transparent text-salon-muted hover:bg-salon-rose/[0.05] hover:text-salon-ink"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-salon-line p-3">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-salon-muted transition-colors hover:bg-salon-rose/[0.05] hover:text-salon-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-salon-rose/50"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  const blackBtn = "inline-flex items-center justify-center bg-salon-ink text-white hover:bg-black";

  return (
    <div
      className="salon-dash flex min-h-screen bg-salon-bg font-body text-salon-muted antialiased"
      style={{ backgroundImage: SHELL_BG }}
    >
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-salon-line bg-white/70 backdrop-blur md:block">
        <div className="sticky top-0 h-screen">{SidebarBody}</div>
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-salon-ink/40" onClick={() => setNavOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-salon-line bg-salon-bg">
            <div className="flex justify-end p-2">
              <button type="button" onClick={() => setNavOpen(false)} aria-label="Close menu" className="rounded p-1.5 text-salon-muted hover:bg-salon-rose/10 hover:text-salon-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            {SidebarBody}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-salon-line bg-salon-bg/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open menu" className="rounded p-1.5 text-salon-muted hover:bg-salon-rose/10 hover:text-salon-ink md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-salon-rose/50">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-salon-display text-2xl tracking-tight text-salon-ink">{PAGE_TITLE[page]}</h1>
          </div>
          <a href={publicSiteUrl(site.site_name)} target="_blank" rel="noreferrer">
            <button className={`${blackBtn} gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]`}>
              <ExternalLink className="h-4 w-4" /> View site
            </button>
          </a>
        </header>

        <main className={`mx-auto w-full flex-1 p-4 md:p-8 ${page === "calendar" ? "max-w-none" : "max-w-4xl"}`}>
          {page === "dashboard" && <DashboardPage site={site} />}

          {page === "calendar" && <WeekCalendar siteId={site.id} />}

          {page === "edit" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-salon-muted">Your site's content, treatments, photos and staff. Changes save in place.</p>
                <button onClick={togglePublish} disabled={savingStatus} className={`${blackBtn} gap-2 rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-50`}>
                  {savingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : published ? <EyeOff className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                  {published ? "Unpublish" : "Publish"}
                </button>
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
              <Card>
                <CardHeader>
                  <CardTitle className="font-salon-display text-xl text-salon-ink">Account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-salon-muted">
                    Plan: <span className="font-medium text-salon-ink">{site.is_paid ? "Pro — booking & reminders active" : "Free"}</span>
                  </div>
                  <div className="text-sm text-salon-muted">Your public site link:</div>
                  <a href={publicSiteUrl(site.site_name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono text-sm text-salon-rose-deep hover:text-salon-rose">
                    {publicSiteLabel(site.site_name)} <ExternalLink className="h-4 w-4" />
                  </a>
                  <div>
                    <button onClick={onSignOut} className="inline-flex items-center gap-2 rounded-full border border-salon-line bg-white px-4 py-2 text-sm font-medium text-salon-ink transition-colors hover:border-salon-rose/40">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** Dashboard page: quick stats + the reused upcoming-bookings list. */
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
    <div className="rounded-2xl border border-salon-line bg-white p-4">
      <div className="font-salon-display text-4xl text-salon-rose-deep">{value === null ? "—" : value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-salon-faint">{label}</div>
    </div>
  );
}
