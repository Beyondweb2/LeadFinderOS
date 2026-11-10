import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Check, CheckCircle2, Copy, Flag, Loader2, Lock, Mail, MessageCircle, MessageSquareText, Pencil, PoundSterling, RefreshCw, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import { Callout, EDGE, IconTile, SubSection, TONE, ToneChip, type Tone } from '@/components/operator/ui';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage, EdgeFunctionError } from '@/lib/edgeInvoke';
import { AutosaveIndicator, useAutosaveFields } from '@/hooks/useAutosaveFields';
import { withSaveRetry } from '@/lib/autosaveQueue';
import { notifyLeadChanged } from '@/lib/leadSync';
import {
  APPROACH_LABEL, APPROACH_ROUTE, QC_REVIEW_HEADING, ROUTE_WITHDRAWN_TEXT, TIED_IN_DECLINE_HEADING, TIED_IN_DECLINE_REASON, QUICK_CLOSE_AGREEMENT_LINE, QUICK_CLOSE_GUARANTEE_LINES, QUICK_CLOSE_STATE_LABEL,
  linkTimeLeftWords, quickCloseScript, routeAfterAnswer, routeSwitchText, routeOwnershipLine, routePaymentsShort, closeTermsLines, closeChipText, firstPaymentGbp,
  type QcApproach, type QcCallNotes, type CloseRoute, type QcLinkShare, type OfferFit, type QuickCloseAnswers, type QuickCloseGate, type QuickCloseState,
} from '@/lib/quickClose';
import type { LinkRoute } from '@/lib/paymentLinkRoute';
import { SERVICE_ROUTE_NAME, isSaleableRoute, type ServiceRoute } from '@/lib/findableOffer';
import { cn } from '@/lib/utils';
import { COMPLETE_EXTRAS, COMPLETE_PAYMENT_PLANS, COMPLETE_UPFRONT_MONTHS, ESSENTIAL_PAYMENT_PLANS, PAYMENT_PLAN_NAME, PAYMENT_PLAN_SPEC, PLAN_PRODUCT_NAME, V7_WINDOW_START_LINE, completeUpfrontSavingGbp, gbpWords, guaranteeForPlan, planShortLine, planTotalGbp, type PaymentPlan } from '@/lib/paymentPlans';
import { ClosePanel } from '@/components/ClosePanel';
import { useSmsLink } from '@/components/SmsLinkSend';
import { PROSPECT_ONLY_DETAIL } from '@/lib/prospectOnly';
import { callNotesToCarry, closeStillNeeded, planSendName, sendConfirmText, type SendChannel } from '@/lib/prospectClose';
import { CLOSE_EMAIL_INVALID_TEXT, cleanCloseEmail } from '@/lib/closeEmail';
import type { NextStep } from '@/lib/deliveryStage';
import { firstContactDueLabel, type FirstContactState } from '@/lib/firstContact';
import { SellerClientInfoForm, type SellerClientInfo } from '@/components/SellerClientInfoForm';

/* ⛔ ONE PAGE (Paul, 2026-11-04, docs/prospect-one-page-close.md): there is no Quick Close button and no Close tab any more. The questions are
   on the prospect page (ProspectQuestions.tsx), this panel is the Close section at its foot, and the dialog below is only that panel in a
   frame, for the Sales dashboard's "Paul asked for details". The history below explains the rules it still keeps.
   ══ QUICK CLOSE (Sales Experience, 2026-09-29) — src/lib/quickClose.ts has the rules ═══════════════════
   Built for a phone call on a phone: one question at a time, big buttons, every tap SAVED (so a dropped
   call resumes where it stopped), what we already know shown instead of asked, then one button for the
   £99 link and one-tap copy. The server (fn quick-close) decides everything that matters.
   2026-10-04 (docs/pre-sales-certification/fixes-02-quick-close.md): once the route is chosen the TERMS
   and the LINK sit first (M-013) — price, payment count, minimum term, ownership, guarantee, agreement
   tick (M-011); an expired link is never shown as ready and has a "Create fresh payment link" button
   (M-014); the link can be emailed, sent on WhatsApp (window open) or copied, and each is recorded (M-015);
   a route change asks first and the server refuses a stale one (route integrity).
   ⛔ SALES WORKSPACE V2 (2026-10-05): ONE CLOSE UI. QuickClosePanel is the lead workspace's CLOSE tab; the
   dialog below is only that panel in a frame (for screens outside the workspace). The questions follow the
   website approach (quickClose.ts closeFlow): a new site is never asked for current-site access, and an
   unresolved domain is a handoff note for Paul, not a stop. Inside the workspace every Quick Close button
   switches to the Close tab.
   🔴 v5 (Paul, 2026-10-16): ONE PLAN FOR SALE — Findable Build. Optimise is never offered (a close stored on it
   before v5 is asked the plan again, Build only). Still tied into a contract with their current provider is
   DECLINED (clause 1.6): the close stops, nothing else is offered, no link, and Paul's release cannot lift it. */

