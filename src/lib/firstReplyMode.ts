/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT HAPPENS WHEN A BUSINESS REPLIES TO THE OPENER — three modes, one definition.

   ⛔ WHY THIS IS A MODE ON THE EXISTING RULE AND NOT A SECOND MECHANISM (Paul, 2026-09-08). The
   reply chain in _shared/whatsapp-inbound.ts already carries SEVEN guards that took incidents to
   learn: the opener gate (only a reply to initial_contact counts), the once-per-lead slot, decline
   detection, auto-responder detection, cross-channel suppression, never-pitch-a-paying-customer,
   and archived-means-stop. A parallel "audit only" path would need every one of them again, and
   CLAUDE.md records four separate incidents caused by exactly that kind of second copy drifting.
   So the guards are untouched and only the OUTCOME branches.

   THE THREE MODES:
     · off        — nothing automatic happens on a reply. The lead still flips to 'replied'.
     · audit_only — run the audit if they have none; SEND NOOTHING. The operator sends the warm
                    template by hand once it is ready. This is the default.
     · send       — run the audit if needed, then auto-send the reply template on completion.

   🔴 THE SAFETY PROPERTY, AND IT IS STRUCTURAL RATHER THAN A FLAG THE SENDER CHECKS. In audit_only
   mode the lead's once-ever slot is claimed with status 'audit_only', which is TERMINAL: the
   completion hook in process-ai-audit-queue only ever upgrades 'awaiting_audit' to 'pending'
   (`.eq("status", "awaiting_audit")`), so there is no state from which a send can occur. A mode
   the send path merely consults could be got past by a stale row or a later mode flip; a status it
   cannot see cannot be sent. The drain refuses first_reply rows in audit_only mode as well —
   belt and braces, the way the paying-customer guard is done at both arm time and send time.

   ⛔ ABSENCE IS NEVER PERMISSION — the fifteenth instance of the rule in CLAUDE.md, and here it
   decides whether a message goes to a stranger. An unreadable column, a NULL, an empty string or
   a value this code does not recognise ALL resolve to 'audit_only', never to 'send'. A new mode
   added later is therefore silent-by-default rather than sending-by-default.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The reply-trigger modes, in UI order. */
export const FIRST_REPLY_MODES = ['off', 'audit_only', 'send'] as const;
export type FirstReplyMode = typeof FIRST_REPLY_MODES[number];

/** Paul's main use, and the safe direction for every absent or unknown value. */
export const DEFAULT_FIRST_REPLY_MODE: FirstReplyMode = 'audit_only';

/** The terminal status an audit_only arm writes. Terminal is the safety property — see the header. */
export const AUDIT_ONLY_STATUS = 'audit_only';

/**
 * The template the reply trigger sends when no explicit one is set.
 *
 * ⚠️ ONE DEFINITION, FOUR CALL SITES. This was the literal `"audit_reply"` written out at four
 * places (the send-time resolve, two arm-time pitchEverSent checks, and the SPA's select). Moving
 * the warm test onto a new template meant changing all four in step or having the arm check one
 * template's history while the sender sent another — a duplicate send by construction.
 */
export const DEFAULT_FIRST_REPLY_TEMPLATE = 'audit_reply_warm';

/**
 * How old a parked reply row may be and still send.
 *
 * 🔴 MEASURED FROM A REAL HAZARD, 2026-09-08: 18 `pending` first_reply rows were sitting past
 * their fire_after — held back only by the toggle being off — four of them for leads already at
 * status `report_sent`. Flipping the toggle on would have sent all eighteen, days late, on the
 * next tick. Clearing them is a one-off; this constant is what stops the shape recurring, because
 * the next long toggle-off period would rebuild the same pile.
 */
export const AUTO_REPLY_STALE_MS = 6 * 60 * 60 * 1000;

/** Read a stored mode. Anything absent, blank or unrecognised is 'audit_only' (see the header). */
export function parseFirstReplyMode(raw: unknown): FirstReplyMode {
  if (typeof raw !== 'string') return DEFAULT_FIRST_REPLY_MODE;
  const t = raw.trim();
  return (FIRST_REPLY_MODES as readonly string[]).includes(t)
    ? (t as FirstReplyMode)
    : DEFAULT_FIRST_REPLY_MODE;
}

/**
 * May this mode ever put a message on the wire?
 *
 * ⛔ ASSERTS ON THE MODE THAT SENDS, never on the ones that don't. `mode !== 'audit_only'` would
 * make every future mode a sending one the day it is added — the absent-value fault pointing the
 * wrong way. Only an explicit 'send' sends.
 */
export function modeSends(mode: FirstReplyMode): boolean {
  return mode === 'send';
}

/** Does an automatic audit run on a reply in this mode? Both working modes measure; 'off' does not. */
export function modeRunsAudit(mode: FirstReplyMode): boolean {
  return mode === 'audit_only' || mode === 'send';
}

/**
 * The status to claim the lead's once-ever slot with, given the mode and whether a completed audit
 * already exists.
 *
 * `null` means "arm nothing at all" — the mode is off, so no row should exist. That matters
 * because `lead_id` is UNIQUE on whatsapp_auto_replies: ANY row permanently spends the lead's
 * once-ever slot, so writing a row to record "we did nothing" would mean the lead could never be
 * pitched after the mode is turned on. The same reasoning the archived branch already uses.
 */
export function armStatusFor(
  mode: FirstReplyMode,
  hasCompletedAudit: boolean,
): 'pending' | 'awaiting_audit' | typeof AUDIT_ONLY_STATUS | null {
  if (!modeRunsAudit(mode)) return null;
  if (!modeSends(mode)) return AUDIT_ONLY_STATUS;
  return hasCompletedAudit ? 'pending' : 'awaiting_audit';
}

/**
 * Is this parked row too old to send?
 *
 * Compares against `fire_after` — when the row BECAME due — not `created_at`, because a row
 * deliberately delayed (the 3-minute cancel window) has not been waiting since it was written.
 * A missing or unparseable stamp reads as stale: a row we cannot date is a row we cannot vouch
 * for, and the failure direction that costs nothing is not sending.
 */
export function isStaleAutoReply(fireAfterIso: string | null | undefined, nowMs: number): boolean {
  if (!fireAfterIso) return true;
  const t = Date.parse(fireAfterIso);
  if (!Number.isFinite(t)) return true;
  return nowMs - t > AUTO_REPLY_STALE_MS;
}

/** Human labels for the control. Kept beside the modes so a new mode cannot render as a raw slug. */
export const FIRST_REPLY_MODE_LABELS: Record<FirstReplyMode, string> = {
  off: 'Off',
  audit_only: 'Run audit only',
  send: 'Audit + auto-send',
};

export const FIRST_REPLY_MODE_HINTS: Record<FirstReplyMode, string> = {
  off: 'A reply does nothing automatic. The lead still shows as replied.',
  audit_only:
    'A reply to your opener auto-runs an audit (3 questions, 1 run) if they have none. Nothing is sent — you send the warm template by hand once it is ready.',
  send:
    'A reply to your opener auto-runs an audit if needed, then automatically sends the reply template when it completes.',
};
