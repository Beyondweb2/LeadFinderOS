import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, Info, PiggyBank, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { cn } from '@/lib/utils';
import { Empty, Panel, TONE, gbp, type Tone } from '@/components/salesDash/ui';
import {
  COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_RATE, MONTHLY_TIERS, londonDayOf, monthName, monthlyTracker,
  type CommissionLine, type EarningsTotals,
} from '@/lib/commission';
import type { EarningsResponse } from '@/hooks/useEarnings';

/* ══ THE SALES PAGE'S MONEY PARTS (2026-10-01) ═════════════════════════════════════════════════════
   Moved from the old Earnings page (which now redirects to the Sales page): the payments table, the
   admin's payout record, the per-salesperson table; plus the page's recent wins, its one chart and the
   plain commission explanation. Every figure is a commission line (src/lib/commission.ts) — nothing
   here is counted a second way. */

const pct = (r: number) => `${Math.round(r * 100)}%`;
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
type Client = EarningsResponse['clients'][number];

const STATUS: Record<CommissionLine['status'], { label: string; tone: Tone }> = {
  due: { label: 'Earned · due', tone: 'green' },
  paid: { label: 'Paid out', tone: 'grey' },
  reversed: { label: 'Reversed', tone: 'red' },
  not_commissionable: { label: 'No commission', tone: 'grey' },
};

