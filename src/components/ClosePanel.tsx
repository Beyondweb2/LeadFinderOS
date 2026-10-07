import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy, FileText, Loader2, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { notifyLeadChanged } from '@/lib/leadSync';
import { LINK_READY_FALLBACK } from '@/lib/paymentLinkRoute';
import { OnboardingLinkCard } from '@/components/OnboardingLinkCard';
import { QuickClosePanel, quickCloseKey, useQuickClose } from '@/components/QuickCloseDialog';
import { cn } from '@/lib/utils';

/* ══ THE TWO WAYS TO CLOSE (2026-10-07, fix/quick-close-two-options) ═══════════════════════════════════════
   How do you want to close them?
     CLOSE ON THE PHONE — ask the short questions now, then send the Agreement & Payment link (QuickClosePanel).
     SEND FULL SETUP    — send their own set-up link; they answer the questions, then agreement, then payment.
   One sign-up either way (the same onboarding row, agreement link and checkout); neither link is a Stripe URL.
   The choice is only a way in: once answers exist, or a set-up link has gone out, this opens on that way. */

type Way = 'phone' | 'setup';

const WAY_CARD = 'flex min-h-[88px] w-full items-start gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:border-blue-500/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function ClosePanel({ leadId, active = true, framed = false }: { leadId: string; active?: boolean; framed?: boolean }) {
  const q = useQuickClose(leadId, active);
  const v = q.data;
  const [picked, setPicked] = useState<Way | 'chooser' | null>(null);
  if (!v) return <QuickClosePanel leadId={leadId} active={active} framed={framed} />; // loading / error states live there
  /* Paid, ended or not editable: nothing to choose — the one panel says where it stands. */
  if (v.state === 'paid' || !v.canEdit) return <QuickClosePanel leadId={leadId} active={active} framed={framed} />;
  const started = Object.keys(v.answers ?? {}).length > 0 || !!v.link;
  const sentSetup = (v.full_setup?.shared.length ?? 0) > 0;
  const way: Way | null = picked === 'chooser' ? null : picked ?? (started ? 'phone' : sentSetup ? 'setup' : null);
  const back = (
    <button type="button" onClick={() => setPicked('chooser')} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" data-testid="close-change-way">
      <ArrowLeft className="h-3 w-3" />How do you want to close them?
    </button>
  );
  return (
    <div className={cn(framed && 'h-full overflow-y-auto px-4 py-4')} data-testid="close-panel">
      {way === null && (
        <section className="space-y-3" data-testid="close-chooser">
          <p className="text-lg font-bold tracking-tight">How do you want to close them?</p>
          <button type="button" className={WAY_CARD} onClick={() => setPicked('phone')} data-testid="close-way-phone">
            <Phone className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <span><span className="block text-base font-bold">Close on the phone</span><span className="mt-0.5 block text-sm text-muted-foreground">Ask the questions now, then send agreement &amp; payment</span></span>
          </button>
          <button type="button" className={WAY_CARD} onClick={() => setPicked('setup')} data-testid="close-way-setup">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <span><span className="block text-base font-bold">Send full setup</span><span className="mt-0.5 block text-sm text-muted-foreground">Let the customer fill it in themselves</span></span>
          </button>
        </section>
      )}
      {way === 'phone' && <div>{back}<QuickClosePanel leadId={leadId} active={active} /></div>}
      {way === 'setup' && <div>{back}<FullSetupPanel leadId={leadId} /></div>}
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
  const setup = v.full_setup;
  const lr = v.link_route;
  const canWa = lr?.route === 'whatsapp_reply' || lr?.route === 'whatsapp_template';
  const sentWa = (setup?.shared ?? []).filter((s) => s.channel === 'whatsapp' && s.status !== 'failed').slice(-1)[0] ?? null;
  const call = async (channel: 'whatsapp' | 'copy', resend = false) => {
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
      <Button variant="outline" className="h-12 w-full gap-1.5" onClick={() => void copy()} data-testid="setup-copy-link">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}
      </Button>
      {(setup?.shared.length ?? 0) > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="setup-share-history">
          {setup!.shared.slice().reverse().map((s) => <li key={s.channel + s.at}>✓ {s.channel === 'copy' ? 'Copied (to send by hand)' : s.status === 'simulated' ? 'Sent on WhatsApp (test mode — not delivered)' : 'Sent on WhatsApp'} · {hhmm(s.at)}</li>)}
        </ul>
      )}
      <OnboardingLinkCard lead={{ id: v.lead.id, business_name: v.lead.business_name, category: v.lead.trade, search_location: v.lead.town, amount_paid: 0 }} />
    </section>
  );
}
