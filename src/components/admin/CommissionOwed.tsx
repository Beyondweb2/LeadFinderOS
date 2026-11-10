import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, BadgePoundSterling, Check, ChevronDown, Clock, FileCheck2, Loader2, Mail, Phone, RefreshCw, Sparkles, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Panel, SectionHeading, TONE, gbp } from '@/components/salesDash/ui';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { clientHubLink } from '@/lib/salesLinks';
import type { LinePaymentRow, OwedItem, OwedSale, OwedView } from '@/lib/commissionOwed';
import { SALE_PLAN_FLAG_WORDS, isSalePlanFlag } from '@/lib/salePlan';
import { stripeCheckWords, type StripeCheckRow } from '@/lib/commissionReconcile';
import { agreementWords, type PaidClientRecord } from '@/lib/paidClientRecord';
import { splitArchived } from '@/lib/paidClientArchive';
import { FIRST_PAYMENT_LADDER, LATER_PAYMENT_RATE, ONE_PAYMENT_COMMISSION } from '@/lib/commissionConfig';
import { usePaidClientArchive } from '@/hooks/usePaidClientArchive';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/* ══ COMMISSION OWED + NEW PAID CLIENTS (Paul, 2026-11-02, docs/commission-owed.md) ═════════════════════════════════════════════
   As simple as possible: one big number, one row per person, the next payments with a countdown. Everything is worked out by the
   server (fn sales-earnings `owed`, src/lib/commissionOwed.ts). "Mark as paid" only RECORDS a bank transfer Paul has made: nothing
   here pays anybody. The server works the amount out again and refuses if it differs from what the screen showed.
   A salesperson reads the same answer scoped to themselves, with no buttons (MyCommissionOwed). */

export interface NewPaidClient {
  lead_id: string; business: string; plan: string | null; plan_words: string; amount_paid: number; seller_id: string | null;
  /** The seller is held for Paul's attribution review (or decided as nobody's): never shown as "Self-service". */
  seller_pending?: 'awaiting_attribution' | 'not_credited' | null;
  paid_at: string | null; missing: string[]; flag: string | null; test: boolean; refunded: boolean; record: PaidClientRecord;
}
type History = (LinePaymentRow & { planWords: string })[];
export interface OwedResponse extends OwedView { ok: true; history: History; names: Record<string, string>; new_paid_clients: NewPaidClient[]; stripe_check?: StripeCheckRow | null }

export const owedKey = ['commission-owed'] as const;
export function useCommissionOwed(enabled = true) {
  return useQuery({ queryKey: owedKey, enabled, staleTime: 60_000, refetchOnWindowFocus: true, queryFn: () => invokeEdge<OwedResponse>('sales-earnings', { mode: 'owed' }) });
}

const dayWords = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '');

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
        <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-2 font-medium">Paid</th><th className="py-1 pr-2 font-medium">Customer</th><th className="py-1 pr-2 font-medium">Plan</th><th className="py-1 pr-2 font-medium">For</th><th className="py-1 pr-2 text-right font-medium">Collected</th><th className="py-1 text-right font-medium">Paid</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/40">
              <td className="whitespace-nowrap py-1.5 pr-2">{dayWords(r.paid_at)}{showPaidBy ? ` · ${nameOf(r.paid_by)}` : ''}</td>
              <td className="py-1.5 pr-2">{r.business_name}</td>
              <td className="whitespace-nowrap py-1.5 pr-2">{r.planWords}</td>
              <td className="py-1.5 pr-2 text-muted-foreground">{r.label}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{r.client_amount_gbp === null ? '' : gbp(Number(r.client_amount_gbp))}</td>
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
      <Group title="Waiting for four-week audit" why="Payable the day after the client’s guarantee window closes. The window is 7 days from when their four-week audit is sent (14 on older agreements). There is no date until it is sent. If they claim, nothing on the sale is payable." rows={waiting} icon={Clock} />
      <Group title="Held for a dispute" why="A dispute is open at the bank. Won, it comes back. Lost, it is taken off." rows={held} icon={AlertTriangle} />
    </div>
  );
}

