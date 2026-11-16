/* ══ THE CALL MANAGER'S RULES — PURE, SO THEY CAN BE TESTED WITHOUT A BROWSER (2026-11-16, v1-calling-solid) ══════════
   src/hooks/useTwilioCall.ts is the one call for the whole app (held by LiveCallProvider above every route, so a rep can
   click around while talking). It asks this file:
     · precheckConnection — a quick look BEFORE dialling: offline = stop with words; a slow link = warn, still call.
     · callQualityWords   — Twilio's live quality warnings (high RTT / jitter / packet loss / low MOS / a silent mic)
                            → one plain line on the floating call bar, cleared when Twilio clears it.
     · disconnectReason   — a call that ends while Twilio was reconnecting is a DROPPED call (offer redial), not "ended".
     · endedOutcomeWords  — a real call that ended without being answered and without the rep pressing End: read the
                            call row (Twilio's own status callback) → busy / no answer / unreachable / refused, in words.
     · KEYPAD_KEYS        — the only characters the keypad sends (DTMF).
   ⛔ PURE, NO IMPORTS from React or the SDK. callErrorWords stays the one code → sentence table. */
import { callErrorWords } from './callErrorWords.ts';
import { NON_GEOGRAPHIC_WORDS } from './callRules.ts';

/** The failure keys the hook uses → plain words. A server refusal carries its own words (twilio-voice-token detail). */
export const CALL_FAILURE_WORDS: Record<string, string> = {
  mic_denied: 'The microphone is blocked. Allow it in your browser (the padlock by the address), then try again — or call from your own phone.',
  no_mic: 'No microphone was found. Plug in a headset or microphone, then try again — or call from your own phone.',
  mic_busy: 'Another app is using the microphone (Zoom, WhatsApp, Teams…). Close it, then try again.',
  unsupported: 'This browser cannot make calls. Use Chrome, Edge or Safari on a computer, or call from your own phone.',
  not_configured: 'Browser calling is not set up yet.',
  network: 'The connection dropped. Check your internet, turn off any VPN, and try again.',
  offline: 'You are offline, so no call was made. Check your internet, then press Call again.',
  dropped: 'The call dropped — the internet connection was lost mid-call. Press Call again to redial.',
  declined: 'The call was declined.',
  opted_out: 'Blocked: this business asked not to be contacted (Do Not Contact). Do not call them.',
  wrong_number: 'Blocked: this number is marked wrong. Find the right number before calling.',
  outside_hours: 'It is outside calling hours for them (Mon–Fri 8am–8pm, Sat 9am–5pm, their time). No call was made.',
  low_balance: 'Calling is paused: the phone account is out of credit. Paul has been told. For now, call from your own phone.',
};

/** Failures a redial can fix: the bar and the panel offer Call again for these. Others say who fixes it instead. */
export const REDIAL_FAILURES: ReadonlySet<string> = new Set(['network', 'offline', 'dropped', 'declined']);

export interface ConnectionLike { onLine?: boolean; connection?: { effectiveType?: string; rtt?: number; saveData?: boolean } | null }
export interface Precheck { ok: boolean; failure?: 'offline'; warning: string | null }

/** Round-trip time (ms) above which the browser's own estimate says calls will lag. */
export const SLOW_RTT_MS = 400;
export const SLOW_NETWORK_WORDS = 'Your internet looks slow — the call may lag or break up. A wired connection or a phone hotspot helps.';

/** A quick look at the rep's connection before anything is dialled. Missing information is not a warning. */
export function precheckConnection(nav: ConnectionLike | null | undefined): Precheck {
  if (nav && nav.onLine === false) return { ok: false, failure: 'offline', warning: null };
  const c = nav?.connection;
  const slow = !!c && (c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || (typeof c.rtt === 'number' && c.rtt > SLOW_RTT_MS));
  return { ok: true, warning: slow ? SLOW_NETWORK_WORDS : null };
}

/* Twilio Voice SDK call quality warnings (Call 'warning' / 'warning-cleared'). */
const POOR = 'Poor connection — they may hear you break up. Move closer to the wifi, close video calls, or use a hotspot.';
const QUALITY_WORDS: Record<string, string> = {
  'high-rtt': POOR, 'high-jitter': POOR, 'high-packet-loss': POOR, 'high-packets-lost-fraction': POOR, 'low-mos': POOR,
  'low-bytes-received': 'You may not be hearing them — the sound from their side has stopped arriving.',
  'low-bytes-sent': 'They may not be hearing you — your sound is not getting out.',
  'ice-connectivity-lost': 'Connection lost — trying to reconnect…',
  'constant-audio-input-level': 'Your microphone seems silent. Check it is not muted on the headset, or pick another one in the browser.',
};

/** One of Twilio's warning names → the words for the bar, or null for a warning we do not show. */
export function callQualityWords(name: string | null | undefined): string | null {
  return QUALITY_WORDS[String(name ?? '')] ?? null;
}
/** Is this warning about the connection (shown as "poor connection")? */
export const isConnectionWarning = (name: string | null | undefined) => callQualityWords(name) === POOR;

/** A disconnect while Twilio was reconnecting = the line dropped (redial); otherwise the call simply ended. */
export function disconnectReason(o: { reconnecting: boolean; hungUpByRep: boolean }): 'ended' | 'dropped' {
  return o.reconnecting && !o.hungUpByRep ? 'dropped' : 'ended';
}

export interface CallRowLike { status?: string | null; error_code?: string | null; answered_at?: string | null }
/** Statuses that mean Twilio has settled the call. */
export const FINAL_CALL_STATUSES: ReadonlySet<string> = new Set(['completed', 'busy', 'no-answer', 'failed', 'canceled']);

/** A real call ended without an answer and without the rep pressing End → what happened, in words; null = say nothing. */
export function endedOutcomeWords(row: CallRowLike | null | undefined): string | null {
  if (!row || row.answered_at) return null;
  const s = String(row.status ?? '');
  if (s === 'busy') return 'Their line was busy. Try again a bit later.';
  if (s === 'no-answer') return 'No answer. Try again later, or send a WhatsApp instead.';
  if (s === 'failed') return row.error_code ? callErrorWords({ code: row.error_code }) : 'The call could not get through — their phone may be off or out of reach. Try again later.';
  return null;
}

/** A refused / failed call to a freephone / non-geographic number: the number TYPE is the real reason (2026-11-16 — an
 *  0800 lead read "not allowed to call this country"). Any other number keeps its own words. */
export function failureWordsForNumber(kind: string | null | undefined, words: string, code?: number | null): string {
  if (kind !== 'non_geographic') return words;
  return code == null || NUMBER_REFUSAL_CODES.has(code) ? NON_GEOGRAPHIC_WORDS : words;
}
/** Twilio codes that mean "this number / destination was refused" (not the rep's internet): geo permission, bad number. */
export const NUMBER_REFUSAL_CODES: ReadonlySet<number> = new Set([13227, 13224, 13214, 13223, 21211, 21215, 21216, 21217, 32205, 31403, 31404, 31484, 31604]);

/** The phone keypad: the only characters sent as tones. */
export const KEYPAD_KEYS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
export const isKeypadKey = (k: string) => KEYPAD_KEYS.includes(k);

/** How long a fresh token is asked for before the old one runs out (the SDK's tokenWillExpire lead time, seconds). */
export const TOKEN_REFRESH_LEAD_S = 60;
