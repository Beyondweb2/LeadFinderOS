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
   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — reached from an edge function (findable-onboarding).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { mayGenerateLink, type QuickCloseRecord } from './quickClose.ts';
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