export interface View {
  ok: true; canEdit: boolean;
  /** Set when the lead is already a client (already_paid) or its engagement ended / was refunded (client_closed). */
  closed?: 'already_paid' | 'client_closed' | null;
  lead: { id: string; business_name: string | null; phone: string | null; email: string | null; website: string | null; address: string | null; town: string | null; trade: string | null; contact_name: string | null; rating: number | null; review_count: number | null; campaign: string | null; lead_source: string | null; salesperson: string | null; services?: string[]; service_areas?: string[] };
  onboarding: { id: string; status: string; contact_name: string | null; contact_email: string | null; confirmed_phone: string | null; business_website: string | null } | null;
  answers: QuickCloseAnswers; state: QuickCloseState; gate: QuickCloseGate;
  consents?: { lines: string[]; wording: string; confirmed: { wording: string; at: string } | null };
  /** reasons = the payment stop (an unconfirmed agency contract, or a pre-v5 Optimise issue); flags = for Paul, never a stop (v2). */
  review: { approved_at: string | null; reasons: string[]; flags?: string[]; delivery_approach?: QcApproach };
  /** url is null unless the link is safe to hand over right now (usable). */
  link: { url: string | null; usable: boolean; generated_at: string | null; expires_at: string | null; usable_until?: string | null; shared: QcLinkShare[] } | null;
  share?: { email: string | null; hasPhone: boolean };
  windowOpen: boolean;
  /** Paul's WhatsApp link rule, decided by the server (paymentLinkRoute.ts). */
  link_route?: { route: LinkRoute; reason: string; say: string; template: { name: string; status: string; category: string | null; checked_at: string | null; label: string; sendable: boolean; say: string } };
  /** What the call screen heard (quick_close.call) and the offer it points to (offerFit). */
  call?: QcCallNotes;
  call_lines?: { key: string; label: string; answer: string }[];
  offer?: OfferFit;
  /** 2026-10-29: payment plans that cannot be sold yet (their Stripe price is not set up), with the reason. */
  plans_unavailable?: Partial<Record<string, string>>;
  has_website?: boolean;
  /** A prospect-only country (Australia): never closed (src/lib/prospectOnly.ts). */
  prospect_only?: boolean;
  events: { kind: string; at: string; by_me: boolean }[];
  /** THE TWO WAYS TO CLOSE: the route this sign-up is on, and the Full Setup link with how it has gone out. */
  close_route?: CloseRoute;
  full_setup?: { url: string; shared: { channel: string; at: string; status: string | null; template: string | null; to?: string | null }[] };

  setup?: { ready: boolean; label: string; done: number; total: number; missing: string[]; state_label: string; next: NextStep; submitted: boolean; first_contact?: { state: FirstContactState; due: string | null } } | null;
  /** CLIENT INFO NEEDED (2026-10-05): Paul's open request to this seller, and the client details they may add. */
  info_request?: { requested_at: string; reminded_at: string | null; items: { key: string; label: string }[] } | null;
  client_info?: SellerClientInfo | null;
}
export const quickCloseKey = (leadId: string | null | undefined) => ['quick-close', leadId ?? null] as const;
/* ══ THE LOOK (2026-10-06, Paul: no big teal / cyan washes) ═════════════════════════════════════════════
   The Sales Dashboard / Call screen language, scoped to Quick Close: dark card surfaces, BLUE for the
   workflow and its actions, Findable YELLOW for emphasis (the guarantee), GREEN only for a genuine success
   (paid, link ready, sent), amber for waiting, red for a stop — subtle accent edges, never a coloured wash. */
/** The state chip's colour. Paid is the one success state (drawn green by SUCCESS_CHIP, not the teal tone). */
const STATE_TONE: Record<QuickCloseState, Tone> = {
  not_started: 'grey', in_progress: 'blue',
  blocked: 'red', declined: 'red', consents_needed: 'amber', needs_review: 'amber',
  ready: 'blue', link_generated: 'blue',
  link_expired: 'amber',
  paid: 'green',
};
/** A genuine success, in green (overrides the teal of the shared 'green' tone, here only). */
const SUCCESS_CHIP = 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300';
const OK_TEXT = 'text-emerald-600 dark:text-emerald-400';
/** Findable yellow — emphasis only (the guarantee). */
const EMPHASIS_TEXT = 'text-yellow-500 dark:text-yellow-400';
/** The one primary CTA (create / copy the sign-up link): workflow blue. */
const MONEY_CTA = 'h-14 w-full gap-2 rounded-xl bg-blue-600 text-base font-bold text-white shadow-sm shadow-blue-950/30 hover:bg-blue-700';
/** A card on the dashboard surface with a thin accent edge (no wash). */
const PANEL = 'rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm';
/** A fold-out group inside the panel: a list-row surface, never a box inside a box. */
const FOLD = 'rounded-xl border border-border/60 bg-muted/20 p-3';
/** A chosen answer: blue edge and text, a faint blue fill. */
const PICKED = 'border-blue-500/70 bg-blue-500/10 text-blue-700 ring-1 ring-inset ring-blue-500/30 dark:text-blue-300';
/** Server refusals that mean "what you are looking at is out of date" — the screen re-reads itself. */
const REFRESH_ON: ReadonlySet<string> = new Set(['stale_route', 'answer_not_kept', 'already_paid', 'client_closed','answers_changed', 'link_expired', 'busy', 'route_locked', 'plan_locked']);

export function useQuickClose(leadId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: quickCloseKey(leadId),
    enabled: !!leadId && enabled,
    staleTime: 15_000,
    // A dialog left open across a payment, or another tab's change, must not keep offering stale actions (B-14).
    refetchOnWindowFocus: true,
    refetchInterval: (query) => ((query.state.data as View | undefined)?.state === 'link_generated' ? 30_000 : false),
    queryFn: () => invokeEdge<View>('quick-close', { mode: 'load', lead_id: leadId }),
  });
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
const hhmm = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
/** How much longer the rep may send this link (the app stops offering it before Stripe closes it). */
function timeLeft(iso: string | null | undefined): string {
  if (!iso) return '';
  return linkTimeLeftWords(Date.parse(iso) - Date.now());
}
const SHARE_WORDS: Record<QcLinkShare['channel'], string> = { copy: 'Copied', email: 'Emailed', whatsapp: 'Sent on WhatsApp', sms: 'Texted' };

/** THE PLAN, AND HOW THEY PAY — the one decision Quick Close still asks (Paul, 2026-10-30). Both plans side by side, Complete first and
 *  recommended, neither framed as lesser; Essential carries its three ways to pay. One tap saves the plan, so the sign-up link the
 *  client receives is already the right one and they are never asked to choose a plan themselves. Every line is from paymentPlans.ts. */
