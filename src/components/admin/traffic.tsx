import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, Empty, TONE } from '@/components/salesDash/ui';
import type { AdminOverviewResponse, SiteFunnel } from '@/hooks/useAdminOverview';

/* ══ FINDABLE SITE TRAFFIC + FUNNEL (release 5) ════════════════════════════════════════════════════
   First-party, cookie-free (fn site-analytics). Browser steps count SESSIONS; server steps count what
   the database recorded. Paul's own and test activity is excluded and the excluded count shown.
   Nothing here is invented: before tracking began, the browser steps say "not tracked yet". */

type O = AdminOverviewResponse;
const num = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('en-GB') : '—');

function List({ title, rows }: { title: string; rows: { key: string | null; n: number }[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {!rows.length ? <p className="text-xs text-muted-foreground">None yet.</p> : (
        <ul className="space-y-1">{rows.map((r) => (
          <li key={String(r.key)} className="grid grid-cols-[1fr_auto] gap-2 text-xs"><span className="truncate">{r.key || '/'}</span><span className="tabular-nums">{num(r.n)}</span></li>
        ))}</ul>
      )}
    </div>
  );
}

export function FindableFunnelPanel({ o }: { o: O }) {
  const s: SiteFunnel | null = o.site;
  if (!s) {
    return (
      <Panel collapseKey="admin.cc.site" title="Findable.live funnel" icon={Globe} tone="blue" defaultOpen={false} summary="Unavailable">
        <Empty>The site numbers could not be read just now.</Empty>
      </Panel>
    );
  }
  const tracked = !!s.tracking_since;
  const steps: { label: string; value: number; basis: 'browser' | 'server' }[] = [
    { label: 'Visitors (sessions)', value: s.sessions, basis: 'browser' },
    { label: 'Started the free check', value: s.free_check_started, basis: 'browser' },
    { label: 'Submitted the free check', value: s.free_check_submitted, basis: 'server' },
    { label: 'Free-check audit finished', value: s.free_check_completed, basis: 'server' },
    { label: 'Opened onboarding', value: s.onboarding_started, basis: 'browser' },
    { label: 'Sign-up forms filled', value: s.signup_forms, basis: 'server' },
    { label: 'Reached checkout', value: s.checkout_sessions, basis: 'server' },
    { label: 'Paid', value: s.paid, basis: 'server' },
  ];
  const top = Math.max(1, ...steps.map((x) => x.value));
  return (
    <Panel collapseKey="admin.cc.site" title="Findable.live funnel" icon={Globe} tone="blue" defaultOpen={false}
      hint={`${o.period.label} · first-party and cookie-free. Your own and test activity is excluded${s.internal_sessions ? ` (${num(s.internal_sessions)} internal session${s.internal_sessions === 1 ? '' : 's'} left out)` : ''}.`}
      summary={tracked ? `${num(s.sessions)} visitors · ${num(s.free_check_submitted)} free checks · ${num(s.paid)} paid` : 'Visitor tracking starts with the next site deploy'}>
      <div className="space-y-1.5">
        {steps.map((x) => {
          const notTracked = x.basis === 'browser' && !tracked;
          return (
            <div key={x.label} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[13rem_1fr_7rem]">
              <span className="truncate text-xs text-muted-foreground">{x.label}</span>
              <span className="h-4 min-w-0 overflow-hidden rounded bg-muted/60">{!notTracked && <span className={cn('block h-full rounded', TONE.blue.bar)} style={{ width: `${Math.max(2, (x.value / top) * 100)}%`, opacity: x.basis === 'server' ? 0.9 : 0.55 }} />}</span>
              <span className="text-right text-xs tabular-nums">{notTracked ? <span className="text-muted-foreground">not tracked yet</span> : <><span className="font-semibold">{num(x.value)}</span><span className="text-muted-foreground"> · {x.basis === 'browser' ? 'sessions' : 'recorded'}</span></>}</span>
            </div>
          );
        })}
      </div>
      {s.checkout_refused > 0 && <p className="mt-2 text-xs text-muted-foreground">Checkout refused {num(s.checkout_refused)} time{s.checkout_refused === 1 ? '' : 's'} in this period (a blocked route, no trade, already paid…) — each refusal is a stuck customer.</p>}
      {tracked && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <List title="Landing pages" rows={s.landing_pages} />
          <List title="Referrers" rows={s.referrers} />
          <List title="Campaigns (UTM)" rows={s.campaigns} />
          <List title="Most viewed" rows={s.top_pages} />
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        {tracked ? `Visitor tracking since ${new Date(s.tracking_since!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. ` : 'Visitor tracking begins when the site update ships; until then only the server steps have numbers. '}
        A session is one browser tab's visit (a random id that disappears when the tab closes) — no cookies, no IP address, no names. Your own visits are excluded: from inside LeadFinderOS, operator previews, and any browser marked with the one-time internal link. Sign-ups made with your own email are excluded server-side.
      </p>
    </Panel>
  );
}
