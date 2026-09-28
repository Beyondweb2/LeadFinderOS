import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, Info, Loader2, PiggyBank, RefreshCw, TrendingUp, Undo2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { useEarnings } from '@/hooks/useEarnings';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { COMMISSION_INITIAL_RATE, COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_RATE, type CommissionLine } from '@/lib/commission';
import { leadLaunchState } from '@/lib/salesLinks';
import { cn } from '@/lib/utils';
import { Empty, KpiCard, Panel, TONE, gbp, type Tone } from '@/components/salesDash/ui';
import { EarnedCelebration } from '@/components/salesDash/EarnedCelebration';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   EARNINGS (Sales Experience release 2, 2026-09-28). Commission from the PAYMENT LEDGER only (Stripe's
   own record of money that moved) — never from a CRM status. The rules are src/lib/commission.ts;
   the server (fn sales-earnings) scopes a salesperson to their own clients. The admin sees everyone,
   per seller, and records payouts actually made.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const STATUS: Record<CommissionLine['status'], { label: string; tone: Tone }> = {
  due: { label: 'Earned · due', tone: 'green' },
  paid: { label: 'Paid out', tone: 'grey' },
  reversed: { label: 'Reversed', tone: 'red' },
  not_commissionable: { label: 'No commission', tone: 'grey' },
};
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const pct = (r: number) => `${Math.round(r * 100)}%`;

