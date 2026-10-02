import { useState, type ReactNode } from 'react';
import { ArrowRight, Banknote, BellRing, Handshake, PoundSterling, UserPlus, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Empty, Figure, KpiCard, Panel, TONE, ago, gbp, type Tone } from '@/components/salesDash/ui';
import { Rate } from '@/components/admin/controlCentre';
import type { AdminOverviewResponse } from '@/hooks/useAdminOverview';
import type { TeamRow } from '@/lib/adminMetrics';
import { MONTHLY_TIERS, monthlyTracker, type CommissionLine } from '@/lib/commission';
import { activityStatus, handoffClients, handoffNext, type ActivityStatus, type HandoffClient } from '@/lib/adminControl';

/* ══ THE ADMIN CONTROL CENTRE'S NEW SECTIONS (2026-10-02, docs/dashboards-redesign.md) ══════════════
   Business at a glance · New sales & handoffs · Sales team performance · Money. Presentational: the
   numbers come folded from fn admin-overview and fn sales-earnings, the clients from fn paid-client-hub
   (the Paid Clients page's own list). Drawn from the shared dashboard design system. */

type O = AdminOverviewResponse;
const pct = (r: number) => `${Math.round(r * 100)}%`;
const num = (n: number) => n.toLocaleString('en-GB');
const londonMonth = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7);
const dayMonth = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

/* ── 1. Business at a glance ────────────────────────────────────────────────────────────────────── */

/** Four figures, each with ONE home: revenue and new clients this month, what needs Paul, commission due. */
export function BusinessGlance({ o, clients, needs, urgent, onNeeds, meId, nowIso = new Date().toISOString() }: {
  o: O; clients: HandoffClient[]; needs: number; urgent: number; onNeeds: () => void; meId: string | null; nowIso?: string;
}) {
  const month = londonMonth(nowIso);
  const newThisMonth = clients.filter((c) => c.payment_date && c.payment_date.slice(0, 7) === month);
  const byTeam = newThisMonth.filter((c) => c.sold_by_name && c.sold_by_user_id !== meId).length;
  const t = o.money.commission.totals;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="business-glance">
      <KpiCard tone="green" icon={PoundSterling} label="Revenue this month" value={gbp(o.money.month.net)} sub={`${num(o.money.month.payments)} payment${o.money.month.payments === 1 ? '' : 's'} · Stripe ledger`} />
      <KpiCard tone="blue" icon={UserPlus} label="New clients this month" value={newThisMonth.length} sub={newThisMonth.length ? `${byTeam} sold by the team` : 'None yet this month'} />
      <KpiCard tone="amber" icon={BellRing} label="Needs you" value={needs} sub={urgent ? `${urgent} urgent` : needs ? 'Nothing urgent' : 'All clear'} onClick={onNeeds} />
      <KpiCard tone="purple" icon={Wallet} label="Commission due" value={t ? gbp(t.due) : '—'} sub={t ? `Paid on ${dayMonth(t.nextPayoutDate)}` : 'Unavailable'} />
    </div>
  );
}

/* ── 2. New sales & handoffs ────────────────────────────────────────────────────────────────────── */

const STATE_CHIP: Record<string, Tone> = { waiting_sales: 'amber', waiting_client: 'amber', waiting_findable: 'blue', ready_to_submit: 'green', ready: 'green', in_delivery: 'purple', ended: 'grey' };
const SHOWN = 6;

