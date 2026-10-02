import { Globe, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, Empty, TONE } from '@/components/salesDash/ui';
import type { AdminOverviewResponse, OwnSiteSearchSummary, SearchSummary, SiteFunnel } from '@/hooks/useAdminOverview';

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

const SEARCH_STATE: Record<SearchSummary['state'], string> = {
  not_connected: 'Not connected',
  property_missing: 'Connected, but no Search Console property set',
  no_data: 'Connected — no search data in the last 28 days yet',
  error: 'Last sync failed',
  populated: 'Connected',
};

/** Client websites in Google search (Search Console) — figures only where a real connection has data. */
export function ClientSearchPanel({ o }: { o: O }) {
  const clients = o.clients.filter((c) => !c.refunded);
  const s = o.search;
  const connected = s ? clients.filter((c) => s[c.leadId]?.state === 'populated').length : 0;
  return (
    <Panel collapseKey="admin.cc.search" title="Client websites · Google search" icon={Search} tone="green" defaultOpen={false}
      hint="Clicks and impressions from each client's Google Search Console, last full 28 days. Not connected means no numbers — never an estimate."
      summary={!o.searchConfigured ? 'Google not set up yet — every client reads Not connected' : `${connected} of ${clients.length} client${clients.length === 1 ? '' : 's'} connected`}>
      {!o.searchConfigured && (
        <p className="mb-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">No Google service account is set up yet, so no client can be connected. Setting one up is a one-off: a Google Cloud service account, added as a user on each client's Search Console property.</p>
      )}
      {!s ? <Empty>Search Console data could not be read just now.</Empty> : !clients.length ? <Empty>No paid clients yet.</Empty> : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
          {clients.map((c) => {
            const x = s[c.leadId] ?? { state: 'not_connected' as const };
            return (
              <li key={c.leadId} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{c.business}</span>
                  <span className={cn('text-xs', x.state === 'populated' ? TONE.green.text : x.state === 'error' ? TONE.red.text : 'text-muted-foreground')}>{SEARCH_STATE[x.state]}</span>
                </div>
                {x.state === 'error' && x.lastError && <p className="text-xs text-muted-foreground">{x.lastError}</p>}
                {x.state === 'populated' && (
                  <div className="mt-1 text-xs">
                    <p className="tabular-nums"><span className="font-semibold">{num(x.clicks)}</span> clicks · <span className="font-semibold">{num(x.impressions)}</span> impressions (summed across pages)
                      {x.previous ? <span className="text-muted-foreground"> · previous 28 days {num(x.previous.clicks)} / {num(x.previous.impressions)}</span> : <span className="text-muted-foreground"> · no comparison yet (data from {x.dataFrom})</span>}
                    </p>
                    {!!x.topPages?.length && <p className="text-muted-foreground">Top pages: {x.topPages.map((p) => `${p.path} (${num(p.clicks)})`).join(' · ')}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const pct = (n: number | null | undefined) => (typeof n === 'number' ? `${(n * 100).toFixed(1)}%` : '—');
const pos = (n: number | null | undefined) => (typeof n === 'number' ? n.toFixed(1) : '—');

const OWN_SEARCH_STATE: Record<OwnSiteSearchSummary['state'], string> = {
  ...SEARCH_STATE,
  not_connected: 'Not connected yet: findable.live is not verified in Search Console, or the Google credential is not set up',
};

/* 2026-10-02 — findable.live's OWN Google search numbers (own_site_search_*, the same daily sync as the
   clients). Lives inside this panel on purpose: it is Findable's site, not a client, and must never be
   counted with them. Figures appear only when the state is "populated"; nothing is estimated. */
function OwnSiteSearch({ o }: { o: O }) {
  const x = o.ownSearch;
  return (
    <div className="mt-4 rounded-xl border border-border/60 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Google search · findable.live (Search Console)</p>
        {x && <span className={cn('text-xs', x.state === 'populated' ? TONE.green.text : x.state === 'error' ? TONE.red.text : 'text-muted-foreground')}>{x.state === 'populated' ? 'Connected' : OWN_SEARCH_STATE[x.state]}</span>}
      </div>
      {x === undefined ? <p className="mt-1 text-xs text-muted-foreground">Not available from this version of the dashboard yet.</p>
        : x === null ? <p className="mt-1 text-xs text-muted-foreground">Search Console data could not be read just now.</p>
        : x.state === 'error' ? <p className="mt-1 text-xs text-muted-foreground">{x.lastError ?? 'The last sync failed.'}</p>
        : x.state !== 'populated' ? (
          !o.searchConfigured
            ? <p className="mt-1 text-xs text-muted-foreground">No Google service account is set up yet. The steps are in findable-site docs/findable-offsite-authority-plan.md, "Search Console and Bing: exact steps".</p>
            : <p className="mt-1 text-xs text-muted-foreground">No search data for {x.property ?? 'findable.live'} yet. It appears after the next 05:00 sync once the property is verified and the service account is added to it.</p>
        ) : (
          <div className="mt-2 text-xs">
            <p className="tabular-nums">
              Last 28 full days: <span className="font-semibold">{num(x.clicks)}</span> clicks · <span className="font-semibold">{num(x.impressions)}</span> impressions · CTR <span className="font-semibold">{pct(x.ctr)}</span> · average position <span className="font-semibold">{pos(x.position)}</span>
              {x.previous ? <span className="text-muted-foreground"> · previous 28 days {num(x.previous.clicks)} / {num(x.previous.impressions)}</span> : <span className="text-muted-foreground"> · no comparison yet (data from {x.dataFrom})</span>}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {([['Top queries', (x.topQueries ?? []).map((r) => ({ k: r.query, r }))], ['Top pages', (x.topPages ?? []).map((r) => ({ k: r.path, r }))]] as const).map(([title, rows]) => (
                <div key={title} className="min-w-0">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
                  {!rows.length ? <p className="text-xs text-muted-foreground">None yet.</p> : (
                    <ul className="space-y-1">{rows.map(({ k, r }) => (
                      <li key={k} className="grid grid-cols-[1fr_auto] gap-2"><span className="truncate">{k || '/'}</span><span className="tabular-nums text-muted-foreground">{num(r.clicks)} · {num(r.impressions)} · {pct(r.ctr)} · {pos(r.position)}</span></li>
                    ))}</ul>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Columns: clicks · impressions · CTR · average position.</p>
          </div>
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
        <OwnSiteSearch o={o} />
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
      {(s.checkout_sessions_unattributed ?? 0) > 0 && <p className="mt-1 text-xs text-muted-foreground">Not counted: {num(s.checkout_sessions_unattributed)} checkout session{s.checkout_sessions_unattributed === 1 ? '' : 's'} with no surviving lead (test or price-check sessions) and any on leads carrying your own email.</p>}
      {tracked && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <List title="Landing pages" rows={s.landing_pages} />
          <List title="Referrers" rows={s.referrers} />
          <List title="Campaigns (UTM)" rows={s.campaigns} />
          <List title="Most viewed" rows={s.top_pages} />
        </div>
      )}
      <OwnSiteSearch o={o} />
      <p className="mt-3 text-[11px] text-muted-foreground">
        {tracked ? `Visitor tracking since ${new Date(s.tracking_since!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. ` : 'Visitor tracking begins when the site update ships; until then only the server steps have numbers. '}
        A session is one browser tab's visit (a random id that disappears when the tab closes) — no cookies, no IP address, no names. Your own visits are excluded: from inside LeadFinderOS, operator previews, and any browser marked with the one-time internal link. Sign-ups made with your own email are excluded server-side.
      </p>
    </Panel>
  );
}
