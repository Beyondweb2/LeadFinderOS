/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE STRIKE: A NUMBER WHATSAPP COULD NOT DELIVER TO IS NEVER COLD-WHATSAPPED AGAIN (2026-11-23, Paul;
   docs/whatsapp-fewer-failures.md).
   Before this, a delivery failure with no error code was "temporary": the lead went back in the queue and was tried up to 3 times
   (17 repeat failures to the same lead in the 60 days to 23 Nov), and 28 leads sat on "WhatsApp failed", which also kept them out
   of the text queue.
   ⛔ WHAT COUNTS AS A STRIKE: a real (not test) send whose delivery_status is failed / no_whatsapp AND whose Meta code is either
      absent or 131026 ("Message undeliverable": not on WhatsApp, or has not accepted the terms). The live whatsapp-status webhook
      (v129, held) stores no code for a delivery failure, so today an absent code is the normal case. A send refused with some
      OTHER code (our template, our account, 131049 per-user marketing limit, a rate limit) is about us, not the number: no strike.
   ⛔ A NUMBER THAT HAS EVER HAD A MESSAGE DELIVERED, OR HAS WRITTEN TO US, IS ON WHATSAPP: never struck out.
   ⛔ WHAT A STRIKE DOES: the lead is "No WhatsApp" (status no_whatsapp, the one status the text queue accepts after a WhatsApp try),
      leaves every WhatsApp queue lane, and every COLD door refuses it from then on. A reply to a message they send us is not cold
      and is never refused by this.
   The SQL twin is public.apply_whatsapp_one_strike (migration 20261228090000); scripts/whatsapp-fewer-failures.test.ts keeps them equal.
   ⛔ PURE, relative imports only (edge-reachable).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The one Meta code that names the number itself as unreachable. */
export const NOT_ON_WHATSAPP_CODE = 131026;
/** The send states that mean "it did not arrive". failed_temporary is a refusal at send time with a code: retried, not a strike. */
export const STRIKE_DELIVERY_STATES: readonly string[] = ['failed', 'no_whatsapp'];
/** The send states that prove the number is on WhatsApp. */
export const PROOF_DELIVERY_STATES: readonly string[] = ['delivered', 'read', 'played'];
/** Lead statuses a strike moves to No WhatsApp. Anything further along (replied, interested, client, not_interested, email_sent…)
 *  keeps its status: it still leaves the WhatsApp lanes and the cold doors still refuse it. */
export const STRIKE_MOVES_STATUSES: readonly string[] = ['', 'not_contacted', 'queued', 'initial_contact', 'whatsapp_failed', 'no_whatsapp'];
export const STRUCK_OUT_STATUS = 'no_whatsapp';

export interface StrikeSendRow { delivery_status: string | null; error_code?: number | null; test_mode?: boolean | null }

/** Is this one send a strike against the number? */
export function isStrike(r: StrikeSendRow): boolean {
  if (r.test_mode === true) return false;
  if (!STRIKE_DELIVERY_STATES.includes(String(r.delivery_status ?? ''))) return false;
  return r.error_code == null || r.error_code === NOT_ON_WHATSAPP_CODE;
}

/** Struck out: at least one strike, no delivery ever, and they never wrote to us. */
export function struckOut(sends: readonly StrikeSendRow[], hasInbound = false): boolean {
  if (hasInbound) return false;
  const real = sends.filter((r) => r.test_mode !== true);
  if (real.some((r) => PROOF_DELIVERY_STATES.includes(String(r.delivery_status ?? '')))) return false;
  return real.some(isStrike);
}

/** The status a struck-out lead takes. */
export function statusAfterStrike(current: string | null | undefined): string {
  const s = String(current ?? '').trim();
  return STRIKE_MOVES_STATUSES.includes(s) ? STRUCK_OUT_STATUS : s;
}

export const STRUCK_OUT_WORDS = 'No WhatsApp: an earlier WhatsApp message to this number could not be delivered, so it is not sent cold WhatsApp again. Text or call instead.';
