import { CircleAlert, Loader2, Mic, MicOff, PhoneCall, PhoneOff, FlaskConical, ClipboardPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TONE } from '@/components/salesDash/primitives';
import { useEffect } from 'react';
import { fmtDuration, type TwilioCall } from '@/hooks/useTwilioCall';
import { useLiveCall, useLiveCallActions } from '@/components/LiveCall';
import { callNumberView } from '@/lib/callNumber';
import { REDIAL_FAILURES } from '@/lib/callManager';
import { pickCallNumber } from '@/lib/callRules';

/* THE CALL PANEL (2026-10-09) — top of the Call tab: the Call in browser button (and a small Call on WhatsApp) and, when you choose to
   call from the browser, the live call (Calling… / Ringing / Connected 02:13 / Ended / Failed), Mute and Hang up.
   Sits ABOVE the script, the questions and the Close section — all on one page, so the rep keeps reading while talking.
   ⛔ Opening the workspace or pressing a button here records nothing about the lead. When a call ends, the panel offers
      "Log this call" (the existing What happened? window): an outcome is still the rep's, never assumed.
   ⛔ The free alternative (WhatsApp app call, from the rep's own phone) is a separate, labelled button — never a silent
      fallback from a failed chargeable call, and a chargeable call is never started by it. */
const STATE_WORDS: Record<TwilioCall['state'], string> = {
  idle: '', preparing: 'Getting ready…', connecting: 'Calling…', ringing: 'Ringing…', connected: 'Connected', ended: 'Call ended', failed: 'Call failed',
};

export function CallPanel({ leadId, businessName, phone, country, onLogCall }: {
  leadId: string; businessName?: string | null; phone: string | null | undefined; country?: string | null; onLogCall: () => void;
}) {
  /* The app's one call (LiveCall.tsx): nothing on this page can end it. */
  const call = useLiveCall();
  const { setPanelLead } = useLiveCallActions();
  useEffect(() => { setPanelLead(leadId); return () => setPanelLead(null); }, [leadId, setPanelLead]);
  const here = call.leadId === leadId;
  const otherLead = call.active && !here;
  const view = callNumberView(phone, country);
  const pick = pickCallNumber(phone, country);
  return (
    <section className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-3 sm:p-3.5" data-testid="call-panel" data-call-state={here ? call.state : 'idle'}>
      {otherLead ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm" data-testid="call-other-lead">
          <span className="font-semibold text-red-700 dark:text-red-300">You are on a call with another prospect.</span>
          <Button size="sm" variant="destructive" className="h-9 gap-1.5" onClick={call.hangup}><PhoneOff className="h-4 w-4" />Hang up</Button>
        </div>
      ) : here && call.state !== 'idle' ? (
        <div className="space-y-2" data-testid="call-live">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn('flex items-center gap-2 text-sm font-bold', call.state === 'failed' ? TONE.red.text : call.state === 'connected' ? TONE.green.text : TONE.amber.text)} role="status" aria-live="polite" data-testid="call-status">
              {(call.state === 'preparing' || call.state === 'connecting' || call.state === 'ringing') && <Loader2 className="h-4 w-4 animate-spin" />}
              {call.state === 'failed' && <CircleAlert className="h-4 w-4" />}
              {STATE_WORDS[call.state]}
              {call.state === 'connected' && <span className="font-mono tabular-nums" data-testid="call-duration">{fmtDuration(call.seconds)}</span>}
              {call.simulated && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"><FlaskConical className="h-3 w-3" />Test mode — no real call</span>}
            </p>
            {call.active && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-10 gap-1.5" onClick={call.toggleMute} disabled={call.state !== 'connected'} aria-pressed={call.muted} data-testid="call-mute">
                  {call.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{call.muted ? 'Unmute' : 'Mute'}
                </Button>
                <Button size="sm" variant="destructive" className="h-10 gap-1.5" onClick={call.hangup} data-testid="call-hangup"><PhoneOff className="h-4 w-4" />Hang up</Button>
              </div>
            )}
          </div>
          {call.active && (call.reconnecting || call.warning) && (
            <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-200" data-testid="call-panel-warning">{call.reconnecting ? 'Reconnecting… the call is trying to recover the connection.' : call.warning}</p>
          )}
          {call.state === 'failed' && call.error && <p className="rounded-lg bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-300" data-testid="call-error">{call.error}</p>}
          {call.state === 'ended' && call.outcome && <p className="rounded-lg bg-muted px-2.5 py-2 text-xs" data-testid="call-outcome">{call.outcome}</p>}
          {(call.state === 'ended' || call.state === 'failed') && (
            <div className="flex flex-wrap items-center gap-2">
              {(call.state === 'ended' || call.failure === 'dropped') && <Button size="sm" className="h-10 gap-1.5 font-bold" onClick={() => { onLogCall(); call.reset(); }} data-testid="call-log"><ClipboardPen className="h-4 w-4" />Log this call</Button>}
              {/* Call again only where a redial can help: a block (Do Not Contact, hours, credit, a refused country) says who fixes it instead. */}
              {(call.state === 'ended' || (!!call.failure && REDIAL_FAILURES.has(call.failure))) && <Button size="sm" variant="outline" className="h-10 gap-1.5" onClick={() => { call.reset(); void call.start(leadId, businessName); }} data-testid="call-again"><PhoneCall className="h-4 w-4" />Call again</Button>}
              <Button size="sm" variant="ghost" className="h-10" onClick={call.reset}>Dismiss</Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-11 gap-2 rounded-xl bg-amber-500 font-bold text-white hover:bg-amber-600" onClick={() => void call.start(leadId, businessName)} disabled={!view || pick.premiumOnly} data-testid="call-start-browser">
              <PhoneCall className="h-4 w-4" />{pick.kind === 'non_geographic' ? 'Call anyway' : 'Call in browser'}
            </Button>
            {view?.whatsappUrl && (
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => window.open(view.whatsappUrl, '_blank', 'noopener,noreferrer')} data-testid="call-start-whatsapp">
                <PhoneCall className="h-3.5 w-3.5" />Call on WhatsApp
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">Not recorded. Allow your microphone when asked.</p>
          </div>
          {/* Before dialling (src/lib/callRules.ts pickCallNumber): a freephone / non-geographic number may not connect, a 09
              is never dialled, and with several numbers on the lead it says which one rings. */}
          {pick.warning && (
            <p data-testid="call-number-warning" className={cn('rounded-lg px-2.5 py-2 text-xs', pick.premiumOnly ? 'bg-red-500/10 text-red-700 dark:text-red-300' : pick.kind === 'non_geographic' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'bg-muted text-muted-foreground')}>{pick.warning}</p>
          )}
        </>
      )}
    </section>
  );
}
