/* ══ A WHATSAPP TEMPLATE NEVER GOES TO A NUMBER WE KNOW IS NOT A MOBILE (2026-10-19, Paul) ═══════════════════════
   Since 19 Oct every Find Leads business is added — landlines and no-phone leads included (findLeadsBulkAdd.ts). The
   CRM may hold them; WhatsApp must not try them. COLD templates already need a UK / MY / SG mobile
   (coldWhatsAppEligibility.ts, sales_queue_opener, the drip, send-whatsapp-message). This leaf is the same promise for
   EVERY OTHER template (follow-ups, the sign-up / onboarding link from Quick Close or the client hub, the
   audit-complete pitch): a number in a market we know — UK, Malaysia, Singapore — that is not a mobile there is
   refused before anything is built; no number at all is refused.
   ⛔ A free-form reply in an open thread is NOT checked here: they messaged us, so WhatsApp reaches them.
   ⛔ A number from another country is left to the existing checks (old threads abroad keep working): only a number
      we can positively read as a landline is refused — absence of a market is not proof of a landline.
   React-free, edge-importable (relative .ts imports). Tested by scripts/whatsapp-non-mobile.test.ts. */
import { mobileMarketOf } from './outreachMarkets.ts';

export const NOT_A_MOBILE = 'not_a_mobile';
export const NOT_A_MOBILE_REASON = 'This number is a landline (not a mobile), so WhatsApp cannot reach it and nothing was sent. Call it instead.';
export const NO_NUMBER_REASON = 'There is no phone number for this lead, so nothing was sent.';

/** Why a TEMPLATE may not go to these WhatsApp digits, or null. */
export function templateDestinationRefusal(digits: string | null | undefined): 'no_number' | typeof NOT_A_MOBILE | null {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (!d) return 'no_number';
  if (mobileMarketOf(d)) return null;
  // A UK, Malaysian or Singapore number that is not a mobile there.
  if (/^44\d{9,10}$/.test(d) || /^60\d{8,10}$/.test(d) || /^65\d{8}$/.test(d)) return NOT_A_MOBILE;
  return null;
}
