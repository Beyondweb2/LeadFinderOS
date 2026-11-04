import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ShieldAlert, Check, CheckCircle2, Copy, FileText, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { QC_REVIEW_HEADING, TIED_IN_DECLINE_HEADING } from '@/lib/quickClose';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { notifyLeadChanged } from '@/lib/leadSync';
import { LINK_READY_FALLBACK } from '@/lib/paymentLinkRoute';
import { OnboardingLinkCard } from '@/components/OnboardingLinkCard';
import { QuickClosePanel, quickCloseKey, useQuickClose } from '@/components/QuickCloseDialog';
import { CustomerEmailControl } from '@/components/CustomerEmailControl';
import { SmsLinkSend } from '@/components/SmsLinkSend';
import { cn } from '@/lib/utils';

/* ══ THE CLOSE SECTION (Paul, 2026-11-04, docs/prospect-one-page-close.md) ═════════════════════════════════════════════
   The foot of the prospect page: the plan, then WhatsApp / Text / Email (QuickClosePanel). The other way to close, letting the customer
   fill in the questions on their own link, is folded under it: same sign-up row, same agreement, same checkout. Neither link is a Stripe URL. */
export function ClosePanel({ leadId, active = true, framed = false }: { leadId: string; active?: boolean; framed?: boolean }) {
  const q = useQuickClose(leadId, active);
  const v = q.data;
  /* Loading, error, paid, ended or not editable: the one panel says where it stands. */
  if (!v || v.state === 'paid' || !v.canEdit || v.prospect_only) return <QuickClosePanel leadId={leadId} active={active} framed={framed} />;
  const noAnswers = Object.keys(v.answers ?? {}).length === 0;
  const setupSent = (v.full_setup?.shared.length ?? 0) > 0;
  return (
    <div className={cn('space-y-3', framed && 'h-full overflow-y-auto px-4 py-4')} data-testid="close-panel">
      {v.state === 'needs_review' && noAnswers && <SelfServeHold leadId={leadId} reasons={v.review.reasons} />}
      {v.state === 'declined' && noAnswers && <SelfServeDeclined reasons={v.review.reasons} />}
      <QuickClosePanel leadId={leadId} active={active} />
      <details className="group rounded-xl border border-border/60 px-3 py-2" open={setupSent} data-testid="close-full-setup">
        <summary className="flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />Or let them fill it in themselves<ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-2"><FullSetupPanel leadId={leadId} /></div>
      </details>
    </div>
  );
}

/** 🔴 v5 clause 1.6 (2026-10-16): the client said on their OWN page that they are still tied into a contract with whoever looks after
 *  their website. We do not take them on: no release, no other plan. Their details are kept so someone can get back in touch. */
function SelfServeDeclined({ reasons }: { reasons: string[] }) {
  return (
    <div className="mb-3" data-testid="self-serve-declined">
      <Callout tone="red" icon={AlertTriangle} title={TIED_IN_DECLINE_HEADING}>
        <p className="text-muted-foreground">They said on their own page that they are still tied into a contract with their current provider.</p>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="mt-2 text-muted-foreground">No payment can be taken and nothing else is offered. Get back in touch when their contract ends.</p>
      </Callout>
    </div>
  );
}

/** The client's OWN sign-up chose Build on an agency-run site and is NOT SURE whether they are still tied in: the SAME stop as a phone
 *  close, the same release (quick-close approve_review, Paul only), given only once they confirm they are free. Nothing is charged meanwhile. */
