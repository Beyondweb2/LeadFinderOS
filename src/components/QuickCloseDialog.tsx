import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, BadgePoundSterling, Check, CheckCircle2, ClipboardCopy, ClipboardList, Copy, Flag, Loader2, Lock, Mail, MessageCircle, Pencil, PoundSterling, RefreshCw, ShieldAlert, ShieldCheck, Zap,
} from 'lucide-react';
import { Callout, EDGE, IconTile, SubSection, TONE, ToneChip, type Tone } from '@/components/operator/ui';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage, EdgeFunctionError } from '@/lib/edgeInvoke';
import { notifyLeadChanged } from '@/lib/leadSync';
import {
  APPROACH_LABEL, APPROACH_ROUTE, QC_REVIEW_HEADING, QUICK_CLOSE_AFTER_PAYMENT, QUICK_CLOSE_AGREEMENT_LINE, QUICK_CLOSE_GUARANTEE_LINES, QUICK_CLOSE_QUESTIONS, QUICK_CLOSE_STATE_LABEL,
  closeFlow, linkTimeLeftWords, missingQuestions, quickCloseMessage, quickCloseScript, routeAfterAnswer, routeAvailable, routeSwitchText, routeOwnershipLine, routePaymentsShort, routeTermsLines,
  type QcApproach, type QcKey, type QcLinkShare, type QuickCloseAnswers, type QuickCloseGate, type QuickCloseState,
} from '@/lib/quickClose';
import { FINDABLE_SETUP_PRICE_GBP, SERVICE_ROUTE_NAME, totalPaymentsFor, type ServiceRoute } from '@/lib/findableOffer';
import { cn } from '@/lib/utils';
import { SalesHandoffForm } from '@/components/SalesHandoffForm';
import type { HandoffFieldKey, SalesHandoffFields } from '@/lib/salesHandoff';
import type { NextStep } from '@/lib/deliveryStage';
import { firstContactDueLabel, type FirstContactState } from '@/lib/firstContact';
import { SellerClientInfoForm, type SellerClientInfo } from '@/components/SellerClientInfoForm';

/* ══ QUICK CLOSE (Sales Experience, 2026-09-29) — src/lib/quickClose.ts has the rules ═══════════════════
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
   website approach (quickClose.ts closeFlow): a new site is never asked for current-site access, plain
   Optimise is never asked who controls the domain, and an unresolved domain is a handoff note for Paul, not
   a stop. Inside the workspace every Quick Close button switches to the Close tab (QuickCloseNav). */

interface View {
  ok: true; canEdit: boolean;
  /** Set when the lead is already a client (already_paid) or its engagement ended / was refunded (client_closed). */
  closed?: 'already_paid' | 'client_closed' | null;
  lead: { id: string; business_name: string | null; phone: string | null; email: string | null; website: string | null; address: string | null; town: string | null; trade: string | null; contact_name: string | null; rating: number | null; review_count: number | null; campaign: string | null; lead_source: string | null; salesperson: string | null };
  onboarding: { id: string; status: string; contact_name: string | null; contact_email: string | null; confirmed_phone: string | null; business_website: string | null } | null;
  answers: QuickCloseAnswers; state: QuickCloseState; gate: QuickCloseGate;
  consents?: { lines: string[]; wording: string; confirmed: { wording: string; at: string } | null };
  /** reasons = the payment stop (Optimise on a site we cannot get into); flags = for Paul, never a stop (v2). */
  review: { approved_at: string | null; reasons: string[]; flags?: string[]; delivery_approach?: QcApproach };
  /** url is null unless the link is safe to hand over right now (usable). */
  link: { url: string | null; usable: boolean; generated_at: string | null; expires_at: string | null; usable_until?: string | null; shared: QcLinkShare[] } | null;
  share?: { email: string | null; hasPhone: boolean };
  windowOpen: boolean;
  events: { kind: string; at: string; by_me: boolean }[];
  /** The sales handoff (src/lib/salesHandoff.ts) — editable by the seller even after payment. */
  handoff?: { canEdit: boolean; fields: SalesHandoffFields; prefilled: HandoffFieldKey[]; saved_at: string | null; completed_at: string | null; complete: boolean; missing: HandoffFieldKey[] };
  /** After payment: the client's setup checklist, so the seller sees what is missing. */
  setup?: { ready: boolean; label: string; done: number; total: number; missing: string[]; state_label: string; next: NextStep; submitted: boolean; first_contact?: { state: FirstContactState; due: string | null } } | null;
  /** CLIENT INFO NEEDED (2026-10-05): Paul's open request to this seller, and the client details they may add. */
  info_request?: { requested_at: string; reminded_at: string | null; items: { key: string; label: string }[] } | null;
  client_info?: SellerClientInfo | null;
}
export const quickCloseKey = (leadId: string | null | undefined) => ['quick-close', leadId ?? null] as const;
/** The state chip's colour (operator/ui tones: green = money/done, drawn teal). */
const STATE_TONE: Record<QuickCloseState, Tone> = {
  not_started: 'grey', in_progress: 'blue',
  blocked: 'red', consents_needed: 'amber', needs_review: 'amber',
  ready: 'green', link_generated: 'green',
  link_expired: 'amber',
  paid: 'green',
};
/** The one money CTA (create / copy the sign-up link) — the teal of the money tone. */
const MONEY_CTA = 'h-14 w-full gap-2 rounded-xl bg-teal-600 text-base font-bold text-white shadow-sm shadow-teal-900/30 hover:bg-teal-700';
/** A fold-out group inside the panel: a list-row surface, never a box inside a box. */
const FOLD = 'rounded-xl border border-border/60 bg-muted/20 p-3';
/** Server refusals that mean "what you are looking at is out of date" — the screen re-reads itself. */
const REFRESH_ON: ReadonlySet<string> = new Set(['stale_route', 'answer_not_kept', 'already_paid', 'client_closed','answers_changed', 'link_expired', 'busy', 'route_locked']);

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
const SHARE_WORDS: Record<QcLinkShare['channel'], string> = { copy: 'Copied', email: 'Emailed', whatsapp: 'Sent on WhatsApp' };

