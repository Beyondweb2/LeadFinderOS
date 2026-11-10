/* BROWSER CALLING (2026-10-09) — Twilio Voice JavaScript SDK behind one small state machine.
   idle → preparing → connecting → ringing → connected → ended   (or → failed at any point)

   ⛔ THE BROWSER NEVER CHOOSES A NUMBER. start(leadId) asks twilio-voice-token for a token and a call row for THAT lead;
      the connect carries only that row's id, and the server dials the number it stored for it.
   ⛔ A STATE IS A REAL EVENT: "connected" is Twilio's accept, "ringing" is its ringing — a click is only "preparing".
      Nothing here marks a lead Contacted; the rep logs the outcome (Log call) and the server records the call row.
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
      dialled the prospect, and Call again on top of it left a second call no button could end. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { EdgeFunctionError } from '@/lib/edgeInvokeCore';
import { callErrorEndsCall, deviceErrorEndsCall, setCallState } from '@/lib/liveCallFlag';

export type CallState = 'idle' | 'preparing' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';

interface TokenOk { ok: true; simulated: boolean; callId: string; token?: string; identity?: string; phoneTail: string }
interface TokenNo { ok: false; error: string; detail?: string }

// The slice of the SDK we use (kept structural so tests and the build do not depend on its types).
interface VoiceCall {
  on(ev: string, cb: (...a: unknown[]) => void): void; mute(m: boolean): void; disconnect(): void;
}
interface VoiceDevice { connect(o: { params: Record<string, string> }): Promise<VoiceCall>; destroy(): void; on(ev: string, cb: (...a: unknown[]) => void): void }

export const CALL_FAILURE_WORDS: Record<string, string> = {
  mic_denied: 'The microphone is blocked. Allow it in your browser (the padlock by the address), then try again — or call from your own phone.',
  unsupported: 'This browser cannot make calls. Use Chrome, Edge or Safari on a computer, or call from your own phone.',
  not_configured: 'Browser calling is not set up yet.',
  network: 'The connection dropped. Check your internet and try again.',
  declined: 'The call was declined.',
};

export function useTwilioCall() {
  const [state, setState] = useState<CallState>('idle');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  /* A REAL call to this lead was picked up (Twilio's accept). Stays true after the call ends, until the next start or reset. */
  const [answered, setAnswered] = useState(false);
  const callRef = useRef<VoiceCall | null>(null);
  const deviceRef = useRef<VoiceDevice | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stateRef = useRef<CallState>('idle');
  /* The current start(): a hang-up or a newer start bumps it, and every older start() sees it is stale. */
  const runRef = useRef(0);
  const set = useCallback((s: CallState) => { stateRef.current = s; setCallState(s); setState(s); }, []);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startTimer = () => { stopTimer(); setSeconds(0); timerRef.current = setInterval(() => setSeconds((n) => n + 1), 1000); };
  const cleanup = useCallback(() => {
    stopTimer(); simRef.current.forEach(clearTimeout); simRef.current = [];
    try { deviceRef.current?.destroy(); } catch { /* already gone */ }
    deviceRef.current = null; callRef.current = null;
  }, []);
  const fail = useCallback((code: string, detail?: string) => {
    cleanup(); setError(detail || CALL_FAILURE_WORDS[code] || 'The call could not be completed.'); set('failed');
  }, [cleanup, set]);
  const ended = useCallback(() => { cleanup(); set('ended'); }, [cleanup, set]);

  const start = useCallback(async (forLeadId: string, forLabel?: string | null) => {
    if (['preparing', 'connecting', 'ringing', 'connected'].includes(stateRef.current)) return;
    const run = ++runRef.current;
    const stale = () => runRef.current !== run;
    setLeadId(forLeadId); setLabel(forLabel ?? null); setError(null); setMuted(false); setSeconds(0); setSimulated(false); setCallId(null); setAnswered(false);
    set('preparing');
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
      } catch { if (stale()) return; return fail('mic_denied'); }
      if (stale()) return;
      set('connecting');
      device = new Device(tok.token!, { codecPreferences: ['opus', 'pcmu'] as never, closeProtection: true, logLevel: 'error' }) as unknown as VoiceDevice;
      deviceRef.current = device;
      device.on('error', (...a: unknown[]) => {
        if (stale()) return;
        const er = a[0] as { code?: number; message?: string } | undefined;
        /* The line exists: this is the Device talking (an expired token, a signalling blip), not the call ending. */
        if (!deviceErrorEndsCall(stateRef.current, !!callRef.current)) {
          console.warn('[call] device error ignored while the call is live:', er?.code, er?.message);
          return;
        }
        fail('network', er?.message ? `Call error: ${er.message}` : undefined);
      });
      const call = await device.connect({ params: { callId: tok.callId } });
      if (stale()) {
        /* End call was pressed while this was connecting: hang up what was just opened, and leave the newer state alone. */
        try { call.disconnect(); } catch { /* already over */ }
        try { device.destroy(); } catch { /* already gone */ }
        return;
      }
      callRef.current = call;
      call.on('ringing', () => { if (!stale() && stateRef.current === 'connecting') set('ringing'); });
      call.on('accept', () => { if (stale()) return; set('connected'); setAnswered(true); startTimer(); });
      call.on('disconnect', () => { if (!stale() && stateRef.current !== 'failed') ended(); });
      call.on('cancel', () => { if (!stale()) ended(); });
      call.on('reject', () => { if (!stale()) fail('declined'); });
      call.on('error', (...a: unknown[]) => {
        if (stale()) return;
        const er = a[0] as { code?: number; message?: string } | undefined;
        /* Answered: a fatal error is followed by Twilio's own 'disconnect' (above), a passing one must not hang up. */
        if (!callErrorEndsCall(stateRef.current)) { console.warn('[call] call error while connected:', er?.code, er?.message); return; }
        fail('network', er?.message ? `Call error: ${er.message}` : undefined);
      });
    } catch (e) {
      if (stale()) { try { device?.destroy(); } catch { /* already gone */ } return; }
      fail('network', (e as Error)?.message ? `Could not start the call: ${(e as Error).message}` : undefined);
    }
  }, [ended, fail, set]);

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

  const reset = useCallback(() => { runRef.current++; cleanup(); setError(null); setLeadId(null); setLabel(null); setCallId(null); setSeconds(0); setMuted(false); setAnswered(false); set('idle'); }, [cleanup, set]);

  useEffect(() => () => { runRef.current++; cleanup(); setCallState('idle'); }, [cleanup]);
  // Closing the tab or leaving the page ends the call rather than leaving it live.
  useEffect(() => {
    const h = () => { try { callRef.current?.disconnect(); } catch { /* ignore */ } };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, []);

  const active = ['preparing', 'connecting', 'ringing', 'connected'].includes(state);
  return { state, active, leadId, label, callId, muted, seconds, error, simulated, answered, start, hangup, toggleMute, reset };
}
export type TwilioCall = ReturnType<typeof useTwilioCall>;

export const fmtDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
