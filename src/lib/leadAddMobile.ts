/* ADD A MOBILE TO A LEAD THAT HAS NONE (Paul, 2026-11-10; SQL public.lead_add_mobile, migration 20261210100000).
 *
 * A landline lead's owner gives a mobile on the call. The salesperson types it; the lead's number becomes the mobile, the number
 * it had is kept (phone_original) and History records the change. Then WhatsApp and Text can carry the sign-up link.
 * ⛔ The SERVER decides (the function refuses a non-mobile, an opted-out number, a number another lead holds, and a lead that
 *    already has a mobile unless the admin asks). This file only says when to OFFER the box, checks the typing so the person
 *    is told before a round trip, and turns a refusal into words. Pure. */
import { mobileMarketOf } from './outreachMarkets.ts';
import { toWhatsAppDigits } from './waNumber.ts';

/** Does this lead have a mobile we could message? The same reading every sender uses (the digits, then the market). */
export function leadHasMobile(phone: string | null | undefined, country: string | null | undefined): boolean {
  return mobileMarketOf(toWhatsAppDigits(phone, country ?? null)) !== null;
}

/** Offer "Add their mobile"? Only where the lead has none. (A lead that already has one is the admin's to change.) */
export function offerAddMobile(phone: string | null | undefined, country: string | null | undefined): boolean {
  return !leadHasMobile(phone, country);
}

/** Is what they typed a mobile for this lead's market? Null = fine. */
export function typedMobileProblem(typed: string, country: string | null | undefined): string | null {
  const t = typed.trim();
  if (!t) return 'Type their mobile number.';
  if (!leadHasMobile(t, country)) return ADD_MOBILE_REFUSAL_WORDS.not_a_mobile;
  return null;
}

export const ADD_MOBILE_REFUSAL_WORDS: Record<string, string> = {
  not_a_mobile: 'That is not a mobile number we can message. Check it with them and type it again.',
  same_number: 'That is the number already on this lead.',
  already_mobile: 'This lead already has a mobile number. Ask Paul if it needs changing.',
  suppressed: 'That number is on the do-not-contact list, so it was not added.',
  archived: 'This lead is archived.',
  not_found: 'That lead could not be found.',
  not_your_lead: 'That lead is not assigned to you.',
  no_role: 'Your account cannot change leads.',
};

/** The words for the function's refusal. A number another lead holds names who has it. */
export function addMobileRefusalWords(code: string | null | undefined, ownerName?: string | null): string {
  if (code === 'duplicate') return `That mobile is already on another lead${ownerName ? ` (${ownerName})` : ''}, so it was not added.`;
  return ADD_MOBILE_REFUSAL_WORDS[String(code ?? '')] ?? 'The mobile could not be added. Try again.';
}
