/* ══ THE LIVE CALL (Paul, 2026-11-04, docs/prospect-one-page-close.md) ══════════════════════════════════════════════
   ONE browser call for the whole app, mounted ABOVE the routes, so nothing on a page can end it: scrolling, typing an answer,
   picking a plan, sending the link, a list reload, Previous / Next, or even closing the popup. It used to live inside the
   lead popup, and anything that remounted the popup hung up on the prospect.
   ⛔ While a call is live a fixed RED "End call" sits on the right edge with the timer, drawn on document.body above every
      dialog. It carries data-keep-dialog-open (ui/dialog.tsx, ui/sheet.tsx) so pressing it never closes the window underneath,
      and pointer-events-auto because a modal dialog switches pointer events off on the body.
   ⛔ The popup reads useLiveCallActions (stable), not the call itself: the timer ticks every second and must not redraw the
      page someone is typing in. Only CallPanel and the button read the ticking value. */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { PhoneOff } from 'lucide-react';
import { fmtDuration, useTwilioCall, type TwilioCall } from '@/hooks/useTwilioCall';
import { outreachLeadLink } from '@/lib/salesLinks';

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

function EndCallOverlay({ call, panelLead }: { call: TwilioCall; panelLead: string | null }) {
  if (call.active) {
    return createPortal(
      <button type="button" onClick={call.hangup} data-keep-dialog-open data-testid="end-call"
        title={call.label ? `End the call with ${call.label}` : 'End the call'}
        className="pointer-events-auto fixed right-0 top-1/2 z-[200] flex w-[76px] -translate-y-1/2 flex-col items-center gap-0.5 rounded-l-2xl bg-red-600 px-1.5 py-3 text-white shadow-xl shadow-red-950/40 ring-1 ring-red-400/40 transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-[88px]">
        <PhoneOff className="h-6 w-6" aria-hidden />
        <span className="text-xs font-bold leading-tight">End call</span>
        <span className="font-mono text-xs tabular-nums" data-testid="end-call-timer">{call.state === 'connected' ? fmtDuration(call.seconds) : WAITING_WORDS[call.state] ?? ''}</span>
      </button>,
      document.body,
    );
  }
  /* Ended with the popup closed or on another lead: nothing else on screen offers Log this call, so say where it is. */
  if ((call.state === 'ended' || call.state === 'failed') && call.leadId && panelLead !== call.leadId) {
    return createPortal(
      <div data-keep-dialog-open data-testid="call-ended-card" className="pointer-events-auto fixed bottom-4 right-4 z-[200] max-w-[17rem] rounded-2xl border border-border bg-card p-3 text-sm shadow-xl">
        <p className="font-semibold">{call.state === 'ended' ? 'Call ended' : 'Call failed'}{call.label ? ` · ${call.label}` : ''}</p>
        <div className="mt-2 flex items-center gap-3 text-xs font-semibold">
          <Link to={outreachLeadLink(call.leadId)} className="text-blue-600 hover:underline dark:text-blue-400" data-testid="call-ended-open">Open lead to log it</Link>
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
          <EndCallOverlay call={call} panelLead={panelLead} />
        </CallContext.Provider>
      </AnsweredContext.Provider>
    </ActionsContext.Provider>
  );
}
