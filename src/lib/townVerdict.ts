/* RELATIVE imports with explicit .ts extensions, NOT the "@/" alias — this file is imported by
   edge functions (process-whatsapp-queue, instantly-push, bulk-jobs, create-ai-audit)
   and Deno cannot resolve the Vite alias. Same convention as marketView.ts and auditReport.ts. */
import { SETTLED_TOWN_NOTES } from "../../supabase/functions/_shared/place-details.ts";

/* ============================================================
   THE TOWN VERDICT — is this lead's town VERIFIED, UNVERIFIABLE, or simply UNCHECKED?

   Paul's rule (2026-08-14, the Wilson's Valeting rule): money and messages never move on an
   unverified town. This is the ONE predicate every gate reads — outreach, email push, bulk audits,
   per-lead audits, derived reports — so the gates cannot drift from each other.

   ⛔ DERIVED, NEVER STORED. There is no town_status column and there must not be one: a stored
   verdict freezes old rows at a stale rule and lets the callers drift — the exact reason
   serveDecision is derived in serveGate.ts (CLAUDE.md §1). Everything needed already lives on the
   lead, written by resolveDerivedTown (place-town.ts), the single town implementation:
     derived_town      — the verified town, from Google's structured address components
     town_fetched_at   — a verification attempt ran (separates "never asked" from "asked")
     town_fetch_note   — WHY there is no town, when there isn't. SETTLED_TOWN_NOTES holds the two
                         permanent answers; every other note is transient and retried.

   ⛔ GATES FIRE ONLY ON `unverifiable` — POSITIVE EVIDENCE that Google was asked and cannot help.
   `unchecked` always passes: absence is never an answer (CLAUDE.md §6, ten instances now), and a
   transient failure (rate limit, outage, cost cap, missing key) must never permanently gate a good
   lead. The settled set is imported from place-details.ts, the file that writes the notes, so a
   note added there is automatically judged here by the same list.
   ============================================================ */

export type TownVerdict = "verified" | "unverifiable" | "unchecked";

/** The three columns the verdict reads. Optional so any partial lead row can be graded — a row
 *  missing the columns entirely grades `unchecked`, which gates nothing. */
export interface TownVerdictRow {
  derived_town?: string | null;
  town_fetch_note?: string | null;
}

export function townVerdict(row: TownVerdictRow | null | undefined): TownVerdict {
  /* A present town is a verified town, whatever the note says — the note describes the LAST
     attempt, and derived_town is only ever written from Google's own address components. */
  if (String(row?.derived_town ?? "").trim()) return "verified";
  const note = String(row?.town_fetch_note ?? "").trim();
  if (note && SETTLED_TOWN_NOTES.has(note)) return "unverifiable";
  return "unchecked";
}

/** The gate itself, named so call sites read as policy: `if (townGated(lead)) skip`. */
export function townGated(row: TownVerdictRow | null | undefined): boolean {
  return townVerdict(row) === "unverifiable";
}

/** One reason string for every gate, so the operator reads the same sentence everywhere a lead is
 *  held back. Raw and specific — never a wrapper (the catch-all-error lesson, CLAUDE.md §4). */
export const TOWN_GATE_REASON =
  "town unverified — Google was asked and cannot confirm where this business is; fix the town on the lead, then retry";
