import { useState } from 'react';
import { AlertTriangle, Check, CheckCheck, Clock, FlaskConical, Loader2, MessageSquareText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useContactDecision, useSmsThread } from '@/hooks/useSms';
import { BestWayToContact } from '@/components/BestWayToContact';
import type { RouteChannel } from '@/lib/contactRouting';

/* SEND THIS LINK BY TEXT (2026-10-09) — the SMS button on the two Close screens (the agreement & payment link, and the
   Full Setup link), plus the honest status of the last text and the "Best way to contact" card above it.
   ⛔ This only ASKS: onSend calls Quick Close (the authoritative flow — it generated the link, it checks the customer and
      attributes the sale to the rep, and it texts through the one guarded sender). The browser never builds or types a link.
   ⛔ The status is the carrier's, read from sms_messages: "Queued" and "Sent" are not "Delivered"; a failure names the
      other ways to send the same link, and a resend is a deliberate second press, never automatic. */
export function SmsLinkSend({ leadId, kind, onSend, otherSent }: {
  leadId: string; kind: 'setup' | 'agreement';
  onSend: (resend: boolean) => Promise<boolean>;
  /** Other channels that already carried this link (so the recommendation says "already sent by …"). */
  otherSent?: RouteChannel[];
}) {
  const [busy, setBusy] = useState(false);
  const thread = useSmsThread(leadId);
  const { decision } = useContactDecision(leadId, 'link', { alreadySent: otherSent });
  const last = (thread.data ?? []).filter((m) => m.direction === 'outbound' && m.link_kind === kind).slice(-1)[0] ?? null;
  const repliedAfter = last ? (thread.data ?? []).some((m) => m.direction === 'inbound' && m.created_at > last.created_at) : false;
  const sms = decision?.options.find((o) => o.channel === 'sms');
  const failed = !!last && (last.status === 'failed' || last.status === 'undelivered');
  const go = async (resend: boolean) => {
    if (resend && !window.confirm('Text this link to them again?')) return;
    setBusy(true);
    try { await onSend(resend); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2" data-testid={`sms-link-${kind}`}>
      <BestWayToContact leadId={leadId} purpose="link" alreadySent={otherSent} failed={failed ? ['sms'] : undefined} />
      {last && !failed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-500/30 bg-blue-500/[0.06] px-3 py-2 text-sm" data-testid="sms-link-sent">
          <span className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300">
            {last.status === 'simulated' ? <FlaskConical className="h-4 w-4" /> : last.status === 'delivered' ? <CheckCheck className="h-4 w-4" /> : last.status === 'sent' ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {last.status === 'simulated' ? 'Texted (test mode — not sent)' : repliedAfter ? 'Texted · they replied' : last.status === 'delivered' ? 'Texted · delivered' : last.status === 'sent' ? 'Texted · sent to the network' : 'Texted · queued (delivery not confirmed yet)'}
          </span>
          <Button size="sm" variant="outline" className="h-9" onClick={() => void go(true)} disabled={busy} data-testid={`sms-link-resend-${kind}`}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}Resend
          </Button>
        </div>
      ) : (
        <>
          {failed && (
            <p className="flex items-start gap-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300" data-testid="sms-link-failed"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />That text did not arrive. Check the number with them, resend it, or send the link another way below.</p>
          )}
          {sms?.available ? (
            <Button className="h-12 w-full gap-1.5 rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700" onClick={() => void go(failed)} disabled={busy} data-testid={`sms-link-send-${kind}`}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><MessageSquareText className="h-4 w-4" />{failed ? 'Text it again' : kind === 'setup' ? 'Text the full setup link' : 'Text the agreement & payment link'}</>}
            </Button>
          ) : sms ? (
            <p className={cn('rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground')} data-testid="sms-link-unavailable">Text: {sms.reason}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
