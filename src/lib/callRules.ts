/* ══ BROWSER CALLING: WHICH NUMBER, WHICH COUNTRIES, WHAT HOURS, HOW MUCH CREDIT — ONE RULE (2026-11-16, v1-calling-solid) ══
   twilio-voice-token (before a call row is written) and twilio-webhook (before Twilio is told to dial) both ask this file.
   Until today each held its own copy of the UK pattern, so a country added in one was still refused by the other.

   ⛔ THE NUMBER IS ALWAYS E.164 BEFORE IT IS DIALLED. callDigits() is waNumber.toWhatsAppDigits (07… → 447…, an Irish
      lead's 08… → 3538…, +60 / +65 kept) plus one clean-up only calls need: the "(0)" people type after a code
      ("+44 (0)7700 900123", "+353 (0)85 …") and a trunk 0 typed straight after the code ("+44 07700…"). Without it
      those became 4407700… — refused as "not callable", never dialled wrong, but a real lead the rep could not ring.
      toWhatsAppDigits itself is unchanged (every WhatsApp send and the phone-history guard read it).
   ⛔ WHICH COUNTRIES. UK (mobile + landline, no 08/09 premium) and IRELAND (mobile 083-089, landlines; no 08x
      non-geographic / special-rate ranges) are always callable — Paul switched both on in Twilio's Voice geo
      permissions on 2026-11-16 after a call to a UK mobile was refused with 13227. Malaysia / Singapore only while
      that country's calling switch is on (outreach_country_settings, unchanged). Anything else is refused.
   ⛔ WHICH NUMBER (Paul, 2026-11-16): the phone field may hold several numbers; the call rings a mobile first, then a
      landline, then a non-geographic one (0800 / 03 / 084 / 087 …, flagged "May not connect" before dialling). A 09
      premium-rate number is NEVER dialled (pickCallNumber).
   ⛔ CALLING HOURS are the PROSPECT'S local time, read from their number's country: Mon-Fri 08:00-20:00,
      Sat 09:00-17:00, never Sunday. Outside them no call row is written and nothing is dialled.
   ⛔ CREDIT. Below TWILIO_BALANCE_BLOCK nothing is dialled (Twilio would refuse anyway, mid-ring); below
      TWILIO_BALANCE_ALERT Paul gets ONE bell + email a day. A balance that cannot be read does not stop a call —
      Twilio itself is the authority on credit — but it is logged.
   ⛔ PURE, relative imports with an explicit .ts (edge functions import this). */
import { toWhatsAppDigits } from './waNumber.ts';
import { channelOn, localMinutes, localWeekday, mobileMarketOf, type CountrySettings } from './outreachMarkets.ts';

export type CallMarket = 'UK' | 'IE' | 'MY' | 'SG';

/** Until 2026-11-16 the whole UK rule: geographic (1, 2), 03 and 07. Kept as the core shape; ukNumberKind is the rule now. */
export const UK_CALLABLE = /^44[1237]\d{8,9}$/;

/* ── What KIND of UK number (Paul, 2026-11-16) ────────────────────────────────────────────────────────────────────
   mobile          071-075, 077-079
   geographic      01, 02
   non_geographic  03 (0300 / 0330 …), 0800 / 0808 freephone, 084 / 087, 055 / 056, 070 personal, 076 pager —
                   dialled only after the rep has seen "May not connect…" (and only when the lead has no better number)
   premium         09 — NEVER dialled */
export type UkNumberKind = 'mobile' | 'geographic' | 'non_geographic' | 'premium';
export function ukNumberKind(digits: string | null | undefined): UkNumberKind | null {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (!/^44\d{9,10}$/.test(d)) return null;
  const n = d.slice(2);
  if (/^7[1-57-9]\d{8}$/.test(n)) return 'mobile';
  if (/^[12]\d{8,9}$/.test(n)) return 'geographic';
  if (/^9\d{9}$/.test(n)) return 'premium';
  if (/^(3\d{9}|80[08]\d{6,7}|8[47]\d{8}|5[56]\d{8}|7[06]\d{8})$/.test(n)) return 'non_geographic';
  return null;
}
export const NON_GEOGRAPHIC_WORDS = 'Freephone / non-geographic number (0800, 03, 084, 087…), may not connect: try their mobile or landline.';
export const PREMIUM_WORDS = 'Not dialled: this is a 09 premium-rate number. Find their mobile or landline instead.';
/** Irish mobiles (083, 085, 086, 087, 089) and geographic landlines (01 Dublin, 02x-07x, 09x). Not 08x non-mobile
 *  (0818 NTS) and nothing without a full national number. */
