import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BarChart3, Info, Loader2, RefreshCw, Target, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSubscription } from '@/hooks/useSubscription';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { CALL_OUTCOMES } from '@/lib/salesCrm';
import { templateLabel } from '@/types/outreach';
import {
  CHANNEL_LABELS, PERIODS, leadSourceLabel, rate,
  type CampaignRow, type FunnelCounts, type SalesPerformance, type TemplateRow,
} from '@/lib/salesPerformance';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES DASHBOARD (2026-09-28, Paul: "what is working, what is not, where should I focus").
   Both roles, one page. A salesperson sees their own leads only — decided by the server
   (fn sales-performance), never by this page. The admin can pick a person or everyone.
   Every number is a count of LEADS (never messages) except "sends" on a template row. The rules are
   written once, in src/lib/salesPerformance.ts, and repeated in plain English at the foot of the page.
   No money figure appears here for anyone.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

type Perf = SalesPerformance & { ok: true; scope: { person: string | null; self: boolean; role: string }; ms: number };

const pct = (n: number, d: number) => { const r = rate(n, d); return r === null ? '—' : `${r}%`; };

export default function SalesDashboard() {
  const { role } = useSubscription();
  const team = useTeamDirectory();
  const isAdmin = role === 'admin';
  const [period, setPeriod] = useState<string>('all');
  const [person, setPerson] = useState<string>('all');
  const q = useQuery({
    queryKey: ['sales-performance', role, isAdmin ? person : 'me', period],
    enabled: !!role,
    staleTime: 60_000,
    queryFn: () => invokeEdge<Perf>('sales-performance', { period, person: isAdmin ? person : 'me' }),
  });
  const d = q.data;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><BarChart3 className="h-5 w-5 text-primary" />Sales dashboard</h1>
          <p className="text-sm text-muted-foreground">What is working, what is not, and where to focus.{!isAdmin && ' Your leads only.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone (whole book)</SelectItem>
                {(team.data ?? []).filter((m) => m.status === 'active').map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', q.isFetching && 'animate-spin')} />Refresh
          </Button>
        </div>
      </header>

      {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Counting…</p>}
      {q.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load the numbers: {edgeErrorMessage(q.error)}
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      )}

      {d && (
        <>
          <Funnel f={d.funnel} />
          <Focus d={d} />
          <Section title="Campaigns" hint="One row per campaign. Leads are counted where they are now; the period is when each lead was first contacted.">
            <CampaignTable rows={d.campaigns} />
          </Section>
          <Section title="Templates" hint="Only templates actually sent. A reply is credited to the last template sent before it; 'contested' means two different templates went out with no reply in between, so the credit is by rule, not evidence. Interested, sign-up and won are counted among the leads whose reply that template earned.">
            <TemplateTable rows={d.templates} />
          </Section>
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Channels" hint="A lead counts once per channel it was contacted on. Calls, LinkedIn, email and in person come from what was logged in the prospect panel.">
              <SimpleTable head={['Channel', 'Contacted', 'Responded', 'Rate']}
                rows={d.channels.map((c) => [CHANNEL_LABELS[c.channel], c.contacted, c.responded, pct(c.responded, c.contacted)])} empty="No contact recorded yet." />
            </Section>
            <Section title="Where leads came from" hint="App search, or where a person found a lead they added by hand.">
              <SimpleTable head={['Source', 'Leads', 'Contacted', 'Interested', 'Won']}
                rows={d.sources.map((s) => [leadSourceLabel(s.source), s.leads, s.contacted, s.interested, s.won])} empty="No leads yet." />
            </Section>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Calls" hint={`Logged call outcomes${period === 'all' ? '' : ' in this period'}.`}>
              <p className="mb-2 text-2xl font-bold">{d.calls.total}</p>
              <div className="flex flex-wrap gap-1.5">
                {CALL_OUTCOMES.filter((o) => d.calls.byOutcome[o.value]).map((o) => (
                  <span key={o.value} className="rounded-full border border-border/60 px-2 py-0.5 text-xs">{o.label} <span className="font-semibold">{d.calls.byOutcome[o.value]}</span></span>
                ))}
                {d.calls.total === 0 && <span className="text-xs text-muted-foreground">No calls logged yet. Log one from the prospect panel's Work tab.</span>}
              </div>
            </Section>
            <Section title="Won" hint="Leads that became paying clients. Just the name: no amounts, no payment details.">
              {d.won.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : (
                <ul className="space-y-1 text-sm">{d.won.map((w, i) => <li key={i} className="flex items-center gap-2"><Trophy className="h-3.5 w-3.5 text-amber-500" />{w.name}<span className="text-xs text-muted-foreground">· {w.campaign}</span></li>)}</ul>
              )}
            </Section>
          </div>
          <HowCounted d={d} />
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm sm:p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

function Funnel({ f }: { f: FunnelCounts }) {
  const steps: { label: string; value: number; sub: string }[] = [
    { label: 'Contacted', value: f.contacted, sub: `${f.leads} leads` },
    { label: 'Responded', value: f.responded, sub: `${pct(f.responded, f.contacted)} of contacted` },
    { label: 'Interested', value: f.interested, sub: `${pct(f.interested, f.contacted)} of contacted` },
    { label: 'Sign-up link sent', value: f.onboardingSent, sub: `${pct(f.onboardingSent, f.interested)} of interested` },
    { label: 'Link opened', value: f.onboardingOpened, sub: `${pct(f.onboardingOpened, f.onboardingSent)} of sent` },
    { label: 'Won', value: f.won, sub: `${pct(f.won, f.onboardingSent)} of sent` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="sales-funnel">
      {steps.map((s, i) => (
        <div key={s.label} className="relative rounded-xl border border-border/60 bg-card/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
          <p className="text-[11px] text-muted-foreground">{s.sub}</p>
          {i < steps.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/50 lg:block" />}
        </div>
      ))}
      <p className="col-span-full text-[11px] text-muted-foreground">Not interested now: <span className="font-semibold text-foreground">{f.notInterested}</span> · Followed up (two or more contacts): <span className="font-semibold text-foreground">{f.followedUp}</span></p>
    </div>
  );
}

/** Plain, actionable pointers from counts that exist. Nothing is suggested from a sample too small to mean anything. */
function Focus({ d }: { d: SalesPerformance }) {
  const MIN = 10;
  const t = d.templates.filter((r) => r.leadsSent >= MIN).map((r) => ({ r, rate: (r.replies / r.leadsSent) }));
  const best = t.length > 1 ? t.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
  const worst = t.length > 1 ? t.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  const items: string[] = [];
  if (d.focus.interestedNoLink > 0) items.push(`${d.focus.interestedNoLink} interested lead${d.focus.interestedNoLink === 1 ? ' has' : 's have'} not been sent the sign-up link yet.`);
  if (d.focus.openedNotWon > 0) items.push(`${d.focus.openedNotWon} opened the sign-up page but ${d.focus.openedNotWon === 1 ? 'has' : 'have'} not paid. Worth a call.`);
  if (best && worst && best !== worst) items.push(`Best reply rate: ${templateLabel(best.r.template)} (${Math.round(best.rate * 100)}% of ${best.r.leadsSent}). Lowest: ${templateLabel(worst.r.template)} (${Math.round(worst.rate * 100)}% of ${worst.r.leadsSent}).`);
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-primary/40 bg-primary/5 p-3.5" data-testid="sales-focus">
      <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Target className="h-4 w-4 text-primary" />Where to focus</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Template comparisons only use templates sent to at least {MIN} leads.</p>
    </section>
  );
}

function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  return (
    <SimpleTable
      head={['Campaign', 'Leads', 'Contacted', 'Responded', 'Interested', 'Not int.', 'Followed up', 'Link sent', 'Opened', 'Won']}
      rows={rows.map((r) => [r.name, r.leads, r.contacted, `${r.responded} (${pct(r.responded, r.contacted)})`, `${r.interested} (${pct(r.interested, r.contacted)})`, r.notInterested, r.followedUp, r.onboardingSent, `${r.onboardingOpened} (${pct(r.onboardingOpened, r.onboardingSent)})`, r.won])}
      empty="No campaign activity yet."
    />
  );
}

function TemplateTable({ rows }: { rows: TemplateRow[] }) {
  return (
    <SimpleTable
      head={['Template', 'Leads sent', 'Sends', 'Replies', 'Reply rate', 'Contested', 'Interested', 'Not int.', 'Link sent', 'Opened', 'Won']}
      rows={rows.map((r) => [templateLabel(r.template), r.leadsSent, r.sends, r.replies, pct(r.replies, r.leadsSent), r.repliesContested, r.interested, r.notInterested, r.onboardingSent, r.onboardingOpened, r.won])}
      empty="No template sends yet."
    />
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="-mx-1 overflow-x-auto thin-scrollbar">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => <th key={h} className={cn('px-1.5 py-1.5 font-semibold', i > 0 && 'text-right')}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/30 last:border-0">
              {r.map((c, ci) => <td key={ci} className={cn('px-1.5 py-1.5', ci === 0 ? 'max-w-[14rem] truncate font-medium' : 'text-right tabular-nums')} title={ci === 0 ? String(c) : undefined}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HowCounted({ d }: { d: Perf }) {
  return (
    <details className="rounded-xl border border-border/60 bg-card/40 p-3.5 text-xs text-muted-foreground" data-testid="how-counted">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 font-semibold text-foreground"><Info className="h-3.5 w-3.5" />How these numbers are counted</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
        <li><b>Your leads</b> are the leads assigned to you now. A message the queue sent for you counts as yours; a message somebody else sent by hand does not.</li>
        <li><b>Contacted</b>: a WhatsApp message that was actually delivered to WhatsApp, or a call / LinkedIn / email / in-person contact you logged (a "no answer" counts: you tried).</li>
        <li><b>Responded</b>: a real reply on WhatsApp after your first message (auto-replies are ignored), or a logged contact where you actually spoke.</li>
        <li><b>Interested</b>: starred, marked interested or quoted, a logged "interested" or "meeting booked", or won. <b>Not interested</b> is how they stand now.</li>
        <li><b>Sign-up link sent</b>: a WhatsApp message carrying their own link (recorded automatically), or "Sent another way" on the lead. Copying the link does not count.</li>
        <li><b>Opened</b>: their sign-up page was loaded after the link was first sent. Your own "Preview" and links opened from the Inbox are never counted.</li>
        <li><b>Won</b>: they became a paying client. No amounts are shown.</li>
        <li><b>Not recorded before</b>: page opens since {d.tracking.opensSince}; logged calls and who-sent-what since {d.tracking.contactLogSince}. Older activity is not reconstructed.</li>
      </ul>
      <p className="mt-2 text-[10px]">Loaded in {(d.ms / 1000).toFixed(1)} s.</p>
    </details>
  );
}
