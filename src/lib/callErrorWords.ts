/* ══ BROWSER CALLING: WHAT WENT WRONG, IN PLAIN WORDS — AND WHICH TWILIO EDGE TO USE (2026-11-11, fix/malaysia-calling) ══

   🔴 WHY THIS EXISTS. Stephan (in Malaysia) kept seeing "Twilio error 31000" in the dialer. 31000 is the Voice SDK's
   catch-all: it is what the browser gets when
     · Twilio refuses to dial for a reason the SDK has no name for — his 2 and 4 Nov calls were refused with 13227
       ("no international permission": Malaysia was not switched on in the account's Voice geo permissions) and the
       browser only saw 31000; or
     · the browser's connection to Twilio drops (a VPN, hotel / office wifi, a far-away edge).
   The screen printed Twilio's own text. Now the SDK is asked for precise codes (enableImprovedSignalingErrorPrecision),
   the original server code under a 31000 is read too, and every code becomes one sentence: what went wrong + what to do.

   ⛔ NO RAW CODES ON SCREEN. The code goes to the console for support, never into the sentence.
   ⛔ NEVER "TRY AGAIN" FOR SOMETHING A RETRY CANNOT FIX (a country not allowed, a bad number): those say who fixes it.
   ⛔ PURE, NO IMPORTS. */

export interface CallErrorLike { code?: number | string; message?: string; originalError?: unknown; name?: string }

const COUNTRY_NOT_ALLOWED = 'Our phone account is not allowed to call this country yet, so the call was stopped before it rang. Tell Paul (he switches it on in Twilio). For now, call from your own phone.';
const CONNECTION = 'The connection to the calling service dropped. Check your internet, turn off any VPN, and press Call again. If it keeps happening, call from your own phone and tell Paul.';
const AUDIO = 'The call could not get a clear audio path — usually a strict wifi, firewall or VPN. Try another network (a phone hotspot works), or call from your own phone.';
const PASS_EXPIRED = 'Your calling session expired. Press Call again.';
const MIC_BLOCKED = 'The microphone is blocked. Allow it in your browser (the padlock by the address), then try again — or call from your own phone.';
const BAD_NUMBER = 'This number could not be dialled — it may be wrong or no longer in service. Check the number on the lead, or try another number for them.';
const BUSY = 'Their line is busy. Try again a bit later.';
const NO_ANSWER = 'Their phone is switched off or out of reach. Try again later, or send a WhatsApp instead.';
const DECLINED = 'The call was declined.';
const SERVICE = 'The calling service had a problem on its side. Wait a minute and press Call again. If it keeps happening, call from your own phone and tell Paul.';
const GENERIC = 'The call could not connect. Press Call again in a minute. If it keeps happening, call from your own phone and tell Paul.';

/** Twilio code → plain sentence. Covers the Voice SDK (31xxx / 53xxx / 20xxx) and the REST / TwiML codes a refused
 *  dial reports back (13xxx / 21xxx / 32xxx). */
