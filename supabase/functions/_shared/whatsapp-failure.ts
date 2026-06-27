// Shared WhatsApp failure classification + lead routing, used by BOTH the queue
// processor (synchronous send response) and the whatsapp-status webhook (async
// delivery callbacks) so they behave identically.
//
// We can't pre-check if a number is on WhatsApp, so we react to the outcome:
//   PERMANENT  → number isn't a reachable WhatsApp user → 'no_whatsapp', pulled
//                out of the queue (still contactable by SMS/call/email).
//   TEMPORARY  → rate limit / transient / config blip → retried up to
//                MAX_WHATSAPP_ATTEMPTS, then dropped as 'whatsapp_failed'.
//
// 131026 ("Message undeliverable" — recipient not a valid WhatsApp user / hasn't
// accepted terms) is THE not-on-WhatsApp signal. Everything else is temporary so a
// glitch never wrongly brands a real number "no WhatsApp".

export const PERMANENT_NO_WHATSAPP_CODES = new Set<number>([131026]);
export const MAX_WHATSAPP_ATTEMPTS = 3;

export function classifyFailure(code: number | undefined): "permanent" | "temporary" {
  return code !== undefined && PERMANENT_NO_WHATSAPP_CODES.has(code) ? "permanent" : "temporary";
}

/**
 * The outreach_leads patch for a FAILED send/delivery, given the Meta error code
 * and the lead's current attempt count. `nowIso` is used to move a retried lead to
 * the back of the queue (queued_at). Increments whatsapp_attempts.
 */
export function leadFailurePatch(
  code: number | undefined,
  currentAttempts: number,
  nowIso: string,
): Record<string, unknown> {
  const attempts = (currentAttempts ?? 0) + 1;
  if (classifyFailure(code) === "permanent") {
    return { status: "no_whatsapp", whatsapp_delivery_status: "no_whatsapp", whatsapp_attempts: attempts };
  }
  if (attempts >= MAX_WHATSAPP_ATTEMPTS) {
    return { status: "whatsapp_failed", whatsapp_delivery_status: "failed", whatsapp_attempts: attempts };
  }
  return { status: "queued", queued_at: nowIso, whatsapp_delivery_status: "failed_temporary", whatsapp_attempts: attempts };
}
