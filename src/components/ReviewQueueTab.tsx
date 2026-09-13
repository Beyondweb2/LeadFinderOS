/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REVIEW TAB — bottom right, on every screen, until Paul decides.

   🔴 WHY (2026-09-13). White Sparks finished both its audits and nothing anywhere said so. The
   Deliver card's `baseline_checked` tick is a record that he did it, never a prompt.

   ⛔ IT LIVES IN AppLayout, WHICH MOUNTS ONCE. Before the 2026-08-28 layout route there were
   fifteen <AppLayout> wrappers and the shell remounted on every navigation (§6c) — a floating tab
   then could only ever have been restored from storage after the fact, flickering on every click.
   It survives navigation now by construction rather than by being put back.

   ⛔ IT IS NOT A DIALOG AND MUST NOT BECOME ONE. §6c's rule: never persist an open dialog, because
   a modal springing open on return blocks the page you came back for. This is a docked panel that
   never covers the page, is collapsible, and — the part that matters — does not steal focus or
   block a single click anywhere in the app. Paul asked that he "cannot navigate away from it": that
   is met by it being present on EVERY screen, not by trapping him on one.

   ⛔ AND IT SHOWS COUNTS, NEVER A VERDICT. See reviewQueue.ts: a computed "nothing winnable" would
   be a one-run sampling problem wearing a number's clothes, deciding a refund.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, Check, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useReviewQueue, type ReviewItem } from '@/hooks/useReviewQueue';
import { BAND_LABEL } from '@/lib/baselineView';
import {
  REVIEW_BAND_ORDER, REVIEW_CONFIRM_KEY, REVIEW_DISMISSED_KEY,
  refundPatch, refundReasonOk, MIN_REFUND_REASON_CHARS,
} from '@/lib/reviewQueue';

