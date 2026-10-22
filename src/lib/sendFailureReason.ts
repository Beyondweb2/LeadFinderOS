/* ══ WHY A WHATSAPP SEND FAILED, FROM WHAT IS STORED (2026-10-22, fix/auto-off-counts, docs/country-auto-off.md) ══════
   The queue panel's "Failed sends — last 7 days" list showed "Meta gave no error code" for every failure Meta reported
   AFTER accepting the message. That code is never stored: the live delivery webhook (whatsapp-status, held — not to be
   deployed until the Findable Meta App secret is ready) reads it only to choose the lead's flag. The flag IS stored, so
   it is the reason we can show: No WhatsApp = Meta said the number is not on WhatsApp (131026); otherwise a failure for
   some other reason.
   A send Meta refused outright carries its own code / title / details (shown by SendErrorNote); this adds nothing then.
   Also says whether the failure counts toward a country's automatic switch-off (src/lib/countryAutoPause.ts).
   ⛔ Words only; never a guess at a code. Pure. */

export interface SendFailureFacts {
  code: number | null;
  /** whatsapp_sends.delivery_status of the failed send. */
  deliveryStatus: string | null;
  /** The lead's status / delivery status now (null when the send has no lead). */
  leadStatus: string | null;
  leadDelivery: string | null;
}

export interface SendFailureReason {
  /** Plain words when there is no Meta code to show; null when SendErrorNote shows the code. */
  words: string | null;
  /** Does it count toward the country auto-off? (Numbers not on WhatsApp never do.) */
  countsTowardAutoOff: boolean;
}

const NOT_SAVED = "Meta's exact code was not saved (the live delivery webhook does not store it).";

export function sendFailureReason(f: SendFailureFacts): SendFailureReason {
  if (f.code != null) return { words: null, countsTowardAutoOff: f.code !== 131026 };
  if (f.leadStatus === 'no_whatsapp' || f.leadDelivery === 'no_whatsapp' || f.deliveryStatus === 'no_whatsapp') {
    return { words: `Number not on WhatsApp — Meta reported it after sending, and the lead is marked No WhatsApp. ${NOT_SAVED}`, countsTowardAutoOff: false };
  }
  if (f.leadDelivery === 'failed_temporary') {
    return { words: `Failed after sending, for a reason other than the number not being on WhatsApp — it will be retried. ${NOT_SAVED}`, countsTowardAutoOff: true };
  }
  if (f.leadStatus === 'whatsapp_failed' || f.leadDelivery === 'failed') {
    return { words: `Failed after sending, for a reason other than the number not being on WhatsApp — the lead is marked WhatsApp failed. ${NOT_SAVED}`, countsTowardAutoOff: true };
  }
  return { words: 'Send failed — Meta gave no error code.', countsTowardAutoOff: true };
}
