/* ══ THE LIVE CALL (Paul, 2026-11-04, docs/prospect-one-page-close.md) ══════════════════════════════════════════════
   ONE browser call for the whole app, mounted ABOVE the routes, so nothing on a page can end it: scrolling, typing an answer,
   picking a plan, sending the link, a list reload, Previous / Next, or even closing the popup. It used to live inside the
   lead popup, and anything that remounted the popup hung up on the prospect.
   ⛔ While a call is live the CALL BAR sits on the right edge (2026-11-16: who, timer, Mute, Keypad, quality warning and
      the RED "End call"; before, only the red button and the timer), drawn on document.body above every
      dialog. It carries data-keep-dialog-open (ui/dialog.tsx, ui/sheet.tsx) so pressing it never closes the window underneath,
      and pointer-events-auto because a modal dialog switches pointer events off on the body.
   ⛔ The popup reads useLiveCallActions (stable), not the call itself: the timer ticks every second and must not redraw the
      page someone is typing in. Only CallPanel and the button read the ticking value. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Grid3x3, Mic, MicOff, PhoneCall, PhoneOff, TriangleAlert } from 'lucide-react';
import { fmtDuration, useTwilioCall, type TwilioCall } from '@/hooks/useTwilioCall';
import { outreachLeadLink } from '@/lib/salesLinks';
import { KEYPAD_KEYS, REDIAL_FAILURES } from '@/lib/callManager';

interface LiveCallActions {
  start: TwilioCall['start'];
  /** The lead whose CallPanel is on screen: that panel offers Log this call, so the corner card stays away. */
  setPanelLead: (leadId: string | null) => void;
}
const CallContext = createContext<TwilioCall | null>(null);
const ActionsContext = createContext<LiveCallActions | null>(null);
/* The lead whose REAL call was picked up in this session, or null. A plain string on its own context: it changes when
   they pick up and when the call is cleared, never every second, so a page may read it without redrawing with the timer. */
const AnsweredContext = createContext<string | null>(null);

/** Did they pick up a browser call to this lead just now? (src/hooks/useSms.ts: a call they answered opens the Text button.)
 *  null outside the provider (a test harness): nothing is assumed. */
export function useAnsweredCallLead(): string | null {
  return useContext(AnsweredContext);
}

export function useLiveCall(): TwilioCall {
  const c = useContext(CallContext);
  if (!c) throw new Error('useLiveCall outside LiveCallProvider');
  return c;
}
export function useLiveCallActions(): LiveCallActions {
  const c = useContext(ActionsContext);
  if (!c) throw new Error('useLiveCallActions outside LiveCallProvider');
  return c;
}

const WAITING_WORDS: Partial<Record<TwilioCall['state'], string>> = { preparing: 'Getting ready', connecting: 'Calling', ringing: 'Ringing' };

/* ══ THE FLOATING CALL BAR (2026-11-16, v1-calling-solid) ════════════════════════════════════════════════════════════
   On EVERY page while a call is live, so the rep can click around the app mid-call: who (a link back to the lead), the
   timer, Mute, the Keypad (menus, extensions) and the red End call. Twilio's live quality warnings and "Reconnecting…"
   show on it. Drawn on document.body above every dialog (data-keep-dialog-open, pointer-events-auto — see the header). */
