/* ══ WHAT EACH WAY OF CONTACTING SOMEONE COSTS — A CONFIGURABLE ESTIMATE, NOT A PRICE LIST (2026-10-09) ═══
   ⛔ EVERY NUMBER HERE IS AN ESTIMATE TO BE CHECKED AGAINST A BILLED ROW (CLAUDE.md §4 "a rate copied from a price
   list is a guess until a billed row agrees"). Official pages were read on 2026-10-09 but Twilio's and Meta's rate
   cards publish in USD / vary by account and move without notice, so the figures below are deliberately rounded UP
   and live in ONE editable table. They only ORDER the choices and show the rep a rough cost; nothing is billed from
   them. Change a number here and every screen follows.

   Sources read 2026-10-09:
     Twilio UK SMS      ~USD 0.046-0.056 per outbound segment, ~USD 0.0075 inbound, plus carrier fees that vary.
     Twilio UK voice    ~USD 0.03 per minute to a UK mobile, less to a landline; browser (Voice SDK) client leg
                        ~USD 0.004 per minute extra; UK mobile number ~USD 2.50 a month.
     WhatsApp (Meta)    UK utility ~GBP 0.016, marketing ~GBP 0.04-0.06 per delivered template message. Billed by Meta
                        direct, not Twilio.
                        FROM 1 OCT 2026 (Paul, 2026-10-31): a free-text (service) reply inside the customer's 24-hour
                        window is free for the first 1,000 a month PER NUMBER, then charged at the market's service rate
                        (the same as utility); a UTILITY TEMPLATE sent inside the window is now charged too (it used to
                        be free there). That is why the Inbox sends a saved template as free text while the window is
                        open (src/lib/inWindowFreeText.ts). The UK figure itself is still UNCONFIRMED until a billed
                        row agrees. whatsapp_service stays 0 below: inside the free 1,000 it is free, and nothing here
                        counts usage (no usage counter, by decision).
     Email              Resend: effectively free at our volume.
   ⛔ THE CHEAPEST NOMINAL PRICE IS NOT THE ANSWER (contactRouting.ts): a delivered message beats a cheap one that
   never arrives, so cost only breaks ties between channels that are both likely to land.
   Pure, no imports. */

export type CostChannel = 'whatsapp_service' | 'whatsapp_utility' | 'whatsapp_marketing' | 'sms' | 'call_mobile' | 'call_landline' | 'email';

/** GBP. SMS is per SEGMENT; calls are per MINUTE (client leg included); WhatsApp per delivered template message. */
export const CHANNEL_COST_GBP: Readonly<Record<CostChannel, number>> = {
  whatsapp_service: 0,        // a free-text reply inside the 24-hour window: free for the first 1,000 a month per number (from 1 Oct 2026), then the service rate (= utility) — not counted here
  whatsapp_utility: 0.02,
  whatsapp_marketing: 0.06,
  sms: 0.05,                  // per outbound segment, rounded up for carrier fees
  call_mobile: 0.035,         // per minute, PSTN + browser client
  call_landline: 0.02,
  email: 0,
};

/** What a reply costs us to RECEIVE, per inbound SMS. */
export const SMS_INBOUND_COST_GBP = 0.01;

/* ── SMS segments ─────────────────────────────────────────────────────────────────────────────────────
   GSM-7 text: 160 characters in one segment, 153 per segment once it is split. Anything outside the GSM-7
   alphabet (an emoji, a curly quote, most non-Latin letters) makes the whole message UCS-2: 70 / 67. The
   extension characters ^ { } \ [ ] ~ | € count as two. A link or a curly apostrophe can silently double the
   bill, so the composer shows the segment count before sending. */
const GSM7_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[]~|€\f';

export interface SmsSize { encoding: 'GSM-7' | 'UCS-2'; characters: number; segments: number }

export function smsSize(body: string): SmsSize {
  const chars = Array.from(String(body ?? ''));
  let units = 0;
  let gsm = true;
  for (const c of chars) {
    if (GSM7_BASIC.includes(c)) units += 1;
    else if (GSM7_EXT.includes(c)) units += 2;
    else { gsm = false; break; }
  }
  if (gsm) {
    const segments = units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153);
    return { encoding: 'GSM-7', characters: units, segments };
  }
  // UCS-2 counts UTF-16 code units (an emoji is two).
  const u = String(body).length;
  return { encoding: 'UCS-2', characters: u, segments: u === 0 ? 0 : u <= 70 ? 1 : Math.ceil(u / 67) };
}

export function smsCostGbp(body: string): number {
  return Math.round(smsSize(body).segments * CHANNEL_COST_GBP.sms * 10000) / 10000;
}

/** "about 5p" / "free" — for the rep. Never claims precision. */
export function costWords(gbp: number): string {
  if (!(gbp > 0)) return 'free';
  if (gbp < 0.01) return 'under 1p';
  return `about ${Math.round(gbp * 100)}p`;
}