export const IE_CALLABLE = /^353(8[35679]\d{7}|1\d{7}|[2-79]\d{7,8})$/;
const MY_CALLABLE = /^60(1([02-9]\d{7}|1\d{8})|[3-9]\d{7,8})$/;
const SG_CALLABLE = /^65[3689]\d{7}$/;

/** Markets callable without a per-country switch. */
export const ALWAYS_CALLABLE: ReadonlySet<CallMarket> = new Set<CallMarket>(['UK', 'IE']);

/** ONE typed number → E.164 digits (no "+"), or null. */
function oneNumberDigits(raw: string, country: string | null): string | null {
  const cleaned = raw.replace(/\(\s*0\s*\)/g, '');
  let d = toWhatsAppDigits(cleaned, country);
  if (!d) return null;
  // A trunk 0 typed straight after the code: "+44 07700 900123" → 4407700900123 → 447700900123.
  if (/^440[1-9]/.test(d)) d = '44' + d.slice(3);
  else if (/^3530[1-9]/.test(d)) d = '353' + d.slice(4);
  return d;
}

/** The phone field can hold more than one number ("01234 567890 / 07700 900123"): split on / , ; | & "or" new line. */
export function splitPhones(raw: string | null | undefined): string[] {
  return String(raw ?? '').split(/\s*(?:[/,;|&\n]|\bor\b)\s*/i).map((s) => s.trim()).filter((s) => /\d{6,}/.test(s.replace(/\D/g, '')));
}

export type CallNumberKind = UkNumberKind | 'abroad';
export interface CallPick {
  /** What a browser call dials, or null (nothing callable — a 09 alone is null too). */
  digits: string | null;
  kind: CallNumberKind | null;
  /** How many numbers the phone field holds. */
  count: number;
  /** Every number in the field was 09 premium: never dialled. */
  premiumOnly: boolean;
  /** Shown before the rep presses Call: a non-geographic number, or which of several numbers will be rung. */
  warning: string | null;
}

const RANK: Record<CallNumberKind, number> = { mobile: 0, geographic: 1, abroad: 1, non_geographic: 2, premium: 9 };
const kindOf = (d: string): CallNumberKind | null => {
  if (d.startsWith('44')) return ukNumberKind(d);
  if (!browserCallMarket(d)) return null;
  return /^3538[35679]\d{7}$/.test(d) || mobileMarketOf(d) ? 'mobile' : 'abroad';
};

/** Which of the lead's numbers a browser call rings: a mobile, else a landline, else a non-geographic one; 09 never. */
export function pickCallNumber(raw: string | null | undefined, country?: string | null): CallPick {
  const parts = splitPhones(raw);
  const all = (parts.length ? parts : [String(raw ?? '')])
    .map((p) => oneNumberDigits(p, country ?? null)).filter((d): d is string => !!d)
    .map((d) => ({ d, k: kindOf(d) })).filter((x): x is { d: string; k: CallNumberKind } => !!x.k);
  const count = parts.length;
  const usable = all.filter((x) => x.k !== 'premium').sort((a, b) => RANK[a.k] - RANK[b.k]);
  const best = usable[0] ?? null;
  const premiumOnly = !best && all.some((x) => x.k === 'premium');
  let warning: string | null = premiumOnly ? PREMIUM_WORDS : best?.k === 'non_geographic' ? NON_GEOGRAPHIC_WORDS : null;
  if (best && !warning && count > 1) warning = `This lead has ${count} numbers — the call rings +${best.d} (${best.k === 'mobile' ? 'the mobile' : 'the landline'}).`;
  return { digits: best?.d ?? null, kind: best?.k ?? (premiumOnly ? 'premium' : null), count, premiumOnly, warning };
}

/** A stored phone → the E.164 digits (no "+") a browser call dials, or null. */
export function callDigits(raw: string | null | undefined, country?: string | null): string | null {
  return pickCallNumber(raw, country).digits;
}

/** "+447700900123" — what the server hands Twilio. */
export function callE164(raw: string | null | undefined, country?: string | null): string | null {
  const d = callDigits(raw, country);
  return d ? '+' + d : null;
}

