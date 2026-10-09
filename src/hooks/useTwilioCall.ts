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
   The SDK (~100 kB) loads only when the first call is placed. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { EdgeFunctionError } from '@/lib/edgeInvokeCore';

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
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const callRef = useRef<VoiceCall | null>(null);
  const deviceRef = useRef<VoiceDevice | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stateRef = useRef<CallState>('idle');
  const set = useCallback((s: CallState) => { stateRef.current = s; setState(s); }, []);

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

  const start = useCallback(async (forLeadId: string) => {
    if (['preparing', 'connecting', 'ringing', 'connected'].includes(stateRef.current)) return;
    setLeadId(forLeadId); setError(null); setMuted(false); setSeconds(0); setSimulated(false); setCallId(null);
    set('preparing');
    let tok: TokenOk | TokenNo;
    try {
      tok = await invokeEdge<TokenOk | TokenNo>('twilio-voice-token', { lead_id: forLeadId });
    } catch (e) {
      return fail(e instanceof EdgeFunctionError && e.code === 'not_configured' ? 'not_configured' : 'network',
        e instanceof EdgeFunctionError ? (e.detail || edgeErrorMessage(e)) : edgeErrorMessage(e));
    }
    if (tok.ok === false) return fail(tok.error, tok.detail);
    setCallId(tok.callId);

    if (tok.simulated) {
      // A pretend call: ringing, then "answered" — so the screen, timer, mute and Log call can all be exercised.
      setSimulated(true); set('connecting');
      simRef.current.push(setTimeout(() => set('ringing'), 600), setTimeout(() => { set('connected'); startTimer(); }, 2200));
      return;
    }
    try {
      const { Device } = await import('@twilio/voice-sdk');
      if (!(Device as unknown as { isSupported?: boolean }).isSupported) return fail('unsupported');
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop()); // permission only; the SDK opens its own stream
      } catch { return fail('mic_denied'); }
      set('connecting');
      const device = new Device(tok.token!, { codecPreferences: ['opus', 'pcmu'] as never, closeProtection: true, logLevel: 'error' }) as unknown as VoiceDevice;
      deviceRef.current = device;
      device.on('error', (...a: unknown[]) => { const er = a[0] as { code?: number; message?: string } | undefined; fail('network', er?.message ? `Call error: ${er.message}` : undefined); });
      const call = await device.connect({ params: { callId: tok.callId } });
      callRef.current = call;
      call.on('ringing', () => { if (stateRef.current === 'connecting') set('ringing'); });
      call.on('accept', () => { set('connected'); startTimer(); });
      call.on('disconnect', () => { if (stateRef.current !== 'failed') ended(); });
      call.on('cancel', () => ended());
      call.on('reject', () => fail('declined'));
      call.on('error', (...a: unknown[]) => { const er = a[0] as { code?: number; message?: string } | undefined; fail('network', er?.message ? `Call error: ${er.message}` : undefined); });
    } catch (e) {
      fail('network', (e as Error)?.message ? `Could not start the call: ${(e as Error).message}` : undefined);
    }
  }, [ended, fail, set]);

  const hangup = useCallback(() => {
    if (simulated) { ended(); return; }
    try { callRef.current?.disconnect(); } catch { /* already over */ }
    if (stateRef.current !== 'idle') ended();
  }, [ended, simulated]);

  const toggleMute = useCallback(() => {
    setMuted((m) => { const next = !m; try { callRef.current?.mute(next); } catch { /* sim */ } return next; });
  }, []);

  const reset = useCallback(() => { cleanup(); setError(null); setLeadId(null); setCallId(null); setSeconds(0); setMuted(false); set('idle'); }, [cleanup, set]);

  useEffect(() => () => { cleanup(); }, [cleanup]);
  // Closing the tab or leaving the page ends the call rather than leaving it live.
  useEffect(() => {
    const h = () => { try { callRef.current?.disconnect(); } catch { /* ignore */ } };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, []);

  const active = ['preparing', 'connecting', 'ringing', 'connected'].includes(state);
  return { state, active, leadId, callId, muted, seconds, error, simulated, start, hangup, toggleMute, reset };
}
export type TwilioCall = ReturnType<typeof useTwilioCall>;

export const fmtDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