/** Inside the lead workspace, a Quick Close button goes to the CLOSE tab instead of opening a second window. */
export const QuickCloseNav = createContext<{ openClose: (leadId: string) => void } | null>(null);

/** The lead has no website on file: improving / refreshing / recreating one is not possible. */
const NEEDS_CURRENT_SITE: ReadonlySet<string> = new Set(['improve', 'refresh', 'recreation']);

export function QuickCloseDialog({ leadId, open, onOpenChange }: { leadId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <DialogTitle className="sr-only">Quick Close</DialogTitle>
        <DialogDescription className="sr-only">Close this lead: the questions, the terms and the sign-up link</DialogDescription>
        <QuickClosePanel leadId={leadId} active={open} framed />
      </DialogContent>
    </Dialog>
  );
}

/** THE CLOSE — one UI. framed = inside the dialog (its own scroll area); otherwise it flows in the workspace tab. */
export function QuickClosePanel({ leadId, active = true, framed = false }: { leadId: string; active?: boolean; framed?: boolean }) {
  const { role } = useSubscription();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuickClose(leadId, active);
  const open = active;
  const v = q.data;
  const [step, setStep] = useState<QcKey | 'review' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fix, setFix] = useState<Record<string, string>>({});
  const [trade, setTrade] = useState('');
  const [script, setScript] = useState(quickCloseScript(null));
  const [copied, setCopied] = useState<string | null>(null);

  const answers = v?.answers ?? {};
  const route = answers.route ?? null;
  // The words follow the route: a new route resets them (the rep can still edit freely after).
  useEffect(() => { setScript(quickCloseScript(route)); }, [route]);
  const missing = useMemo(() => missingQuestions(answers), [answers]);
  // A decision-maker "No" ends the questions (nothing after it can lead to payment).
  const current: QcKey | null = step && step !== 'review' ? step : answers.decision_maker === 'no' ? null : (missing[0] ?? null);
  /* v2: only the questions this approach needs, in order (closeFlow). */
  const shownQs = closeFlow(answers).map((k) => QUICK_CLOSE_QUESTIONS.find((x) => x.key === k)!).filter(Boolean);
  const hasSite = !!(v?.onboarding?.business_website || v?.lead.website);
  useEffect(() => { if (!open) { setStep(null); setEditing(false); setCopied(null); } }, [open]);
  useEffect(() => { if (v?.onboarding) setFix({ contact_name: v.onboarding.contact_name ?? v.lead.contact_name ?? '', contact_email: v.onboarding.contact_email ?? v.lead.email ?? '', confirmed_phone: v.onboarding.confirmed_phone ?? v.lead.phone ?? '', business_website: v.onboarding.business_website ?? v.lead.website ?? '' }); }, [v?.onboarding?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label: string, body: Record<string, unknown>, quiet = false) => {
    setBusy(label);
    try {
      const r = await invokeEdge<View>('quick-close', { lead_id: leadId, ...body });
      qc.setQueryData(quickCloseKey(leadId), r);
      notifyLeadChanged(leadId);
      return r;
    } catch (e) {
      if (!quiet) toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' });
      if (e instanceof EdgeFunctionError && REFRESH_ON.has(e.code)) void q.refetch();
      return null;
    } finally { setBusy(null); }
  };
  const answer = async (key: QcKey, value: string) => {
    /* ROUTE INTEGRITY: switching Build ⇄ Optimise changes the money — it is asked, never a stray tap.
       The server also refuses it unless route_change is true, and refuses any save from a screen showing
       a different route than the saved one (expect_route). */
    let routeChange = false;
    /* v2: the approach can move the route too (improve → Optimise, a new site → Build). */
    const nextRoute = routeAfterAnswer(answers, key, value);
    if (route && nextRoute && nextRoute !== route) {
      if (!window.confirm(routeSwitchText(route, nextRoute, !!v?.link))) return;
      routeChange = true;
    }
    const before = qc.getQueryData<View>(quickCloseKey(leadId));
    if (before) qc.setQueryData<View>(quickCloseKey(leadId), { ...before, answers: { ...before.answers, [key]: value } });
    setStep(null);
    const r = await run(`a:${key}`, { mode: 'save', answers: { [key]: value }, expect_route: route, ...(routeChange ? { route_change: true } : {}) });
    if (!r && before) qc.setQueryData(quickCloseKey(leadId), before);
  };
  const saveFixes = async () => { const r = await run('fix', { mode: 'save', answers: {}, expect_route: route, corrections: fix, ...(trade.trim() ? { trade: trade.trim() } : {}) }); if (r) setEditing(false); };
  const generate = async () => {
    if (!v?.lead.trade && !trade.trim()) { toast({ title: 'Add the trade first', description: 'It decides what the baseline measures.', variant: 'destructive' }); return; }
    if (!v?.lead.trade && trade.trim()) { const ok = await run('fix', { mode: 'save', answers: {}, expect_route: route, trade: trade.trim() }); if (!ok) return; }
    await run('link', { mode: 'generate_link' });
  };
  /** Copy, then record it (as COPIED — the app cannot know where it was pasted). The record never blocks the copy. */
  const doCopy = async (what: 'link' | 'message' | 'script', text: string) => {
    if (await copy(text)) {
      setCopied(what); window.setTimeout(() => setCopied(null), 2000);
      toast({ title: what === 'link' ? 'Sign-up link copied' : 'Copied' });
      if (what !== 'script') void run('share-copy', { mode: 'share_link', channel: 'copy' }, true);
    } else toast({ title: 'Copy blocked by the browser', description: 'Select the text and copy it by hand.', variant: 'destructive' });
  };
  const sendEmail = async () => {
    const r = await run('email', { mode: 'share_link', channel: 'email' });
    if (r) toast({ title: 'Sign-up link emailed', description: v?.share?.email ? `To ${v.share.email}` : undefined });
  };
  const sendWhatsApp = async () => {
    const r = await run('wa', { mode: 'share_link', channel: 'whatsapp' });
    if (!r) return;
    const last = r.link?.shared.filter((s) => s.channel === 'whatsapp').slice(-1)[0];
    toast({ title: last?.status === 'simulated' ? 'Sent (test mode — not delivered)' : 'Sent on WhatsApp' });
  };

  const saveHandoff = async (h: SalesHandoffFields) => !!(await run('handoff', { mode: 'save_handoff', handoff: h }));
  const saveClientInfo = async (ci: Record<string, string>) => {
    const r = await run('client-info', { mode: 'save_client_info', client_info: ci }) as { refused?: string[] } | null;
    if (r) toast({ title: 'Client details saved for Paul', description: r.refused?.length ? r.refused.join(' ') : undefined });
    return !!r;
  };
  const submitDelivery = async () => { const r = await run('submit', { mode: 'submit_delivery' }); if (r) toast({ title: 'Submitted for delivery', description: 'Paul has been told.' }); };
  const answeredCount = shownQs.filter((x) => answers[x.key] && answers[x.key] !== 'not_applicable').length;
  const known: [string, string | null | undefined][] = v ? [
    ['Business', v.lead.business_name], ['Trade', v.lead.trade], ['Town', v.lead.town], ['Phone', v.onboarding?.confirmed_phone || v.lead.phone],
    ['Email', v.onboarding?.contact_email || v.lead.email], ['Website', v.onboarding?.business_website || v.lead.website], ['Contact', v.onboarding?.contact_name || v.lead.contact_name],
    ['Google', v.lead.rating ? `${v.lead.rating}★ (${v.lead.review_count ?? 0} reviews)` : null], ['Campaign', v.lead.campaign], ['Source', v.lead.lead_source ?? 'App search'], ['Salesperson', v.lead.salesperson],
  ] : [];
  const closing = !!v && v.canEdit && !!route && (v.state === 'ready' || v.state === 'link_generated' || v.state === 'link_expired');
  const usableUrl = v?.link?.usable ? v.link.url : null;
  const greetName = v?.onboarding?.contact_name || v?.lead.contact_name || null;
  const currentQ = current ? QUICK_CLOSE_QUESTIONS.find((x) => x.key === current)! : null;

  return (
    <div className={cn('flex min-h-0 flex-col', framed && 'h-full')} data-testid="quick-close-panel">
        <div className={cn('shrink-0 text-left', framed ? 'border-b border-border/60 px-4 py-3.5' : 'pb-3')}>
          <div className="flex min-w-0 items-start gap-3 pr-8">
            <IconTile icon={BadgePoundSterling} tone="green" />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-baseline gap-1.5 text-base font-bold tracking-tight"><span className="shrink-0 whitespace-nowrap">Close</span><span className="min-w-0 truncate font-normal text-muted-foreground">· {v?.lead.business_name ?? '…'}</span></p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {v && <ToneChip tone={STATE_TONE[v.state]} dot>{QUICK_CLOSE_STATE_LABEL[v.state]}</ToneChip>}
                {v && route && <ToneChip tone="green" icon={PoundSterling} testId="qc-route-chip">{SERVICE_ROUTE_NAME[route]} · {totalPaymentsFor(route)} payments</ToneChip>}
                {v && v.state !== 'paid' && <span className="min-w-0">{answeredCount} of {shownQs.length} answered · saved as you go</span>}
              </div>
            </div>
          </div>
          {v && v.state !== 'paid' && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', TONE.green.bar)} style={{ width: `${Math.round((answeredCount / Math.max(1, shownQs.length)) * 100)}%` }} /></div>}
        </div>

        <div className={cn('space-y-4', framed && 'min-h-0 flex-1 overflow-y-auto px-4 py-4')}>
          {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading what we already know…</p>}
          {q.isError && <Callout tone="red" icon={AlertTriangle}>{edgeErrorMessage(q.error)}</Callout>}

          {v && v.state === 'paid' && v.closed === 'client_closed' && (
            <Callout tone="grey" icon={Lock} testId="qc-client-closed" title="This client's engagement has ended.">
              <span className="text-muted-foreground">Nothing more happens here: no sign-up link can be made or sent. Ask Paul if anything looks wrong.</span>
            </Callout>
          )}

          {v && v.state === 'paid' && v.closed !== 'client_closed' && (
            <Callout tone="green" icon={CheckCircle2} title={<span className="text-lg font-bold">Paid — your part is done.</span>}>
              Paul takes it from here and will be in touch with them within two working days{v.setup?.first_contact?.due && (v.setup.first_contact.state === 'owed' || v.setup.first_contact.state === 'overdue') ? ` (by ${firstContactDueLabel(v.setup.first_contact.due)})` : ''}. He has the handoff: your answers, the contact details, the latest messages and anything still to collect.
            </Callout>
          )}

          {v && v.state === 'paid' && v.setup && (
            <SubSection title={`Client setup · ${v.setup.done}/${v.setup.total} complete`} icon={ClipboardList} tone={v.setup.ready ? 'green' : 'amber'} testId="qc-client-setup" className="text-sm">
              <p className="text-xs text-muted-foreground">{v.setup.state_label}{v.setup.submitted ? ' · submitted for delivery' : ''}</p>
              {v.setup.missing.length > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Still missing: {v.setup.missing.join(' · ')}</p>}
              {v.setup.ready && !v.setup.submitted && v.handoff?.canEdit && (
                <Button className="mt-2 h-11 w-full" onClick={() => void submitDelivery()} disabled={busy === 'submit'}>{busy === 'submit' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Submit for delivery</Button>
              )}
            </SubSection>
          )}

          {/* ── CLIENT INFO NEEDED: Paul asked this seller for missing details (client missing-info actions) ── */}
          {v && v.state === 'paid' && v.closed !== 'client_closed' && (v.info_request || v.client_info?.canEdit) && v.client_info && (
            <details className={cn(v.info_request ? cn('rounded-2xl p-3.5', TONE.amber.tint) : FOLD)} open={!!v.info_request} data-testid="qc-client-info">
              <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-semibold">
                {v.info_request ? 'CLIENT INFO NEEDED' : 'Client details for Paul'}
                <span className="text-xs font-normal text-muted-foreground">{v.info_request ? `asked ${new Date(v.info_request.reminded_at ?? v.info_request.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}` : 'optional'}</span>
              </summary>
              {v.info_request && (
                <div className="mt-2 text-sm" data-testid="qc-info-request">
                  <p>{v.lead.business_name ?? 'This client'} is missing:</p>
                  <ul className="mt-1 list-disc pl-5">{v.info_request.items.map((i) => <li key={i.key}>{i.label}</li>)}</ul>
                  <p className="mt-1 text-xs text-muted-foreground">Please add anything you collected during the sale — here, and in the handoff below. Saving tells Paul.</p>
                </div>
              )}
              <div className="mt-3"><SellerClientInfoForm info={v.client_info} onSave={saveClientInfo} busy={busy === 'client-info'} /></div>
            </details>
          )}

          {/* ── THE CURRENT QUESTION (while answering) ── */}
          {v && v.canEdit && currentQ && (
            <section aria-live="polite">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Question {Math.min(answeredCount + 1, shownQs.length)} of {shownQs.length}</p>
              <p className="mt-1 text-lg font-semibold leading-snug">{currentQ.text}</p>
              {current === 'build_consents' && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground" data-testid="qc-build-consents">
                  {(v.consents?.lines ?? currentQ.detail ?? []).map((d) => <li key={d}>{d}</li>)}
                </ul>
              )}
              <div className={cn('mt-3 grid gap-2', current === 'route' || current === 'build_consents' || current === 'approach' || current === 'domain' || current === 'design_owner' ? 'grid-cols-1' : 'grid-cols-2')}>
                {currentQ.options
                  .filter((o) => !(current === 'authority' && o.value === 'not_applicable' && (answers.manager === 'agency' || answers.manager === 'third_party')))
                  .map((o) => {
                    const off = (current === 'route' && !routeAvailable(answers, o.value as ServiceRoute))
                      || (current === 'approach' && !hasSite && NEEDS_CURRENT_SITE.has(o.value));
                    const planOf = current === 'approach' && o.value !== 'unsure' ? APPROACH_ROUTE[o.value as Exclude<QcApproach, 'unsure'>] : null;
                    return (
                      <button key={o.value} type="button" disabled={!!busy || off} onClick={() => void answer(current!, o.value)}
                        className={cn('flex min-h-[56px] flex-col items-center justify-center rounded-xl border px-3 py-3 text-center text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
                          answers[current!] === o.value ? cn('border-teal-500/70 ring-1 ring-inset', TONE.green.soft, TONE.green.text, TONE.green.ring) : 'border-border/70 bg-background hover:border-teal-500/40 hover:bg-muted/60')}>
                        {o.label}
                        {current === 'route' && <span className="mt-0.5 text-xs font-normal text-muted-foreground">{off ? 'Not possible — they have no website' : `${SERVICE_ROUTE_NAME[o.value as ServiceRoute]} · ${routePaymentsShort(o.value as ServiceRoute)}`}</span>}
                        {current === 'approach' && <span className="mt-0.5 text-xs font-normal text-muted-foreground">{off ? 'Not possible — no website on file' : planOf ? `${SERVICE_ROUTE_NAME[planOf]} · ${routePaymentsShort(planOf)}` : 'Pick the plan next'}</span>}
                      </button>
                    );
                  })}
              </div>
              {step && <button type="button" onClick={() => setStep(null)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" />Back</button>}
            </section>
          )}

          {v && v.state === 'blocked' && (
            <Callout tone="red" icon={AlertTriangle} title="The decision maker needs to approve this">
              <span className="text-muted-foreground">No sign-up link can be created. Ask who makes the decision, and send them the sign-up link or arrange a call with them.</span>
            </Callout>
          )}
          {v && v.state === 'consents_needed' && (
            <Callout tone="amber" icon={ShieldAlert} testId="qc-consents-needed" title="Build consents needed before the sign-up link">
              <span className="text-muted-foreground">A new website can only go ahead once they confirm all three. When they can, change the answer to Yes. If they would rather keep their current site, choose Optimise instead.</span>
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
          {v && answers.approach && v.state !== 'paid' && (
            <p className="text-xs text-muted-foreground" data-testid="qc-approach-summary">Website approach: <span className="font-medium text-foreground">{APPROACH_LABEL[answers.approach]}</span>
              {v.review.delivery_approach && v.review.delivery_approach !== answers.approach && <> · delivered as <span className="font-medium text-foreground">{APPROACH_LABEL[v.review.delivery_approach]}</span> unless Paul confirms the rights</>}</p>
          )}

          {/* ── THE CLOSE: terms, then the link (first on screen once the route is chosen — M-013) ── */}
          {v && route && v.state !== 'paid' && v.state !== 'blocked' && (
            <section aria-live="polite" className={cn('min-w-0 rounded-2xl p-3.5', TONE.green.tint)} data-testid="qc-route-terms">
              <p className="flex items-center gap-2 text-sm font-bold tracking-tight"><IconTile icon={PoundSterling} tone="green" size="sm" />{SERVICE_ROUTE_NAME[route]}</p>
              <ul className="mt-2 space-y-0.5 text-sm">{routeTermsLines(route).map((l, i) => <li key={l} className={cn(i === 2 && 'font-semibold')}>{l}</li>)}</ul>
              <p className="mt-1.5 text-sm">{routeOwnershipLine(route)}</p>
              <div className="mt-2.5 rounded-xl bg-background/70 p-2.5 text-sm ring-1 ring-inset ring-teal-500/20" data-testid="qc-guarantee">
                <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className={cn('h-4 w-4 shrink-0', TONE.green.text)} />{QUICK_CLOSE_GUARANTEE_LINES[0]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{QUICK_CLOSE_GUARANTEE_LINES[1]}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{QUICK_CLOSE_AGREEMENT_LINE} After payment: {QUICK_CLOSE_AFTER_PAYMENT[0]} {QUICK_CLOSE_AFTER_PAYMENT[1]}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Say the minimum term out loud before you send the link. Set by the offer — the price, the number of payments and the timing cannot be changed here.</p>

              {closing && (
                <div className="mt-3 space-y-2 border-t border-teal-500/25 pt-3" data-testid="qc-link">
                  {!v.lead.trade && (
                    <label className={cn('block rounded-xl p-2.5 text-sm font-medium', TONE.amber.tint)}>What is their trade? <span className="font-normal text-muted-foreground">(decides what the baseline measures)</span>
                      <Input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. plumber" className="mt-1.5 h-11 text-base" />
                    </label>
                  )}
                  {!usableUrl ? (
                    <>
                      {v.state === 'link_expired' && (
                        <p className={cn('flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-xs', TONE.amber.tint, TONE.amber.text)} data-testid="qc-link-expired"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                          The link made {hhmm(v.link?.generated_at)} is no longer usable and must not be sent. Make the sign-up link — any old payment page is closed.
                        </p>
                      )}
                      <Button className={MONEY_CTA} onClick={() => void generate()} disabled={!!busy}>
                        {busy === 'link' ? <Loader2 className="h-5 w-5 animate-spin" /> : v.state === 'link_expired' ? <RefreshCw className="h-5 w-5" /> : <PoundSterling className="h-5 w-5" />}
                        {v.state === 'link_expired' ? 'Make a fresh sign-up link' : 'Create sign-up link'}
                      </Button>
                      <p className="text-center text-xs text-muted-foreground">One link for the client: they check their details, read and sign the Client Service Agreement, then pay £{FINDABLE_SETUP_PRICE_GBP}. Payment cannot open before they sign.</p>
                    </>
                  ) : (
                    <>
                      <p className={cn('flex flex-wrap items-center gap-x-1 text-xs font-semibold uppercase tracking-wide', TONE.green.text)}><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Sign-up link ready · <span className="font-normal normal-case">{timeLeft(v.link?.usable_until ?? v.link?.expires_at)}</span></p>
                      <Button className={MONEY_CTA} onClick={() => void doCopy('link', usableUrl)}>
                        {copied === 'link' ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}{copied === 'link' ? 'Copied' : 'Copy sign-up link'}
                      </Button>
                      <p className="line-clamp-2 break-all rounded-lg bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground" title={usableUrl}>{usableUrl}</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Button variant="outline" className="h-12 gap-1.5" onClick={() => void sendEmail()} disabled={!v.share?.email || !!busy} title={v.share?.email ? `Emails the link and the terms to ${v.share.email}` : 'No email address for them — add one under "Correct a detail"'}>
                          {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Email the link
                        </Button>
                        <Button variant="outline" className="h-12 gap-1.5" onClick={() => void sendWhatsApp()} disabled={!v.windowOpen || !v.share?.hasPhone || !!busy} title={v.windowOpen ? 'Sends the link and the terms in their open WhatsApp conversation' : 'The WhatsApp window is closed — email or copy the link instead'}>
                          {busy === 'wa' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}Send on WhatsApp
                        </Button>
                        <Button variant="outline" className="h-12 gap-1.5" onClick={() => void doCopy('message', quickCloseMessage(greetName, usableUrl, route))}><ClipboardCopy className="h-4 w-4" />{copied === 'message' ? 'Copied' : 'Copy message'}</Button>
                      </div>
                      <p className="text-xs text-muted-foreground" data-testid="qc-share-availability">
                        {v.share?.email ? `Email goes to ${v.share.email}.` : 'No email address on file — add one under "Correct a detail" to email it.'}{' '}
                        {!v.share?.hasPhone ? 'No phone number for WhatsApp.' : v.windowOpen ? 'WhatsApp is open (they messaged in the last 24 hours).' : 'WhatsApp is closed (no message from them in the last 24 hours) — email the link instead.'}
                      </p>
                      {(v.link?.shared.length ?? 0) > 0 && (
                        <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="qc-share-history">
                          {v.link!.shared.slice().reverse().map((s) => (
                            <li key={`${s.channel}-${s.at}`}>✓ {SHARE_WORDS[s.channel]}{s.channel === 'email' && s.to ? ` to ${s.to}` : ''}{s.status === 'simulated' ? ' (test mode — not delivered)' : ''}{s.channel === 'copy' ? ' (to send by hand)' : ''} · {hhmm(s.at)}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          {v && route && v.state !== 'paid' && v.state !== 'blocked' && (
            <details className={FOLD} open={v.state === 'ready'}>
              <summary className="flex min-h-[36px] cursor-pointer select-none items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><span className={cn('h-4 w-1 shrink-0 rounded-full', TONE.blue.bar)} aria-hidden />What to tell them</span><button type="button" onClick={(e) => { e.preventDefault(); void doCopy('script', script); }} className="inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-medium text-primary hover:bg-muted hover:underline">{copied === 'script' ? 'Copied' : 'Copy'}</button></summary>
              <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={6} className="mt-2 text-sm" aria-label="What to tell them (edit freely)" />
              <p className="mt-1 text-[11px] text-muted-foreground">Your words — change them however you like, but keep the price, the minimum term and the guarantee as written. Never promise a ranking, a recommendation or that AI will name them.</p>
            </details>
          )}

          {v && v.gate.notes.length > 0 && v.state !== 'paid' && (
            <ul className="space-y-1 text-xs text-muted-foreground">{v.gate.notes.map((n) => <li key={n}>• {n} (Paul will pick this up)</li>)}</ul>
          )}

          {v && Object.keys(answers).length > 0 && (
            <ul className="space-y-1">
              {shownQs.filter((x) => answers[x.key]).map((x) => (
                <li key={x.key}>
                  <button type="button" disabled={!v.canEdit} onClick={() => setStep(x.key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/60 disabled:hover:bg-transparent">
                    <Check className={cn('h-4 w-4 shrink-0', TONE.green.text)} />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{x.text}</span>
                    <span className="shrink-0 font-semibold">{x.options.find((o) => o.value === answers[x.key])?.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* The handoff folds to one line while the close is happening (M-013); it can be finished after payment. */}
          {v?.handoff && v.handoff.canEdit && v.state !== 'not_started' && v.state !== 'blocked' && (
            <details className={cn(FOLD, v.handoff.complete ? EDGE.green : EDGE.amber)} open={v.state === 'paid' && !v.handoff.complete} data-testid="qc-handoff">
              <summary className="flex min-h-[36px] cursor-pointer select-none flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm font-semibold">Handoff for Paul<ToneChip tone={v.handoff.complete ? 'green' : 'amber'} dot>{v.handoff.complete ? 'complete' : v.handoff.saved_at ? `${v.handoff.missing.length} still to answer` : 'not started — can wait until after the call'}</ToneChip></summary>
              <p className="mt-1 text-xs text-muted-foreground">Quick answers so Paul does not have to ask again. Send the link first — this can be finished after they pay.</p>
              <div className="mt-3"><SalesHandoffForm fields={v.handoff.fields} prefilled={v.handoff.prefilled} route={route} onSave={saveHandoff} busy={busy === 'handoff'} compact /></div>
            </details>
          )}

          {v && (
            <details className={FOLD} open={v.state === 'not_started'}>
              <summary className="flex min-h-[36px] cursor-pointer select-none items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><span className={cn('h-4 w-1 shrink-0 rounded-full', TONE.grey.bar)} aria-hidden />What we already know</span><span className="text-xs font-normal text-muted-foreground">no need to ask</span></summary>
              {!editing ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {known.map(([k, val]) => <FragmentRow key={k} k={k} v={val} />)}
                </dl>
              ) : (
                <div className="mt-2 space-y-2">
                  {([['contact_name', 'Contact name'], ['contact_email', 'Email'], ['confirmed_phone', 'Phone'], ['business_website', 'Website']] as const).map(([k, label]) => (
                    <label key={k} className="block text-xs text-muted-foreground">{label}<Input value={fix[k] ?? ''} onChange={(e) => setFix((f) => ({ ...f, [k]: e.target.value }))} className="mt-0.5 h-10 text-sm" inputMode={k === 'confirmed_phone' ? 'tel' : k === 'contact_email' ? 'email' : 'text'} /></label>
                  ))}
                  <div className="flex gap-2"><Button size="sm" className="h-10 flex-1" onClick={() => void saveFixes()} disabled={busy === 'fix'}>Save</Button><Button size="sm" variant="ghost" className="h-10" onClick={() => setEditing(false)}>Cancel</Button></div>
                </div>
              )}
              {v.canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Pencil className="h-3 w-3" />Correct a detail</button>}
            </details>
          )}

          {v && !v.lead.trade && v.canEdit && !closing && (
            <label className={cn('block rounded-2xl p-3.5 text-sm font-medium', TONE.amber.tint)}>What is their trade? <span className="font-normal text-muted-foreground">(decides what the baseline measures)</span>
              <Input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. plumber" className="mt-1.5 h-11 text-base" />
            </label>
          )}

          {v && v.state !== 'paid' && framed && <p className="text-center text-[11px] text-muted-foreground">Prefer they fill it in themselves? The self-service sign-up link is on the lead's Close tab.</p>}
        </div>
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v: string | null | undefined }) {
  return (<><dt className="text-muted-foreground">{k}</dt><dd className={cn('min-w-0 truncate font-medium', !v && 'font-normal text-muted-foreground/70')} title={v ?? undefined}>{v || 'not known'}</dd></>);
}

/* ══ THE WEBSITE APPROACH, CAPTURED EARLY (sales workspace v2) ═══════════════════════════════════════
   The DETAILS tab's field and the Close tab's question are ONE stored answer (quick_close.answers.approach,
   saved by fn quick-close like every other answer). It decides the plan (Build / Optimise) and which Close
   questions make sense, so a switch of plan asks first, exactly as on the Close tab. */
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
        {(Object.keys(APPROACH_LABEL) as QcApproach[]).map((k) => {
          const off = !v.canEdit || busy || (!hasSite && NEEDS_CURRENT_SITE.has(k));
          return (
            <button key={k} type="button" disabled={off} onClick={() => void choose(k)} aria-pressed={a.approach === k}
              className={cn('rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors disabled:opacity-50',
                a.approach === k ? cn('border-teal-500/70', TONE.green.soft, TONE.green.text) : 'border-border/60 hover:bg-muted')}>
              {APPROACH_LABEL[k]}
              <span className="block text-[10px] font-normal text-muted-foreground">{!hasSite && NEEDS_CURRENT_SITE.has(k) ? 'No website on file' : k === 'unsure' ? 'Paul recommends after payment' : SERVICE_ROUTE_NAME[APPROACH_ROUTE[k]]}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{plan ? `Plan: ${SERVICE_ROUTE_NAME[plan]} · ${routePaymentsShort(plan)}. ` : ''}This decides which questions the Close tab asks.{v.canEdit ? '' : ' (Locked — this lead has paid or ended.)'}</p>
    </div>
  );
}

/** The button that opens it (the lead workspace header, Focus Mode). */
/** variant 'quiet' (the lead workspace header, 2026-10-01): an outline shortcut that does not compete with
 *  the Next Action — the same dialog, the same payment path. */
export function QuickCloseButton({ leadId, className, size = 'sm', variant = 'solid' }: { leadId: string; className?: string; size?: 'sm' | 'lg'; variant?: 'solid' | 'quiet' }) {
  const [open, setOpen] = useState(false);
  const nav = useContext(QuickCloseNav);
  return (
    <>
      <button type="button" onClick={() => (nav ? nav.openClose(leadId) : setOpen(true))} className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', variant === 'quiet' ? 'border border-teal-600/40 text-teal-700 hover:bg-teal-500/10 dark:text-teal-300' : 'bg-teal-600 text-white hover:bg-teal-700', size === 'lg' ? 'h-11 px-4 text-sm rounded-xl' : 'h-8 px-2.5 text-xs', className)} aria-label="Quick Close: take payment now">
        <Zap className="h-3.5 w-3.5" />Quick Close
      </button>
      {open && !nav && <QuickCloseDialog leadId={leadId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
