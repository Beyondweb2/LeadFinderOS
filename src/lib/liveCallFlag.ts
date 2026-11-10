/* IS A BROWSER CALL LIVE RIGHT NOW? (2026-11-10). One module-level answer for code that is not React and must never end
 * a call by accident: the stale-bundle reload (src/lib/staleChunk.ts) and the page error screen (src/App.tsx).
 * Written only by the one call hook (src/hooks/useTwilioCall.ts) on every state change. A leaf: no imports.
 *
 * ⛔ A full page reload destroys the Twilio device and hangs up on the prospect. Anything that reloads by itself asks
 *    callIsLive() first and waits. A reload the PERSON presses is theirs to choose, and the button says what it costs. */

let live = false;

/** From "Getting ready" until the call has ended or failed. */
export const LIVE_CALL_STATES: ReadonlySet<string> = new Set(['preparing', 'connecting', 'ringing', 'connected']);

export function setCallState(state: string): void {
  live = LIVE_CALL_STATES.has(state);
}

export function callIsLive(): boolean {
  return live;
}

/* ── What an error may do to a call (the one rule; src/hooks/useTwilioCall.ts asks it) ──────────────────────────────
   Twilio reports two kinds of error. On the DEVICE: an expired access token (20104 / 31205), a lost signalling socket.
   None of those is the call ending: the audio carries on. On the CALL: a fatal one is always followed by the Call's own
   'disconnect' event, and that event is what ends the call here; a passing one (a failed call message, DTMF) is not. */

/** Does an error on the Device end the attempt? Only before the prospect's line exists. */
export function deviceErrorEndsCall(state: string, hasCall: boolean): boolean {
  return !(hasCall && (state === 'ringing' || state === 'connected'));
}

/** Does an error on the Call end it by itself? Not once it is answered: 'disconnect' decides that. */
export function callErrorEndsCall(state: string): boolean {
  return state !== 'connected';
}