/** Each sale, in plain words: the plan, how many of its payments have earned, the pounds so far. Paul can record a guarantee claim here. */
function SaleRows({ sales, onClaim }: { sales: OwedSale[]; onClaim?: (s: OwedSale) => void }) {
  if (!sales.length) return <p className="py-1 text-xs text-muted-foreground">No sales on these rules yet.</p>;
  return (
    <ul data-testid="owed-sales">
      {sales.map((s) => (
        <li key={s.leadId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 py-2 first:border-t-0" data-testid="owed-sale">
          <div className="min-w-0 flex-1 basis-56">
            <Link to={clientHubLink(s.leadId)} className="text-sm font-medium hover:underline">{s.business}</Link>
            <p className="text-xs text-muted-foreground" data-testid="owed-sale-progress">{s.progress}</p>
          </div>
          {s.bonusWords && <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', TONE.amber.soft, TONE.amber.text)} data-testid="owed-sale-bonus">{s.bonusWords}</span>}
          {onClaim && s.claim !== 'refunded' && (s.claim === 'marked' || s.windowOpen) && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" data-testid="owed-sale-claim" onClick={() => onClaim(s)}>{s.claim === 'marked' ? 'Undo claim' : 'Client claimed'}</Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Did today's figures get checked against Stripe? Quiet when clean, loud when not. */
function StripeCheckLine({ check }: { check: StripeCheckRow | null | undefined }) {
  const w = stripeCheckWords(check, Date.now());
  const needs = check?.needs_you ?? [];
  const changes = check?.changes ?? [];
  const cls = w.tone === 'good' ? 'text-muted-foreground' : w.tone === 'attention' ? TONE.amber.text : TONE.red.text;
  if (!needs.length && !changes.length) return <p className={cn('mt-2 text-xs', cls)} data-testid="stripe-check">{w.text}</p>;
  return (
    <details className="mt-2 text-xs" data-testid="stripe-check">
      <summary className={cn('cursor-pointer', cls)}>{w.text}</summary>
      {needs.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4" data-testid="stripe-check-needs">{needs.map((n, i) => <li key={`${n.object}${i}`} className="break-words">{n.detail}</li>)}</ul>}
      {changes.length > 0 && <><p className="mt-1.5 font-medium">Fixed in that run</p><ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">{changes.map((c, i) => <li key={i} className="break-words">{c.what}</li>)}</ul></>}
    </details>
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
  const [claimOf, setClaimOf] = useState<OwedSale | null>(null);
  const [claimSaving, setClaimSaving] = useState(false);
  const d = q.data;
  const nameOf = useMemo(() => (id: string) => d?.names[id] ?? 'Former member', [d]);
  const refresh = () => qc.invalidateQueries({ queryKey: owedKey });
  const saveClaim = async () => {
    if (!claimOf) return;
    setClaimSaving(true);
    try { await invokeEdge('sales-earnings', { mode: 'set_claim', lead_id: claimOf.leadId, claimed: claimOf.claim !== 'marked' }); setClaimOf(null); await refresh(); }
    catch (e) { toast({ title: 'Not saved', description: edgeErrorMessage(e), variant: 'destructive' }); }
    finally { setClaimSaving(false); }
  };
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
  return (
    <section className="space-y-3" data-testid="commission-owed">
      <SectionHeading title="Commission owed" tone="green" />
      <Panel title="You owe right now" icon={BadgePoundSterling} tone="green" hint="Money due to pay today or overdue. You pay it yourself by bank transfer, then mark it here."
        action={<Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Refresh" onClick={() => void q.refetch()}><RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} /></Button>}>
        <p className="text-4xl font-bold tracking-tight tabular-nums" data-testid="owed-total">{gbp(d.totalOwedNow)}</p>
        {/* The rate card, from the constants that pay it (commissionConfig.ts; the signed contract, Paul 2026-11-10). */}
        <p className="mt-1 text-xs text-muted-foreground" data-testid="owed-rate-card">
          What a sale earns: first payment {FIRST_PAYMENT_LADDER.map((s) => `£${s.pounds}`).join(' / ')} by that person’s sales in the month ({FIRST_PAYMENT_LADDER.map((s, i) => { const from = i === 0 ? 1 : FIRST_PAYMENT_LADDER[i - 1].upTo + 1; return Number.isFinite(s.upTo) ? `${from}–${s.upTo}` : `${from}+`; }).join(' / ')}), then {Math.round(LATER_PAYMENT_RATE * 100)}% of each later plan payment. Complete up front £{ONE_PAYMENT_COMMISSION.complete_upfront}, Essential in full £{ONE_PAYMENT_COMMISSION.full}. Nothing on hosting after the plan.
        </p>
        <StripeCheckLine check={d.stripe_check} />

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
              const mineNext = d.next.filter((i) => i.sellerId === p.sellerId);
              return (
                <div key={p.sellerId} className="rounded-xl border border-border/60 px-3 py-2.5" data-testid="owed-person">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <button type="button" className="flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-left font-semibold" onClick={() => setOpen(open === p.sellerId ? null : p.sellerId)} aria-expanded={open === p.sellerId}>
                      <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open === p.sellerId && 'rotate-180')} /><span className="truncate">{nameOf(p.sellerId)}</span>
                    </button>
                    <div className="text-right"><p className="text-[11px] text-muted-foreground">Owed now</p><p className={cn('font-bold tabular-nums', p.owedNow > 0 && TONE.green.text)}>{gbp(p.owedNow)}</p></div>
                    <div className="text-right"><p className="text-[11px] text-muted-foreground">Paid so far</p><p className="tabular-nums">{gbp(p.paidSoFar)}</p></div>
                    <Button size="sm" className="h-9" disabled={p.owedNow <= 0} data-testid="mark-person-paid"
                      onClick={() => setConfirm({ title: `Mark ${gbp(p.owedNow)} as paid to ${nameOf(p.sellerId)}?`, lines: mineNow, total: p.owedNow, person: p.sellerId })}>Mark as paid</Button>
                  </div>
                  {p.carriedOffset < 0 && <p className={cn('mt-1.5 text-xs', TONE.red.text)}>{gbp(-p.carriedOffset)} from a refund after payout comes off their next commission.</p>}
                  {/* ── This person's next payments ── */}
                  {mineNext.length > 0 && (
                    <ul className="mt-2 border-t border-border/50 pt-1" data-testid="owed-next">
                      {mineNext.map((i) => (
                        <ItemRow key={i.key} item={i} action={i.amount > 0 ? (
                          <Button size="sm" variant="outline" className="h-8" data-testid="mark-line-paid"
                            onClick={() => setConfirm({ title: `Mark ${gbp(i.amount)} as paid to ${nameOf(i.sellerId)}?`, lines: [i], total: i.amount, itemKey: i.key,
                              warning: i.bucket === 'soon' ? `Not due until ${dayWords(i.payableOn)}. If the client is refunded after you pay, it comes off their next commission.` : mineNext.some((x) => x.amount < 0) || p.carriedOffset < 0 ? 'They have a refund to offset. Marking the person as paid takes it off. Marking this line alone does not.' : null })}>Mark as paid</Button>
                        ) : <span className="h-8 w-[6.5rem] text-center text-xs leading-8 text-muted-foreground">comes off next</span>} />
                      ))}
                    </ul>
                  )}
                  {open === p.sellerId && (
                    <div className="mt-2 space-y-3 border-t border-border/50 pt-2">
                      <div><p className="mb-1 text-xs font-semibold">Their sales</p><SaleRows sales={d.sales.filter((s) => s.sellerId === p.sellerId)} onClaim={setClaimOf} /></div>
                      <div><p className="mb-1 text-xs font-semibold">Paid so far</p><PaidHistory rows={hist} nameOf={nameOf} /></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <QuietList items={d.quiet} nameOf={nameOf} />
      </Panel>
      <ConfirmPaid target={confirm} onClose={() => setConfirm(null)} onDone={(batchId, total) => { setLastPaid({ batchId, total, title: confirm?.title.replace(/^Mark .* as paid to (.*)\?$/, '$1') ?? '' }); setConfirm(null); void refresh(); }} />
      <Dialog open={!!claimOf} onOpenChange={(v) => { if (!v) setClaimOf(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{claimOf?.claim === 'marked' ? `Take back the claim on ${claimOf.business}?` : `Record a guarantee claim from ${claimOf?.business}?`}</DialogTitle>
            <DialogDescription>{claimOf?.claim === 'marked' ? 'Their commission goes back to how it was.' : 'Nothing on this sale will be payable. This only records what the client told you. It refunds nobody: you do that in Stripe.'}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClaimOf(null)} disabled={claimSaving}>Cancel</Button>
            <Button onClick={() => void saveClaim()} disabled={claimSaving} data-testid="confirm-claim">{claimSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{claimOf?.claim === 'marked' ? 'Yes, take it back' : 'Yes, they claimed'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** One new client: who to ring, and everything the sale recorded. There is no form behind this: it is what was typed as it was typed.
 *  Archive puts the row away (a mark, src/lib/paidClientArchive.ts): the client, the payment and the commission are untouched. */
function PaidClientRow({ c, sellerName, archived, busy, onArchive, onRestore }: { c: NewPaidClient; sellerName: string; archived: boolean; busy: boolean; onArchive: () => void; onRestore: () => void }) {
  const [open, setOpen] = useState(false);
  const r = c.record;
  const hasMore = r.lines.length > 0 || r.notes.length > 0;
  return (
    <li className={cn('border-t border-border/50 py-2.5 first:border-t-0', archived && 'opacity-70')} data-testid="new-paid-client" data-archived={archived ? 'true' : 'false'}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1 basis-52">
          <Link to={clientHubLink(c.lead_id)} className="font-medium hover:underline">{c.business}</Link>
          {c.test && <span className={cn('ml-1.5 rounded px-1 text-[10px] font-semibold', TONE.grey.soft, TONE.grey.text)}>test</span>}
          {c.refunded && <span className={cn('ml-1.5 rounded px-1 text-[10px] font-semibold', TONE.red.soft, TONE.red.text)}>refunded</span>}
          {archived && <span className={cn('ml-1.5 rounded px-1 text-[10px] font-semibold', TONE.grey.soft, TONE.grey.text)}>archived</span>}
          <span className="block text-xs text-muted-foreground">{c.plan_words} · {sellerName} · {dayWords(c.paid_at)}</span>
          <FlagNote flag={c.flag} />
        </div>
        <span className="w-20 text-right font-semibold tabular-nums">{gbp(c.amount_paid)}</span>
        {archived
          ? <Button size="sm" variant="outline" className="h-9 gap-1" disabled={busy} onClick={onRestore} data-testid="new-paid-restore"><Undo2 className="h-3.5 w-3.5" />Restore</Button>
          : <Button size="sm" variant="ghost" className="h-9 gap-1 text-muted-foreground hover:text-foreground" disabled={busy} onClick={onArchive} aria-label={`Archive ${c.business}`} title="Put this client away. Nothing is deleted: Show archived brings it back." data-testid="new-paid-archive"><Archive className="h-3.5 w-3.5" />Archive</Button>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid="new-paid-contact">
        {r.contactName && <span className="font-medium">{r.contactName}</span>}
        {r.phone ? <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{r.phone}</a> : <span className={cn('text-xs', TONE.amber.text)}>No phone</span>}
        {r.email ? <a href={`mailto:${r.email}`} className="inline-flex min-w-0 items-center gap-1 break-all text-primary hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" />{r.email}</a> : <span className={cn('text-xs', TONE.amber.text)}>No email</span>}
      </div>
      {/* The signed agreement, on the row (2026-11-10): who signed, which version, when. The PDF is on the client's page. */}
      {r.agreement
        ? <p className="mt-1 text-xs text-muted-foreground" data-testid="new-paid-agreement"><FileCheck2 className={cn('mr-1.5 inline h-3.5 w-3.5 align-text-bottom', TONE.green.text)} />{agreementWords(r.agreement)} · {dayWords(r.agreement.at)} · <Link to={clientHubLink(c.lead_id)} className="font-medium text-primary hover:underline">signed copy</Link></p>
        : r.agreement === null && <p className={cn('mt-1 flex items-center gap-1.5 text-xs', TONE.amber.text)} data-testid="new-paid-agreement-none"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />No signed agreement on record</p>}
      {c.missing.length > 0 && <p className={cn('mt-1 text-xs', TONE.amber.text)} data-testid="new-paid-missing">Not recorded: {c.missing.join(', ')}</p>}
      {hasMore && (
        <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="new-paid-more">
          <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />Everything from the sale
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-muted/30 px-3 py-2 text-sm" data-testid="new-paid-record">
          {r.website && <p className="break-all text-xs"><span className="text-muted-foreground">Website </span>{r.website}</p>}
          {r.lines.length > 0 && <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">{r.lines.map((l) => <div key={l.label} className="contents"><dt className="text-muted-foreground">{l.label}</dt><dd className="break-words">{l.value}</dd></div>)}</dl>}
          {r.notes.length > 0 && <div><p className="text-xs font-semibold">Notes</p><ul className="mt-0.5 space-y-1 text-xs">{r.notes.map((n, i) => <li key={`${n.at}${i}`} className="break-words"><span className="text-muted-foreground">{dayWords(n.at)}: </span>{n.text}</li>)}</ul></div>}
        </div>
      )}
    </li>
  );
}

export function NewPaidClientsSection() {
  const q = useCommissionOwed();
  const arc = usePaidClientArchive();
  const { toast } = useToast();
  const [showAll, setShowAll] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const all = q.data?.new_paid_clients;
  const { live, archived } = useMemo(() => splitArchived(all ?? [], (c) => c.lead_id, arc.archived), [all, arc.archived]);
  const sellerOf = (c: NewPaidClient) => (c.seller_pending === 'awaiting_attribution' ? 'Seller awaiting your review' : c.seller_pending === 'not_credited' ? 'Not credited to a salesperson'
    : c.seller_id ? q.data?.names[c.seller_id] ?? 'Former member' : 'Self-service');
  const busy = arc.archive.isPending || arc.restore.isPending;
  const failed = (what: string) => (e: unknown) => toast({ title: `Could not ${what}`, description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
  const archive = (c: NewPaidClient) => arc.archive.mutate(c.lead_id, { onSuccess: () => toast({ title: `${c.business} archived`, description: 'Nothing was deleted. Show archived brings it back.' }), onError: failed('archive it') });
  const restore = (c: NewPaidClient) => arc.restore.mutate(c.lead_id, { onError: failed('restore it') });
  if (q.isLoading || q.isError) return null;
  const row = (c: NewPaidClient, isArchived: boolean) => <PaidClientRow key={c.lead_id} c={c} sellerName={sellerOf(c)} archived={isArchived} busy={busy} onArchive={() => archive(c)} onRestore={() => restore(c)} />;
  return (
    <section className="space-y-3" data-testid="new-paid-clients">
      <SectionHeading title="New paid clients" tone="blue" />
      <Panel title="Newest first" icon={Sparkles} tone="blue" hint="Who to ring, and everything the salesperson typed. Click a name to open the client. Archive puts a test or finished client away; nothing is deleted.">
        {arc.isError && <p className={cn('mb-2 flex items-center gap-1.5 text-xs', TONE.amber.text)} data-testid="new-paid-archive-error"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Could not read which clients you archived, so all of them are shown.</p>}
        {live.length === 0 ? <p className="text-sm text-muted-foreground">{archived.length === 0 ? 'No paid clients yet.' : 'Every paid client here is archived.'}</p> : (
          <ul>{(showAll ? live : live.slice(0, 8)).map((c) => row(c, false))}</ul>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {live.length > 8 && <Button size="sm" variant="ghost" className="h-9" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${live.length}`}</Button>}
          {archived.length > 0 && <Button size="sm" variant="ghost" className="h-9 gap-1" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)} data-testid="new-paid-show-archived"><Archive className="h-3.5 w-3.5" />{showArchived ? 'Hide archived' : `Show archived (${archived.length})`}</Button>}
        </div>
        {showArchived && archived.length > 0 && <ul className="mt-1 border-t border-border/50" data-testid="new-paid-archived-list">{archived.map((c) => row(c, true))}</ul>}
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
      {d.next.length > 0 && <div className="mt-3"><p className="text-sm font-semibold">Next payments</p><ul data-testid="my-next">{d.next.map((i) => <ItemRow key={i.key} item={i} />)}</ul></div>}
      <QuietList items={d.quiet} />
      {d.sales.length > 0 && <div className="mt-3"><p className="text-sm font-semibold">Your sales</p><SaleRows sales={d.sales} /></div>}
      <details className="mt-3 rounded-xl border border-border/50 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">What you have been paid</summary><div className="mt-2"><PaidHistory rows={d.history} nameOf={() => ''} /></div></details>
    </Panel>
  );
}
