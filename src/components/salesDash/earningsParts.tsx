import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Info, PiggyBank, Repeat, ShieldCheck, Sparkles, Trophy, UserRoundX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { cn } from '@/lib/utils';
import { Empty, Panel, TONE, gbp, type Tone } from '@/components/salesDash/ui';
import { londonDayOf, type CommissionLine } from '@/lib/commission';
import { FIRST_PAYMENT_LADDER, LATER_PAYMENT_RATE, ONE_PAYMENT_COMMISSION, laterPaymentPounds, saleCommissionMax } from '@/lib/commissionConfig';
import { PAYMENT_PLAN_SPEC } from '@/lib/paymentPlans';
import { salePlanWordsOr } from '@/lib/salePlan';
import type { EarningsResponse } from '@/hooks/useEarnings';

/* ══ THE SALES PAGE'S MONEY PARTS (2026-10-01) ═════════════════════════════════════════════════════
   Moved from the old Earnings page (which now redirects to the Sales page): the payments table, the
   admin's payout record, the per-salesperson table; plus the page's recent wins and the
   plain commission rules (the week-by-week chart went 2026-10-02). Every figure is a commission line (src/lib/commission.ts) — nothing
   here is counted a second way. */

import { COMMISSION_PAYABLE_DAYS_V7 } from '@/lib/commissionConfig';

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
type Client = EarningsResponse['clients'][number];

const STATUS: Record<CommissionLine['status'], { label: string; tone: Tone }> = {
  due: { label: 'Earned · due', tone: 'green' },
  paid: { label: 'Paid out', tone: 'grey' },
  reversed: { label: 'Reversed', tone: 'red' },
  not_commissionable: { label: 'No commission', tone: 'grey' },
  /* v3 terms (2026-10-05): the initial commission waits for the client's Approval Date. */
  pending: { label: 'Pending', tone: 'amber' },
  cancelled: { label: 'Cancelled · refunded', tone: 'red' },
};

