/* BROWSER CALLING (2026-10-09) — Twilio Voice JavaScript SDK behind one small state machine.
   idle → preparing → connecting → ringing → connected → ended   (or → failed at any point)

   ⛔ THE BROWSER NEVER CHOOSES A NUMBER. start(leadId) asks twilio-voice-token for a token and a call row for THAT lead;
      the connect carries only that row's id, and the server dials the number it stored for it.
   ⛔ A STATE IS A REAL EVENT: "connected" is Twilio's accept, "ringing" is its ringing — a click is only "preparing".
      Nothing here marks a lead Contacted; the rep logs the outcome (Log call) and the server keeps the call row.
   ⛔ NEVER RECORDED. No recording option is requested anywhere.
   ⛔ DOES NOT SILENTLY FALL BACK: a failure ends in `failed` with the reason and the free alternative named by the screen
      (the WhatsApp app call or dialling by hand) — it never starts another chargeable call by itself.
   Test mode (the server's default): the token function answers `simulated` and this runs a pretend call — no microphone,
   no Twilio, nothing dialled — so the whole workflow can be exercised safely.
   The SDK (~100 kB) loads only when the first call is placed.

   ⛔ ONLY THE CALL'S OWN END ENDS A CALL (2026-11-10). Once the prospect's line is ringing or answered, an error reported
      on the Device is NOT the call: Twilio reports an expired access token there (20104 / 31205) and every signalling
      blip, while the audio carries on. This hook used to destroy the device on any of them, which would have hung up on
      the prospect when the token ran out mid-call. A fatal error on the Call is always followed by Twilio's own
      'disconnect', and that is what ends it here. Before the line exists, any error still fails the attempt.
   ⛔ END CALL ALWAYS MEANS "DO NOT DIAL". Each start() takes a run number; a hang-up or a newer start makes the older one
      stale, and a stale start stops after whichever step it was waiting on (the token, the SDK, the microphone prompt,
      the connect) and hangs up anything it had already opened. Without this, End call during "Getting ready" still
      dialled the prospect, and Call again on top of it left a second call no button could end.

   2026-11-16 (v1-calling-solid, src/lib/callManager.ts) — SOLID CALLING:
   ⛔ A QUICK PRE-CHECK before anything is dialled: offline = stop with words; a slow link = a warning, the call still goes.
   ⛔ THE TOKEN IS REFRESHED SILENTLY: the SDK's tokenWillExpire asks twilio-voice-token { refresh: true } and hands the
      new one to device.updateToken — a call longer than the token never hears about it.
   ⛔ LIVE QUALITY: Twilio's 'warning' / 'warning-cleared' (high RTT, jitter, packet loss, low MOS, a silent mic) show one
      plain line on the call bar; 'reconnecting' / 'reconnected' show "Reconnecting…". A disconnect while reconnecting
      is a DROPPED call (failed, with Call again) — not a quiet "Call ended".
   ⛔ WHY IT DID NOT CONNECT: a real call that ends unanswered without the rep pressing End reads its own call row (Twilio's
      status callback) → busy / no answer / refused-with-its-code, in words. A refused one (13227…) becomes `failed`.
   ⛔ EVERY FAILURE IS LOGGED (client_error_reports, function "browser-call"): the reason key and Twilio code, the call
      row id — never the number, never the token. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { EdgeFunctionError } from '@/lib/edgeInvokeCore';
import { supabase } from '@/integrations/supabase/client';
import { reportClientError } from '@/lib/errorReporting';
import { callErrorEndsCall, deviceErrorEndsCall, setCallState } from '@/lib/liveCallFlag';
import { CALL_SIGNALING_TIMEOUT_MS, browserTimeZone, callErrorCode, callErrorWords, micFailureKey, twilioEdgesFor, type CallErrorLike } from '@/lib/callErrorWords';
import {
  CALL_FAILURE_WORDS, FINAL_CALL_STATUSES, failureWordsForNumber, TOKEN_REFRESH_LEAD_S, callQualityWords, disconnectReason, endedOutcomeWords, isKeypadKey,
  precheckConnection, type CallRowLike, type ConnectionLike,
} from '@/lib/callManager';

export { CALL_FAILURE_WORDS } from '@/lib/callManager';

export type CallState = 'idle' | 'preparing' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';

interface TokenOk { ok: true; simulated: boolean; callId: string; token?: string; identity?: string; phoneTail: string; numberKind?: string | null }
interface TokenNo { ok: false; error: string; detail?: string }

// The slice of the SDK we use (kept structural so tests and the build do not depend on its types).
interface VoiceCall {
  on(ev: string, cb: (...a: unknown[]) => void): void; mute(m: boolean): void; disconnect(): void; sendDigits(d: string): void;
}
interface VoiceDevice {
  connect(o: { params: Record<string, string> }): Promise<VoiceCall>; destroy(): void; on(ev: string, cb: (...a: unknown[]) => void): void;
  updateToken(t: string): void;
}

/** One row read (RLS: a rep reads their own call rows). Typed loosely: the generated types make this query too deep for tsc. */
type LooseRead = { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } } } };

/** Failures go to client_error_reports so support can see them; never the number or the token. Never throws. */
function logCallProblem(kind: string, extra: Record<string, unknown> = {}) {
  console.warn('[call]', kind, extra);
  void reportClientError({ functionName: 'browser-call', errorMessage: kind, extra: { call_problem: kind, ...extra } }).catch(() => undefined);
}

export function useTwilioCall() {
  const [state, setState] = useState<CallState>('idle');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** The failure key ('dropped', 'network', 'opted_out' …) — the screen offers Call again only where a redial helps. */
  const [failure, setFailure] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  /* A REAL call to this lead was picked up (Twilio's accept). Stays true after the call ends, until the next start or reset. */
  const [answered, setAnswered] = useState(false);
  /** A live warning for the call bar: a slow link before dialling, or Twilio's own quality warning during the call. */
  const [warning, setWarning] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  /** Why an unanswered call ended (busy / no answer), read from the call row. */
  const [outcome, setOutcome] = useState<string | null>(null);
  /** The tones sent from the keypad on this call. */
  const [digits, setDigits] = useState('');
  const callRef = useRef<VoiceCall | null>(null);
  const deviceRef = useRef<VoiceDevice | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stateRef = useRef<CallState>('idle');
  const reconnectingRef = useRef(false);
  const answeredRef = useRef(false);
  const warningsRef = useRef<Map<string, string>>(new Map());
  /* The current start(): a hang-up or a newer start bumps it, and every older start() sees it is stale. */
  const runRef = useRef(0);
  /** The kind of number being rung (twilio-voice-token): a refused freephone / non-geographic number says so. */
  const numberKindRef = useRef<string | null>(null);
  const set = useCallback((s: CallState) => { stateRef.current = s; setCallState(s); setState(s); }, []);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startTimer = () => { stopTimer(); setSeconds(0); timerRef.current = setInterval(() => setSeconds((n) => n + 1), 1000); };
  const cleanup = useCallback(() => {
    stopTimer(); simRef.current.forEach(clearTimeout); simRef.current = [];
    try { deviceRef.current?.destroy(); } catch { /* already gone */ }
    deviceRef.current = null; callRef.current = null;
    reconnectingRef.current = false; setReconnecting(false); warningsRef.current.clear(); setWarning(null);
  }, []);
  const fail = useCallback((code: string, detail?: string, extra: Record<string, unknown> = {}) => {
    const words = detail || CALL_FAILURE_WORDS[code] || 'The call could not be completed.';
    const twilioCode = typeof extra.code === 'number' ? extra.code : undefined;
    cleanup(); setFailure(code); setError(twilioCode === undefined ? words : failureWordsForNumber(numberKindRef.current, words, twilioCode)); set('failed');
    logCallProblem(code, extra);
  }, [cleanup, set]);
  const ended = useCallback(() => { cleanup(); set('ended'); }, [cleanup, set]);

  /* A real call ended unanswered and the rep did not press End: ask the call row what Twilio said (its status callback
     can land a moment after the browser's disconnect, so it is read up to three times). */
  const readOutcome = useCallback(async (forCallId: string, run: number) => {
    for (const wait of [1200, 2500, 4000]) {
      await new Promise((r) => setTimeout(r, wait));
      if (runRef.current !== run || stateRef.current !== 'ended') return;
      const { data } = await (supabase as unknown as LooseRead).from('call_logs').select('status, error_code, answered_at').eq('id', forCallId).maybeSingle();
      const row = (data ?? null) as CallRowLike | null;
      if (!row || !FINAL_CALL_STATUSES.has(String(row.status ?? ''))) continue;
      if (runRef.current !== run || stateRef.current !== 'ended') return;
      const words = row.status === 'failed'
        ? failureWordsForNumber(numberKindRef.current, endedOutcomeWords(row) ?? '', row.error_code ? Number(row.error_code) : null)
        : endedOutcomeWords(row);
      if (row.status === 'failed') {
        setFailure('refused'); setError(words); set('failed');
        logCallProblem('refused', { call_id: forCallId, code: row.error_code ?? null });
      } else if (words) setOutcome(words);
      return;
    }
  }, [set]);

  const start = useCallback(async (forLeadId: string, forLabel?: string | null) => {
    if (['preparing', 'connecting', 'ringing', 'connected'].includes(stateRef.current)) return;
    const run = ++runRef.current;
    const stale = () => runRef.current !== run;
    setLeadId(forLeadId); setLabel(forLabel ?? null); setError(null); setFailure(null); setMuted(false); setSeconds(0); setSimulated(false);
    setCallId(null); setAnswered(false); setOutcome(null); setDigits(''); setWarning(null); answeredRef.current = false; numberKindRef.current = null;
    set('preparing');
    /* The quick pre-check: offline stops here; a slow link warns and the call still goes. */
    const pre = precheckConnection(typeof navigator === 'undefined' ? null : navigator as unknown as ConnectionLike);
    if (!pre.ok) return fail(pre.failure ?? 'offline');
    if (pre.warning) setWarning(pre.warning);
    let tok: TokenOk | TokenNo;
    try {
      tok = await invokeEdge<TokenOk | TokenNo>('twilio-voice-token', { lead_id: forLeadId });
    } catch (e) {
      if (stale()) return;
      return fail(e instanceof EdgeFunctionError && e.code === 'not_configured' ? 'not_configured' : 'network',
        e instanceof EdgeFunctionError ? (e.detail || edgeErrorMessage(e)) : edgeErrorMessage(e));
    }
    if (stale()) return;
    if (tok.ok === false) return fail(tok.error, tok.detail);
    setCallId(tok.callId);
    numberKindRef.current = tok.numberKind ?? null;
    const thisCallId = tok.callId;

    if (tok.simulated) {
      // A pretend call: ringing, then "answered" — so the screen, timer, mute and Log call can all be exercised.
      setSimulated(true); set('connecting');
      simRef.current.push(setTimeout(() => set('ringing'), 600), setTimeout(() => { set('connected'); startTimer(); }, 2200));
      return;
    }
    let device: VoiceDevice | null = null;
    try {
      const { Device } = await import('@twilio/voice-sdk');
      if (stale()) return;
      if (!(Device as unknown as { isSupported?: boolean }).isSupported) return fail('unsupported');
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop()); // permission only; the SDK opens its own stream
      } catch (me) { if (stale()) return; console.warn('[call] microphone:', (me as Error)?.name); return fail(micFailureKey(me)); }
      if (stale()) return;
      set('connecting');
      /* 2026-11-11 (src/lib/callErrorWords.ts): the nearest Twilio edge for the rep's own clock (UK → Dublin, Malaysia →
         Singapore) with fallbacks, signalling reconnection, Opus first, and precise error codes instead of the catch-all 31000. */
      device = new Device(tok.token!, {
        codecPreferences: ['opus', 'pcmu'] as never, closeProtection: true, logLevel: 'error',
        edge: twilioEdgesFor(browserTimeZone()), maxCallSignalingTimeoutMs: CALL_SIGNALING_TIMEOUT_MS,
        enableImprovedSignalingErrorPrecision: true, tokenWillExpireSeconds: TOKEN_REFRESH_LEAD_S,
      } as never) as unknown as VoiceDevice;
      deviceRef.current = device;
      const dev = device;
      /* A call longer than its token: fetch a fresh one and hand it over — the call carries on untouched. */
      dev.on('tokenWillExpire', () => {
        if (stale()) return;
        invokeEdge<{ ok: boolean; token?: string; error?: string }>('twilio-voice-token', { refresh: true })
          .then((r) => { if (stale()) return; if (r.ok && r.token) dev.updateToken(r.token); else logCallProblem('token_refresh_refused', { call_id: thisCallId, why: r.error ?? null }); })
          .catch((e) => logCallProblem('token_refresh_failed', { call_id: thisCallId, why: edgeErrorMessage(e) }));
      });
      dev.on('error', (...a: unknown[]) => {
        if (stale()) return;
        const er = a[0] as CallErrorLike | undefined;
        /* The line exists: this is the Device talking (an expired token, a signalling blip), not the call ending. */
        if (!deviceErrorEndsCall(stateRef.current, !!callRef.current)) {
          console.warn('[call] device error ignored while the call is live:', callErrorCode(er), er?.message);
          return;
        }
        fail('network', callErrorWords(er), { call_id: thisCallId, code: callErrorCode(er), where: 'device' });
      });
      const call = await dev.connect({ params: { callId: tok.callId } });
      if (stale()) {
        /* End call was pressed while this was connecting: hang up what was just opened, and leave the newer state alone. */
        try { call.disconnect(); } catch { /* already over */ }
        try { dev.destroy(); } catch { /* already gone */ }
        return;
      }
      callRef.current = call;
      call.on('ringing', () => { if (!stale() && stateRef.current === 'connecting') set('ringing'); });
      call.on('accept', () => { if (stale()) return; set('connected'); setAnswered(true); answeredRef.current = true; startTimer(); });
      const onDisconnect = () => {
        if (disconnectReason({ reconnecting: reconnectingRef.current, hungUpByRep: false }) === 'dropped') {
          fail('dropped', undefined, { call_id: thisCallId, answered: answeredRef.current });
          return;
        }
        ended();
        if (!answeredRef.current) void readOutcome(thisCallId, run);
      };
      call.on('disconnect', () => { if (!stale() && stateRef.current !== 'failed') onDisconnect(); });
      call.on('cancel', () => { if (!stale()) ended(); });
      call.on('reject', () => { if (!stale()) fail('declined'); });
      call.on('reconnecting', (...a: unknown[]) => {
        if (stale()) return;
        reconnectingRef.current = true; setReconnecting(true);
        console.warn('[call] reconnecting:', callErrorCode(a[0] as CallErrorLike));
      });
      call.on('reconnected', () => { if (stale()) return; reconnectingRef.current = false; setReconnecting(false); });
      call.on('warning', (...a: unknown[]) => {
        if (stale()) return;
        const name = String(a[0] ?? ''); const words = callQualityWords(name);
        if (!words) return;
        warningsRef.current.set(name, words); setWarning(words);
        console.warn('[call] quality warning:', name);
      });
      call.on('warning-cleared', (...a: unknown[]) => {
        if (stale()) return;
        warningsRef.current.delete(String(a[0] ?? ''));
        setWarning(warningsRef.current.size ? [...warningsRef.current.values()][0] : null);
      });
      call.on('error', (...a: unknown[]) => {
        if (stale()) return;
        const er = a[0] as CallErrorLike | undefined;
        /* Answered: a fatal error is followed by Twilio's own 'disconnect' (above), a passing one must not hang up. */
        if (!callErrorEndsCall(stateRef.current)) { console.warn('[call] call error while connected:', callErrorCode(er), er?.message); return; }
        fail('network', callErrorWords(er), { call_id: thisCallId, code: callErrorCode(er), where: 'call' });
      });
    } catch (e) {
      if (stale()) { try { device?.destroy(); } catch { /* already gone */ } return; }
      fail('network', callErrorWords(e as CallErrorLike), { call_id: thisCallId, code: callErrorCode(e as CallErrorLike), where: 'start' });
    }
  }, [ended, fail, readOutcome, set]);

  const hangup = useCallback(() => {
    /* Whatever start() is still waiting on must not dial after this. */
    runRef.current++;
    if (simulated) { ended(); return; }
    try { callRef.current?.disconnect(); } catch { /* already over */ }
    if (stateRef.current !== 'idle') ended();
  }, [ended, simulated]);

  const toggleMute = useCallback(() => {
    setMuted((m) => { const next = !m; try { callRef.current?.mute(next); } catch { /* sim */ } return next; });
  }, []);

  /** The keypad (menus, extensions): one tone per key, only while the call is answered. */
  const sendDigit = useCallback((d: string) => {
    if (!isKeypadKey(d) || stateRef.current !== 'connected') return;
    try { callRef.current?.sendDigits(d); } catch { /* sim / already over */ }
    setDigits((s) => (s + d).slice(-24));
  }, []);

  const reset = useCallback(() => {
    runRef.current++; cleanup(); setError(null); setFailure(null); setLeadId(null); setLabel(null); setCallId(null); setSeconds(0);
    setMuted(false); setAnswered(false); setOutcome(null); setDigits(''); set('idle');
  }, [cleanup, set]);

  useEffect(() => () => { runRef.current++; cleanup(); setCallState('idle'); }, [cleanup]);
  // Closing the tab or leaving the page ends the call rather than leaving it live.
  useEffect(() => {
    const h = () => { try { callRef.current?.disconnect(); } catch { /* ignore */ } };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, []);

  const active = ['preparing', 'connecting', 'ringing', 'connected'].includes(state);
  return {
    state, active, leadId, label, callId, muted, seconds, error, failure, simulated, answered, warning, reconnecting, outcome, digits,
    start, hangup, toggleMute, sendDigit, reset,
  };
}
export type TwilioCall = ReturnType<typeof useTwilioCall>;

export const fmtDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