function CallBar({ call, panelLead }: { call: TwilioCall; panelLead: string | null }) {
  const [keypad, setKeypad] = useState(false);
  useEffect(() => { if (call.state !== 'connected') setKeypad(false); }, [call.state]);
  if (call.active) {
    const connected = call.state === 'connected';
    return createPortal(
      <div data-keep-dialog-open data-testid="call-bar" role="region" aria-label="Call in progress"
        className="pointer-events-auto fixed right-0 top-1/2 z-[200] flex w-[120px] -translate-y-1/2 flex-col items-stretch gap-1.5 rounded-l-2xl border border-r-0 border-border bg-card p-2 text-center shadow-xl shadow-black/30 sm:w-[136px]">
        {call.leadId ? (
          <Link to={outreachLeadLink(call.leadId)} data-testid="call-bar-who" title={call.label ? `Open ${call.label}` : 'Open the lead'}
            className="truncate text-xs font-semibold text-foreground hover:underline">{call.label || 'Prospect'}</Link>
        ) : <span className="truncate text-xs font-semibold">{call.label || 'Prospect'}</span>}
        <span className="font-mono text-xs tabular-nums text-muted-foreground" data-testid="end-call-timer" role="status" aria-live="polite">
          {call.reconnecting ? 'Reconnecting…' : connected ? fmtDuration(call.seconds) : WAITING_WORDS[call.state] ?? ''}
        </span>
        {call.simulated && <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Test mode</span>}
        {call.warning && (
          <p data-testid="call-quality-warning" className="flex items-start gap-1 rounded-lg bg-amber-500/15 px-1.5 py-1 text-left text-[10px] leading-snug text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden />{call.warning}
          </p>
        )}
        <div className="grid grid-cols-2 gap-1">
          <button type="button" onClick={call.toggleMute} disabled={!connected} aria-pressed={call.muted} data-testid="call-bar-mute"
            title={call.muted ? 'Unmute' : 'Mute'}
            className="flex flex-col items-center rounded-lg border border-border py-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-40">
            {call.muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}{call.muted ? 'Unmute' : 'Mute'}
          </button>
          <button type="button" onClick={() => setKeypad((k) => !k)} disabled={!connected} aria-pressed={keypad} data-testid="call-bar-keypad"
            title="Keypad" className="flex flex-col items-center rounded-lg border border-border py-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-40">
            <Grid3x3 className="h-4 w-4" aria-hidden />Keypad
          </button>
        </div>
        <button type="button" onClick={call.hangup} data-testid="end-call"
          title={call.label ? `End the call with ${call.label}` : 'End the call'}
          className="flex flex-col items-center gap-0.5 rounded-xl bg-red-600 px-1.5 py-2 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-400/40 transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <PhoneOff className="h-5 w-5" aria-hidden />
          <span className="text-xs font-bold leading-tight">End call</span>
        </button>
        {keypad && connected && (
          <div data-testid="call-keypad" className="absolute right-full top-1/2 mr-2 w-[156px] -translate-y-1/2 rounded-2xl border border-border bg-card p-2 shadow-xl">
            <p className="mb-1 h-4 truncate text-center font-mono text-xs tabular-nums" aria-live="polite">{call.digits}</p>
            <div className="grid grid-cols-3 gap-1">
              {KEYPAD_KEYS.map((k) => (
                <button key={k} type="button" onClick={() => call.sendDigit(k)} data-testid={`call-key-${k}`}
                  className="h-10 rounded-lg border border-border font-mono text-base font-semibold hover:bg-muted">{k}</button>
              ))}
            </div>
          </div>
        )}
      </div>,
      document.body,
    );
  }
  /* Ended with the popup closed or on another lead: nothing else on screen offers Log this call, so say where it is —
     with why it did not connect (busy / no answer / refused / dropped), and Call again where a redial can help. */
  if ((call.state === 'ended' || call.state === 'failed') && call.leadId && panelLead !== call.leadId) {
    const lead = call.leadId, who = call.label;
    const redial = call.state === 'ended' || (!!call.failure && REDIAL_FAILURES.has(call.failure));
    const why = call.state === 'failed' ? call.error : call.outcome;
    return createPortal(
      <div data-keep-dialog-open data-testid="call-ended-card" className="pointer-events-auto fixed bottom-4 right-4 z-[200] max-w-[18rem] rounded-2xl border border-border bg-card p-3 text-sm shadow-xl">
        <p className="font-semibold">{call.state === 'ended' ? 'Call ended' : call.failure === 'dropped' ? 'Call dropped' : 'Call failed'}{who ? ` · ${who}` : ''}</p>
        {why && <p className="mt-1 text-xs text-muted-foreground" data-testid="call-ended-why">{why}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
          <Link to={outreachLeadLink(lead)} className="text-blue-600 hover:underline dark:text-blue-400" data-testid="call-ended-open">Open lead to log it</Link>
          {redial && (
            <button type="button" data-testid="call-ended-redial" onClick={() => { call.reset(); void call.start(lead, who); }}
              className="inline-flex items-center gap-1 text-foreground hover:underline"><PhoneCall className="h-3.5 w-3.5" aria-hidden />Call again</button>
          )}
          <button type="button" onClick={call.reset} className="text-muted-foreground hover:text-foreground">Dismiss</button>
        </div>
      </div>,
      document.body,
    );
  }
  return null;
}

export function LiveCallProvider({ children }: { children: ReactNode }) {
  const call = useTwilioCall();
  const [panelLead, setPanelLead] = useState<string | null>(null);
  const actions = useMemo<LiveCallActions>(() => ({ start: call.start, setPanelLead }), [call.start]);
  const answeredLead = call.answered && !call.simulated ? call.leadId : null;
  return (
    <ActionsContext.Provider value={actions}>
      <AnsweredContext.Provider value={answeredLead}>
        <CallContext.Provider value={call}>
          {children}
          <CallBar call={call} panelLead={panelLead} />
        </CallContext.Provider>
      </AnsweredContext.Provider>
    </ActionsContext.Provider>
  );
}
