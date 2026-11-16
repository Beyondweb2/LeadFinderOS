import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Loader2, Mail, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Callout } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { notifyLeadChanged } from '@/lib/leadSync';
import { saveNextAction } from '@/lib/nextActionWrite';
import { newSendKey } from '@/lib/smsClient';
import { smsSize } from '@/lib/channelCosts';
import { isRefused, previewMoreInfo, savePriceLine, sendMoreInfo, type MoreInfoPreview } from '@/lib/moreInfoClient';
import { MORE_INFO_CONSENT_LABEL, MORE_INFO_NEXT_ACTION, moreInfoFollowUpDay, moreInfoFollowUpNote, type MoreInfoChannel } from '@/lib/moreInfoMessage';
import { cn } from '@/lib/utils';

/* ══ SEND MORE INFO (Paul, 2026-11-16, docs/send-more-info.md) ═════════════════════════════════════════════════════════════
   On the prospect page, beside the sign-up / onboarding sends: for a prospect who asked for more info on the call. ONE email or ONE
   text (never WhatsApp), previewed and editable first. The words are built by the server from the lead (business name, latest report,
   trade, the price line setting, your first name); an edit may change the words but not add a link. After it sends, your Next Action
   for the lead becomes a Follow up in two days (the same Next Action write as the form). */
export function SendMoreInfo({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-12 w-full gap-2" onClick={() => setOpen(true)} data-testid="send-more-info-open">
        <Info className="h-4 w-4" />Send more info
      </Button>
      {open && <SendMoreInfoDialog leadId={leadId} onClose={() => setOpen(false)} />}
    </>
  );
}

const ukDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });

/** `initialChannel` + `askedOnCall`: opened from Log call's "Wants info" — the channel is picked and the call-consent box is already ticked
 *  (the logged call is the record that they asked; the server still gets callConsent true, so the History line is the same). */
