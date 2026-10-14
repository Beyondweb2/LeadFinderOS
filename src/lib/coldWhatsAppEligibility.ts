/* ══ CAN THIS LEAD BE COLD-WHATSAPPED, AND WHAT DO WE WRITE WHEN IT CANNOT (2026-10-08) ══════════════
   ONE rule for the Outreach queue dialog and the drip, so the two cannot disagree about a number.

   🔴 WHAT WAS WRONG. The dialog's gate was classifyLineType, which answers "is this a landline?" and treats
   an EMPTY number and an Australian mobile as eligible ("let the downstream handling decide"). Downstream
   never decided: the drip's query excludes a null phone, so a lead queued with no number sat 'queued' for 9
   days (Roof Rhino, Precision Roofers); an Australian mobile was queued, then bounced at send time back to
   "New". A lead the system had just learned it cannot WhatsApp read as untouched.

   ⛔ THE ANSWER IS A POSITIVE ALLOWLIST ON THE DIGITS WE WOULD SEND TO (the absent-value law, CLAUDE.md §6):
   eligible only when the number normalises to a UK mobile. Anything else — no number, an unparseable one, a
   UK landline, a foreign number, India, Australia — is "not eligible", with the REASON kept separate from
   the STATUS: every reason writes the SAME existing state, no_whatsapp_needs_sms (the "cannot WhatsApp this
   number" marker; only its wording mentions SMS). No second status is invented.
   The SQL twin is sales_queue_opener's reason ladder (migration 20261016090000_queue_truthful_flags.sql).

   ⛔ CONTACT METHOD IS NOT CONTACT EVIDENCE. Nothing here reads contact_method: pressing Call sets that pill
   and nothing else, and a lead whose pill says Call is exactly as WhatsApp-eligible as before.
   ⛔ PURE, relative imports only: the queue edge function imports this by path. */
import { toWhatsAppDigits } from './waNumber.ts';
import { isUkColdDestination, NOT_A_UK_MOBILE } from './ukColdDestination.ts';
import { COUNTRY_OFF, mobileMarketOf, type Market } from './outreachMarkets.ts';

/** The one existing "cannot WhatsApp this number" status. Never rename: stored, consumed everywhere. */
export const NO_WHATSAPP_STATUS = 'no_whatsapp_needs_sms';

export type ColdNotEligibleReason = 'no_phone' | 'bad_number' | 'landline' | typeof NOT_A_UK_MOBILE | typeof COUNTRY_OFF;
export type ColdVerdict =
  | { eligible: true; digits: string }
  | { eligible: false; reason: ColdNotEligibleReason; digits: string | null };

/* 2026-10-14 (Malaysia / Singapore, src/lib/outreachMarkets.ts): `markets` = the markets whose WhatsApp switch is on.
   Left out it is the UK alone — exactly the old rule. A real Malaysian / Singapore mobile in a market that is switched
   off answers COUNTRY_OFF: a mobile we are not messaging yet, NEVER a reason to flag the lead No mobile. */
export function coldWhatsAppVerdict(phone: string | null | undefined, country?: string | null,
                                    markets: ReadonlySet<Market> = UK_ONLY): ColdVerdict {
  const raw = String(phone ?? '').trim();
  if (!raw) return { eligible: false, reason: 'no_phone', digits: null };
  const digits = toWhatsAppDigits(raw, country);
  if (!digits) return { eligible: false, reason: 'bad_number', digits: null };
  const market = mobileMarketOf(digits);
  if (market === 'UK' && isUkColdDestination(digits)) {
    return markets.has('UK') ? { eligible: true, digits } : { eligible: false, reason: COUNTRY_OFF, digits };
  }
  if (market) return markets.has(market) ? { eligible: true, digits } : { eligible: false, reason: COUNTRY_OFF, digits };
  // A UK number that is not a mobile (01/02/03…) is a landline; everything else is simply not UK.
  if (/^44[1-3]\d{8,9}$/.test(digits)) return { eligible: false, reason: 'landline', digits };
  return { eligible: false, reason: NOT_A_UK_MOBILE, digits };
}

const UK_ONLY: ReadonlySet<Market> = new Set<Market>(['UK']);

/** Does this reason mean "WhatsApp cannot reach this number" (flag the lead No mobile)? COUNTRY_OFF never does: the
 *  number is a real mobile in a market that is switched off. */
export function marksNoMobile(reason: ColdNotEligibleReason): boolean {
  return reason !== COUNTRY_OFF;
}

/** Human wording for the batch note; the reason codes themselves are stored tokens. */
export const COLD_NOT_ELIGIBLE_LABEL: Record<ColdNotEligibleReason, string> = {
  no_phone: 'no phone number (flagged No mobile)',
  bad_number: 'phone number not usable (flagged No mobile)',
  landline: 'landline (flagged No mobile)',
  [NOT_A_UK_MOBILE]: 'not a mobile we message (UK, Malaysia or Singapore) - flagged No mobile',
  [COUNTRY_OFF]: 'a Malaysia / Singapore mobile - that country is switched off for WhatsApp (not flagged; turn it on in WhatsApp queue settings)',
};

/* A status BEFORE any real contact. A positive allowlist: anything not listed here (replied, interested,
   qualified, client, closed, opted_out, …) is more advanced or terminal and is NEVER overwritten. */
const BEFORE_CONTACT: ReadonlySet<string> = new Set(['', 'not_contacted', 'queued']);

/** What a lead's status becomes when we have just learned it cannot be WhatsApped. A lead still at the
 *  start becomes No WhatsApp; a lead that has moved on keeps its status. */
export function statusWhenWhatsAppUnavailable(current: string | null | undefined): string {
  const s = String(current ?? '').trim();
  return BEFORE_CONTACT.has(s) ? NO_WHATSAPP_STATUS : s;
}

/** What a lead's status becomes when we have just found GENUINE contact evidence on that very lead (a
 *  real sent/received WhatsApp, or a logged conversation). Only a lead still at the start becomes
 *  Contacted (initial_contact); replied / interested / client / closed … are never downgraded, and a lead
 *  with no evidence of its own is left exactly as it was. */
export function statusWithContactEvidence(current: string | null | undefined, ownEvidence: boolean): string {
  const s = String(current ?? '').trim();
  if (!ownEvidence) return s || 'not_contacted';
  return BEFORE_CONTACT.has(s) ? 'initial_contact' : s;
}

/** Where a lead returns to when the drip pulls it back out of the queue: the status it had before it was
 *  queued, never 'queued' itself, never a made-up "New" over a more advanced stage. */
export function statusBeforeQueue(previous: string | null | undefined): string {
  const p = String(previous ?? '').trim();
  return p && p !== 'queued' ? p : 'not_contacted';
}