const WORDS: Record<number, string> = {
  // A country / number the account may not call (geo permissions, high-risk ranges).
  13227: COUNTRY_NOT_ALLOWED, 13224: BAD_NUMBER, 21215: COUNTRY_NOT_ALLOWED, 21216: COUNTRY_NOT_ALLOWED,
  32205: COUNTRY_NOT_ALLOWED, 31403: COUNTRY_NOT_ALLOWED,
  // The number itself.
  13214: BAD_NUMBER, 13223: BAD_NUMBER, 21211: BAD_NUMBER, 21217: BAD_NUMBER, 31404: BAD_NUMBER, 31484: BAD_NUMBER, 31604: BAD_NUMBER,
  // The other end.
  31486: BUSY, 31600: BUSY, 31480: NO_ANSWER, 31408: NO_ANSWER, 31603: DECLINED,
  // Signalling / the browser's connection to Twilio.
  31000: CONNECTION, 31005: CONNECTION, 31009: CONNECTION, 53000: CONNECTION, 53001: CONNECTION, 53405: AUDIO, 53407: AUDIO,
  31003: AUDIO, 31201: PASS_EXPIRED, 31204: PASS_EXPIRED, 31205: PASS_EXPIRED, 20101: PASS_EXPIRED, 20104: PASS_EXPIRED,
  // The microphone.
  31208: MIC_BLOCKED, 31401: MIC_BLOCKED, 31402: MIC_BLOCKED,
  // Twilio's own side.
  31500: SERVICE, 31502: SERVICE, 31503: SERVICE, 31530: SERVICE, 31531: SERVICE, 31002: SERVICE,
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The most specific Twilio code an SDK error carries: the original server code under a generic 31000 / 31005 wins. */
export function callErrorCode(e: CallErrorLike | null | undefined): number | null {
  if (!e) return null;
  const top = num(e.code);
  const orig = e.originalError as { code?: unknown; error?: { code?: unknown } } | undefined;
  const inner = num(orig?.code) ?? num(orig?.error?.code);
  if (inner != null && inner !== top && (top == null || top === 31000 || top === 31005 || !(top in WORDS))) return inner;
  return top ?? inner;
}

/** One plain sentence for a call error: what went wrong and what to do. Never contains a raw code. */
export function callErrorWords(e: CallErrorLike | null | undefined): string {
  const c = callErrorCode(e);
  if (c != null && WORDS[c]) return WORDS[c];
  if (c != null && c >= 31400 && c < 31500) return BAD_NUMBER;
  if (c != null && c >= 31500 && c < 31600) return SERVICE;
  if (c != null && c >= 53000 && c < 54000) return CONNECTION;
  return GENERIC;
}

/** A getUserMedia failure → the hook's failure word key. */
export function micFailureKey(e: unknown): 'mic_denied' | 'no_mic' | 'mic_busy' {
  const n = String((e as { name?: string } | null)?.name ?? '');
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'no_mic';
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'mic_busy';
  return 'mic_denied';
}

/* ══ WHICH TWILIO EDGE THE BROWSER CONNECTS THROUGH ══════════════════════════════════════════════════════════════════
   The SDK's default is "roaming" (DNS picks an edge). On a VPN, or a network whose DNS resolver is abroad, that can be
   an edge on another continent — Malaysia → Ashburn — and the signalling link is the first thing to drop (31000).
   We pin the nearest edge from the rep's own clock (the browser's time zone), with near fallbacks and "roaming" last;
   the SDK moves to the next edge by itself if one cannot be reached (this needs maxCallSignalingTimeoutMs > 0).
   ⛔ The time zone only chooses a route to Twilio. It never decides who or where we may call. */
export const CALL_SIGNALING_TIMEOUT_MS = 30_000;

export function twilioEdgesFor(timeZone: string | null | undefined): string[] {
  const tz = String(timeZone ?? '');
  if (/^Australia\/|^Pacific\/(Auckland|Chatham|Fiji)/.test(tz)) return ['sydney', 'singapore', 'roaming'];
  if (/^Asia\/(Tokyo|Seoul|Pyongyang)/.test(tz)) return ['tokyo', 'singapore', 'roaming'];
  if (/^Asia\//.test(tz) || /^Indian\//.test(tz)) return ['singapore', 'tokyo', 'roaming'];  // Kuala_Lumpur, Kuching, Singapore…
  if (/^Europe\/|^Atlantic\/|^Africa\//.test(tz)) return ['dublin', 'frankfurt', 'roaming'];
  if (/^America\/(Sao_Paulo|Argentina|Santiago|Bogota|Lima|Montevideo|Caracas)/.test(tz)) return ['sao-paulo', 'ashburn', 'roaming'];
  if (/^America\/(Los_Angeles|Vancouver|Phoenix|Denver|Boise|Anchorage|Tijuana)|^Pacific\/Honolulu/.test(tz)) return ['umatilla', 'ashburn', 'roaming'];
  if (/^America\//.test(tz)) return ['ashburn', 'umatilla', 'roaming'];
  return ['roaming'];
}

/** The browser's own time zone, or null (never throws). */
export function browserTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}