/** "Today" / "Yesterday" / "3 Oct" — London days. */
function whenWords(iso: string, todayIso: string): string {
  const d = londonDayOf(iso); const t = londonDayOf(todayIso);
  const y = new Date(`${t}T12:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
  return d === t ? 'Today' : d === y.toISOString().slice(0, 10) ? 'Yesterday' : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

/** The newest sales (first payments), each with what it earned. */
export function RecentWins({ lines, clients, sales, todayIso = new Date().toISOString(), max = 5 }: { lines: CommissionLine[]; clients: Client[]; sales?: EarningsResponse['sales']; todayIso?: string; max?: number }) {
  const clientOf = new Map(clients.map((c) => [c.leadId, c]));
  const planOf = new Map((sales ?? []).map((s) => [s.leadId, s.plan]));
  const wins = lines.filter((l) => l.kind === 'payment' && l.paymentNumber === 1 && !l.testSale && l.status !== 'cancelled').slice(0, max);
  return (
    <Panel title="Recent wins" icon={Trophy} tone="amber" hint="Your newest sales and what each one earned you.">
      {wins.length === 0 ? <Empty icon={Trophy}>Your first sale will show here the day the client pays.</Empty> : (
        <ul className="space-y-1.5" data-testid="recent-wins">
          {wins.map((l) => {
            const c = clientOf.get(l.leadId);
            return (
              <li key={l.id} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5 ring-1 ring-inset ring-border/40">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', l.commission > 0 ? TONE.amber.solid : TONE.grey.icon)}><Trophy className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c?.business ?? 'Client'}</span>
                  <span className="block text-xs text-muted-foreground">{salePlanWordsOr(planOf.get(l.leadId), c?.package ?? 'Findable')} · {whenWords(l.occurredAt, todayIso)}</span>
                </span>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums', l.commission > 0 ? cn(TONE.green.soft, TONE.green.text) : 'text-muted-foreground')}>
                  {l.status === 'not_commissionable' ? 'No commission' : `+${gbp(l.commission)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** How commission works, in plain words and pounds, from the same constants that pay it. ⛔ REMOVED 2026-10-02 (Paul): "This month, week
 *  by week" — a bar per week of a month already counted on the month card, which told a salesperson nothing they could act on. */
export function CommissionExplainer() {
  const ladder = FIRST_PAYMENT_LADDER;
  const stepWords = ladder.map((s, i) => { const from = i === 0 ? 1 : ladder[i - 1].upTo + 1; return `£${s.pounds} for ${Number.isFinite(s.upTo) ? `sales ${from} to ${s.upTo}` : `sale ${from} onward`}`; }).join(', ');
  const share = `${Math.round(LATER_PAYMENT_RATE * 100)}%`;
  const m = PAYMENT_PLAN_SPEC.complete.monthlyGbp, r = PAYMENT_PLAN_SPEC.twelve.monthlyGbp;
  /* What each plan can earn on the ladder's first step, from the same constants that pay it. */
  const most = (plan: 'complete' | 'six' | 'twelve') => saleCommissionMax({ firstPounds: ladder[0].pounds, laterPayments: PAYMENT_PLAN_SPEC[plan].totalPayments - 1, monthlyGbp: PAYMENT_PLAN_SPEC[plan].monthlyGbp });
  const rules: { icon: typeof Info; text: ReactNode }[] = [
    { icon: Sparkles, text: <>The first payment of a sale earns {stepWords}, counted per UK calendar month. Sales are numbered when the first payment is collected. Never backdated, and the count starts again on the 1st. A refunded sale stops counting.</> },
    { icon: Repeat, text: <>Then {share} of each later plan payment the client makes, in whole pounds: £{laterPaymentPounds(m)} on each £{m} payment, £{laterPaymentPounds(r)} on each £{r} payment, until the plan is fully paid. On the first step that is up to £{most('complete')} on Complete monthly, £{most('six')} on Essential over 6 months and £{most('twelve')} on Essential over 12 months. Complete paid up front earns £{ONE_PAYMENT_COMMISSION.complete_upfront}, once. Essential paid in full earns £{ONE_PAYMENT_COMMISSION.full}, once. Nothing on hosting after the plan, renewals or upsells.</> },
    { icon: ShieldCheck, text: <>Anything collected before the client’s guarantee window closes becomes payable the day after it closes. It closes {COMMISSION_PAYABLE_DAYS_V7} days after their four-week audit is sent. Until it is sent it shows as waiting for the four-week audit. If the client claims, nothing on that sale is payable.</> },
    { icon: CalendarCheck2, text: <>Anything collected after the window closes is payable on the 1st of the following month. A payment that never arrives earns nothing; if a missed payment is recovered later, it earns as normal. A refund or chargeback earns nothing, and one after you were paid comes off your next commission. While a dispute is open that money is held.</> },
    { icon: UserRoundX, text: <>Only money the client actually paid counts. If you leave, you are still paid on the plan’s payments as they arrive.</> },
  ];
  return (
    <Panel collapseKey="sales.commission-rules" defaultOpen={false} title="How your commission works" icon={Info} tone="blue" hint="The rules behind every number on this page." summary={`First payment ${ladder.map((s) => `£${s.pounds}`).join(' / ')} by your sales in the month, then ${share} of each later plan payment. £${ONE_PAYMENT_COMMISSION.complete_upfront} up front, £${ONE_PAYMENT_COMMISSION.full} Essential in full. Open for the rules.`}>
      <ul className="space-y-2.5" data-testid="commission-explainer">
        {rules.map((r, i) => (
          <li key={i} className="flex items-start gap-3 text-[13px] leading-relaxed">
            <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', TONE.blue.icon)}><r.icon className="h-3.5 w-3.5" /></span>
            <span className="text-muted-foreground">{r.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Every payment and refund, newest first. The admin also sees who sold it. */
export function PaymentsTable({ lines, bizOf, sellerOf }: { lines: CommissionLine[]; bizOf: Map<string, string>; sellerOf?: (id: string | null) => string }) {
  const head = ['Client', ...(sellerOf ? ['Sold by'] : []), 'Payment', 'Date', 'Client paid', 'Commission', 'Status', 'Paid on'];
  return (
    <Panel collapseKey="sales.payments" defaultOpen={false} title="Client payments" icon={PiggyBank} tone="green" hint="Every client payment and refund, newest first, with the commission on it.">
      {lines.length === 0 ? <Empty>Nothing yet.</Empty> : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {head.map((h) => <th key={h} className={cn('px-2 py-2 font-semibold', ['Client paid', 'Commission', 'Paid on'].includes(h) && 'text-right')}>{h}</th>)}
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border/30 last:border-0">
                  <td className="max-w-[12rem] truncate px-2 py-2 font-medium" title={bizOf.get(l.leadId)}>{bizOf.get(l.leadId) ?? 'Client'}</td>
                  {sellerOf && <td className="px-2 py-2 text-muted-foreground">{sellerOf(l.sellerId)}</td>}
                  <td className="px-2 py-2 text-muted-foreground" data-testid="line-label">{l.label}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{day(l.occurredAt)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.kind === 'reversal' ? `−${gbp(l.clientAmount)}` : gbp(l.clientAmount)}</td>
                  <td className={cn('px-2 py-2 text-right font-semibold tabular-nums', l.commission > 0 ? 'text-emerald-600 dark:text-emerald-300' : l.commission < 0 ? 'text-red-600 dark:text-red-300' : 'text-muted-foreground')}>{l.commission < 0 ? `−${gbp(-l.commission)}` : gbp(l.commission)}</td>
                  <td className="px-2 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', TONE[STATUS[l.status].tone].soft, TONE[STATUS[l.status].tone].text)}>{STATUS[l.status].label}</span></td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">{l.status === 'not_commissionable' ? '—' : l.payoutDate ? day(l.payoutDate) : 'After four-week audit'}</td>
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
