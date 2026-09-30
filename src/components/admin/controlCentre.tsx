import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { COST_BASIS, COST_OWNER_LABEL, COST_OWNER_RULE, type CostAccounting, type CostOwner } from '@/lib/apiCostAccounting';
import { AlertTriangle, ArrowRight, Banknote, ExternalLink, CalendarCheck, Coins, Filter, Megaphone, PhoneCall, Receipt, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, Empty, TONE, gbp, ago, type Tone } from '@/components/salesDash/ui';
import type { AdminOverviewResponse } from '@/hooks/useAdminOverview';
import type { AttentionGroup, AttentionItem, Cohort, TeamRow, Totals, TriageSummary } from '@/lib/adminMetrics';
import { CALL_OUTCOME_COLUMNS } from '@/lib/adminMetrics';
import { CONTACT_LOG_START } from '@/lib/salesPerformance';

/* ══ THE ADMIN CONTROL CENTRE'S SECTIONS (2026-09-30, docs/admin-control-centre.md) ════════════════
   Presentational only: every number arrives folded from fn admin-overview. Nothing here computes a
   business figure — it formats, and it refuses to print a rate on a sample too small to mean it. */

type O = AdminOverviewResponse;

const usd = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${n.toFixed(2)}`);
const num = (n: number) => n.toLocaleString('en-GB');

/** Below this many, a rate is shown as "small sample" beside the counts rather than on its own. */
export const RATE_MIN_BASE = 10;

/** A rate that always carries its base: "12% · 3 of 25". Tiny bases say so instead of a bare %. */
export function Rate({ n, of: base }: { n: number; of: number }) {
  if (!base) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round((n / base) * 100);
  return (
    <span className="whitespace-nowrap tabular-nums">
      {base >= RATE_MIN_BASE ? <span className="font-semibold">{pct}%</span> : <span className="text-muted-foreground">small sample</span>}
      <span className="text-muted-foreground"> · {n}/{base}</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}
export { Section };

/* ── Needs your attention ───────────────────────────────────────────────────────────────────────── */

const GROUP_META: Record<AttentionGroup, { label: string; tone: Tone }> = {
  urgent: { label: 'Urgent', tone: 'red' }, today: { label: 'Today', tone: 'amber' }, review: { label: 'Review', tone: 'purple' }, blocked: { label: 'Blocked', tone: 'grey' },
};

export function AttentionQueue({ items, onOpen, triage, period, onResolve, onSuppress, sorter, waitingInInbox = 0 }: {
  items: AttentionItem[]; onOpen: (i: AttentionItem) => void;
  triage: TriageSummary | null; period: string; onResolve: (triageId: string) => Promise<void>;
  /** Paul confirms an opt-out the rules could not be sure of. */
  onSuppress?: (triageId: string) => Promise<void>;
  /** Open replies waiting for whoever holds them, not on this list. */
  waitingInInbox?: number;
  /** The reply sorter's last run (admin_job_runs), when readable. */
  sorter?: { lastFinishedAt: string | null; lastStatus: string | null; lastError: string | null } | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const groups = (Object.keys(GROUP_META) as AttentionGroup[]).map((g) => ({ g, rows: items.filter((i) => i.group === g) })).filter((x) => x.rows.length);
  const urgent = items.filter((i) => i.group === 'urgent').length;
  const b = triage?.byBucket;
  const sorted = b ? b.urgent_admin + b.admin_action + b.rep_action + b.no_action + b.review : 0;
  return (
    <Panel collapseKey="admin.cc.attention" title="Needs your attention" icon={AlertTriangle} tone={urgent ? 'red' : 'amber'}
      hint="Only what needs you. A reply alone is not a task: replies a salesperson can handle, or that need nobody, are not here."
      summary={items.length ? `${items.length} item${items.length === 1 ? '' : 's'}${urgent ? ` · ${urgent} urgent` : ''}` : 'Nothing needs you'}>
      {!triage ? <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">Reply sorting is unavailable just now, so replies are not included below — check the Inbox.</p>
        : sorted > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            {period}: {num(sorted)} repl{sorted === 1 ? 'y' : 'ies'} sorted — {num(b!.no_action)} needed nobody, {num(b!.rep_action)} for a salesperson, {num(b!.admin_action + b!.urgent_admin)} for you, {num(b!.review)} to review{triage.aiFiled ? ` (${num(triage.aiFiled)} read by AI)` : ''}.
            {triage.suppressed > 0 && ` ${num(triage.suppressed)} opt-out${triage.suppressed === 1 ? '' : 's'} suppressed automatically.`}
          </p>
        )}
      {sorter && (
        <p className={cn('mb-3 text-[11px]', sorter.lastStatus === 'error' ? TONE.red.text : 'text-muted-foreground')}>
          Replies are sorted automatically every 2 minutes — last run {sorter.lastFinishedAt ? ago(sorter.lastFinishedAt) : 'not yet'}{sorter.lastStatus === 'error' ? ` FAILED: ${sorter.lastError ?? 'unknown error'}` : ''}.
          {waitingInInbox > 0 && <> {num(waitingInInbox)} other repl{waitingInInbox === 1 ? 'y is' : 'ies are'} waiting in the <Link to="/inbox?filter=waiting" className="text-primary hover:underline">Inbox</Link> for whoever holds the lead (not live sales, so not listed here).</>}
        </p>
      )}
      {!items.length ? <Empty>Nothing needs you right now.</Empty> : (
        <div className="space-y-4">
          {groups.map(({ g, rows }) => (
            <div key={g}>
              <p className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-wide', TONE[GROUP_META[g].tone].text)}>{GROUP_META[g].label} · {rows.length}</p>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
                {rows.map((i) => (
                  <li key={i.key} className="flex min-w-0 items-stretch">
                    <button type="button" onClick={() => onOpen(i)} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[GROUP_META[g].tone].dot)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="truncate text-sm font-semibold">{i.business}</span>
                          <span className="text-[11px] text-muted-foreground">{i.state}{i.owner ? ` · ${i.owner}` : ''}{i.sinceIso ? ` · ${ago(i.sinceIso)}` : ''}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">{i.why}{i.method === 'ai' && typeof i.confidence === 'number' ? ` (AI, ${Math.round(i.confidence * 100)}% sure)` : ''}</span>
                        <span className="mt-0.5 block text-xs font-medium text-primary">{i.action}</span>
                      </span>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                    {i.external && (
                      <a href={i.external.url} target="_blank" rel="noreferrer" title={i.external.label}
                        className="flex shrink-0 items-center gap-1 border-l border-border/60 px-3 text-[11px] font-medium text-primary transition hover:bg-muted/50">
                        Stripe<ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {i.triageId && i.kind === 'reply_opt_out' && onSuppress && (
                      <button type="button" disabled={busy === i.triageId} title="Suppress this number from all automated outreach (recorded in History)"
                        onClick={async () => {
                          if (!window.confirm(`Suppress ${i.business} from all automated outreach? It is recorded in their History.`)) return;
                          setBusy(i.triageId!); try { await onSuppress(i.triageId!); } finally { setBusy(null); }
                        }}
                        className="shrink-0 border-l border-border/60 px-3 text-[11px] font-medium text-red-700 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300">
                        Suppress
                      </button>
                    )}
                    {i.triageId && (
                      <button type="button" disabled={busy === i.triageId} title="Mark handled — it leaves this list"
                        onClick={async () => { setBusy(i.triageId!); try { await onResolve(i.triageId!); } finally { setBusy(null); } }}
                        className="shrink-0 border-l border-border/60 px-3 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground disabled:opacity-50">
                        {busy === i.triageId ? '…' : 'Handled'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Today / yesterday ──────────────────────────────────────────────────────────────────────────── */

export function SinceYesterday({ o, attention }: { o: O; attention: number }) {
  const cells: { label: string; t: string; y: string; tone: Tone }[] = [
    { label: 'WhatsApps sent', t: num(o.today.whatsappSent), y: num(o.yesterday.whatsappSent), tone: 'blue' },
    { label: 'Replies', t: num(o.today.replies), y: num(o.yesterday.replies), tone: 'blue' },
    { label: 'Interested', t: num(o.today.interested), y: num(o.yesterday.interested), tone: 'green' },
    { label: 'Meetings', t: num(o.today.meetings), y: num(o.yesterday.meetings), tone: 'green' },
    { label: 'Sales', t: num(o.today.sales), y: num(o.yesterday.sales), tone: 'green' },
    { label: 'Revenue', t: gbp(o.today.revenue), y: gbp(o.yesterday.revenue), tone: 'green' },
    { label: 'Commission added', t: gbp(o.today.commission), y: gbp(o.yesterday.commission), tone: 'grey' },
    { label: 'API spend', t: usd(o.today.apiUsd), y: usd(o.yesterday.apiUsd), tone: 'grey' },
  ];
  return (
    <Panel collapseKey="admin.cc.today" title="Today" icon={CalendarCheck} tone="blue"
      hint={`Since midnight (UK time), with yesterday beneath. ${attention} item${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} you.`}
      summary={`${num(o.today.whatsappSent)} sent · ${num(o.today.replies)} replies · ${num(o.today.interested)} interested · ${gbp(o.today.revenue)}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {cells.map((c) => (
          <div key={c.label} className={cn('min-w-0 rounded-xl px-3 py-2.5', TONE[c.tone].soft)}>
            <p className="truncate text-[11px] font-medium text-muted-foreground">{c.label}</p>
            <p className={cn('text-xl font-bold tabular-nums leading-tight', TONE[c.tone].text)}>{c.t}</p>
            <p className="text-[11px] tabular-nums text-muted-foreground">yesterday {c.y}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── Team comparison ────────────────────────────────────────────────────────────────────────────── */

type Col = { key: string; label: string; get: (r: TeamRow | (Totals & { name: string })) => ReactNode; hint?: string };
const TEAM_GROUPS: { title: string; cols: Col[] }[] = [
  { title: 'Activity', cols: [
    { key: 'added', label: 'Leads added', get: (r) => num(r.leadsAdded) },
    { key: 'claimed', label: 'Claimed', get: (r) => num(r.leadsClaimed) },
    { key: 'wa', label: 'WhatsApps', get: (r) => num(r.whatsappSent), hint: 'real sends; leads messaged below' },
    { key: 'calls', label: 'Calls logged', get: (r) => num(r.calls) },
    { key: 'emails', label: 'Emails', get: (r) => num(r.emails) },
    { key: 'social', label: 'Social', get: (r) => num(r.social) },
  ] },
  { title: 'Outcomes', cols: [
    { key: 'replies', label: 'Replies', get: (r) => num(r.replies) },
    { key: 'interested', label: 'Interested', get: (r) => num(r.interested) },
    { key: 'meetings', label: 'Meetings', get: (r) => num(r.meetings) },
    { key: 'ni', label: 'Not interested', get: (r) => num(r.notInterested) },
    { key: 'wn', label: 'Wrong numbers', get: (r) => num(r.wrongNumbers) },
    { key: 'oo', label: 'Opt-outs', get: (r) => num(r.optOuts) },
  ] },
  { title: 'Money', cols: [
    { key: 'paid', label: 'Paid clients', get: (r) => num(r.paid) },
    { key: 'rev', label: 'Revenue', get: (r) => gbp(r.revenue) },
    { key: 'ci', label: 'Commission · initial', get: (r) => gbp(r.commissionInitial) },
    { key: 'cr', label: 'Commission · recurring', get: (r) => gbp(r.commissionRecurring) },
    { key: 'cd', label: 'Commission due now', get: (r) => gbp(r.commissionDue) },
    { key: 'api', label: 'API cost', get: (r) => usd(r.apiCostUsd) },
  ] },
  { title: 'Follow-ups (now)', cols: [
    { key: 'fd', label: 'Due by today', get: (r) => num(r.followUpsDue) },
    { key: 'fo', label: 'Overdue', get: (r) => num(r.followUpsOverdue) },
  ] },
];
const COHORT: { key: keyof Cohort; label: string }[] = [
  { key: 'replied', label: 'Replied' }, { key: 'interested', label: 'Interested' }, { key: 'meeting', label: 'Meeting' }, { key: 'paid', label: 'Paid' },
];

export function TeamComparison({ o }: { o: O }) {
  const people = o.team;
  const total = { name: 'Team total', ...o.totals };
  return (
    <Panel collapseKey="admin.cc.team" title="Team comparison" icon={Users} tone="blue" defaultOpen={false}
      hint={`${o.period.label} · counts side by side, rates always with what they are out of. No scores.`}
      summary={`${people.length} ${people.length === 1 ? 'person' : 'people'} · ${num(o.totals.whatsappSent)} WhatsApps · ${num(o.totals.calls)} calls · ${num(o.totals.interested)} interested`}>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card py-2 pr-3 font-semibold">&nbsp;</th>
              {people.map((p) => (
                <th key={p.userId} className="px-2 py-2 text-right font-semibold normal-case tracking-normal text-foreground">
                  {/* Their own Sales dashboard view: their leads, follow-ups and actions. */}
                  {p.userId && p.userId !== 'unknown'
                    ? <Link to={`/sales-dashboard?person=${encodeURIComponent(p.userId)}`} className="hover:text-primary hover:underline" title={`Open ${p.name}'s sales dashboard`}>{p.name}</Link>
                    : p.name}
                </th>
              ))}
              {people.length > 1 && <th className="px-2 py-2 text-right font-semibold normal-case tracking-normal">Total</th>}
            </tr>
          </thead>
          <tbody>
            {TEAM_GROUPS.map((g) => (
              <TeamGroup key={g.title} title={g.title} cols={g.cols} people={people} total={people.length > 1 ? total : null} />
            ))}
            <tr><td colSpan={people.length + 2} className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Of the leads first contacted in this period</td></tr>
            <tr className="border-b border-border/40">
              <td className="sticky left-0 z-10 bg-card py-1.5 pr-3 text-xs text-muted-foreground">First contacted</td>
              {people.map((p) => <td key={p.userId} className="px-2 py-1.5 text-right tabular-nums">{num(p.cohort.contacted)}</td>)}
              {people.length > 1 && <td className="px-2 py-1.5 text-right tabular-nums">{num(total.cohort.contacted)}</td>}
            </tr>
            {COHORT.map((c) => (
              <tr key={c.key} className="border-b border-border/40">
                <td className="sticky left-0 z-10 bg-card py-1.5 pr-3 text-xs text-muted-foreground">{c.label} since</td>
                {people.map((p) => <td key={p.userId} className="px-2 py-1.5 text-right text-xs"><Rate n={p.cohort[c.key]} of={p.cohort.contacted} /></td>)}
                {people.length > 1 && <td className="px-2 py-1.5 text-right text-xs"><Rate n={total.cohort[c.key]} of={total.cohort.contacted} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{o.exclusionNote} A queue send is credited to whoever holds the lead; a reply to whoever holds it when it arrives. Calls are logged outcomes only. Interested, meetings and logged contacts are dated only from {CONTACT_LOG_START}, when logging began — earlier interest shows in the funnel and the cohort rates, never in a period count.</p>
    </Panel>
  );
}

function TeamGroup({ title, cols, people, total }: { title: string; cols: Col[]; people: TeamRow[]; total: (Totals & { name: string }) | null }) {
  return (
    <>
      <tr><td colSpan={people.length + 2} className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</td></tr>
      {cols.map((c) => (
        <tr key={c.key} className="border-b border-border/40">
          <td className="sticky left-0 z-10 bg-card py-1.5 pr-3 text-xs text-muted-foreground">{c.label}</td>
          {people.map((p) => <td key={p.userId} className="px-2 py-1.5 text-right tabular-nums">{c.get(p)}</td>)}
          {total && <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{c.get(total)}</td>}
        </tr>
      ))}
    </>
  );
}

/* ── Funnel ─────────────────────────────────────────────────────────────────────────────────────── */

export function FunnelPanel({ o }: { o: O }) {
  const top = o.funnel.stages[0]?.count ?? 0;
  return (
    <Panel collapseKey="admin.cc.funnel" title="Sales funnel" icon={Filter} tone="green" defaultOpen={false}
      hint={`${o.funnel.basis}, and how far each has got so far. A lead can reach a later stage without a logged earlier one (paid with no logged meeting).`}
      summary={o.funnel.stages.map((s) => `${s.label} ${num(s.count)}`).join(' → ')}>
      <div className="space-y-1.5">
        {o.funnel.stages.map((s, i) => {
          const prev = i > 0 ? o.funnel.stages[i - 1].count : null;
          return (
            <div key={s.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_9rem]">
              <span className="truncate text-xs text-muted-foreground">{s.label}</span>
              <span className="h-5 min-w-0 overflow-hidden rounded bg-muted/60">
                <span className={cn('block h-full rounded', TONE.green.bar)} style={{ width: `${top ? Math.max(2, (s.count / top) * 100) : 0}%`, opacity: 0.35 + 0.65 * (1 - i / o.funnel.stages.length) }} />
              </span>
              <span className="text-right text-xs tabular-nums"><span className="font-semibold">{num(s.count)}</span>{prev !== null && prev > 0 && <span className="text-muted-foreground"> · {Math.round((s.count / prev) * 100)}% of previous</span>}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {o.funnel.losses.map((l) => (
          <span key={l.key} className="rounded-lg bg-muted/60 px-2.5 py-1 text-xs"><span className="text-muted-foreground">{l.label}</span> <span className="font-semibold tabular-nums">{num(l.count)}</span></span>
        ))}
      </div>
    </Panel>
  );
}

/* ── Channels ───────────────────────────────────────────────────────────────────────────────────── */

export function ChannelsPanel({ o }: { o: O }) {
  return (
    <Panel collapseKey="admin.cc.channels" title="Outreach channels" icon={Megaphone} tone="blue" defaultOpen={false}
      hint={`${o.period.label} · leads reached on each channel and what followed. "Touched by" — not "caused by": most leads are reached on more than one.`}
      summary={o.channels.filter((c) => c.attempts).map((c) => `${c.label} ${num(c.attempts)}`).join(' · ') || 'No outreach in this period'}>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">Channel</th><th className="px-2 py-2 text-right font-semibold">Leads reached</th>
            <th className="px-2 py-2 text-right font-semibold">Replied</th><th className="px-2 py-2 text-right font-semibold">Interested</th>
            <th className="px-2 py-2 text-right font-semibold">Meetings</th><th className="px-2 py-2 text-right font-semibold">Sales touched</th>
          </tr></thead>
          <tbody>
            {o.channels.map((c) => (
              <tr key={c.channel} className="border-b border-border/40">
                <td className="py-1.5 pr-3 font-medium">{c.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(c.attempts)}</td>
                {c.attempts === 0 ? <td colSpan={4} className="px-2 py-1.5 text-right text-xs text-muted-foreground">not used in this period</td>
                  : !c.enoughData ? <td colSpan={4} className="px-2 py-1.5 text-right text-xs text-muted-foreground">not enough data yet ({c.replies} replied · {c.interested} interested · {c.meetings} meetings · {c.sales} sales)</td>
                  : <>
                    <td className="px-2 py-1.5 text-right text-xs"><Rate n={c.replies} of={c.attempts} /></td>
                    <td className="px-2 py-1.5 text-right text-xs"><Rate n={c.interested} of={c.attempts} /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(c.meetings)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(c.sales)}</td>
                  </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ── Calls ──────────────────────────────────────────────────────────────────────────────────────── */

export function CallsPanel({ o }: { o: O }) {
  const rows = o.calls.rows.length > 1 ? [...o.calls.rows, o.calls.total] : o.calls.rows;
  return (
    <Panel collapseKey="admin.cc.calls" title="Calls" icon={PhoneCall} tone="grey" defaultOpen={false}
      hint={`${o.period.label} · logged call outcomes only. Tapping a phone number is never counted as a call.`}
      summary={`${num(o.calls.total.total)} call${o.calls.total.total === 1 ? '' : 's'} logged`}>
      {!o.calls.total.total ? <Empty>No calls logged in this period.</Empty> : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Who</th><th className="px-2 py-2 text-right font-semibold">Calls</th>
              {CALL_OUTCOME_COLUMNS.map((c) => <th key={c.key} className="px-2 py-2 text-right font-semibold">{c.label}</th>)}
              <th className="px-2 py-2 text-right font-semibold">Other</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className={cn('border-b border-border/40', r.userId === 'total' && 'font-semibold')}>
                  <td className="py-1.5 pr-3">{r.name}</td><td className="px-2 py-1.5 text-right tabular-nums">{num(r.total)}</td>
                  {CALL_OUTCOME_COLUMNS.map((c) => <td key={c.key} className="px-2 py-1.5 text-right tabular-nums">{num(r.byOutcome[c.key] ?? 0)}</td>)}
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.byOutcome.other ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── Money ──────────────────────────────────────────────────────────────────────────────────────── */

function Figure({ label, value, sub, tone = 'grey', strong }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; strong?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-xl px-3 py-2.5', strong ? TONE[tone].soft : 'bg-muted/40')}>
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-bold tabular-nums leading-tight', strong && TONE[tone].text)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function RevenuePanel({ o }: { o: O }) {
  const m = o.money;
  return (
    <Panel collapseKey="admin.cc.revenue" title="Revenue" icon={Banknote} tone="green"
      hint={`${o.period.label} · from the Stripe payment ledger only — never from a lead's status.`}
      summary={`${gbp(m.period.net)} net · ${m.payingClients} paying client${m.payingClients === 1 ? '' : 's'}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure strong tone="green" label="Collected (net)" value={gbp(m.period.net)} sub={`${m.period.payments} payment${m.period.payments === 1 ? '' : 's'}`} />
        <Figure label="Initial payments" value={gbp(m.period.initial)} />
        <Figure label="Recurring payments" value={gbp(m.period.recurring)} />
        <Figure label="Refunds · disputes lost" value={`${gbp(m.period.refunds)} · ${gbp(m.period.disputesLost)}`} sub={m.period.disputesOpen ? `${gbp(m.period.disputesOpen)} in open disputes` : undefined} />
        <Figure label="This week (Mon–Sun)" value={gbp(m.week.net)} />
        <Figure label="This month" value={gbp(m.month.net)} />
        <Figure label="Paying clients" value={m.payingClients} sub={`${m.activeSubscriptions} active subscription${m.activeSubscriptions === 1 ? '' : 's'}${m.pastDue ? ` · ${m.pastDue} past due` : ''}`} />
        <Figure label="Build · Optimise" value={`${gbp(m.byRoute.build)} · ${gbp(m.byRoute.optimise)}`} sub={m.byRoute.unknown ? `${gbp(m.byRoute.unknown)} route not recorded` : undefined} />
      </div>
      {m.bySeller.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">By seller: {m.bySeller.map((s) => `${s.name} ${gbp(s.gross)} (${s.clients} new client${s.clients === 1 ? '' : 's'})`).join(' · ')}</p>
      )}
      {m.outsideLedger.count > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Not in these figures: {m.outsideLedger.count} earlier client payment{m.outsideLedger.count === 1 ? '' : 's'} totalling {gbp(m.outsideLedger.amount)} ({m.outsideLedger.names.join(', ')}) were taken before the payment ledger, or outside this Stripe account.</p>
      )}
      {m.outsideLedger.refunded.count > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Refunded, and also outside the ledger: {m.outsideLedger.refunded.names.join(', ')} (paid {gbp(m.outsideLedger.refunded.amount)} in total). Marked Refunded on the lead; no refund is recorded in the payment ledger, so the refund's amount and date are not on record here. Not counted as revenue.</p>
      )}
    </Panel>
  );
}

export function CommissionPanel({ o }: { o: O }) {
  const c = o.money.commission;
  const t = c.totals;
  return (
    <Panel collapseKey="admin.cc.commission" title="Commission" icon={Wallet} tone="green" defaultOpen={false}
      hint="From the commission ledger, at the rate each sale earned when it landed — never recalculated at today's rates."
      summary={t ? `${gbp(t.due)} due · ${gbp(t.earned)} earned all time` : 'Unavailable'}>
      {o.commissionError || !t ? <Empty>{o.commissionError ?? 'Commission could not be read.'}</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Figure strong tone="green" label="Due at next payout" value={gbp(t.due)} sub={`paid ${t.nextPayoutDate}`} />
            <Figure label="Earned (all time)" value={gbp(t.earned)} />
            <Figure label="Paid out" value={gbp(t.paidOut)} />
            <Figure label="Held (open disputes)" value={gbp(t.held)} />
            <Figure label="Reversed" value={gbp(t.reversed)} sub={t.offset < 0 ? `${gbp(-t.offset)} to offset` : undefined} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Added in {o.period.label.toLowerCase()}: {gbp(c.periodAdded)}.</p>
          {c.bySeller.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No salesperson has earned commission yet. Sales you make yourself earn none.</p> : (
            <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Salesperson</th>{['Initial', 'Recurring', 'Held', 'Reversed', 'Paid', 'Due'].map((h) => <th key={h} className="px-2 py-2 text-right font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>{c.bySeller.map((s) => (
                  <tr key={s.userId} className="border-b border-border/40">
                    <td className="py-1.5 pr-3">{s.name}</td>
                    {[s.initial, s.recurring, s.held, s.reversed, s.paid, s.due].map((v, i) => <td key={i} className="px-2 py-1.5 text-right tabular-nums">{gbp(v)}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/** 2 · Google after its free monthly allowance — by SKU, by London calendar month. An estimate, never a bill. */
function GoogleAllowance({ a }: { a: CostAccounting }) {
  if (!a.googleMonths.length) return null;
  return (
    <div className="mt-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">2 · Google Maps after its free monthly allowance (estimate)</p>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Google gives each SKU a number of free calls a month; only calls above it are billable, at list price. This is what the calls above the free allowance would cost —
        <span className="font-medium text-foreground"> not a bill and not a confirmed future charge</span>: Google counts the allowance across every project on the billing account (usage outside LeadFinderOS is not visible here), and trial or promotional credits are not visible either.
      </p>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[560px] text-xs">
          <thead><tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1.5 pr-2 font-semibold">Month · SKU</th><th className="px-2 py-1.5 text-right font-semibold">Calls</th><th className="px-2 py-1.5 text-right font-semibold">Free cap</th>
            <th className="px-2 py-1.5 text-right font-semibold">Above cap</th><th className="px-2 py-1.5 text-right font-semibold">Recorded value</th><th className="px-2 py-1.5 text-right font-semibold">After allowance</th>
          </tr></thead>
          <tbody>{a.googleMonths.map((m) => (
            <Fragment key={m.month}>
              <tr className="border-b border-border/40 bg-muted/30"><td className="py-1 pr-2 font-semibold" colSpan={4}>{m.month}</td><td className="px-2 py-1 text-right font-semibold tabular-nums">{usd(m.recordedUsd)}</td><td className="px-2 py-1 text-right font-semibold tabular-nums">{usd(m.estimateAfterAllowanceUsd)}</td></tr>
              {m.skus.map((s) => (
                <tr key={s.sku.key} className="border-b border-border/30">
                  <td className="py-1 pl-3 pr-2">{s.sku.name} <span className="text-muted-foreground">(${s.sku.usdPer1000}/1,000)</span></td>
                  <td className="px-2 py-1 text-right tabular-nums">{s.calls.toLocaleString('en-GB')}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{s.sku.freeCallsPerMonth.toLocaleString('en-GB')}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{s.aboveFree.toLocaleString('en-GB')}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{usd(s.recordedUsd)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{usd(s.estimateAfterAllowanceUsd)}</td>
                </tr>
              ))}
            </Fragment>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export function CostPanel({ o, onDetail }: { o: O; onDetail: () => void }) {
  const c = o.money.cost;
  const a = o.costAccounting;
  const top = (list: { key: string; usd: number }[]) => list.slice(0, 8);
  const owners: CostOwner[] = ['findable', 'testing', 'legacy', 'unallocated'];
  return (
    <Panel collapseKey="admin.cc.cost" title="API & system costs" icon={Coins} tone="grey" defaultOpen={false}
      hint="Recorded usage VALUE (US dollars, estimates) — not money charged. Confirmed charges need real billing data."
      summary={`${usd(c.period.usd)} recorded usage value in ${o.period.label.toLowerCase()} · confirmed charges not available`}>
      {/* ⛔ FOUR THINGS, NEVER ONE NUMBER (src/lib/apiCostAccounting.ts). */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">1 · Recorded usage value · {o.period.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{usd(c.period.usd)}</p>
          <p className="text-[11px] text-muted-foreground">Today {usd(c.today)} · this week {usd(c.week)} · this month {usd(c.month)}. What our code logged when it spent — an estimate, not a bill.</p>
        </div>
        <div className="rounded-xl border border-dashed border-border p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">3 · Confirmed charges</p>
          <p className="mt-1 text-xl font-semibold text-muted-foreground">Not available</p>
          <p className="text-[11px] text-muted-foreground">No provider billing data is connected (Google Cloud billing, OpenAI, Apify invoices). Nothing here is money known to have been paid.</p>
        </div>
      </div>
      {a ? (
        <>
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Whose usage it was · {o.period.label}</p>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {owners.map((k) => (
                <li key={k} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs">
                  <span className="min-w-0"><span className="font-medium">{COST_OWNER_LABEL[k]}</span><span className="block text-[10px] text-muted-foreground">{COST_OWNER_RULE[k]}</span></span>
                  <span className="shrink-0 tabular-nums">{usd(a.byOwner[k])}</span>
                </li>
              ))}
            </ul>
          </div>
          <GoogleAllowance a={a} />
          {a.apify && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Apify account, billing cycle {a.apify.cycleStart.slice(0, 10)} → {a.apify.cycleEnd.slice(0, 10)}:</span> {usd(a.apify.accountUsd)}{a.apify.capUsd ? ` of its ${usd(a.apify.capUsd)} limit` : ''} (Apify's own account figure, read {ago(a.apify.capturedAt)}).
              {' '}We recorded {usd(a.apify.recordedUsd)} of it; {usd(a.apify.notInOurLogUsd)} is <span className="font-medium">unallocated</span> — spend our log does not record (see below), or another user of the same Apify account. Not assumed either way.
            </p>
          )}
        </>
      ) : <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">The ownership and allowance breakdown could not be read just now.</p>}
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recorded usage value by provider, feature and person · {o.period.label}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {([['By provider', c.period.byProvider], ['By feature', c.period.byFeature], ['By person', c.period.byPerson]] as const).map(([title, list]) => (
          <div key={title} className="min-w-0">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            {!list.length ? <p className="text-xs text-muted-foreground">Nothing recorded.</p> : (
              <ul className="space-y-1">{top([...list]).map((r) => (
                <li key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
                  <span className="relative min-w-0 truncate">
                    <span className={cn('absolute inset-y-0 left-0 rounded', TONE.grey.soft)} style={{ width: `${c.period.usd ? (r.usd / c.period.usd) * 100 : 0}%` }} />
                    <span className="relative px-1">{r.key}</span>
                  </span>
                  <span className="tabular-nums">{usd(r.usd)}</span>
                </li>
              ))}</ul>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">What each figure is: {Object.entries(COST_BASIS).map(([k, v]) => `${k} — ${v}`).join('; ')}.</p>
      <p className="mt-1 text-[11px] text-muted-foreground">Not recorded anywhere yet: {o.costNotes.unrecorded.join('; ')}. <button type="button" className="text-primary hover:underline" onClick={onDetail}>Detailed usage log and spend guard</button></p>
    </Panel>
  );
}

export function ContributionPanel({ o }: { o: O }) {
  const k = o.money.contribution;
  return (
    <Panel collapseKey="admin.cc.contribution" title="Money overview" icon={Receipt} tone="green"
      hint={`${o.period.label} · money in (pounds) and recorded API spend (US dollars), kept apart. This is not profit.`}
      summary={`${gbp(k.afterCommission)} after commission · ${usd(k.apiUsd)} recorded API usage value`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Figure strong tone="green" label="Revenue collected (net)" value={gbp(k.revenueNet)} />
        <span className="text-lg text-muted-foreground">−</span>
        <Figure label="Sales commission" value={gbp(k.commission)} />
        <span className="text-lg text-muted-foreground">=</span>
        <Figure strong tone={k.afterCommission >= 0 ? 'green' : 'red'} label="Revenue after commission" value={gbp(k.afterCommission)} />
        <span className="mx-1 hidden h-10 w-px bg-border sm:block" aria-hidden />
        <Figure label="Recorded API usage value (US dollars)" value={usd(k.apiUsd)} sub="an estimate — not converted or subtracted" />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">API spend is billed in US dollars and revenue is in pounds, so the two are shown side by side rather than combined — there is no dated exchange rate on record to convert with. Neither figure includes hosting, software, tax, your time or unrecorded API spend.</p>
    </Panel>
  );
}