export default function Earnings() {
  const { role } = useSubscription();
  const { user } = useAuth();
  const isAdmin = role === 'admin';
  const team = useTeamDirectory();
  const navigate = useNavigate();
  const [person, setPerson] = useState('all');
  const q = useEarnings(isAdmin ? person : 'me');
  const d = q.data;
  const [payoutOpen, setPayoutOpen] = useState(false);
  const nameOf = useMemo(() => new Map((team.data ?? []).map((m) => [m.user_id, m.display_name])), [team.data]);
  const bizOf = useMemo(() => new Map((d?.clients ?? []).map((c) => [c.leadId, c.business])), [d?.clients]);
  const viewingSelf = !isAdmin || person === 'me';

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      <EarnedCelebration lines={d?.lines} enabled={viewingSelf && !!d?.commissionable} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl"><Wallet className="h-7 w-7 text-emerald-500" />Earnings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{isAdmin ? 'Commission by salesperson, from real client payments.' : 'Your commission, from real client payments only.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-9 w-44 text-xs" aria-label="Whose earnings"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {(team.data ?? []).filter((m) => m.status === 'active' && m.user_id !== user?.id).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isAdmin && <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => setPayoutOpen(true)}>Record a payout</Button>}
          <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => void q.refetch()} disabled={q.isFetching}><RefreshCw className={cn('h-3.5 w-3.5', q.isFetching && 'animate-spin')} />Refresh</Button>
        </div>
      </header>

      {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Adding it up…</p>}
      {q.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load earnings: {edgeErrorMessage(q.error)}
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      )}

      {d && (
        <>
          {!d.commissionable && <p className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Commission is paid to salespeople. Clients you sell yourself show here at £0.</p>}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
            <div className="col-span-3 lg:col-span-1">
              <KpiCard hero label="Earned" icon={Wallet} tone="green" value={gbp(d.totals.earned)} sub={`${gbp(d.totals.earnedThisMonth)} this month · net of any reversals`} />
            </div>
            <KpiCard label="Due next payout" icon={CalendarClock} tone="green" value={gbp(d.totals.due)} sub={`Paid ${day(d.totals.nextPayoutDate)}${d.totals.offset < 0 ? ` · offset ${gbp(-d.totals.offset)}` : ''}`} />
            <KpiCard label="Projected" icon={TrendingUp} tone="grey" value={gbp(d.totals.projected)} sub="Only if those future payments arrive. Never counted as earned." />
            <KpiCard label={d.totals.reversed > 0 ? 'Reversed' : 'Paid out'} icon={d.totals.reversed > 0 ? Undo2 : PiggyBank} tone={d.totals.reversed > 0 ? 'red' : 'grey'} value={gbp(d.totals.reversed > 0 ? d.totals.reversed : d.totals.paidOut)} sub={d.totals.reversed > 0 ? `Refunds / chargebacks · paid out so far ${gbp(d.totals.paidOut)}` : 'Recorded payouts so far'} />
          </div>
          {d.totals.offset < 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"><Undo2 className="mt-0.5 h-4 w-4 shrink-0" />A refund came after its commission was paid out. {gbp(-d.totals.offset)} will be taken from future commission.</p>
          )}

          {isAdmin && person === 'all' && (
            <Panel title="By salesperson" icon={Wallet} tone="green" hint="Only salespeople earn commission.">
              {d.bySeller.length === 0 ? <Empty>No salesperson has earned commission yet.</Empty> : (
                <Table head={['Salesperson', 'Earned', 'Due', 'Offset', 'Paid out']} rows={d.bySeller.map((s) => [nameOf.get(s.sellerId) ?? 'Salesperson', gbp(s.earned), gbp(s.due), s.offset < 0 ? gbp(s.offset) : '—', gbp(s.paidOut)])} />
              )}
            </Panel>
          )}

          <Panel title="Clients" icon={CheckCircle2} tone="green" hint={`Commission is ${pct(COMMISSION_INITIAL_RATE)} of the first payment and ${pct(COMMISSION_RECURRING_RATE)} of the next ${COMMISSION_RECURRING_COUNT} monthly payments actually received.`}>
            {d.clients.length === 0 ? <Empty icon={Wallet}>No client payments yet. When a client you sold pays, it shows here the same day.</Empty> : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {d.clients.map((c) => (
                  <li key={c.leadId}>
                    <button type="button" onClick={() => navigate('/outreach', { state: leadLaunchState(c.leadId) })} disabled={!isAdmin}
                      className={cn('flex w-full flex-col gap-2 rounded-xl border border-border/60 p-3.5 text-left', isAdmin && 'hover:border-primary/40')}>
                      <span className="truncate text-sm font-semibold" title={c.business}>{c.business}</span>
                      <span className="grid grid-cols-3 gap-1 text-center">
                        <Stat k="Payments" v={String(c.payments)} tone="grey" />
                        <Stat k="Earned" v={gbp(c.earned - c.reversed)} tone="green" />
                        <Stat k="Still possible" v={gbp(c.remainingPotential)} tone="grey" />
                      </span>
                      <span className="text-[11px] text-muted-foreground">{!c.commissionable ? 'Sold by the admin — no commission' : c.commissionablePaymentsLeft > 0 ? `${c.commissionablePaymentsLeft} more commissionable monthly payment${c.commissionablePaymentsLeft === 1 ? '' : 's'}` : 'All commissionable payments received'}{c.subscriptionStatus ? ` · monthly ${c.subscriptionStatus.replace(/_/g, ' ')}` : ' · no monthly yet'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Every payment" icon={PiggyBank} tone="green" hint="Newest first. Each line is a real payment or refund recorded from Stripe.">
            {d.lines.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    {['Client', 'Payment', 'Date', 'Client paid', 'Rate', 'Commission', 'Status', 'Payout'].map((h, i) => <th key={h} className={cn('px-2 py-2 font-semibold', i >= 3 && i !== 6 && 'text-right')}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.lines.map((l) => (
                      <tr key={l.id} className="border-b border-border/30 last:border-0">
                        <td className="max-w-[12rem] truncate px-2 py-2 font-medium" title={bizOf.get(l.leadId)}>{bizOf.get(l.leadId) ?? 'Client'}</td>
                        <td className="px-2 py-2 text-muted-foreground">{l.label}</td>
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

          <details className="rounded-xl border border-border/60 bg-card/40 p-3.5 text-xs text-muted-foreground">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 font-semibold text-foreground"><Info className="h-3.5 w-3.5" />How commission works</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
              <li><b>Earned</b> the moment a client payment is received: {pct(COMMISSION_INITIAL_RATE)} of the first payment, {pct(COMMISSION_RECURRING_RATE)} of each of the next {COMMISSION_RECURRING_COUNT} monthly payments — always of the amount actually paid.</li>
              <li><b>Due</b>: paid on the first working day of the month after the payment (weekends and bank holidays move it to the next working day).</li>
              <li><b>Projected</b>: what future monthly payments would earn if they arrive. Never added to earned.</li>
              <li><b>Reversed</b>: a refund or chargeback takes back the commission on that money. If it was already paid out, it comes off future commission.</li>
              <li>Only money Stripe actually received counts. A failed payment earns nothing.</li>
            </ul>
          </details>
        </>
      )}

      {isAdmin && <PayoutDialog open={payoutOpen} onOpenChange={setPayoutOpen} sellers={(team.data ?? []).filter((m) => m.user_id !== user?.id).map((m) => ({ id: m.user_id, name: m.display_name }))} />}
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone: Tone }) {
  return <span className="rounded-lg bg-muted/40 px-1 py-1.5"><span className={cn('block text-sm font-bold tabular-nums', TONE[tone].text === 'text-muted-foreground' ? '' : TONE[tone].text)}>{v}</span><span className="block text-[10px] text-muted-foreground">{k}</span></span>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">{head.map((h, i) => <th key={h} className={cn('px-2 py-2 font-semibold', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border/30 last:border-0">{r.map((c, j) => <td key={j} className={cn('px-2 py-2', j === 0 ? 'font-medium' : 'text-right tabular-nums')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** The admin records a payout ACTUALLY MADE (money moved outside the app). Nothing is paid from here. */
function PayoutDialog({ open, onOpenChange, sellers }: { open: boolean; onOpenChange: (v: boolean) => void; sellers: { id: string; name: string }[] }) {
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