function SelfServeHold({ leadId, reasons }: { leadId: string; reasons: string[] }) {
  const { role } = useSubscription();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const release = async () => {
    setBusy(true);
    try { const r = await invokeEdge<unknown>('quick-close', { lead_id: leadId, mode: 'approve_review' }); qc.setQueryData(quickCloseKey(leadId), r); notifyLeadChanged(leadId); toast({ title: 'Released for payment' }); }
    catch (e) { toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-3" data-testid="self-serve-hold">
      <Callout tone="amber" icon={ShieldAlert} title={QC_REVIEW_HEADING}>
        <p className="text-muted-foreground">They chose Build on their own page.</p>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="mt-2 text-muted-foreground">Payment stays closed to them until Paul looks. You do not need to sort this out.</p>
        {role === 'admin' && <Button size="sm" className="mt-2 h-10" onClick={() => void release()} disabled={busy} data-testid="self-serve-release">{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Release for payment</Button>}
      </Callout>
    </div>
  );
}

const hhmm = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** SEND FULL SETUP: their own link — questions, then agreement, then payment. Nothing is created until they use it. */
export function FullSetupPanel({ leadId }: { leadId: string }) {
  const q = useQuickClose(leadId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const v = q.data;
  if (!v) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>;
  /* v5 clause 1.6: the call's answers say they are still tied into a contract with their current provider — no set-up
     link (the server refuses it too: share_setup → declined). */
  if (v.state === 'declined') {
    return (
      <section className="space-y-3" data-testid="full-setup-panel">
        <p className="text-lg font-bold tracking-tight">Send full setup</p>
        <Callout tone="red" icon={AlertTriangle} testId="setup-declined" title={TIED_IN_DECLINE_HEADING}>
          <span className="text-muted-foreground">They are still tied into a contract with whoever looks after their website, so we can't take them on now and no set-up link is sent. Get back in touch when the contract ends.</span>
        </Callout>
      </section>
    );
  }
  const setup = v.full_setup;
  const lr = v.link_route;
  const canWa = lr?.route === 'whatsapp_reply' || lr?.route === 'whatsapp_template';
  const sentWa = (setup?.shared ?? []).filter((s) => s.channel === 'whatsapp' && s.status !== 'failed').slice(-1)[0] ?? null;
  const call = async (channel: 'whatsapp' | 'copy' | 'email' | 'sms', resend = false) => {
    setBusy(channel);
    try {
      const r = await invokeEdge<typeof v>('quick-close', { lead_id: leadId, mode: 'share_setup', channel, ...(resend ? { resend: true } : {}) });
      qc.setQueryData(quickCloseKey(leadId), r);
      notifyLeadChanged(leadId);
      return true;
    } catch (e) {
      toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' });
      return false;
    } finally { setBusy(null); }
  };
  const send = async (resend = false) => {
    if (resend && !window.confirm('Send the full setup link to them on WhatsApp again?')) return;
    if (await call('whatsapp', resend)) toast({ title: 'Full setup sent on WhatsApp' });
  };
  const sendSmsSetup = async (resend = false): Promise<boolean> => {
    const ok = await call('sms', resend);
    if (ok) toast({ title: 'Full setup link texted', description: 'Delivery is confirmed once the network reports it.' });
    return ok;
  };
  const sendEmail = async () => {
    if (await call('email')) toast({ title: 'Full setup link emailed', description: v.share?.email ? `To ${v.share.email}` : undefined });
  };
  /** The customer's email is saved to the lead itself (quick-close save_email) — same field the other screens read. */
  const saveEmail = async (email: string) => {
    setBusy('email-save');
    try {
      const r = await invokeEdge<typeof v>('quick-close', { lead_id: leadId, mode: 'save_email', email });
      qc.setQueryData(quickCloseKey(leadId), r);
      notifyLeadChanged(leadId);
      toast({ title: 'Email saved', description: email });
      return true;
    } catch (e) {
      toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' });
      return false;
    } finally { setBusy(null); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(setup!.url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); toast({ title: 'Link copied' }); void call('copy'); }
    catch { toast({ title: 'Copy blocked by the browser', description: 'Select the link and copy it by hand.', variant: 'destructive' }); }
  };
  return (
    <section className="space-y-3" data-testid="full-setup-panel">
      <div>
        <p className="text-lg font-bold tracking-tight">Send full setup</p>
        <p className="mt-0.5 text-sm text-muted-foreground">They answer a few short questions on their own link, see their plan, sign the agreement and pay. Nothing for you to fill in.</p>
      </div>
      {sentWa ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-sm" data-testid="setup-whatsapp-sent">
          <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />{sentWa.status === 'simulated' ? 'Sent on WhatsApp (test mode — not delivered)' : 'Sent on WhatsApp'} · {hhmm(sentWa.at)}</span>
          {canWa && <Button size="sm" variant="outline" className="h-9" onClick={() => void send(true)} disabled={!!busy} data-testid="setup-resend-whatsapp">{busy === 'whatsapp' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}Resend</Button>}
        </div>
      ) : canWa ? (
        <Button className="h-14 w-full gap-2 rounded-xl bg-blue-600 text-base font-bold text-white hover:bg-blue-700" onClick={() => void send(false)} disabled={!!busy} data-testid="setup-send-whatsapp">
          {busy === 'whatsapp' ? <><Loader2 className="h-5 w-5 animate-spin" />Sending…</> : <><MessageCircle className="h-5 w-5" />Send full setup on WhatsApp</>}
        </Button>
      ) : (
        <Callout tone="amber" icon={AlertTriangle} testId="setup-link-fallback" title={LINK_READY_FALLBACK}>
          <span className="text-muted-foreground">{lr?.say ?? 'WhatsApp is not available for this link.'} Copy the link and send it another way.</span>
        </Callout>
      )}
      <SmsLinkSend leadId={leadId} kind="setup" otherSent={sentWa ? ['whatsapp'] : []} onSend={sendSmsSetup} />
      <CustomerEmailControl testId="setup-customer-email" email={v.share?.email ?? null} busy={busy} onSave={saveEmail} onSend={() => void sendEmail()} />
      <Button variant="outline" className="h-12 w-full gap-1.5" onClick={() => void copy()} data-testid="setup-copy-link">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}
      </Button>
      {(setup?.shared.length ?? 0) > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="setup-share-history">
          {setup!.shared.slice().reverse().map((s) => <li key={s.channel + s.at}>✓ {s.channel === 'copy' ? 'Copied (to send by hand)' : s.channel === 'email' ? `Emailed${s.to ? ` to ${s.to}` : ''}` : (s.channel as string) === 'sms' ? (s.status === 'simulated' ? 'Texted (test mode — not sent)' : 'Texted') : s.status === 'simulated' ? 'Sent on WhatsApp (test mode — not delivered)' : 'Sent on WhatsApp'} · {hhmm(s.at)}</li>)}
        </ul>
      )}
      <OnboardingLinkCard lead={{ id: v.lead.id, business_name: v.lead.business_name, category: v.lead.trade, search_location: v.lead.town, amount_paid: 0 }} />
    </section>
  );
}
