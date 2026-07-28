/**
 * Inbound-message classification: is this text an auto-responder, and is it a decline?
 *
 * These two lists used to live inside supabase/functions/_shared/auto-reply-rules.ts, which the SPA
 * cannot import — that module calls Deno.env.get(). So the dashboard had no way to tell a booking
 * bot from a human, and campaign "Replied" counted "Thanks for contacting us, we're a little busy"
 * as a reply. Moving the patterns here and re-exporting them from the edge module keeps ONE
 * definition: the auto-pitch rule and the dashboard now agree on what a human reply is, by
 * construction rather than by two lists drifting apart.
 *
 * Imported by the edge side as "../../../src/lib/inboundClassify.ts" — the same convention
 * auditQuestionCounts.ts and auditReport.ts already use.
 *
 * KNOWN LIMIT, measured 2026-07-28 against all 111 real inbound messages: these patterns are
 * English-only and catch 15 of them. They do NOT catch non-English promotional spam — e.g. a lead
 * whose only "reply" was an Arabic money-transfer broadcast arriving 4 seconds after our opener is
 * still classified as human. Treat this as a filter that removes obvious bots, not as proof a
 * message came from a person.
 */

/** Obvious declines — a match means: flag for a human, never auto-send anything. */
const DECLINE_PATTERNS: RegExp[] = [
  /\bno,?\s*thanks?\b/i,
  /\bno\s+thank\s+you\b/i,
  /\bnot\s+interested\b/i,
  /\bstop\b/i,
  /\bremove\s*(me|us)?\b/i,
  /\bunsubscribe\b/i,
  /\bwrong\s+number\b/i,
];

/** Obvious automated responses (booking bots / out-of-office / auto-acks) — not a human
 *  "yes", so they must not arm or fire a pitch, and must not count as a reply. */
const BOT_PATTERNS: RegExp[] = [
  /auto[-\s]?repl(y|ied)/i,
  /out\s+of\s+(the\s+)?office/i,
  /thank(s| you) for (reaching out|messaging|contacting|getting in touch)/i,
  /would you like to (make|book) an appointment/i,
  /we are (a little )?busy/i,
  /will get back to you/i,
  /leave your (details|job details|postcode)/i,
  /away from/i,
  /unavailable right now/i,
];

export function isDecline(text: string): boolean {
  const t = (text || '').trim();
  return !!t && DECLINE_PATTERNS.some((re) => re.test(t));
}

export function looksAutomated(text: string): boolean {
  const t = (text || '').trim();
  return !!t && BOT_PATTERNS.some((re) => re.test(t));
}