export function HandoffsPanel({ clients, routeOf, onOpen, nowMs = Date.now() }: {
  clients: HandoffClient[]; routeOf: (id: string) => 'build' | 'optimise' | null; onOpen: (id: string, section?: string) => void; nowMs?: number;
}) {
  const rows = handoffClients(clients, nowMs);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <Panel id="new-sales" collapseKey="admin.cc.handoffs" title="New sales & handoffs" icon={Handshake} tone="amber"
      hint="Every paid client still being handed over or set up, and anything sold in the last two weeks. Tap a client to open their Paid Client record."
      summary={rows.length ? `${rows.length} client${rows.length === 1 ? '' : 's'} · ${rows.filter((c) => handoffNext(c, nowMs).mine).length} waiting on you` : 'Nothing being handed over'}>
      {rows.length === 0 ? <Empty icon={Handshake}>No new sales or handoffs right now. A new payment shows here the moment it lands.</Empty> : (
        <>
          <ul className="grid grid-cols-1 gap-2.5 xl:grid-cols-2" data-testid="handoff-rows">
            {shown.map((c) => {
              const h = c.handoff;
              const route = routeOf(c.id);
              const tone = STATE_CHIP[h?.state ?? ''] ?? 'grey';
              const next = handoffNext(c, nowMs);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => onOpen(c.id, h?.next.section)}
                    className="group flex h-full w-full min-w-0 flex-col gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3.5 text-left transition hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{c.business_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.sold_by_name ? `Sold by ${c.sold_by_name}` : 'Seller not recorded'} · {(c.amount_paid ?? 0) > 0 ? `${gbp(c.amount_paid)} paid` : 'Marked paid'}{c.payment_date ? ` · ${dayMonth(c.payment_date)}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {route && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{route === 'build' ? 'Build' : 'Optimise'}</span>}
                        {h && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', TONE[tone].soft, TONE[tone].text)} data-testid="handoff-state">{h.state_label}</span>}
                      </span>
                    </div>
                    {h && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="w-16 shrink-0">Setup {h.done}/{h.total}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', h.done >= h.total ? TONE.green.bar : TONE.amber.bar)} style={{ width: `${h.total ? Math.round((h.done / h.total) * 100) : 0}%` }} /></span>
                        <span className="shrink-0">{h.stage_label}</span>
                      </div>
                    )}
                    {h && h.stage === 'setup' && h.missing.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="handoff-missing">Missing: {h.missing.join(' · ')}</p>}
                    <p className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs">
                      <span className="min-w-0"><span className="text-muted-foreground">Next: </span><span className={cn('font-semibold', next.mine ? 'text-foreground' : 'text-muted-foreground')}>{next.label}</span></span>
                      {next.mine && <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-950">You</span>}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length > SHOWN && <button type="button" onClick={() => setAll(!all)} className="mt-3 w-full rounded-xl border border-border/60 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted/50 hover:text-foreground">{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
        </>
      )}
    </Panel>
  );
}

/* ── 3. Sales team performance ─────────────────────────────────────────────────────────────────── */

const STATUS: Record<ActivityStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-400/30' },
  quiet: { label: 'Quiet', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-400/30' },
  inactive: { label: 'Inactive', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-slate-400/30' },
};

function Th({ children, right, title }: { children: ReactNode; right?: boolean; title?: string }) {
  return <th title={title} className={cn('whitespace-nowrap px-2.5 py-2.5 text-[11px] font-semibold text-muted-foreground', right && 'text-right')}>{children}</th>;
}
function Td({ children, right, strong, className }: { children: ReactNode; right?: boolean; strong?: boolean; className?: string }) {
  return <td className={cn('whitespace-nowrap px-2.5 py-3 tabular-nums', right && 'text-right', strong && 'font-bold', className)}>{children}</td>;
}

/** ONE salesperson per row: who is active, their month and tier, outreach, replies, outcomes, sales, follow-ups.
 *  Replaces the old Team comparison (a column per metric group) and the team-status idea in one table. */
export function TeamPerformanceTable({ o, rows, lines, lastActivity, hidden, onOpenPerson, nowMs = Date.now() }: {
  o: O; rows: TeamRow[]; lines: CommissionLine[] | null; lastActivity: Record<string, string | null>; hidden: boolean;
  onOpenPerson: (userId: string) => void; nowMs?: number;
}) {
  const todayIso = new Date(nowMs).toISOString();
  const month = (id: string) => (lines ? monthlyTracker(lines.filter((l) => l.sellerId === id), todayIso) : null);
  const sum = (k: keyof TeamRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const totalCohort = { contacted: rows.reduce((s, r) => s + r.cohort.contacted, 0), paid: rows.reduce((s, r) => s + r.cohort.paid, 0) };
  return (
    <Panel collapseKey="admin.cc.team-performance" title="Sales team performance" icon={Users} tone="blue"
      hint={`${o.period.label} · one salesperson per row. "This month" and "Overdue" are always now; everything else follows the period.`}
      summary={`${rows.length} salesperson${rows.length === 1 ? '' : 's'} · ${num(sum('whatsappSent'))} WhatsApps · ${num(sum('paid'))} sales`}
>
      {rows.length === 0 ? (
        <Empty icon={Users}>{hidden ? 'No salesperson activity in this period. Your own activity is hidden — use "My activity" at the top to include it.' : 'No activity in this period.'} Test accounts are always left out.</Empty>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm" data-testid="team-performance">
            <thead>
              <tr className="text-left">
                <Th>Salesperson</Th><Th>This month</Th><Th right>WhatsApps</Th><Th right>Calls</Th><Th right title="Replies, and the share of people messaged who replied">Replies</Th>
                <Th right>Interested</Th><Th right>Not interested</Th><Th right>Meetings</Th><Th right>Sales</Th><Th right title="Of the people first contacted in this period, how many have paid">Contacted → sale</Th><Th right>Overdue</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const last = lastActivity[r.userId] ?? null;
                const st = activityStatus(last, nowMs);
                const m = month(r.userId);
                const seller = r.role === 'sales';
                return (
                  <tr key={r.userId} className="group [&>td]:border-t [&>td]:border-border/50">
                    <Td className="!whitespace-normal">
                      <button type="button" onClick={() => onOpenPerson(r.userId)} className="min-w-0 text-left" title={`Open ${r.name}'s Sales dashboard`}>
                        <span className="flex items-center gap-2"><span className="font-bold group-hover:text-primary">{r.name}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset', STATUS[st].cls)} data-testid="activity-status">{STATUS[st].label}</span></span>
                        <span className="block text-[11px] text-muted-foreground">{last ? `Last active ${ago(last, nowMs)}` : 'No activity recorded'}</span>
                      </button>
                    </Td>
                    <Td>
                      {seller && m ? (
                        <span className="flex items-center gap-2">
                          <span className="text-base font-extrabold">{m.counted}</span>
                          <span className="rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-950">{pct(m.nextSaleRate)}</span>
                          <span className="text-[11px] text-muted-foreground">{m.topTier || m.salesToNextTier === null ? 'top rate' : `${m.salesToNextTier} to ${pct(m.nextTierRate ?? MONTHLY_TIERS[MONTHLY_TIERS.length - 1].rate)}`}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </Td>
                    <Td right>{num(r.whatsappSent)}</Td>
                    <Td right>{num(r.calls)}</Td>
                    <Td right><span className="font-semibold">{num(r.replies)}</span>{r.leadsMessaged >= 10 && <span className="ml-1 text-[11px] text-muted-foreground">{Math.round((r.replies / r.leadsMessaged) * 100)}%</span>}</Td>
                    <Td right className="text-violet-700 dark:text-violet-300">{num(r.interested)}</Td>
                    <Td right className="text-muted-foreground">{num(r.notInterested)}</Td>
                    <Td right>{num(r.meetings)}</Td>
                    <Td right strong><span className="text-teal-700 dark:text-teal-300">{num(r.paid)}</span>{r.revenue > 0 && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{gbp(r.revenue)}</span>}</Td>
                    <Td right><Rate n={r.cohort.paid} of={r.cohort.contacted} /></Td>
                    <Td right>{r.followUpsOverdue > 0 ? <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-bold text-red-700 dark:text-red-300">{r.followUpsOverdue}</span> : <span className="text-muted-foreground">0</span>}</Td>
                  </tr>
                );
              })}
              {rows.length > 1 && (
                <tr className="[&>td]:border-t-2 [&>td]:border-border/70 text-muted-foreground">
                  <Td strong>Team total</Td><Td>{''}</Td><Td right>{num(sum('whatsappSent'))}</Td><Td right>{num(sum('calls'))}</Td><Td right>{num(sum('replies'))}</Td>
                  <Td right>{num(sum('interested'))}</Td><Td right>{num(sum('notInterested'))}</Td><Td right>{num(sum('meetings'))}</Td>
                  <Td right strong>{num(sum('paid'))}</Td><Td right><Rate n={totalCohort.paid} of={totalCohort.contacted} /></Td><Td right>{num(sum('followUpsOverdue'))}</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── 4. Money ──────────────────────────────────────────────────────────────────────────────────── */

/** The period's money, simply. Revenue this month and commission due live in Business at a glance. */
export function MoneyPanel({ o }: { o: O }) {
  const m = o.money;
  const t = m.commission.totals;
  return (
    <Panel collapseKey="admin.cc.revenue" title="Payments and commission" icon={Banknote} tone="green"
      hint={`${o.period.label} · from the Stripe payment ledger and the commission ledger — never from a lead's status.`}
      summary={`${gbp(m.period.net)} collected · ${m.payingClients} paying client${m.payingClients === 1 ? '' : 's'}`}>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5" data-testid="money-figures">
        <Figure strong tone="green" label="Collected (net)" value={gbp(m.period.net)} sub={`${gbp(m.period.initial)} first · ${gbp(m.period.recurring)} monthly`} />
        <Figure label="Paying clients" value={m.payingClients} sub={`${m.activeSubscriptions} subscription${m.activeSubscriptions === 1 ? '' : 's'} active${m.pastDue ? ` · ${m.pastDue} past due` : ''}`} />
        <Figure label="Refunds · disputes" value={`${gbp(m.period.refunds)} · ${gbp(m.period.disputesLost)}`} sub={m.period.disputesOpen ? `${gbp(m.period.disputesOpen)} in open disputes` : 'None open'} />
        <Figure label="Commission added" value={gbp(m.commission.periodAdded)} sub={t ? `${gbp(t.earned)} earned all time` : undefined} />
        <Figure label="After commission" value={gbp(m.contribution.afterCommission)} sub={`API spend $${m.contribution.apiUsd.toFixed(2)} (USD, not deducted)`} />
      </div>
      {m.outsideLedger.count > 0 && <p className="mt-3 text-[11px] text-muted-foreground">Not in these figures: {m.outsideLedger.count} earlier payment{m.outsideLedger.count === 1 ? '' : 's'} ({gbp(m.outsideLedger.amount)}) taken before the payment ledger.</p>}
    </Panel>
  );
}