export function SendMoreInfoDialog({ leadId, onClose, initialChannel, askedOnCall = false }: { leadId: string; onClose: () => void; initialChannel?: MoreInfoChannel; askedOnCall?: boolean }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [p, setP] = useState<MoreInfoPreview | null>(null);
  const [channel, setChannel] = useState<MoreInfoChannel>('email');
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [priceLine, setPriceLine] = useState('');
  const [busy, setBusy] = useState<null | 'send' | 'price'>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(newSendKey);
  /* "They asked for this info on a call" — required to send (text or email); it is the consent recorded on History. */
  const [callConsent, setCallConsent] = useState(askedOnCall);

  const load = async () => {
    setLoading(true); setError(null);
    const r = await previewMoreInfo(leadId);
    if (isRefused(r)) { setRefusal(r.detail); setP(null); }
    else {
      setRefusal(null); setP(r);
      setSubject(r.email.subject); setEmailBody(r.email.body); setSmsBody(r.sms.body); setPriceLine(r.price_line);
      setChannel(initialChannel ?? (r.email.to ? 'email' : !r.sms.refusal ? 'sms' : 'email'));
    }
    setLoading(false);
  };
  /* Load once when the dialog mounts. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [leadId]);

  const followDay = moreInfoFollowUpDay();
  const unavailable = !p ? 'Loading…' : channel === 'email' ? (p.email.to ? null : 'There is no email address on this lead. Add it on the lead first, or send a text.') : p.sms.refusal;

  const send = async () => {
    if (!p || busy || !callConsent) return;
    setBusy('send'); setError(null);
    const r = await sendMoreInfo({ leadId, channel, subject: channel === 'email' ? subject : undefined, text: channel === 'email' ? emailBody : smsBody, key, callConsent });
    if (isRefused(r)) { setError(r.detail); setBusy(null); setKey(newSendKey()); return; }
    /* The follow-up: a person's send sets it, through the one Next Action write. A refusal here does not undo the send. */
    const na = await saveNextAction(leadId, { nextAction: MORE_INFO_NEXT_ACTION, date: followDay, time: null, note: moreInfoFollowUpNote(channel) });
    notifyLeadChanged(leadId);
    toast({
      title: r.simulated ? 'Test mode: not really sent' : channel === 'email' ? 'More info emailed' : 'More info texted',
      description: [r.to ? `To ${r.to}.` : null, na.ok ? `Next Action: Follow up ${ukDay(followDay)}.` : 'The follow-up could not be set. Set it on the lead.'].filter(Boolean).join(' '),
      variant: na.ok ? undefined : 'destructive',
    });
    setBusy(null);
    onClose();
  };

  const savePrice = async () => {
    setBusy('price'); setError(null);
    const r = await savePriceLine(priceLine);
    setBusy(null);
    if (isRefused(r)) { setError(r.detail); return; }
    toast({ title: 'Price line saved', description: r.price_line });
    await load();
  };

  const smsSegments = smsSize(smsBody).segments;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && busy !== 'send') onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="send-more-info-dialog">
        <DialogHeader>
          <DialogTitle>Send more info</DialogTitle>
          <DialogDescription>Their report and what we do, by email or text. Check it, edit it if you need to, then send.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Building the message…</div>
        ) : refusal ? (
          <Callout tone="amber" icon={AlertTriangle} title="Can't send more info yet" testId="send-more-info-refused">
            <span className="text-muted-foreground">{refusal}</span>
          </Callout>
        ) : p && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2" role="tablist">
              {(['email', 'sms'] as const).map((c) => (
                <button key={c} type="button" role="tab" aria-selected={channel === c} onClick={() => { setChannel(c); setError(null); }}
                  className={cn('flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold', channel === c ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
                  data-testid={`send-more-info-${c}`}>
                  {c === 'email' ? <><Mail className="h-4 w-4" />Email</> : <><MessageSquare className="h-4 w-4" />Text</>}
                </button>
              ))}
            </div>
            {p.warning && <Callout tone="amber" icon={AlertTriangle} title="Check the wording" testId="send-more-info-warning"><span className="text-muted-foreground">{p.warning}</span></Callout>}
            {unavailable ? (
              <Callout tone="amber" icon={AlertTriangle} title={channel === 'email' ? 'No email address' : 'Text not available'}><span className="text-muted-foreground">{unavailable}</span></Callout>
            ) : channel === 'email' ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">To <span className="font-medium text-foreground">{p.email.to}</span> · replies come to your own email</p>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" data-testid="send-more-info-subject" />
                <Textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={18} className="font-sans text-sm" aria-label="Email" data-testid="send-more-info-email-body" />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">To <span className="font-medium text-foreground">{p.sms.to}</span> · {smsSegments} text{smsSegments === 1 ? '' : 's'} long</p>
                <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} rows={12} className="font-sans text-sm" aria-label="Text" data-testid="send-more-info-sms-body" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Keep their report link as it is. After sending, the Next Action becomes <span className="font-medium text-foreground">Follow up {ukDay(followDay)}</span>.</p>
            {p.can_edit_price && (
              <details className="rounded-lg border border-border/60 px-3 py-2 text-sm" data-testid="send-more-info-price">
                <summary className="cursor-pointer font-medium">Price line (admin, used in every email and text)</summary>
                <div className="mt-2 flex gap-2">
                  <Input value={priceLine} onChange={(e) => setPriceLine(e.target.value)} maxLength={160} aria-label="Price line" />
                  <Button variant="outline" onClick={() => void savePrice()} disabled={!!busy}>{busy === 'price' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Saving rebuilds this preview (your edits above are replaced).</p>
              </details>
            )}
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-sm" data-testid="send-more-info-consent">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={callConsent} onChange={(e) => setCallConsent(e.target.checked)} data-testid="send-more-info-consent-box" />
              <span><span className="font-medium">{MORE_INFO_CONSENT_LABEL}</span><span className="block text-xs text-muted-foreground">Required to send. It is saved on the lead's History with your name.</span></span>
            </label>
            {error && <p className="text-sm text-destructive" data-testid="send-more-info-error">{error}</p>}
            <Button className="h-12 w-full gap-2" onClick={() => void send()} disabled={!!busy || !!unavailable || !callConsent} data-testid="send-more-info-send">
              {busy === 'send' ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />{channel === 'email' ? 'Send email' : 'Send text'}</>}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
