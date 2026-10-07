/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A SALES-HELD SIGN-UP — the self-service page must not override what a salesperson agreed
   (client sign-up redesign, 2026-10-07; docs/pre-sales-certification/client-signup-agreement-flow.md).

   🔴 THE HOLE THIS CLOSES. A salesperson's Quick Close writes the route (Build / Optimise) onto an
   onboarding row and sends the client their agreement link. The same client can also open the
   self-service page (the report's button, ?lead=<id>). Before this, that page asked the website question
   again and its submit created a NEWER unpaid row — and the agreement page signs, and checkout charges,
   the NEWEST unpaid row. So a client sold Optimise could silently become Build (or the reverse), and the
   payment landed on a sign-up the salesperson did not create, which is what decides who sold it
   (sale_creations / sold_by_user_id).
   ⛔ THE RULE: when the lead's newest unpaid onboarding row is a Quick Close row with a decided route, the
   sale is HELD BY SALES. The self-service page shows that route and continues on THAT row; the server
   refuses a new self-service submission for the lead (`signup_in_progress`). Whether the row may go on to
   the agreement right now is Quick Close's own rule (mayGenerateLink) — never a second copy of it.
   🔴 FINAL PASS (2026-10-07): A SALES-HELD SIGN-UP IS RESUMED, NEVER REFUSED. The salesperson's sign-up is THE
   sign-up: opening its page, answering part of it, closing it and coming back (or being sent the same link
   again) all land on the SAME row. The old answer to a second visit was a 409 `signup_in_progress` — "Your
   sign-up is already set up with the plan you agreed with us" — shown to a client who had done nothing wrong
   (a saved draft put the page straight back on the questions, or the page was clicked before it had loaded the
   sales sign-up). resumeDecision() is the one rule: ready → continue on the held row; held but Quick Close not
   finished → wait (`signup_pending`, a plain sentence, never a dead end); none → the self-service flow runs.
   What the client may still do is CONFIRM or CORRECT four situation facts (planClientConfirmation). They can
   never change the plan, the price or who sold it.
   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — reached from an edge function (findable-onboarding).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  CLIENT_CONFIRMABLE_KEYS, cleanAnswers, effectiveAnswers, mayGenerateLink, onboardingColumnsFor, pickAnswers, quickCloseGate,
  type ClientConfirmKey, type QcKey, type QuickCloseAnswers, type QuickCloseRecord,
} from './quickClose.ts';
import { serviceRouteFromRow, type ServiceRoute } from './findableOffer.ts';

/** The onboarding columns the rule reads. */
export interface SignupRow {
  id: string;
  status: string | null;
  created_at: string;
  plan_tier?: unknown;
  website_addon?: unknown;
  quick_close?: unknown;
}

export type SalesSignup =
  /** Sales holds the sign-up and it may continue to the agreement now. */
  | { held: true; ready: true; onboardingId: string; route: ServiceRoute }
  /** Sales holds it, but Quick Close is not finished (answers missing, Paul's review, consents). */
  | { held: true; ready: false; onboardingId: string; route: ServiceRoute | null };

const isQuickCloseRow = (qc: unknown): qc is QuickCloseRecord =>
  !!qc && typeof qc === 'object' && !!(qc as { answers?: unknown }).answers && Object.keys((qc as { answers: object }).answers).length > 0;

/**
 * The sales-held sign-up for one lead, or null when the self-service flow is free to run.
 * `rows` = that lead's onboarding rows in ANY order; only the newest UNPAID row decides (the same row the
 * agreement page signs and checkout charges). A paid row never counts — the lead is a client by then.
 */
export function salesSignupFor(rows: readonly SignupRow[] | null | undefined, nowMs: number = Date.now()): SalesSignup | null {
  const open = (rows ?? []).filter((r) => r && r.status !== 'paid')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const newest = open[0];
  if (!newest || !isQuickCloseRow(newest.quick_close)) return null;
  const route = serviceRouteFromRow(newest);
  /* ⛔ Absent is never "ready": no route, or Quick Close not releasable, is a HELD sign-up that waits. */
  if (route && mayGenerateLink(newest.status, newest.quick_close, nowMs)) {
    return { held: true, ready: true, onboardingId: newest.id, route };
  }
  return { held: true, ready: false, onboardingId: newest.id, route };
}

