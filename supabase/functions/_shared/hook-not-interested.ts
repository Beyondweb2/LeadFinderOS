/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ⚠️ 2026-09-25: A NEW HOOK IS SIX RESULTS (3 questions × ChatGPT + Google AI), and the rule for it is
   autoMarkSixOfSixNotInterested at the bottom of this file: named in 6/6 → the lead leaves active
   outreach. Any miss keeps it. The Gemini-3/3 rule below applies to version-1 runs only.

   AUTO "NOT INTERESTED" ON A 3/3 GEMINI HOOK (Paul, 2026-09-21).

   A hook/outreach audit that gets a genuine Gemini answer naming the business on all three
   questions is already too visible in Gemini to be worth outreach spend. This writes the EXACT
   status the manual Inbox "Not interested" button writes (statusUpdatePatch('not_interested') in
   src/lib/statusPatch.ts: { status: 'not_interested', is_potential_work: false }) — never a new
   parallel status — so the lead disappears from the active Inbox exactly as it would after a
   manual click (Inbox.tsx's list filter already hides any not_interested lead).

   ⛔ NOT IMPORTED FROM src/lib/statusPatch.ts. That module imports from the '@/types/outreach'
   alias, which an edge closure may never reach (CLAUDE.md §3 — relative imports with an explicit
   .ts only). The two literal fields are duplicated here instead of the whole module; they are the
   entire patch for this one status value and have nothing left to drift.

   The Gemini-only 3/3 check itself lives in src/lib/hookAudit.ts (geminiNamedAllThree) — pure,
   DB-free, unit-tested. This module is only the IO: resolve the audit's lead, then write the patch
   under a conditional UPDATE that refuses to fire on a lead that is missing, already
   not_interested, or already in a manual/paid/terminal state.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { geminiNamedAllThree } from "../../../src/lib/hookAudit.ts";
import { HOOK_ALL_NAMED_REASON, HOOK_SCORE_RESULTS, isHookStateV2, scoreHookRun } from "../../../src/lib/hookScore.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

/** Statuses this automation must never overwrite — a deliberate manual, paid or terminal call the
 *  operator (or an earlier automation) already made on this lead. Everything else is ordinary
 *  in-progress outreach and is safe to move to not_interested, exactly as the manual button would
 *  from any of those stages. `not_interested` itself is included so a repeat run is a harmless
 *  no-op rather than a second write. */
export const PROTECTED_LEAD_STATUSES = [
  "not_interested", "payment_received", "in_delivery", "completed",
  "refunded", "closed", "opted_out", "price_given", "already_visible",
];

export type HookNotInterestedOutcome =
  | { applied: true; leadId: string }
  | { applied: false; reason: string };

/**
 * Mark the lead behind a hook audit "Not interested" when, and only when, Gemini gave a genuine
 * answer naming the business on all three hook questions. Everything else — a Q1/Q2/Q3 miss, a
 * Gemini error/timeout, a non-hook audit, an unresolvable or already-decided lead — resolves to
 * `{ applied: false, reason }` and touches no row. Never throws.
 */
export async function autoMarkHookLeadNotInterested(
  service: Service,
  auditId: string | null | undefined,
  rows: readonly { status?: string | null; result?: unknown }[],
): Promise<HookNotInterestedOutcome> {
  try {
    if (!geminiNamedAllThree(rows)) return { applied: false, reason: "gemini_not_3_of_3" };
    if (!auditId) return { applied: false, reason: "no_audit_id" };

    const { data: audit, error: auditError } = await service
      .from("ai_audits").select("lead_id").eq("id", auditId).maybeSingle();
    if (auditError) return { applied: false, reason: `audit_lookup_failed:${auditError.message}` };
    const leadId = audit?.lead_id as string | null | undefined;
    if (!leadId) return { applied: false, reason: "audit_has_no_lead" };

    /* Conditional write: only a lead that is NOT already in a protected status and NOT starred
       ("Interested") is moved. `.or(is_potential_work.is.null,...)` — `.neq()` alone drops NULL
       rows (CLAUDE.md §4), which is most of this table. `.select('id')` reports whether the
       predicate actually matched a row, so "already moved on" is distinguishable from "applied". */
    const { data: updated, error: updateError } = await service
      .from("outreach_leads")
      .update({ status: "not_interested", is_potential_work: false })
      .eq("id", leadId)
      .not("status", "in", `(${PROTECTED_LEAD_STATUSES.join(",")})`)
      .or("is_potential_work.is.null,is_potential_work.eq.false")
      .select("id");
    if (updateError) return { applied: false, reason: `lead_update_failed:${updateError.message}` };
    if (!Array.isArray(updated) || updated.length !== 1) {
      return { applied: false, reason: "lead_already_progressed_or_missing" };
    }
    return { applied: true, leadId };
  } catch (e) {
    return { applied: false, reason: `unexpected_error:${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── VERSION 2: NAMED IN 6/6 (Paul, 2026-09-25) ─────────────────────────────────────────────────
   A six-result hook (3 questions × ChatGPT + Google AI, src/lib/hookScore.ts) that is COMPLETE and
   named the business in all six results has no missed search to message about. The lead is moved
   exactly as the manual "Not interested" button moves it, under the same conditional write as the
   v1 rule above. Nothing is deleted and nothing is sent. The audit, its rows and the lead's history
   all stay, and the reason (HOOK_ALL_NAMED_REASON) is recorded on the run's results.hook.

   ⛔ 5/6, 4/6 … 0/6 NEVER MOVE THE LEAD. A real, measured gap exists, so it stays an opportunity.
   ⛔ INCOMPLETE NEVER MOVES THE LEAD. A failed engine result is not a "named". scoreHookRun is
   complete only when all six results are valid answers.
   ⛔ SAME RULER AS THE REPORT AND THE INBOX. Scored with the audit's business name, trade and town,
   and called only after the run is released, so extract-competitors' verdicts are already written. */
export async function autoMarkSixOfSixNotInterested(
  service: Service,
  auditId: string | null | undefined,
  runId: string,
): Promise<HookNotInterestedOutcome> {
  try {
    if (!auditId) return { applied: false, reason: "no_audit_id" };
    const [{ data: audit, error: auditError }, { data: run, error: runError }, { data: rows, error: rowsError }] = await Promise.all([
      service.from("ai_audits").select("lead_id, business_name, business_type, location_text").eq("id", auditId).maybeSingle(),
      service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle(),
      service.from("ai_audit_queue").select("question, status, result, engines").eq("run_id", runId).order("created_at", { ascending: true }),
    ]);
    if (auditError) return { applied: false, reason: `audit_lookup_failed:${auditError.message}` };
    if (runError) return { applied: false, reason: `run_lookup_failed:${runError.message}` };
    if (rowsError) return { applied: false, reason: `rows_lookup_failed:${rowsError.message}` };
    const results = run?.results && typeof run.results === "object" ? run.results as Record<string, unknown> : {};
    const state = results.hook;
    if (!isHookStateV2(state)) return { applied: false, reason: "not_a_six_result_hook" };

    const score = scoreHookRun(state, Array.isArray(rows) ? rows : [], {
      named: { businessName: audit?.business_name ?? "", trade: audit?.business_type || null, town: audit?.location_text || null },
      town: audit?.location_text ?? null,
      trade: audit?.business_type ?? null,
    });
    if (!(score.complete && score.allNamed && score.expected === HOOK_SCORE_RESULTS)) {
      return { applied: false, reason: "not_six_of_six" };
    }

    const leadId = audit?.lead_id as string | null | undefined;
    if (!leadId) return { applied: false, reason: "audit_has_no_lead" };
    const { data: updated, error: updateError } = await service
      .from("outreach_leads")
      .update({ status: "not_interested", is_potential_work: false })
      .eq("id", leadId)
      .not("status", "in", `(${PROTECTED_LEAD_STATUSES.join(",")})`)
      .or("is_potential_work.is.null,is_potential_work.eq.false")
      .select("id");
    if (updateError) return { applied: false, reason: `lead_update_failed:${updateError.message}` };
    if (!Array.isArray(updated) || updated.length !== 1) {
      return { applied: false, reason: "lead_already_progressed_or_missing" };
    }

    /* The internal reason, kept with the audit that decided it. A fresh read-modify-write of
       results, the same shape every other writer of this column uses. A failure here is logged by
       the caller's reason and never undoes the move. */
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const freshResults = fresh?.results && typeof fresh.results === "object" ? fresh.results as Record<string, unknown> : results;
    const freshHook = isHookStateV2(freshResults.hook) ? freshResults.hook : state;
    const { error: stampError } = await service.from("ai_audit_runs").update({
      results: { ...freshResults, hook: { ...freshHook, auto_not_interested: { reason: HOOK_ALL_NAMED_REASON, lead_id: leadId, at: new Date().toISOString() } } },
    }).eq("id", runId);
    if (stampError) console.error(`[hook-not-interested] lead ${leadId} moved, but the reason could not be recorded on run ${runId}: ${stampError.message}`);
    return { applied: true, leadId };
  } catch (e) {
    return { applied: false, reason: `unexpected_error:${e instanceof Error ? e.message : String(e)}` };
  }
}