/** The country a browser call to these digits would reach, or null when browser calling never covers it. */
export function browserCallMarket(digits: string | null | undefined): CallMarket | null {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (d.startsWith('44')) { const k = ukNumberKind(d); return k && k !== 'premium' ? 'UK' : null; }
  if (IE_CALLABLE.test(d)) return 'IE';
  if (MY_CALLABLE.test(d)) return 'MY';
  if (SG_CALLABLE.test(d)) return 'SG';
  return null;
}

/** May a browser call reach this market right now? UK / Ireland always; Malaysia / Singapore only with their switch on.
 *  Absent market or settings = no (absent never falls through as allowed). */
export function browserCallAllowed(market: CallMarket | null, settings: CountrySettings | null | undefined): boolean {
  if (!market) return false;
  if (ALWAYS_CALLABLE.has(market)) return true;
  return (market === 'MY' || market === 'SG') && channelOn(settings, market, 'call');
}

export const CALL_MARKET_NAME:Record<CallMarket, string> = { UK: 'the UK', IE: 'Ireland', MY: 'Malaysia', SG: 'Singapore' };
export const NOT_CALLABLE_WORDS = 'Browser calling covers UK, Irish, Malaysian and Singapore numbers only, and this number is not one of them. Check the number on the lead, or call from your own phone.';

/* ── Calling hours, in the prospect's own time ─────────────────────────────────────────────────────────────────── */
export const CALL_MARKET_ZONE: Record<CallMarket, string> = { UK: 'Europe/London', IE: 'Europe/Dublin', MY: 'Asia/Kuala_Lumpur', SG: 'Asia/Singapore' };
/** Minutes after local midnight, [start, end), per weekday (0 = Sunday … 6 = Saturday). null = no calls that day. */
export const CALL_HOURS: ReadonlyArray<readonly [number, number] | null> = [
  null,                 // Sunday
  [8 * 60, 20 * 60], [8 * 60, 20 * 60], [8 * 60, 20 * 60], [8 * 60, 20 * 60], [8 * 60, 20 * 60], // Mon-Fri
  [9 * 60, 17 * 60],    // Saturday
];
export const CALL_HOURS_WORDS = 'Mon–Fri 8am–8pm, Sat 9am–5pm, never Sunday (their local time)';

export interface CallHoursVerdict { open: boolean; localTime: string; words: string }

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Is it calling hours for a number in this country right now? */
export function callHoursVerdict(market: CallMarket, now: Date = new Date()): CallHoursVerdict {
  const tz = CALL_MARKET_ZONE[market];
  const day = localWeekday(tz, now);
  const min = localMinutes(tz, now);
  const hours = CALL_HOURS[day] ?? null;
  const localTime = hhmm(min);
  const open = !!hours && min >= hours[0] && min < hours[1];
  return {
    open, localTime,
    words: open ? '' : `It is ${localTime} for them in ${CALL_MARKET_NAME[market]}, outside calling hours (${CALL_HOURS_WORDS}). No call was made — try again in their calling hours.`,
  };
}

/* ── Twilio credit ────────────────────────────────────────────────────────────────────────────────────────────── */
/** At or below this (account currency) nothing is dialled. */
export const TWILIO_BALANCE_BLOCK = 1;
/** Below this Paul is told once a day. */
export const TWILIO_BALANCE_ALERT = 10;
export const LOW_BALANCE_WORDS = 'Calling is paused: the phone account is out of credit. Paul has been told. For now, call from your own phone.';

export type BalanceVerdict = 'ok' | 'low' | 'empty' | 'unknown';
export function balanceVerdict(balance: number | null | undefined): BalanceVerdict {
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return 'unknown';
  if (balance <= TWILIO_BALANCE_BLOCK) return 'empty';
  if (balance < TWILIO_BALANCE_ALERT) return 'low';
  return 'ok';
}

/** The bell + email dedupe key: once per UTC day. */
export const lowBalanceDedupeKey = (now: Date = new Date()) => `twilio_balance_low:${now.toISOString().slice(0, 10)}`;

/* ── Do Not Contact ──────────────────────────────────────────────────────────────────────────────────────────── */
export const OPTED_OUT_CALL_WORDS = 'Blocked: this business asked not to be contacted (Do Not Contact). Do not call them.';
export const WRONG_NUMBER_CALL_WORDS = 'Blocked: this number is marked wrong. Find the right number before calling.';
