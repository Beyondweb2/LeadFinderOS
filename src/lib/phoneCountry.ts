/* ══ WHAT IS WRONG WITH THIS NUMBER, IN PLAIN WORDS — ONE RULE (2026-10-22, fix/country-refusals, docs/country-refusals.md) ══
   Refusals used to say "Not a UK mobile (cold WhatsApp is UK mobiles only)" for everything that was not a mobile we
   message — a Malaysian landline, an Australian mobile on a lead labelled UK, a number with no country code on a lead
   with no country. Stale since Malaysia, Singapore and Australia, and it never said what to fix.

   Two answers, both read from the SAME digits the senders use (waNumber.toWhatsAppDigits → outreachMarkets):
     · phoneCountryMismatch — the number's own international code names one of our countries and the lead's country
       label says another (or nothing). The lead card warns; the number is still read by its code.
     · phoneProblemWords — why this number is not a mobile we can message: no number, a landline (whose), a 1300 / 1800
       number, a country we do not message, the country label and the number disagree, no code and no country. null when
       it IS a mobile of one of our markets (whether that country is switched on is the caller's own answer).
   ⛔ Words only. Nothing here decides a send: the verdicts stay coldWhatsAppVerdict / mobileMarketOf / the SQL ladder.
   ⛔ PURE, relative imports with .ts (edge functions import this). */
import { bareInternationalMarketOf, toWhatsAppDigits } from './waNumber.ts';
import { MARKET_NAME, mobileMarketOf, type Market } from './outreachMarkets.ts';
import { WE_MESSAGE } from './countrySkipWords.ts';
export { COUNTRY_OFF_WORDS, NOT_A_MOBILE_WE_MESSAGE_WORDS } from './countrySkipWords.ts';

export const MARKET_CODE: Record<Market, string> = { UK: '+44', MY: '+60', SG: '+65', AU: '+61' };
/** "a Malaysian number" / "an Australian landline". */
const ADJ: Record<Market, { a: string; adj: string }> = {
  UK: { a: 'a', adj: 'UK' }, MY: { a: 'a', adj: 'Malaysian' }, SG: { a: 'a', adj: 'Singapore' }, AU: { a: 'an', adj: 'Australian' },
};
const aAdj = (m: Market, noun: string) => `${ADJ[m].a} ${ADJ[m].adj} ${noun}`;

export type LabelMarket = { kind: 'blank' } | { kind: 'market'; market: Market } | { kind: 'other'; label: string };