function PlanPicker({ chosen, busy, unavailable, onPick }: { chosen: PaymentPlan | null | undefined; busy: boolean; unavailable: Partial<Record<string, string>> | undefined; onPick: (p: PaymentPlan) => void }) {

  return (
    <div className="mt-3 space-y-2.5" data-testid="qc-plan-picker">
      <div className="rounded-xl bg-muted/30 p-2.5 text-sm ring-1 ring-inset ring-border/60" data-testid="qc-picker-guarantee">
        <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className={cn('h-4 w-4 shrink-0', EMPHASIS_TEXT)} />{QUICK_CLOSE_GUARANTEE_LINES[0]}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{V7_WINDOW_START_LINE}</p>
      </div>
      <div className="grid gap-2.5">
        <div className={cn('flex flex-col rounded-2xl border p-3', chosen && COMPLETE_PAYMENT_PLANS.includes(chosen) ? 'border-blue-500/70' : 'border-blue-500/50 bg-card')} data-testid="qc-plan-complete-card">
          <span className="flex flex-wrap items-center gap-1.5 text-base font-bold">{PLAN_PRODUCT_NAME.complete}<span className="rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-600 ring-1 ring-inset ring-yellow-500/40 dark:text-yellow-300">Recommended</span></span>
          <span className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Included</span>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs font-normal text-foreground/85">
            <li>Everything in {PLAN_PRODUCT_NAME.essential}</li>
            {COMPLETE_EXTRAS.map((x) => <li key={x}>{x}</li>)}
          </ul>
          <span className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">How do they want to pay?</span>
          <div className="mt-1 space-y-1.5">
            {COMPLETE_PAYMENT_PLANS.map((p) => {
              const off = unavailable?.[p] ?? null;
              return (
                <button key={p} type="button" disabled={busy || !!off} onClick={() => onPick(p)} data-testid={p === 'complete' ? 'qc-plan-complete' : 'qc-plan-' + p}
                  className={cn('flex w-full flex-col rounded-xl border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
                    chosen === p ? PICKED : 'border-border/70 bg-card hover:border-blue-500/40 hover:bg-muted/60')}>
                  {p === 'complete' ? `${gbpWords(PAYMENT_PLAN_SPEC.complete.monthlyGbp)} a month · ${PAYMENT_PLAN_SPEC.complete.totalPayments} payments` : `or pay up front, save ${gbpWords(completeUpfrontSavingGbp())}`}
                  <span className="text-xs font-normal text-muted-foreground">{off ?? (p === 'complete' ? `${gbpWords(planTotalGbp('complete'))} in total` : `${gbpWords(PAYMENT_PLAN_SPEC.complete_upfront.firstGbp)} once, for ${COMPLETE_UPFRONT_MONTHS} months`)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={cn('flex flex-col rounded-2xl border p-3', chosen && ESSENTIAL_PAYMENT_PLANS.includes(chosen) ? 'border-blue-500/70' : 'border-border/70 bg-card')} data-testid="qc-plan-essential">
          <span className="text-base font-bold">{PLAN_PRODUCT_NAME.essential}</span>
          <span className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Included</span>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-foreground/85">
            <li>A new AI-optimised website, built, hosted and managed by us</li>
            <li>A baseline AI visibility audit</li>
            <li>A four-week audit to measure the change</li>
          </ul>
          <span className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">How do they want to pay?</span>
          <div className="mt-1 space-y-1.5">
            {ESSENTIAL_PAYMENT_PLANS.map((p) => {
              const off = unavailable?.[p] ?? null;
              return (
                <button key={p} type="button" disabled={busy || !!off} onClick={() => onPick(p)} data-testid={'qc-plan-' + p}
                  className={cn('flex w-full flex-col rounded-xl border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
                    chosen === p ? PICKED : 'border-border/70 bg-card hover:border-blue-500/40 hover:bg-muted/60')}>
                  {PAYMENT_PLAN_NAME[p]}
                  <span className="text-xs font-normal text-muted-foreground">{off ?? planShortLine(p)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The lead has no website on file: improving / refreshing / recreating one is not possible. */
const NEEDS_CURRENT_SITE: ReadonlySet<string> = new Set(['improve', 'refresh', 'recreation']);

export function QuickCloseDialog({ leadId, open, onOpenChange }: { leadId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <DialogTitle className="sr-only">Close</DialogTitle>
        <DialogDescription className="sr-only">Close this lead: the plan, the terms and the sign-up link</DialogDescription>
        <ClosePanel leadId={leadId} active={open} framed />
      </DialogContent>
    </Dialog>
  );
}

/** THE CLOSE — the bottom of the prospect page (Paul, 2026-11-04). Pick the plan, then WhatsApp / Text / Email, one quick confirm, and the
 *  right sign-up link goes out. framed = inside the dialog (its own scroll area, for screens outside the popup). */
export function QuickClosePanel({ leadId, active = true, framed = false }: { leadId: string; active?: boolean; framed?: boolean }) {
  const { role } = useSubscription();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuickClose(leadId, active);
  const v = q.data;
  const [busy, setBusy] = useState<string | null>(null);
  const [script, setScript] = useState(quickCloseScript(null));
  const [copied, setCopied] = useState<string | null>(null);
  /* The old £99 × 12 plan is staff-only and hidden until asked for (paymentPlans.ts). */
  const [showOldPlan, setShowOldPlan] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [lastSaved, setLastSaved] = useState(false);
  const [asking, setAsking] = useState<SendChannel | null>(null);
  const [email, setEmail] = useState('');
  const emailFocused = useRef(false);
  const savedEmail = v?.share?.email ?? '';
  useEffect(() => { if (!emailFocused.current) setEmail(savedEmail); }, [savedEmail]);

  const answers = v?.answers ?? {};
  const plan = answers.payment_plan ?? null;
  /* The chosen plan cannot be sold yet (its Stripe price is missing): no link, and the reason (the checkout refuses it too). */
  const planRefusal = plan ? v?.plans_unavailable?.[plan] ?? null : null;
  const route = answers.route ?? null;
  /* v5: a plan no longer for sale (Optimise, stored before 2026-10-16) names no terms and makes no link here. */
  const sellRoute: ServiceRoute | null = route && isSaleableRoute(route) ? route : null;
  const declined = v?.state === 'declined';
  // The words follow the route: a new route resets them (the rep can still edit freely after).
  useEffect(() => { setScript(quickCloseScript(sellRoute, plan)); }, [sellRoute, plan]);

  const run = async (label: string, body: Record<string, unknown>, quiet = false) => {
    setBusy(label);
    const answer = label.startsWith('a:');
    try {
      /* A tapped plan rides out a bad connection before it says it failed. */
      const r = answer
        ? await withSaveRetry(() => invokeEdge<View>('quick-close', { lead_id: leadId, ...body }), (on) => setRetrying(on))
        : await invokeEdge<View>('quick-close', { lead_id: leadId, ...body });
      qc.setQueryData(quickCloseKey(leadId), r);
      notifyLeadChanged(leadId);
      if (answer) setLastSaved(true);
      return r;
    } catch (e) {
      if (!quiet) toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' });
      if (e instanceof EdgeFunctionError && REFRESH_ON.has(e.code)) void q.refetch();
      return null;
    } finally { setBusy(null); }
  };
  /* The plan IS the route (Build): saved together. A pre-v5 Optimise close asks first. */
  const pickPlan = async (p: PaymentPlan) => {
    const switching = !!route && route !== 'build';
    if (switching && !window.confirm(routeSwitchText(route!, 'build', !!v?.link))) return;
    const before = qc.getQueryData<View>(quickCloseKey(leadId));
    if (before) qc.setQueryData<View>(quickCloseKey(leadId), { ...before, answers: { ...before.answers, route: 'build', payment_plan: p } });
    const r = await run('a:payment_plan', { mode: 'save', answers: { route: 'build', payment_plan: p }, expect_route: route, ...(switching ? { route_change: true } : {}) });
    if (!r && before) qc.setQueryData(quickCloseKey(leadId), before);
  };

  /* THE LINK: made on the first send, reused after, remade when an answer changed or it ran out (the server decides which: linkStep). */
  const linkReady = async (): Promise<View | null> => {
    if (!v) return null;
    const carry = callNotesToCarry(v.call, v.lead);
    if (Object.keys(carry).length && !(await run('notes', { mode: 'save_call', call: carry }))) return null;
    return v.link?.usable && !Object.keys(carry).length ? v : run('link', { mode: 'generate_link' });
  };
  const sentOn = (view: View | null | undefined, ch: SendChannel | 'copy') => {
    const url = view?.link?.usable ? view.link.url : null;
    if (!url) return null;
    return (view?.link?.shared ?? []).filter((s) => s.channel === ch && s.status !== 'failed' && (!s.link || s.link === url)).slice(-1)[0] ?? null;
  };
  /* Sending… / Sent / failed come from the sender's own answer, never assumed. A second send of the same link is a deliberate Resend. */
  const send = async (ch: SendChannel) => {
    setAsking(null);
    const ready = await linkReady();
    if (!ready) return;
    const again = !!sentOn(ready, ch);
    const r = await run(ch === 'whatsapp' ? 'wa' : ch, { mode: 'share_link', channel: ch, ...(again && ch !== 'email' ? { resend: true } : {}) });
    if (!r) return;
    const last = r.link?.shared.filter((s) => s.channel === ch).slice(-1)[0];
    const test = last?.status === 'simulated';
    if (ch === 'whatsapp') toast({ title: test ? 'Sent (test mode — not delivered)' : 'Sent on WhatsApp', description: last?.template ? 'As the approved findable_signup_link template.' : 'As a normal message: they replied in the last 24 hours.' });
    else if (ch === 'sms') toast({ title: test ? 'Texted (test mode — not sent)' : 'Link texted', description: 'Delivery is confirmed once the network reports it.' });
    else toast({ title: 'Link emailed', description: r.share?.email ? `To ${r.share.email}` : undefined });
  };
  /** The customer's email is saved to the lead itself (quick-close save_email); a typo is refused here, and the text stays to fix. */
  const saveEmail = async (): Promise<boolean> => {
    const c = cleanCloseEmail(email);
    if (!c.ok) { toast({ title: 'Not saved', description: CLOSE_EMAIL_INVALID_TEXT, variant: 'destructive' }); return false; }
    if (c.email === savedEmail) return true;
    return !!(await run('email-save', { mode: 'save_email', email: c.email }));
  };
  const askToSend = async (ch: SendChannel) => {
    if (ch === 'email' && email.trim() && !(await saveEmail())) return;
    setAsking(ch);
  };
  const copyLink = async () => {
    const ready = await linkReady();
    const url = ready?.link?.usable ? ready.link.url : null;
    if (!url) return;
    if (await copy(url)) {
      setCopied('link'); window.setTimeout(() => setCopied(null), 2000);
      toast({ title: 'Link copied' });
      void run('share-copy', { mode: 'share_link', channel: 'copy' }, true);
    } else toast({ title: 'Copy blocked by the browser', description: 'Try again, or use WhatsApp, Text or Email.', variant: 'destructive' });
  };
  const copyScript = async () => {
    if (await copy(script)) { setCopied('script'); window.setTimeout(() => setCopied(null), 2000); toast({ title: 'Copied' }); }
    else toast({ title: 'Copy blocked by the browser', description: 'Select the text and copy it by hand.', variant: 'destructive' });
  };

  const saveClientInfo = async (ci: Record<string, string>) => {
    const r = await run('client-info', { mode: 'save_client_info', client_info: ci }) as { refused?: string[] } | null;
    if (r) toast({ title: 'Client details saved for Paul', description: r.refused?.length ? r.refused.join(' ') : undefined });
    return !!r;
  };

  const stillNeeded = v ? closeStillNeeded({ answers, call: v.call, lead: v.lead }) : [];
  const stopped = !v || v.state === 'paid' || v.state === 'blocked' || declined || v.state === 'needs_review' || v.state === 'consents_needed';
  const canSend = !!v && v.canEdit && !!plan && !!sellRoute && !stopped && !planRefusal && stillNeeded.length === 0;
  const recipient: Record<SendChannel, string> = { whatsapp: v?.lead.phone ?? '', sms: v?.lead.phone ?? '', email: email.trim() };

  return (
    <div className={cn('flex min-h-0 flex-col', framed && 'h-full')} data-testid="quick-close-panel">
        <div className={cn('shrink-0 text-left', framed ? 'border-b border-border/60 px-4 py-3.5 pr-12' : 'pb-2')}>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {framed && <span className="mr-1 text-base font-bold tracking-tight text-foreground">Close</span>}
            {v && <ToneChip tone={STATE_TONE[v.state]} dot className={v.state === 'paid' ? SUCCESS_CHIP : undefined}>{QUICK_CLOSE_STATE_LABEL[v.state]}</ToneChip>}
            {v && route && <ToneChip tone="grey" icon={PoundSterling} testId="qc-route-chip">{closeChipText(route, plan)}</ToneChip>}
            {v && <AutosaveIndicator status={busy?.startsWith('a:') ? (retrying ? 'retrying' : 'saving') : lastSaved ? 'saved' : 'idle'} className="min-w-0" />}
          </div>
        </div>

        <div className={cn('space-y-4', framed && 'min-h-0 flex-1 overflow-y-auto px-4 py-4')}>
          {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>}
          {q.isError && <Callout tone="red" icon={AlertTriangle}>{edgeErrorMessage(q.error)}</Callout>}

          {v?.prospect_only && <Callout tone="amber" icon={Lock} testId="qc-prospect-only" title="This lead can't be closed yet"><span className="text-muted-foreground">{PROSPECT_ONLY_DETAIL}</span></Callout>}

          {v && v.state === 'paid' && v.closed === 'client_closed' && (
            <Callout tone="grey" icon={Lock} testId="qc-client-closed" title="This client's engagement has ended.">
              <span className="text-muted-foreground">Nothing more happens here: no sign-up link can be made or sent. Ask Paul if anything looks wrong.</span>
            </Callout>
          )}

          {v && v.state === 'paid' && v.closed !== 'client_closed' && (
            <div className={cn(PANEL, 'border-l-[3px] border-l-emerald-500 text-sm')} data-testid="qc-paid">
              <p className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 className={cn('h-5 w-5 shrink-0', OK_TEXT)} />Paid: your part is done.</p>
              <p className="mt-1 text-muted-foreground">Paul takes it from here and will be in touch with them within two working days{v.setup?.first_contact?.due && (v.setup.first_contact.state === 'owed' || v.setup.first_contact.state === 'overdue') ? ` (by ${firstContactDueLabel(v.setup.first_contact.due)})` : ''}. Everything you typed on this lead has gone to him, with the contact details, their website and the AI check.</p>
            </div>
          )}

          {/* ── CLIENT INFO NEEDED: Paul asked this seller for missing details (client missing-info actions) ── */}
          {v && v.state === 'paid' && v.closed !== 'client_closed' && v.info_request && v.client_info && (
            <details className={cn('rounded-2xl p-3.5', TONE.amber.tint)} open data-testid="qc-client-info">
              <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-semibold">
                CLIENT INFO NEEDED
                <span className="text-xs font-normal text-muted-foreground">{`asked ${new Date(v.info_request.reminded_at ?? v.info_request.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`}</span>
              </summary>
              <div className="mt-2 text-sm" data-testid="qc-info-request">
                <p>{v.lead.business_name ?? 'This client'} is missing:</p>
                <ul className="mt-1 list-disc pl-5">{v.info_request.items.map((i) => <li key={i.key}>{i.label}</li>)}</ul>
                <p className="mt-1 text-xs text-muted-foreground">Please add anything you collected during the sale. Saving tells Paul.</p>
              </div>
              <div className="mt-3"><SellerClientInfoForm info={v.client_info} onSave={saveClientInfo} busy={busy === 'client-info'} /></div>
            </details>
          )}

          {v && v.state === 'blocked' && (
            <Callout tone="red" icon={AlertTriangle} title="The decision maker needs to approve this">
              <span className="text-muted-foreground">No sign-up link can be created. Ask who makes the decision, and send them the sign-up link or arrange a call with them.</span>
            </Callout>
          )}
          {v && declined && (
            <Callout tone="red" icon={AlertTriangle} testId="qc-declined" title={TIED_IN_DECLINE_HEADING}>
              <span className="text-muted-foreground">{v.review.reasons[0] ?? v.offer?.reason ?? TIED_IN_DECLINE_REASON}</span>
              <p className="mt-2 text-muted-foreground">No sign-up link can be made or sent, and nothing else is offered instead. If they tell you the contract has ended (or ends before work starts), change the contract answer and carry on.</p>
            </Callout>
          )}
          {v && v.state === 'consents_needed' && (
            <Callout tone="amber" icon={ShieldAlert} testId="qc-consents-needed" title="Build consents needed before the sign-up link">
              <span className="text-muted-foreground">A new website can only go ahead once they confirm all three. When they can, change the answer to Yes.</span>
            </Callout>
          )}
          {v && v.state === 'needs_review' && (
            <Callout tone="amber" icon={ShieldAlert} title={QC_REVIEW_HEADING}>
              <ul className="list-disc pl-5 text-muted-foreground">{v.review.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="mt-2 text-muted-foreground">You do not need to sort this out or interpret any agreement. Paul has been told and will look at it; the lead stays yours.</p>
              {role === 'admin' && <Button size="sm" className="mt-2 h-10" onClick={() => void run('approve', { mode: 'approve_review' })} disabled={busy === 'approve'}>Release for payment</Button>}
            </Callout>
          )}

          {/* v2: for Paul, never a stop — the sale and the preview build go ahead; it is settled after payment. */}
          {v && (v.review.flags?.length ?? 0) > 0 && v.state !== 'paid' && (
            <Callout tone="blue" icon={Flag} testId="qc-paul-flags" title="For Paul after payment — this does not stop the sale">
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{v.review.flags!.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="mt-1.5 text-xs text-muted-foreground">Never promise to take over a domain or copy someone else's design. Paul sorts this out with them.</p>
            </Callout>
          )}
          {route && !isSaleableRoute(route) && v?.state !== 'paid' && <p className={cn('rounded-xl px-3 py-2 text-xs leading-snug ring-1 ring-inset', TONE.amber.tint, 'ring-amber-500/30')} data-testid="qc-route-withdrawn">{ROUTE_WITHDRAWN_TEXT} This close was started on it: pick a plan below with them, or stop here.</p>}

          {/* ── 1 · THE PLAN ── */}
          {v && v.canEdit && !declined && !v.prospect_only && (
            <section data-testid="close-plan">
              <p className="text-sm font-semibold">Which plan, and how do they want to pay?</p>
              <PlanPicker chosen={plan} busy={!!busy} unavailable={v.plans_unavailable} onPick={(p) => void pickPlan(p)} />
              {showOldPlan && <button type="button" disabled={!!busy} onClick={() => void pickPlan('legacy_twelve')} className="mt-2 w-full rounded-xl border border-border/70 px-3 py-2 text-left text-sm" data-testid="qc-plan-legacy_twelve">{PAYMENT_PLAN_NAME.legacy_twelve}: {planShortLine('legacy_twelve')} (staff only)</button>}
              {!showOldPlan && plan !== 'legacy_twelve' && <button type="button" onClick={() => setShowOldPlan(true)} className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" data-testid="qc-show-old-plan">Show the old plan (£99 × 12, staff only)</button>}
            </section>
          )}

          {/* ── 2 · THE TERMS THEY HEAR, THEN THE SEND ── */}
          {v && sellRoute && plan && v.state !== 'paid' && v.state !== 'blocked' && !declined && !v.prospect_only && (
            <section aria-live="polite" className={cn('min-w-0', PANEL, EDGE.blue)} data-testid="qc-route-terms">
              <p className="flex items-center gap-2 text-sm font-bold tracking-tight"><IconTile icon={PoundSterling} tone="blue" size="sm" />{planSendName(plan)}</p>
              <ul className="mt-2 space-y-0.5 text-sm" data-testid="qc-terms" >{closeTermsLines(sellRoute, plan).map((l, i) => <li key={l} className={cn(i === 2 && 'font-semibold')}>{l}</li>)}</ul>
              <p className="mt-1.5 text-sm">{routeOwnershipLine(sellRoute)}</p>
              <div className="mt-2.5 rounded-xl bg-muted/30 p-2.5 text-sm ring-1 ring-inset ring-border/60" data-testid="qc-guarantee">
                <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className={cn('h-4 w-4 shrink-0', EMPHASIS_TEXT)} />{QUICK_CLOSE_GUARANTEE_LINES[0]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{guaranteeForPlan(plan, QUICK_CLOSE_GUARANTEE_LINES[1])}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{QUICK_CLOSE_AGREEMENT_LINE} They do not choose a plan again: the link is already this one, and they pay {gbpWords(firstPaymentGbp(plan))} after signing.</p>

              {v.canEdit && (
                <div className="mt-3 space-y-2 border-t border-border/60 pt-3" data-testid="qc-link">
                  {planRefusal && <p className={cn('flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-xs', TONE.amber.tint, TONE.amber.text)} data-testid="qc-plan-unavailable"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{planRefusal}</p>}
                  {stillNeeded.length > 0 && <p className={cn('flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-xs', TONE.amber.tint, TONE.amber.text)} data-testid="close-still-needed"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />Before you can send, answer: {stillNeeded.join(', ')}.</p>}
                  <SendRow leadId={leadId} v={v} canSend={canSend} busy={busy} email={email} sentOn={(ch) => sentOn(v, ch)}
                    onEmail={setEmail} onEmailFocus={(on) => { emailFocused.current = on; if (!on && email.trim() && cleanCloseEmail(email).ok) void saveEmail(); }} onAsk={(ch) => void askToSend(ch)} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button type="button" disabled={!canSend || !!busy} onClick={() => void copyLink()} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50" data-testid="qc-copy-link">
                      {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === 'link' ? 'Copied' : 'Copy link instead'}
                    </button>
                  </div>
                  {(v.link?.shared.length ?? 0) > 0 && (
                    <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="qc-share-history">
                      {v.link!.shared.slice().reverse().map((s) => (
                        <li key={`${s.channel}-${s.at}`}>✓ {SHARE_WORDS[s.channel]}{s.channel === 'email' && s.to ? ` to ${s.to}` : ''}{s.status === 'simulated' ? ' (test mode — not delivered)' : ''}{s.channel === 'copy' ? ' (to send by hand)' : ''} · {hhmm(s.at)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {v && sellRoute && plan && v.state !== 'paid' && v.state !== 'blocked' && !declined && !v.prospect_only && (
            <details className={FOLD}>
              <summary className="flex min-h-[36px] cursor-pointer select-none items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><span className={cn('h-4 w-1 shrink-0 rounded-full', TONE.blue.bar)} aria-hidden />What to tell them</span><button type="button" onClick={(e) => { e.preventDefault(); void copyScript(); }} className="inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-medium text-primary hover:bg-muted hover:underline">{copied === 'script' ? 'Copied' : 'Copy'}</button></summary>
              <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={6} className="mt-2 text-sm" aria-label="What to tell them (edit freely)" />
              <p className="mt-1 text-[11px] text-muted-foreground">Your words — change them however you like, but keep the price, the minimum term and the guarantee as written. Never promise a ranking, a recommendation or that AI will name them.</p>
            </details>
          )}

          {v && v.gate.notes.length > 0 && v.state !== 'paid' && (
            <ul className="space-y-1 text-xs text-muted-foreground">{v.gate.notes.map((n) => <li key={n}>• {n} (Paul will pick this up)</li>)}</ul>
          )}
        </div>

        <AlertDialog open={!!asking} onOpenChange={(o) => { if (!o) setAsking(null); }}>
          <AlertDialogContent data-testid="close-send-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>{asking && plan ? sendConfirmText(plan, recipient[asking], asking, !!sentOn(v, asking)) : ''}</AlertDialogTitle>
              <AlertDialogDescription>It takes them to the agreement, then payment for this plan.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="close-send-cancel">Cancel</AlertDialogCancel>
              <AlertDialogAction data-testid="close-send-yes" onClick={() => { if (asking) void send(asking); }}>Send</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}

/** WhatsApp, Text, Email. ⛔ Each only ASKS fn quick-close, which builds the link and sends through the one guarded sender of that channel;
 *  the browser never types a link or chooses a number. Where a channel cannot be used it says why, and the others stay on. */
function SendRow({ leadId, v, canSend, busy, email, sentOn, onEmail, onEmailFocus, onAsk }: {
  leadId: string; v: View; canSend: boolean; busy: string | null; email: string;
  sentOn: (ch: SendChannel) => QcLinkShare | null;
  onEmail: (s: string) => void; onEmailFocus: (on: boolean) => void; onAsk: (ch: SendChannel) => void;
}) {
  const lr = v.link_route;
  const canWa = lr?.route === 'whatsapp_reply' || lr?.route === 'whatsapp_template';
  const waSent = sentOn('whatsapp');
  const sms = useSmsLink(leadId, 'agreement', waSent ? ['whatsapp'] : []);
  const emailOk = cleanCloseEmail(email).ok;
  /* "Correct a detail → Phone" is saved for Paul on the sign-up; WhatsApp and Text only ever go to the lead's own number
     (the sender refuses any other). Say so, or the rep believes the link went to the number they just typed (2026-11-10). */
  const digitsOf = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^(44|0)/, '');
  const corrected = (v.onboarding?.confirmed_phone ?? '').trim();
  const otherNumber = !!corrected && digitsOf(corrected) !== digitsOf(v.lead.phone);
  const button = (ch: SendChannel, on: boolean, Icon: typeof Mail, word: string, busyKey: string, testId: string) => {
    const sent = !!sentOn(ch);
    return (
      <Button type="button" variant={sent ? 'outline' : 'default'} disabled={!canSend || !on || !!busy} onClick={() => onAsk(ch)} data-testid={testId}
        className={cn('h-12 w-full gap-1.5 rounded-xl font-bold', !sent && 'bg-blue-600 text-white hover:bg-blue-700')}>
        {busy === busyKey ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? <RefreshCw className="h-4 w-4" /> : <Icon className="h-4 w-4" />}{sent ? `${word} again` : word}
      </Button>
    );
  };
  return (
    <div className="space-y-2" data-testid="close-send">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {button('whatsapp', canWa, MessageCircle, 'WhatsApp', 'wa', 'close-send-whatsapp')}
        {button('sms', !!sms.option?.available, MessageSquareText, 'Text', 'sms', 'close-send-sms')}
        {button('email', emailOk, Mail, 'Email', 'email', 'close-send-email')}
      </div>
      <label className="block text-xs font-medium text-muted-foreground">Their email
        <Input type="email" inputMode="email" autoComplete="off" placeholder="name@example.com" value={email} onChange={(e) => onEmail(e.target.value)} onFocus={() => onEmailFocus(true)} onBlur={() => onEmailFocus(false)} disabled={!!busy && busy !== 'email-save'} className="mt-1 h-10 text-sm" data-testid="close-email" />
      </label>
      <div className="space-y-0.5 text-xs text-muted-foreground" data-testid="close-send-notes">
        {!canWa && <p data-testid="close-whatsapp-off">WhatsApp isn’t available: {lr?.say ?? 'it can’t carry this link right now.'} Use Text or Email.</p>}
        {canWa && !waSent && <p data-testid="close-whatsapp-how">{lr?.route === 'whatsapp_reply' ? 'WhatsApp goes as a normal message: they replied in the last 24 hours.' : lr?.reason === 'ok_unverified' ? lr.template.say : 'WhatsApp goes as the approved sign-up template.'}</p>}
        {sms.option && !sms.option.available && <p data-testid="close-sms-off">Text: {sms.option.reason}</p>}
        {!emailOk && <p data-testid="close-email-off">Email: type their email address below to switch it on.</p>}
        {otherNumber && <p data-testid="close-other-number">WhatsApp and Text go to the number on the lead{v.lead.phone ? ` (${v.lead.phone})` : ''}, not to {corrected}. That number is saved for Paul. To reach them on it now, use Email or Copy link.</p>}
        {sms.words && <p className={cn(sms.failed && 'text-destructive')} data-testid="close-sms-status">{sms.words}</p>}
      </div>
    </div>
  );
}

/** "What we already know" and Correct a detail: at the foot of the questions, folded. */
export function KnownDetails({ leadId, v }: { leadId: string; v: View }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  /* One detail, saved as they leave the field. A bad email is refused by the server: it says so, and the text stays for them to fix. */
  const saveDetail = async (key: string, value: string) => {
    try {
      const r = await invokeEdge<View>('quick-close', { lead_id: leadId, mode: 'save', answers: {}, expect_route: v.answers?.route ?? null, corrections: { [key]: value } });
      qc.setQueryData(quickCloseKey(leadId), r);
    } catch (e) {
      toast({ title: 'Not saved', description: edgeErrorMessage(e), variant: 'destructive' });
      throw e;
    }
  };
  const known: [string, string | null | undefined][] = [
    ['Business', v.lead.business_name], ['Trade', v.lead.trade], ['Town', v.lead.town], ['Phone', v.onboarding?.confirmed_phone || v.lead.phone],
    ['Email', v.onboarding?.contact_email || v.lead.email], ['Website', v.onboarding?.business_website || v.lead.website], ['Contact', v.onboarding?.contact_name || v.lead.contact_name],
    ['Google', v.lead.rating ? `${v.lead.rating}★ (${v.lead.review_count ?? 0} reviews)` : null], ['Campaign', v.lead.campaign], ['Source', v.lead.lead_source ?? 'App search'], ['Salesperson', v.lead.salesperson],
  ];
  return (
    <details className={FOLD} data-testid="known-details">
      <summary className="flex min-h-[36px] cursor-pointer select-none items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><span className={cn('h-4 w-1 shrink-0 rounded-full', TONE.grey.bar)} aria-hidden />What we already know</span><span className="text-xs font-normal text-muted-foreground">no need to ask</span></summary>
      {!editing ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {known.map(([k, val]) => <FragmentRow key={k} k={k} v={val} />)}
        </dl>
      ) : (
        <CorrectDetails leadId={leadId} initial={{ contact_name: v.onboarding?.contact_name ?? v.lead.contact_name ?? '', contact_email: v.onboarding?.contact_email ?? v.lead.email ?? '', confirmed_phone: v.onboarding?.confirmed_phone ?? v.lead.phone ?? '', business_website: v.onboarding?.business_website ?? v.lead.website ?? '' }} onSave={saveDetail} onDone={() => setEditing(false)} />
      )}
      {v.canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Pencil className="h-3 w-3" />Correct a detail</button>}
    </details>
  );
}

/** TWO OPTIONS: the short "what do they offer, and where do they want to be found?" step, just before the plan. It saves
 *  the same two call notes the Call screen does (save_call), so a rep who already heard them there is never asked again. */
/** "Correct a detail": each one saves as they type, and what is not yet saved survives a closed tab (useAutosaveFields). A half-typed email would
 *  only be refused, so an email waits until it is valid or they leave the field. */
function CorrectDetails({ leadId, initial, onSave, onDone }: { leadId: string; initial: Record<string, string>; onSave: (key: string, value: string) => Promise<void>; onDone: () => void }) {
  const [draft, setDraft] = useState(initial);
  const auto = useAutosaveFields({ save: onSave, storageKey: `qc-details:${leadId}`, onRestore: (left) => setDraft((d) => ({ ...d, ...left })) });
  useEffect(() => { for (const [k, val] of Object.entries(initial)) auto.baseline(k, val); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-2 space-y-2" data-testid="qc-correct-details">
      {([['contact_name', 'Contact name'], ['contact_email', 'Email'], ['confirmed_phone', 'Phone'], ['business_website', 'Website']] as const).map(([k, label]) => (
        <label key={k} className="block text-xs text-muted-foreground">{label}
          <Input value={draft[k] ?? ''} onChange={(e) => { const val = e.target.value; setDraft((d) => ({ ...d, [k]: val })); if (k !== 'contact_email' || !val.trim() || cleanCloseEmail(val).ok) auto.set(k, val.trim()); }} onBlur={(e) => { auto.set(k, e.target.value.trim()); auto.flush(k); }} className="mt-0.5 h-10 text-sm" inputMode={k === 'confirmed_phone' ? 'tel' : k === 'contact_email' ? 'email' : undefined} />
        </label>
      ))}
      <div className="flex items-center justify-between gap-2"><AutosaveIndicator status={auto.status} /><Button size="sm" variant="ghost" className="h-10" onClick={onDone}>Done</Button></div>
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v: string | null | undefined }) {
  return (<><dt className="text-muted-foreground">{k}</dt><dd className={cn('min-w-0 truncate font-medium', !v && 'font-normal text-muted-foreground/70')} title={v ?? undefined}>{v || 'not known'}</dd></>);
}

/* ══ THE WEBSITE APPROACH, CAPTURED EARLY (sales workspace v2) ═══════════════════════════════════════
   The DETAILS tab's field and the Close tab's question are ONE stored answer (quick_close.answers.approach,
   saved by fn quick-close like every other answer). v5 (2026-10-16): every choice is Findable Build — "Improve their
   current website" (Optimise) is withdrawn and shown only to label a close that already carries it. */
export function WebsiteApproachField({ leadId }: { leadId: string }) {
  const q = useQuickClose(leadId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const v = q.data;
  if (q.isLoading) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</p>;
  if (!v) return null;
  const a = v.answers ?? {};
  const hasSite = !!(v.onboarding?.business_website || v.lead.website);
  const choose = async (value: string) => {
    const route = a.route ?? null;
    const next = routeAfterAnswer(a, 'approach', value);
    let routeChange = false;
    if (route && next && next !== route) {
      if (!window.confirm(routeSwitchText(route, next, !!v.link))) return;
      routeChange = true;
    }
    setBusy(true);
    try {
      const r = await invokeEdge<View>('quick-close', { lead_id: leadId, mode: 'save', answers: { approach: value }, expect_route: route, ...(routeChange ? { route_change: true } : {}) });
      qc.setQueryData(quickCloseKey(leadId), r);
      notifyLeadChanged(leadId);
      toast({ title: 'Website approach saved' });
    } catch (e) {
      toast({ title: 'Not saved', description: edgeErrorMessage(e), variant: 'destructive' });
      if (e instanceof EdgeFunctionError && REFRESH_ON.has(e.code)) void q.refetch();
    } finally { setBusy(false); }
  };
  const plan = a.approach && a.approach !== 'unsure' ? APPROACH_ROUTE[a.approach] : a.route ?? null;
  return (
    <div className="space-y-1.5" data-testid="website-approach">
      <label className="block text-[11px] font-medium text-muted-foreground">Website approach — what do they want?</label>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {(Object.keys(APPROACH_LABEL) as QcApproach[]).filter((k) => k === 'unsure' || isSaleableRoute(APPROACH_ROUTE[k]) || a.approach === k).map((k) => {
          const withdrawn = k !== 'unsure' && !isSaleableRoute(APPROACH_ROUTE[k]);
          const off = !v.canEdit || busy || withdrawn || (!hasSite && NEEDS_CURRENT_SITE.has(k));
          return (
            <button key={k} type="button" disabled={off} onClick={() => void choose(k)} aria-pressed={a.approach === k}
              className={cn('rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors disabled:opacity-50',
                a.approach === k ? PICKED : 'border-border/60 hover:bg-muted')}>
              {APPROACH_LABEL[k]}
              <span className="block text-[10px] font-normal text-muted-foreground">{withdrawn ? 'Withdrawn — no longer offered' : !hasSite && NEEDS_CURRENT_SITE.has(k) ? 'No website on file' : k === 'unsure' ? 'Paul recommends after payment' : SERVICE_ROUTE_NAME[APPROACH_ROUTE[k]]}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{plan ? `Plan: ${SERVICE_ROUTE_NAME[plan]} · ${routePaymentsShort(plan)}. ` : ''}{v.canEdit ? '' : ' (Locked — this lead has paid or ended.)'}</p>
    </div>
  );
}
