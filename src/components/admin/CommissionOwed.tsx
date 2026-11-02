import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgePoundSterling, Check, ChevronDown, Clock, Loader2, RefreshCw, Sparkles, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Panel, SectionHeading, TONE, gbp } from '@/components/salesDash/ui';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { clientHubLink } from '@/lib/salesLinks';
import type { LinePaymentRow, OwedItem, OwedView } from '@/lib/commissionOwed';
import { SALE_PLAN_FLAG_WORDS, isSalePlanFlag } from '@/lib/salePlan';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/* ══ COMMISSION OWED + NEW PAID CLIENTS (Paul, 2026-11-02, docs/commission-owed.md) ═════════════════════════════════════════════
   As simple as possible: one big number, one row per person, the next payments with a countdown. Everything is worked out by the
   server (fn sales-earnings `owed`, src/lib/commissionOwed.ts). "Mark as paid" only RECORDS a bank transfer Paul has made: nothing
   here pays anybody. The server works the amount out again and refuses if it differs from what the screen showed.
   A salesperson reads the same answer scoped to themselves, with no buttons (MyCommissionOwed). */

export interface NewPaidClient {
  lead_id: string; business: string; plan: string | null; plan_words: string; amount_paid: number; seller_id: string | null;
  paid_at: string | null; missing: string[]; flag: string | null; test: boolean; refunded: boolean;
}
type History = (LinePaymentRow & { planWords: string })[];
export interface OwedResponse extends OwedView { ok: true; history: History; names: Record<string, string>; new_paid_clients: NewPaidClient[] }

export const owedKey = ['commission-owed'] as const;
export function useCommissionOwed(enabled = true) {
  return useQuery({ queryKey: owedKey, enabled, staleTime: 60_000, refetchOnWindowFocus: true, queryFn: () => invokeEdge<OwedResponse>('sales-earnings', { mode: 'owed' }) });
}

const dayWords = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '');
const pct = (r: number | null) => (r === null ? '' : `${Math.round(Number(r) * 100)}%`);

function Countdown({ item }: { item: OwedItem }) {
  const late = item.overdueDays > 0;
  const today = item.countdown === 'due today';
  return <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', late ? cn(TONE.red.soft, TONE.red.text) : today ? cn(TONE.amber.soft, TONE.amber.text) : cn(TONE.grey.soft, TONE.grey.text))} data-testid="owed-countdown">{item.countdown}</span>;
}

function FlagNote({ flag }: { flag: string | null }) {
  if (!isSalePlanFlag(flag)) return null;
  return <span className={cn('inline-flex items-center gap-1 text-xs', TONE.amber.text)} data-testid="plan-mismatch"><AlertTriangle className="h-3 w-3 shrink-0" />{SALE_PLAN_FLAG_WORDS[flag]}</span>;
}

function ItemRow({ item, name, action }: { item: OwedItem; name?: string; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 py-2.5 first:border-t-0" data-testid="owed-item">
      <div className="min-w-0 flex-1 basis-56">
        <Link to={clientHubLink(item.leadId)} className="font-medium hover:underline">{item.business}</Link>
        <p className="text-xs text-muted-foreground">{[item.planWords, item.label, name].filter(Boolean).join(' · ')}</p>
        <FlagNote flag={item.flag} />
      </div>
      {item.bucket !== 'waiting' && item.bucket !== 'held' && <Countdown item={item} />}
      <span className={cn('w-24 text-right font-semibold tabular-nums', item.amount < 0 && TONE.red.text)}>{item.amount < 0 ? `−${gbp(-item.amount)}` : gbp(item.amount)}</span>
      {action}
    </li>
  );
}