/** The lead's country label as one of our markets, blank, or another country (kept as typed, for the words). */
export function labelMarketOf(country: string | null | undefined): LabelMarket {
  const t = String(country ?? '').trim();
  const u = t.toUpperCase();
  if (!u) return { kind: 'blank' };
  if (['UK', 'GB', 'UNITED KINGDOM', 'GREAT BRITAIN', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERN IRELAND'].includes(u)) return { kind: 'market', market: 'UK' };
  if (u === 'MALAYSIA' || u === 'MY') return { kind: 'market', market: 'MY' };
  if (u === 'SINGAPORE' || u === 'SG') return { kind: 'market', market: 'SG' };
  if (u === 'AUSTRALIA' || u === 'AU') return { kind: 'market', market: 'AU' };
  return { kind: 'other', label: t };
}
const labelWords = (l: LabelMarket) => l.kind === 'market' ? (l.market === 'UK' ? 'UK' : MARKET_NAME[l.market]) : l.kind === 'other' ? l.label : '';

/** The country the number's OWN code names: "+44 / +60 / +65 / +61" (or "00…"), or one of those full numbers typed
 *  without "+" (waNumber.bareInternationalMarketOf). null when it carries no code of ours — never a guess. */
export function prefixMarketOf(raw: string | null | undefined): Market | null {
  let s = String(raw ?? '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    const d = s.slice(1);
    return d.startsWith('44') ? 'UK' : d.startsWith('60') ? 'MY' : d.startsWith('65') ? 'SG' : d.startsWith('61') ? 'AU' : null;
  }
  return bareInternationalMarketOf(s);
}

/** The code a "+" number carries when it is NOT one of ours ("+1", "+91"), for the words. */
function foreignCode(raw: string): string | null {
  let s = raw.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+') || prefixMarketOf(s)) return null;
  const d = s.slice(1);
  // One-digit codes 1 and 7; otherwise show two digits (enough to say "not one of ours", not a lookup table).
  return '+' + (/^[17]/.test(d) ? d.slice(0, 1) : d.slice(0, 2));
}

export interface PhoneCountryMismatch { prefix: Market; label: LabelMarket; words: string }

/** The number's own code and the lead's country disagree (or the country is blank). null when they agree or the number
 *  carries no code of ours. */
export function phoneCountryMismatch(raw: string | null | undefined, country: string | null | undefined): PhoneCountryMismatch | null {
  const prefix = prefixMarketOf(raw);
  if (!prefix) return null;
  const label = labelMarketOf(country);
  if (label.kind === 'market' && label.market === prefix) return null;
  const readAs = mobileOrLineMarket(toWhatsAppDigits(String(raw ?? ''), country ?? null));
  const tail = readAs === prefix
    ? `It is read by its code, as ${aAdj(prefix, 'number')}.`
    : 'Fix the country or the number.';
  const words = label.kind === 'blank'
    ? `Country not set — the number looks like ${aAdj(prefix, 'number')} (${MARKET_CODE[prefix]}). ${tail}`
    : `The lead's country says ${labelWords(label)} but the number looks like ${aAdj(prefix, 'number')} (${MARKET_CODE[prefix]}). ${tail}`;
  return { prefix, label, words };
}

/** The market of these digits, mobile or not (for "read as"). */
function mobileOrLineMarket(d: string | null): Market | null {
  if (!d) return null;
  return mobileMarketOf(d) ?? bareInternationalMarketOf(d);
}

/** A landline / non-mobile of one of our markets in these digits, in words; null when it is not one. */
function nonMobileWords(d: string): string | null {
  if (/^44[123]\d{8,9}$/.test(d)) return `This looks like ${aAdj('UK', 'landline')}, not a mobile.`;
  if (/^60[3-9]\d{7,8}$/.test(d)) return `This looks like ${aAdj('MY', 'landline')}, not a mobile.`;
  if (/^656\d{7}$/.test(d)) return `This looks like ${aAdj('SG', 'landline')}, not a mobile.`;
  if (/^653\d{7}$/.test(d)) return 'This looks like a Singapore internet (VoIP) number, not a mobile.';
  if (/^61[2378]\d{8}$/.test(d)) return `This looks like ${aAdj('AU', 'landline')}, not a mobile.`;
  return null;
}

/** A HINT (never a reading) when a national number with no code has another of our countries' mobile shape. */
function nationalHint(d: string, label: LabelMarket): string {
  const ukOrBlank = label.kind === 'blank' || (label.kind === 'market' && label.market === 'UK');
  if (label.kind === 'market' && label.market !== 'UK' && /^07\d{9}$/.test(d)) return ' It looks like a UK mobile (07…) — if it is, set the country to UK or add +44.';
  if (ukOrBlank && /^01[02-9]\d{7}$/.test(d)) return ' If this is a Malaysian mobile (01x…), set the country to Malaysia or add +60.';
  if (ukOrBlank && /^[89]\d{7}$/.test(d)) return ' If this is a Singapore mobile, set the country to Singapore or add +65.';
  return '';
}

/** Why this number is not a mobile we can message, in one or two plain sentences; null when it is one of our markets'
 *  mobiles (then only the country switch decides). */
export function phoneProblemWords(raw: string | null | undefined, country: string | null | undefined): string | null {
  const r = String(raw ?? '').trim();
  if (!r || !/\d/.test(r)) return 'No phone number.';
  const digits = toWhatsAppDigits(r, country ?? null);
  if (digits && mobileMarketOf(digits)) return null;
  const label = labelMarketOf(country);
  const mismatch = phoneCountryMismatch(r, country);
  const also = mismatch ? ` ${mismatch.words}` : '';
  const d = r.replace(/\D/g, '');
  const hint = mismatch ? '' : nationalHint(d, label);

  if (digits) {
    const line = nonMobileWords(digits);
    if (line) return line + (also || (label.kind === 'blank' && digits.startsWith('44') ? ' Country not set, so it was read as a UK number.' : '')) + hint;
  }
  const foreign = foreignCode(r);
  if (foreign) return `This is a ${foreign} number — another country. We only message ${WE_MESSAGE}.`;
  if (label.kind === 'market' && label.market === 'AU' && /^1(3|300|800)/.test(d)) {
    return 'This looks like an Australian 13 / 1300 / 1800 business number, not a mobile.';
  }
  if ((label.kind === 'blank' || (label.kind === 'market' && label.market === 'UK')) && /^04\d{8}$/.test(d)) {
    return `No UK number starts 04 — this may be an Australian mobile. ${label.kind === 'blank' ? 'Country not set: set' : 'Set'} the country to Australia, or add +61.`;
  }
  if (mismatch) return `This number can't be read as a mobile. ${mismatch.words}`;
  if (label.kind === 'other') {
    return `The lead's country says ${label.label} and the number has no country code, so we can't tell where it is. We only message ${WE_MESSAGE} — add the code (+44, +60, +65, +61) or fix the country.`;
  }
  if (label.kind === 'blank' && !/^0/.test(d)) {
    return 'Country not set, and the number has no country code, so we can\'t tell which country it is. Set the country or add the code (+44, +60, +65, +61).' + hint;
  }
  const where = label.kind === 'market' ? label.market : 'UK';
  return `This can't be read as ${aAdj(where, 'mobile')}${label.kind === 'blank' ? ' (country not set, so it was read as UK)' : ''} — check the digits.` + hint;
}