export function ReviewQueueTab() {
  const { items, error } = useReviewQueue();
  const { toast } = useToast();
  const qc = useQueryClient();
  const client = supabase as unknown as SupabaseClient;

  /* ⛔ COLLAPSED-NESS IS CONFIGURATION, SO IT PERSISTS; the ENTRIES never do — they are derived from
     the database every time, so a decision made in another tab cannot leave a stale card on screen.
     Session, not local: a new day should open the tab, not remember that it was shut yesterday. */
  const [collapsed, setCollapsed] = usePersistedState<boolean>('review-tab-collapsed', false, { tier: 'session' });
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['review-queue-leads'] });
    void qc.invalidateQueries({ queryKey: ['client-delivery-leads'] });
    void qc.invalidateQueries({ queryKey: ['outreach-leads'] });
  };

  /** Confirm and dismiss both merge one key into delivery_checklist, never replace the map. */
  const setChecklistKey = async (item: ReviewItem, key: string, label: string) => {
    setBusy(item.leadId);
    try {
      /* ⚠️ READ-MODIFY-WRITE ON A jsonb MAP. Writing { [key]: true } alone would DELETE every other
         milestone on that client — the pages ticks, the directories tick, the whole cockpit. */
      const { data: cur, error: rErr } = await client
        .from('outreach_leads').select('delivery_checklist').eq('id', item.leadId).maybeSingle();
      if (rErr) throw rErr;
      const next = { ...((cur as { delivery_checklist?: Record<string, boolean> } | null)?.delivery_checklist ?? {}), [key]: true };
      const { error } = await client.from('outreach_leads').update({ delivery_checklist: next }).eq('id', item.leadId);
      if (error) throw error;
      toast({ title: label, description: item.businessName });
      refresh();
    } catch (e) {
      toast({ title: 'That did not save', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const doRefund = async (item: ReviewItem) => {
    setBusy(item.leadId);
    try {
      const { data: cur, error: rErr } = await client
        .from('outreach_leads').select('amount_paid').eq('id', item.leadId).maybeSingle();
      if (rErr) throw rErr;
      const patch = refundPatch(cur as { amount_paid: number | null }, reason, new Date().toISOString());
      const { error } = await client.from('outreach_leads').update(patch).eq('id', item.leadId);
      if (error) throw error;
      toast({
        title: 'Recorded as refunded',
        description: `${item.businessName} — now refund them in Stripe. Nothing here moved any money.`,
      });
      setRefundFor(null);
      setReason('');
      refresh();
    } catch (e) {
      toast({ title: 'That did not save', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  /* ⚠️ A FAILED READ IS SHOWN, NOT SWALLOWED. An empty tab and a broken tab look identical
     otherwise, and this surface exists precisely to be the thing that tells him. */
  if (error) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-lg border border-destructive/40 bg-background p-3 shadow-lg">
        <p className="flex items-center gap-2 text-xs font-semibold text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> Review queue unavailable
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Could not read who is waiting. This is not "nobody is waiting".
        </p>
      </div>
    );
  }

  /* Nothing waiting renders nothing at all. A permanent "0 to review" chip is furniture, and
     furniture is what people stop seeing. */
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-amber-500/40 bg-background shadow-xl">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between gap-2 bg-amber-500/10 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold">
          {items.length} baseline{items.length === 1 ? '' : 's'} to review
        </span>
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {!collapsed && (
        <div className="max-h-[60vh] overflow-y-auto">
          {items.map((item) => {
            const v = item.view;
            const isRefunding = refundFor === item.leadId;
            return (
              <div key={item.leadId} className="border-t p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight">{item.businessName}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    ready {new Date(item.readyAt).toLocaleDateString('en-GB')}
                  </span>
                </div>

                {/* The numbers the decision is made on, with no verdict attached. */}
                {v ? (
                  <>
                    <p className="mt-1.5 text-xs">
                      <span className="font-semibold">
                        {v.namedRatePct === null ? '—' : `${v.namedRatePct.toFixed(0)}%`}
                      </span>{' '}
                      <span className="text-muted-foreground">
                        named · {v.namedCells} of {v.answeredCells} answers
                      </span>
                    </p>
                    {/* ⛔ ALL FIVE BANDS, WORST FIRST. NO RACE is the one the refund turns on and is
                        never hidden — see reviewQueue.ts. */}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {REVIEW_BAND_ORDER.map((band) => (
                        <span
                          key={band}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium"
                          title={BAND_LABEL[band]}
                        >
                          {BAND_LABEL[band]} {v.bandCounts[band] ?? 0}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">Loading the numbers…</p>
                )}

                <Link
                  to={`/baseline/${item.fullMeasureAuditId}`}
                  state={{ from: window.location.pathname, fromLabel: 'Review queue' }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open the winnable questions <ExternalLink className="h-3 w-3" />
                </Link>

                {!isRefunding ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Button size="sm" className="h-7 text-xs" disabled={busy === item.leadId}
                      onClick={() => setChecklistKey(item, REVIEW_CONFIRM_KEY, 'Baseline confirmed')}>
                      <Check className="mr-1 h-3 w-3" /> Confirm
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === item.leadId}
                      onClick={() => setChecklistKey(item, REVIEW_DISMISSED_KEY, 'Dismissed')}>
                      <X className="mr-1 h-3 w-3" /> Dismiss
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => { setRefundFor(item.leadId); setReason(''); }}>
                      Refund
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2.5 rounded border border-destructive/40 p-2">
                    {/* ⛔ THE PANEL SAYS WHAT IT DOES NOT DO, ON ITS FACE. Paul's decision: the app
                        never moves money, because a button that moves £99 on a click is one he will
                        eventually hit by accident. */}
                    <p className="text-[11px] font-semibold text-destructive">
                      Records the refund. Moves no money.
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Refund {item.businessName} in Stripe yourself — the app will pick that up too.
                    </p>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why? (kept on the lead — you will want this in three months)"
                      className="mt-1.5 min-h-[52px] text-xs"
                    />
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Button size="sm" variant="destructive" className="h-7 text-xs"
                        disabled={!refundReasonOk(reason) || busy === item.leadId}
                        onClick={() => doRefund(item)}>
                        Record refund
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => { setRefundFor(null); setReason(''); }}>
                        Cancel
                      </Button>
                      {!refundReasonOk(reason) && (
                        <span className="text-[10px] text-muted-foreground">
                          {MIN_REFUND_REASON_CHARS}+ characters
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