/** "Today" / "Yesterday" / "3 Oct" — London days. */
function whenWords(iso: string, todayIso: string): string {
  const d = londonDayOf(iso); const t = londonDayOf(todayIso);
  const y = new Date(`${t}T12:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
  return d === t ? 'Today' : d === y.toISOString().slice(0, 10) ? 'Yesterday' : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

/** The newest sales (first payments), each with what it earned. */
export function RecentWins({ lines, clients, todayIso = new Date().toISOString(), max = 5 }: { lines: CommissionLine[]; clients: Client[]; todayIso?: string; max?: number }) {
  const clientOf = new Map(clients.map((c) => [c.leadId, c]));
  const wins = lines.filter((l) => l.kind === 'payment' && l.paymentNumber === 1 && !l.testSale).slice(0, max);
  return (
    <Panel title="Recent wins" icon={Trophy} tone="green">
      {wins.length === 0 ? <Empty icon={Trophy}>Your first sale will show here the day the client pays.</Empty> : (
        <ul className="divide-y divide-border/50" data-testid="recent-wins">
          {wins.map((l) => {
            const c = clientOf.get(l.leadId);
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c?.business ?? 'Client'}</span>
                  <span className="block text-xs text-muted-foreground">{c?.package ?? 'Findable'} · {whenWords(l.occurredAt, todayIso)}</span>
                </span>
                <span className={cn('shrink-0 text-sm font-semibold tabular-nums', l.commission > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground')}>
                  {l.status === 'not_commissionable' ? 'No commission' : `${gbp(l.commission)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** The one chart: this month's sales, Monday-start week by week (London). */
export function SalesByWeek({ lines, todayIso = new Date().toISOString() }: { lines: CommissionLine[]; todayIso?: string }) {
  const t = monthlyTracker(lines, todayIso);
  const first = new Date(`${t.monthStart}T12:00:00Z`);
  const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + 1);
  const weeks: { label: string; from: string; to: string; n: number }[] = [];
  for (let d = new Date(first); d < next; ) {
    const from = d.toISOString().slice(0, 10);
    const end = new Date(d); end.setUTCDate(end.getUTCDate() + ((7 - ((d.getUTCDay() + 6) % 7)) - 1));
    const to = (end >= next ? new Date(next.getTime() - 86_400_000) : end).toISOString().slice(0, 10);
    weeks.push({ label: `${Number(from.slice(8))}–${Number(to.slice(8))}`, from, to, n: 0 });
    d = new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  }
  for (const s of t.sales) { if (!s.counted) continue; const dd = londonDayOf(s.occurredAt); const w = weeks.find((x) => dd >= x.from && dd <= x.to); if (w) w.n += 1; }
  const max = Math.max(1, ...weeks.map((w) => w.n));
  const today = londonDayOf(todayIso);
  return (
    <Panel title="This month, week by week" icon={BarChart3} tone="green" hint="Sales that count, by week.">
      <div className="flex h-36 items-end gap-2" data-testid="sales-by-week">
        {weeks.map((w) => {
          const now = today >= w.from && today <= w.to;
          return (
            <div key={w.from} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold tabular-nums">{w.n}</span>
              <span className={cn('w-full rounded-t', now ? 'bg-emerald-500' : 'bg-emerald-500/50')} style={{ height: `${w.n ? Math.max(8, (w.n / max) * 96) : 2}px` }} />
              <span className={cn('truncate text-[11px]', now ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{w.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{monthName(t.monthStart)} · days of the month, Monday to Sunday.</p>
    </Panel>
  );
}

/** How commission works, in plain words, with this month's own numbers. Folded by default. */
export function CommissionExplainer({ lines, totals, todayIso = new Date().toISOString() }: { lines: CommissionLine[]; totals: EarningsTotals; todayIso?: string }) {
  const t = monthlyTracker(lines, todayIso);
  const current = t.counted === 0 ? MONTHLY_TIERS[0].rate : t.sales.filter((s) => s.counted).slice(-1)[0].rate;
  const collected = lines.filter((l) => l.paymentNumber >= 2 && l.status !== 'not_commissionable').reduce((s, l) => s + l.commission, 0);
  return (
    <details className="rounded-2xl border border-border/60 bg-card p-4 text-sm" data-testid="commission-explainer">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 font-semibold"><Info className="h-4 w-4 text-muted-foreground" />How your commission works</summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Your rate this month</dt><dd className="font-semibold">{pct(current)}</dd></div>
          {MONTHLY_TIERS.map((z, i) => {
            const from = i === 0 ? 1 : MONTHLY_TIERS[i - 1].upTo + 1;
            return <div key={i} className="flex justify-between gap-3"><dt className="text-muted-foreground">{Number.isFinite(z.upTo) ? `Sales ${from}–${z.upTo}` : `Sale ${from} onwards`}</dt><dd>{pct(z.rate)} of the first payment</dd></div>;
          })}
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Next rate</dt><dd className="font-semibold">{t.topTier ? 'You are on the top rate' : t.salesToNextTier === 0 ? 'Starts with your next sale' : `${t.salesToNextTier} sale${t.salesToNextTier === 1 ? '' : 's'} away`}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Recurring commission</dt><dd>{gbp(totals.projected)} expected · {gbp(collected)} collected</dd></div>
        </dl>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>Each sale keeps the rate it earned: reaching sale 13 does not change sales 1–12. The count starts again on the 1st of each month (UK time).</li>
          <li>A sale that is refunded no longer counts towards your rate for the sales after it.</li>
          <li>Monthly payments: {pct(COMMISSION_RECURRING_RATE)} of each of the next {COMMISSION_RECURRING_COUNT} monthly payments a client actually makes.</li>
          <li>Paid on the first working day of the next month. A refund or chargeback takes back the commission on that money.</li>
          <li>Only money the client actually paid counts.</li>
        </ul>
      </div>
    </details>
  );
}

/** Every payment and refund, newest first. The admin also sees who sold it. */
export function PaymentsTable({ lines, bizOf, sellerOf }: { lines: CommissionLine[]; bizOf: Map<string, string>; sellerOf?: (id: string | null) => string }) {
  const head = ['Client', ...(sellerOf ? ['Sold by'] : []), 'Payment', 'Date', 'Client paid', 'Rate', 'Commission', 'Status', 'Paid on'];
  return (
    <Panel collapseKey="sales.payments" defaultOpen={false} title="Your payments" icon={PiggyBank} tone="green" hint="Every client payment and refund, newest first, with the commission on it.">
      {lines.length === 0 ? <Empty>Nothing yet.</Empty> : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {head.map((h) => <th key={h} className={cn('px-2 py-2 font-semibold', ['Client paid', 'Rate', 'Commission', 'Paid on'].includes(h) && 'text-right')}>{h}</th>)}
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border/30 last:border-0">
                  <td className="max-w-[12rem] truncate px-2 py-2 font-medium" title={bizOf.get(l.leadId)}>{bizOf.get(l.leadId) ?? 'Client'}</td>
                  {sellerOf && <td className="px-2 py-2 text-muted-foreground">{sellerOf(l.sellerId)}</td>}
                  <td className="px-2 py-2 text-muted-foreground" data-testid="line-label">{l.label}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{day(l.occurredAt)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.kind === 'reversal' ? `−${gbp(l.clientAmount)}` : gbp(l.clientAmount)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{pct(l.rate)}</td>
                  <td className={cn('px-2 py-2 text-right font-semibold tabular-nums', l.commission > 0 ? 'text-emerald-600 dark:text-emerald-300' : l.commission < 0 ? 'text-red-600 dark:text-red-300' : 'text-muted-foreground')}>{l.commission < 0 ? `−${gbp(-l.commission)}` : gbp(l.commission)}</td>
                  <td className="px-2 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', TONE[STATUS[l.status].tone].soft, TONE[STATUS[l.status].tone].text)}>{STATUS[l.status].label}</span></td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">{l.status === 'not_commissionable' ? '—' : day(l.payoutDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** ADMIN: commission per salesperson. */
export function BySellerTable({ rows, nameOf }: { rows: EarningsResponse['bySeller']; nameOf: (id: string) => string }) {
  return (
    <Panel collapseKey="sales.by-seller" title="By salesperson" icon={PiggyBank} tone="green" hint="Only salespeople earn commission.">
      {rows.length === 0 ? <Empty>No salesperson has earned commission yet.</Empty> : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">{['Salesperson', 'Earned', 'Due', 'Offset', 'Paid out'].map((h, i) => <th key={h} className={cn('px-2 py-2 font-semibold', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.sellerId} className="border-b border-border/30 last:border-0">
                <td className="px-2 py-2 font-medium">{nameOf(s.sellerId)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{gbp(s.earned)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{gbp(s.due)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.offset < 0 ? gbp(s.offset) : '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{gbp(s.paidOut)}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** The admin records a payout ACTUALLY MADE (money moved outside the app). Nothing is paid from here. */
export function PayoutDialog({ open, onOpenChange, sellers }: { open: boolean; onOpenChange: (v: boolean) => void; sellers: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [seller, setSeller] = useState('');
  const [month, setMonth] = useState(() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); });
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await invokeEdge('sales-earnings', { mode: 'record_payout', user_id: seller, period_month: month, amount_gbp: Number(amount), paid_at: paidAt });
      toast({ title: 'Payout recorded' });
      void qc.invalidateQueries({ queryKey: ['sales-earnings'] });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not record the payout', description: edgeErrorMessage(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Record a payout</DialogTitle><DialogDescription>Only a record of a payment you made to a salesperson. Nothing is paid from here.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Salesperson</Label>
            <Select value={seller} onValueChange={setSeller}><SelectTrigger className="h-9"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label htmlFor="po-month">Receipts month</Label><Input id="po-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label htmlFor="po-amt">Amount paid (£)</Label><Input id="po-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="h-9" /></div>
          <div className="space-y-1"><Label htmlFor="po-date">Paid on</Label><Input id="po-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="h-9" /></div>
        </div>
        <DialogFooter><Button onClick={() => void save()} disabled={saving || !seller || !month || !amount}>{saving ? 'Saving…' : 'Record payout'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
