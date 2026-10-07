/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOW THE LEAD POPUP OPENS — which small window is up on arrival (Paul, 2026-10-07).

     Outreach CALL  → the prospect popup, with the small NUMBER window over it. Not a logged call.
     Log this call  → the prospect popup, with "What happened?" open (the script sheet's own Log button).
     anything else  → the prospect popup alone.

   ⛔ "What happened?" is NEVER open on arrival from Call. It opens from LOG CALL (the header's Log call, the
      script's Log this call) and from nothing else. Pressing CALL in the number window only closes that
      window: no outcome, no write, no navigation, nothing external.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type CallArrival = 'call' | 'log' | 'open';

export interface ArrivalWindows { numberOpen: boolean; logOpen: boolean }

/** Call wins over Log: a popup opened by CALL never arrives on "What happened?". */
export function callArrivalOf(openNumberPopup: boolean | undefined, openLogContact: boolean | undefined): CallArrival {
  return openNumberPopup ? 'call' : openLogContact ? 'log' : 'open';
}

export function arrivalWindows(arrival: CallArrival, hasPhone: boolean): ArrivalWindows {
  if (arrival === 'call') return { numberOpen: hasPhone, logOpen: false };
  if (arrival === 'log') return { numberOpen: false, logOpen: true };
  return { numberOpen: false, logOpen: false };
}

/** The number window's CALL: it closes the number window and changes nothing else. */
export function afterStartCall(w: ArrivalWindows): ArrivalWindows {
  return { ...w, numberOpen: false };
}

/** LOG CALL: the only way "What happened?" opens. */
export function afterLogCall(): ArrivalWindows {
  return { numberOpen: false, logOpen: true };
}
