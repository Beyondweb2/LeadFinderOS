/* ══ THE WORDS FOR THE TWO STORED WHATSAPP SKIP TOKENS, WHEN MANY LEADS ARE COUNTED TOGETHER (2026-10-22, fix/country-refusals) ══
   A bulk queue or a campaign launch counts leads by sales_queue_opener's tokens: not_a_uk_mobile (a stored token — the
   name is historical, only the words change) and country_off. One place, so the three lists (campaignRules, salesCrm,
   coldWhatsAppEligibility) cannot drift. The single lead's own reason is src/lib/phoneCountry.ts phoneProblemWords.
   ⛔ PURE, NO IMPORTS: salesCrm is read by the Dashboard's column walk; keep this a leaf. */

/** Who we message, in words. */
export const WE_MESSAGE = 'UK, Malaysian, Singapore and Australian mobiles';

export const NOT_A_MOBILE_WE_MESSAGE_WORDS = `not a mobile we message — a landline, a number we can't read, or another country (we message ${WE_MESSAGE}; open the lead to see exactly why)`;
export const COUNTRY_OFF_WORDS = 'a mobile in a country whose WhatsApp is switched off right now (Malaysia, Singapore or Australia) — not queued and not flagged; queue it again once that country is switched on';
