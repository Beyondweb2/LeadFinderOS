/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WELCOME PACK READINESS — is there a pack for this paid client, and if not, exactly what is missing.

   🔴 THE BUG THIS MODULE EXISTS TO CLOSE. The original Welcome Pack button resolved its audit as
   "the newest non-market audit for this lead that has a completed run" (WelcomePackButton.tsx). It
   had no idea what a paid baseline was. MCLocksmiths has FOUR audits — the paid baseline and two
   `discovery` scans — and on 2026-09-22 the baseline was newest only by luck. Run one more Discovery
   and that button would have handed the client a pack reporting Discovery numbers, under a heading
   saying "your baseline", with nothing on screen to say so.

   ⛔ THE PACK RESOLVES FROM `outreach_leads.baseline_audit_id` AND NOTHING ELSE. That column is
   claimed by a DB trigger on `audit_purpose = 'baseline'` alone, so a Discovery audit can never
   arrive here — and this module ALSO asserts the purpose on the row it was handed, because a guard
   that only trusts an upstream trigger is a guard that expires the day the trigger changes
   (CLAUDE.md: test the PROPERTY, never the identifier).

   ⛔ ABSENCE IS NEVER READINESS. Every state is enumerated positively: `ready` requires a baseline
   audit id, a row that IS that audit, a recorded purpose of 'baseline', and a
   `baseline_completed_at`. Anything else is `waiting` or `error` — never a pack built on a hole.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { BASELINE_AUDIT_PURPOSE } from './auditKind.ts';
import { REPORT_SHORT_ORIGIN } from './reportSlug.ts';

/** The three states the operator sees on Stage 2. */
export type WelcomePackState = 'waiting' | 'ready' | 'error';

/** Only the lead columns readiness reasons about. */
export interface WelcomePackLead {
  baseline_audit_id?: string | null;
}

/** Only the audit columns readiness reasons about. */
export interface WelcomePackAudit {
  id?: string | null;
  /** 'baseline' for a paid baseline. NULL on rows written before 2026-09-12 — see LEGACY below. */
  audit_purpose?: string | null;
  baseline_completed_at?: string | null;
  short_code?: string | null;
}

export interface WelcomePackReadiness {
  state: WelcomePackState;
  /** One plain sentence for the operator. Never a raw token. */
  reason: string;
  /** What is genuinely absent, named. Empty on a clean `ready`. */
  missing: string[];
  /** The audit the pack is built from — always `lead.baseline_audit_id`, or null. */
  auditId: string | null;
  /** The short code the public link resolves on, or null when the audit has none. */
  shortCode: string | null;
  /** True only when a public link can actually be built. `ready` with `canShare:false` is a real
   *  state: the PDF works, the link does not, and the missing list says so. */
  canShare: boolean;
}

/** The public Welcome Pack URL for a baseline short code — the /w/ sibling of /r/<code>. */
export function welcomePackUrl(shortCode: string): string {
  return `${REPORT_SHORT_ORIGIN}/w/${shortCode}`;
}

/**
 * Is this paid client's Welcome Pack ready?
 *
 * `audit` is the row `lead.baseline_audit_id` points at, as loaded by paid-client-hub — which reads
 * that id and only that id. Pass null when there is no such row.
 *
 * ⚠️ LEGACY: three clients (RG, Ronnie's, SC) were paid before `audit_purpose` existed and their
 * baseline rows carry NULL. A NULL purpose on the row the lead's own `baseline_audit_id` points at
 * is accepted — the lead pointing at it IS the claim. A purpose that is RECORDED and is something
 * else is refused outright, because that row was written by a writer who said what it was for.
 */
export function welcomePackReadiness(
  lead: WelcomePackLead | null | undefined,
  audit: WelcomePackAudit | null | undefined,
): WelcomePackReadiness {
  const auditId = (lead?.baseline_audit_id ?? '') || null;
  const shortCode = (audit?.short_code ?? '') || null;
  const base = { auditId, shortCode, canShare: false };

  if (!auditId) {
    return { ...base, state: 'waiting', reason: 'Waiting for the paid baseline to be prepared and run.', missing: ['paid baseline'] };
  }
  if (!audit || !audit.id) {
    return { ...base, state: 'error', reason: 'This client points at a baseline audit that could not be loaded.', missing: ['baseline audit record'] };
  }
  if (String(audit.id) !== String(auditId)) {
    /* Defensive: a caller that passed the wrong audit must not silently produce a pack. */
    return { ...base, state: 'error', reason: 'The audit supplied is not this client’s baseline audit.', missing: ['the client’s own baseline audit'] };
  }
  const purpose = (audit.audit_purpose ?? '').trim();
  if (purpose && purpose !== BASELINE_AUDIT_PURPOSE) {
    return {
      ...base,
      state: 'error',
      reason: `The linked audit was recorded as a ${purpose} audit, not the paid baseline. A welcome pack is never built from one.`,
      missing: ['a completed paid baseline'],
    };
  }
  if (!audit.baseline_completed_at) {
    return { ...base, state: 'waiting', reason: 'The paid baseline has not finished yet. The pack becomes ready on its own when it does.', missing: ['completed baseline'] };
  }
  if (!shortCode) {
    /* The document is complete; only the shareable link is missing. Say which. */
    return { ...base, state: 'ready', reason: 'Ready to download. This baseline has no short code, so there is no public link for it.', missing: ['public share link'] };
  }
  return { auditId, shortCode, canShare: true, state: 'ready', reason: 'Ready.', missing: [] };
}