/** The one "are you sure", naming who, how much and for what. */
function ConfirmPaid({ target, onClose, onDone }: { target: { title: string; lines: OwedItem[]; total: number; person?: string; itemKey?: string; warning?: string | null } | null; onClose: () => void; onDone: (batchId: string, total: number) => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const confirm = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const r = await invokeEdge<{ batch_id: string; total: number }>('sales-earnings', { mode: 'mark_paid', expected_total: target.total, ...(target.itemKey ? { item_key: target.itemKey } : { person: target.person }) });
      onDone(r.batch_id, r.total);
    } catch (e) {
      toast({ title: 'Not recorded', description: edgeErrorMessage(e), variant: 'destructive' });
      void qc.invalidateQueries({ queryKey: owedKey });
      onClose();
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{target?.title}</DialogTitle>
          <DialogDescription>This only records a bank transfer you have made. Nothing is sent from here.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
          {target?.lines.map((l) => <li key={l.key} className="flex justify-between gap-3"><span className="min-w-0 truncate">{l.business} · {l.label}</span><span className="shrink-0 tabular-nums">{l.amount < 0 ? `−${gbp(-l.amount)}` : gbp(l.amount)}</span></li>)}
        </ul>
        {target?.warning && <p className={cn('text-xs', TONE.amber.text)}>{target.warning}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void confirm()} disabled={saving} data-testid="confirm-mark-paid">{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Yes, I paid {gbp(target?.total ?? 0)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaidHistory({ rows, nameOf, showPaidBy }: { rows: History; nameOf: (id: string) => string; showPaidBy?: boolean }) {
  if (!rows.length) return <p className="py-2 text-xs text-muted-foreground">Nothing paid yet.</p>;
  return (
    <div className="overflow-x-auto" data-testid="paid-history">
      <table className="w-full min-w-[34rem] text-xs">
        <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-2 font-medium">Paid</th><th className="py-1 pr-2 font-medium">Customer</th><th className="py-1 pr-2 font-medium">Plan</th><th className="py-1 pr-2 font-medium">For</th><th className="py-1 pr-2 text-right font-medium">Collected</th><th className="py-1 pr-2 text-right font-medium">Rate</th><th className="py-1 text-right font-medium">Paid</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/40">
              <td className="whitespace-nowrap py-1.5 pr-2">{dayWords(r.paid_at)}{showPaidBy ? ` · ${nameOf(r.paid_by)}` : ''}</td>
              <td className="py-1.5 pr-2">{r.business_name}</td>
              <td className="whitespace-nowrap py-1.5 pr-2">{r.planWords}</td>
              <td className="py-1.5 pr-2 text-muted-foreground">{r.label}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{r.client_amount_gbp === null ? '' : gbp(Number(r.client_amount_gbp))}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{pct(r.rate)}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{r.amount_gbp < 0 ? `−${gbp(-r.amount_gbp)}` : gbp(r.amount_gbp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuietList({ items, nameOf }: { items: OwedItem[]; nameOf?: (id: string) => string }) {
  if (!items.length) return null;
  const waiting = items.filter((i) => i.bucket === 'waiting');
  const held = items.filter((i) => i.bucket === 'held');
  const sum = (a: OwedItem[]) => a.reduce((s, i) => s + i.amount, 0);
  const Group = ({ title, why, rows, icon: I }: { title: string; why: string; rows: OwedItem[]; icon: typeof Clock }) => rows.length ? (
    <details className="group rounded-xl border border-border/50 px-3 py-2" data-testid={`quiet-${rows[0].bucket}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground">
        <I className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1">{title} ({rows.length})</span><span className="tabular-nums">{gbp(sum(rows))}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
      </summary>
      <p className="mt-1 text-xs text-muted-foreground">{why}</p>
      <ul className="mt-1">{rows.map((i) => <ItemRow key={i.key} item={i} name={nameOf?.(i.sellerId)} />)}</ul>
    </details>
  ) : null;
  return (
    <div className="mt-3 space-y-2">
      <Group title="Waiting for four-week audit" why="Payable 7 days after the client’s four-week results are sent (14 on older agreements). There is no date until then." rows={waiting} icon={Clock} />
      <Group title="Held for a dispute" why="A dispute is open at the bank. Won, it comes back. Lost, it is taken off." rows={held} icon={AlertTriangle} />
    </div>
  );
}

export function CommissionOwedSection() {
  const q = useCommissionOwed();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<React.ComponentProps<typeof ConfirmPaid>['target']>(null);
  /* Undo lives for this session only (Paul): the screen forgets it on reload. */
  const [lastPaid, setLastPaid] = useState<{ batchId: string; total: number; title: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const d = q.data;
  const nameOf = useMemo(() => (id: string) => d?.names[id] ?? 'Former member', [d]);
  const refresh = () => qc.invalidateQueries({ queryKey: owedKey });
  const undo = async () => {
    if (!lastPaid) return;
    setUndoing(true);
    try { await invokeEdge('sales-earnings', { mode: 'undo_paid', batch_id: lastPaid.batchId }); setLastPaid(null); await refresh(); toast({ title: 'Undone. It is owed again.' }); }
    catch (e) { toast({ title: 'Not undone', description: edgeErrorMessage(e), variant: 'destructive' }); }
    finally { setUndoing(false); }
  };
  if (q.isLoading) return <section><SectionHeading title="Commission owed" tone="green" /><p className="flex items-center gap-2 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Adding up what you owe…</p></section>;
  if (q.isError || !d) return (
    <section><SectionHeading title="Commission owed" tone="green" />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" />Could not load: {edgeErrorMessage(q.error)}<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>
    </section>
  );
  const nowItems = d.next.filter((i) => i.bucket === 'now');
  const list = showAll ? d.next : d.next.slice(0, 8);
  return (
    <section className="space-y-3" data-testid="commission-owed">
      <SectionHeading title="Commission owed" tone="green" />
      <Panel title="You owe right now" icon={BadgePoundSterling} tone="green" hint="Money due to pay today or overdue. You pay it yourself by bank transfer, then mark it here."
        action={<Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Refresh" onClick={() => void q.refetch()}><RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} /></Button>}>
        <p className="text-4xl font-bold tracking-tight tabular-nums" data-testid="owed-total">{gbp(d.totalOwedNow)}</p>

        {lastPaid && (
          <p className={cn('mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm', TONE.green.soft)} data-testid="undo-paid">
            <Check className="h-4 w-4 shrink-0" />Marked {gbp(lastPaid.total)} as paid ({lastPaid.title}).
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" disabled={undoing} onClick={() => void undo()}>{undoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}Undo</Button>
          </p>
        )}

        {/* ── Per person ── */}
        {d.people.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No salesperson has earned commission yet.</p> : (
          <div className="mt-4 space-y-2" data-testid="owed-people">
            {d.people.map((p) => {
              const hist = d.history.filter((h) => h.user_id === p.sellerId);
              const mineNow = nowItems.filter((i) => i.sellerId === p.sellerId);
              return (
                <div key={p.sellerId} className="rounded-xl border border-border/60 px-3 py-2.5" data-testid="owed-person">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <button type="button" className="flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-left font-semibold" onClick={() => setOpen(open === p.sellerId ? null : p.sellerId)} aria-expanded={open === p.sellerId}>
                      <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open === p.sellerId && 'rotate-180')} /><span className="truncate">{nameOf(p.sellerId)}</span>
                    </button>
                    <div className="text-right"><p className="text-[11px] text-muted-foreground">Owed now</p><p className={cn('font-bold tabular-nums', p.owedNow > 0 && TONE.green.text)}>{gbp(p.owedNow)}</p></div>
                    <div className="text-right"><p className="text-[11px] text-muted-foreground">Coming soon</p><p className="tabular-nums">{gbp(p.comingSoon)}</p></div>
                    <div className="text-right"><p className="text-[11px] text-muted-foreground">Paid so far</p><p className="tabular-nums">{gbp(p.paidSoFar)}</p></div>
                    <Button size="sm" className="h-9" disabled={p.owedNow <= 0} data-testid="mark-person-paid"
                      onClick={() => setConfirm({ title: `Mark ${gbp(p.owedNow)} as paid to ${nameOf(p.sellerId)}?`, lines: mineNow, total: p.owedNow, person: p.sellerId })}>Mark as paid</Button>
                  </div>
                  {p.carriedOffset < 0 && <p className={cn('mt-1.5 text-xs', TONE.red.text)}>{gbp(-p.carriedOffset)} from a refund after payout comes off their next commission.</p>}
                  {open === p.sellerId && <div className="mt-2 border-t border-border/50 pt-2"><p className="mb-1 text-xs font-semibold">Paid so far</p><PaidHistory rows={hist} nameOf={nameOf} /></div>}
                </div>
              );
            })}
          </div>
        )}

        {/* ── The next payments ── */}
        <h3 className="mt-5 text-sm font-semibold">Next payments</h3>
        {d.next.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nothing with a date yet.</p> : (
          <ul className="mt-1" data-testid="owed-next">
            {list.map((i) => {
              const offset = d.people.find((p) => p.sellerId === i.sellerId)?.carriedOffset ?? 0;
              const hasOffset = offset < 0 || d.next.some((x) => x.sellerId === i.sellerId && x.amount < 0);
              return (
                <ItemRow key={i.key} item={i} name={nameOf(i.sellerId)} action={i.amount > 0 ? (
                  <Button size="sm" variant="outline" className="h-8" data-testid="mark-line-paid"
                    onClick={() => setConfirm({ title: `Mark ${gbp(i.amount)} as paid to ${nameOf(i.sellerId)}?`, lines: [i], total: i.amount, itemKey: i.key,
                      warning: i.bucket === 'soon' ? `Not due until ${dayWords(i.payableOn)}. If the client is refunded after you pay, it comes off their next commission.` : hasOffset ? 'They have a refund to offset. Marking the person as paid takes it off. Marking this line alone does not.' : null })}>Mark as paid</Button>
                ) : <span className="h-8 w-[6.5rem] text-center text-xs leading-8 text-muted-foreground">comes off next</span>} />
              );
            })}
          </ul>
        )}
        {d.next.length > 8 && <Button size="sm" variant="ghost" className="mt-1 h-8" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${d.next.length}`}</Button>}

        <QuietList items={d.quiet} nameOf={nameOf} />
      </Panel>
      <ConfirmPaid target={confirm} onClose={() => setConfirm(null)} onDone={(batchId, total) => { setLastPaid({ batchId, total, title: confirm?.title.replace(/^Mark .* as paid to (.*)\?$/, '$1') ?? '' }); setConfirm(null); void refresh(); }} />
    </section>
  );
}

export function NewPaidClientsSection() {
  const q = useCommissionOwed();
  const [showAll, setShowAll] = useState(false);
  const rows = q.data?.new_paid_clients ?? [];
  const nameOf = (id: string | null) => (id ? q.data?.names[id] ?? 'Former member' : 'Self-service');
  if (q.isLoading || q.isError) return null;
  return (
    <section className="space-y-3" data-testid="new-paid-clients">
      <SectionHeading title="New paid clients" tone="blue" />
      <Panel title="Newest first" icon={Sparkles} tone="blue" hint="Click one to open it.">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No paid clients yet.</p> : (
          <ul>
            {(showAll ? rows : rows.slice(0, 8)).map((c) => (
              <li key={c.lead_id} className="border-t border-border/50 first:border-t-0">
                <Link to={clientHubLink(c.lead_id)} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 hover:bg-muted/30" data-testid="new-paid-client">
                  <span className="min-w-0 flex-1 basis-52">
                    <span className="font-medium">{c.business}</span>
                    {c.test && <span className={cn('ml-1.5 rounded px-1 text-[10px] font-semibold', TONE.grey.soft, TONE.grey.text)}>test</span>}
                    {c.refunded && <span className={cn('ml-1.5 rounded px-1 text-[10px] font-semibold', TONE.red.soft, TONE.red.text)}>refunded</span>}
                    <span className="block text-xs text-muted-foreground">{c.plan_words} · {nameOf(c.seller_id)} · {dayWords(c.paid_at)}</span>
                    <FlagNote flag={c.flag} />
                  </span>
                  <span className="w-20 text-right font-semibold tabular-nums">{gbp(c.amount_paid)}</span>
                  {c.missing.length === 0
                    ? <span className={cn('w-44 text-xs font-medium', TONE.green.text)} data-testid="handoff-complete-chip">Handoff complete</span>
                    : <span className={cn('w-44 text-xs', TONE.amber.text)} data-testid="handoff-missing-chip">Missing: {c.missing.join(', ')}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 8 && <Button size="sm" variant="ghost" className="mt-1 h-8" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</Button>}
      </Panel>
    </section>
  );
}

/** The salesperson's own view: the same answer, scoped to them by the server, with no buttons and nobody else in it. */
export function MyCommissionOwed() {
  const q = useCommissionOwed();
  const d = q.data;
  if (q.isLoading) return null;
  if (q.isError || !d) return <p className="flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" />Could not load what you are owed: {edgeErrorMessage(q.error)}</p>;
  const me = d.people[0] ?? null;
  return (
    <Panel collapseKey="sales.my-commission-owed" title="Your payments" icon={BadgePoundSterling} tone="green" hint="What you are owed and when. Paul pays it by bank transfer.">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div><p className="text-[11px] text-muted-foreground">Owed now</p><p className="text-2xl font-bold tabular-nums">{gbp(me?.owedNow ?? 0)}</p></div>
        <div><p className="text-[11px] text-muted-foreground">Coming soon</p><p className="text-2xl font-semibold tabular-nums">{gbp(me?.comingSoon ?? 0)}</p></div>
        <div><p className="text-[11px] text-muted-foreground">Paid so far</p><p className="text-2xl font-semibold tabular-nums">{gbp(me?.paidSoFar ?? 0)}</p></div>
      </div>
      {me && me.carriedOffset < 0 && <p className={cn('mt-2 text-xs', TONE.red.text)}>{gbp(-me.carriedOffset)} from a refund after payout comes off your next commission.</p>}
      {d.next.length > 0 && <ul className="mt-3">{d.next.map((i) => <ItemRow key={i.key} item={i} />)}</ul>}
      <QuietList items={d.quiet} />
      <details className="mt-3 rounded-xl border border-border/50 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">What you have been paid</summary><div className="mt-2"><PaidHistory rows={d.history} nameOf={() => ''} /></div></details>
    </Panel>
  );
}
