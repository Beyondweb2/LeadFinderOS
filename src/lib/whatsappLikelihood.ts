/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOW LIKELY IS A UK MOBILE TO BE ON WHATSAPP, FROM WHAT WE ALREADY HOLD (2026-11-23, docs/whatsapp-fewer-failures.md).
   There is no allowed way to ask WhatsApp before sending (number-checker services are against WhatsApp's rules), so the queue
   only knew "it is a UK mobile". Two facts we already store separate the failures sharply. Measured on 2,421 first queue
   sends to UK mobiles, 25 Sep to 22 Nov 2026 (last 7 days in brackets):
     077 / 078 / 079 with a website ............ 6.9% failed (7.0%)
     075 with a website ......................... 7.6% (10.3%)
     077–079 or 075, no website ................. 14.6% / 20.0%
     073 / 074 / 076 with a website ............. 15.0% (22.2%)
     073 / 074 / 076, no website ................ 33.8% (44.2%)
   Newer ranges are where virtual and app-based "mobile" numbers live, and a business with no website is less likely to run a
   WhatsApp business number. Both are properties of the number and the lead, NOT a lookup: nothing is sent anywhere.
   ⛔ USE: the queue sends LOW before MEDIUM, and HOLDS HIGH (nothing written, it stays queued) unless the number is rated GREEN.
      A held lead can be texted or called instead. It is never marked No WhatsApp by this: only a failed send does that.
   ⛔ PURE, relative imports only (the queue imports it by path).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type WhatsAppLikelihood = 'low_risk' | 'medium_risk' | 'high_risk';

/** 073–074 and 076 (except 07624, the Isle of Man's mobiles): the newer, mostly virtual ranges. */
export function isNewerUkMobileRange(digits: string | null | undefined): boolean {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (!/^447\d{9}$/.test(d)) return false;
  if (d.startsWith('447624')) return false;
  return /^447[346]/.test(d);
}

export function whatsAppLikelihood(digits: string | null | undefined, website: string | null | undefined): WhatsAppLikelihood {
  const newer = isNewerUkMobileRange(digits);
  const site = String(website ?? '').trim().length > 0;
  if (newer && !site) return 'high_risk';
  if (newer || !site) return 'medium_risk';
  return 'low_risk';
}

const RANK: Record<WhatsAppLikelihood, number> = { low_risk: 0, medium_risk: 1, high_risk: 2 };
export const likelihoodRank = (l: WhatsAppLikelihood): number => RANK[l];

/** May the queue send a lead of this band now? HIGH waits for a GREEN number. */
export function likelihoodSendable(l: WhatsAppLikelihood, numberGreen: boolean): boolean {
  return l !== 'high_risk' || numberGreen;
}

export const HIGH_RISK_HELD_WORDS = 'held: newer mobile range and no website, which often has no WhatsApp. They send when the number is rated GREEN, or text or call them.';