/** What a submit / page load on a lead with a sales-held sign-up must do. ⛔ Never "create another sign-up". */
export type ResumeDecision =
  | { kind: 'resume'; onboardingId: string; route: ServiceRoute }
  | { kind: 'pending'; onboardingId: string; route: ServiceRoute | null }
  | { kind: 'self_service' };
export function resumeDecision(rows: readonly SignupRow[] | null | undefined, nowMs: number = Date.now()): ResumeDecision {
  const held = salesSignupFor(rows, nowMs);
  if (!held) return { kind: 'self_service' };
  if (held.ready) return { kind: 'resume', onboardingId: held.onboardingId, route: held.route };
  return { kind: 'pending', onboardingId: held.onboardingId, route: held.route };
}

/** The onboarding columns a client's confirmation may touch: the situation facts and nothing else.
 *  ⛔ plan_tier / website_addon (the plan), the consents and the authority answer are never written from here. */
const CONFIRM_COLUMNS: readonly string[] = ['website_manager', 'website_platform', 'domain_status', 'domain_owned', 'domain_third_party', 'site_rights'];

export type ClientConfirmPlan =
  | { ok: false; error: 'nothing_to_confirm' }
  | { ok: true; next: QuickCloseRecord & Record<string, unknown>; changed: QcKey[]; columns: Record<string, unknown>; holds: boolean };

/** 🔴 THE CLIENT'S CONFIRMATION, DECIDED. From the stored Quick Close record and what the page sent:
 *  · only the four situation facts are read; anything else the request carries is ignored;
 *  · each value is validated like a salesperson's answer (an unknown value is "not answered", never kept);
 *  · it is recorded BESIDE the salesperson's answers (client_confirmed) — the rep's record is never rewritten;
 *  · `changed` = the facts that differ from what the salesperson recorded; a change withdraws any review release,
 *    so Paul sees the new situation (the gate judges effectiveAnswers);
 *  · `holds` = the corrected answers now stop the sign-up (a contract blocker on Build, an unanswered question).
 *  The caller writes `next` conditionally on the rev it read. */
export function planClientConfirmation(cur: (QuickCloseRecord & Record<string, unknown>) | null | undefined, rawIncoming: unknown, nowIso: string): ClientConfirmPlan {
  const rep = cleanAnswers(cur?.answers);
  const inc = pickAnswers(rawIncoming) as Record<string, string | undefined>;
  const answers: Record<string, string> = {};
  for (const k of CLIENT_CONFIRMABLE_KEYS) if (inc[k] !== undefined) answers[k] = inc[k] as string;
  if (!Object.keys(answers).length) return { ok: false, error: 'nothing_to_confirm' };
  const changed = (CLIENT_CONFIRMABLE_KEYS as readonly ClientConfirmKey[]).filter((k) => answers[k] !== undefined && answers[k] !== (rep[k] ?? undefined));
  const next: QuickCloseRecord & Record<string, unknown> = { ...(cur ?? {}), client_confirmed: { at: nowIso, answers: answers as QuickCloseAnswers, changed } };
  if (changed.length && next.review_approved_at) { next.review_approved_at = null; (next as Record<string, unknown>).review_approved_by = null; }
  const eff = effectiveAnswers(next);
  const gate = quickCloseGate(eff);
  const columns: Record<string, unknown> = {};
  if (changed.length) {
    const cols = onboardingColumnsFor(eff);
    for (const c of CONFIRM_COLUMNS) if (c in cols) columns[c] = cols[c];
  }
  return { ok: true, next, changed, columns, holds: !gate.complete || gate.blocked || (gate.review.length > 0 && !next.review_approved_at) };
}
