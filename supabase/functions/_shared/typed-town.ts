/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AUDIT TOWN GATE FOR A LEAD WHOSE TOWN WAS TYPED (2026-10-15) — the lead-field half.

   The text rule (what a typed location must be to count as a town) is pure and lives in
   src/lib/typedTown.ts. This file reads the LEAD'S columns, so it sits here, on the edge side, where the
   outreach list-columns guard (scripts/outreach-list-columns.test.ts) does not treat it as browser list code.

   ⛔ One predicate for both callers — bulk-jobs (before it spends a call) and create-ai-audit (the authority) —
   so they cannot disagree. A messaging gate never uses it: a typed town is evidence for an audit question,
   not a reason to message. A Google-resolved lead is never exempt.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { townGated, type TownVerdictRow } from "../../../src/lib/townVerdict.ts";
import { cleanTypedTown } from "../../../src/lib/typedTown.ts";

export interface TypedTownLead extends TownVerdictRow {
  place_id?: string | null;
  lead_source?: string | null;
  import_batch?: string | null;
  search_location?: string | null;
  address?: string | null;
}

const filled = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/** No Google place, and a person typed this lead's town: a hand-add (lead_source — only sales_add_lead writes
 *  one) or a CSV import (import_batch). Positive match on both; says nothing about the town text itself. */
export function townWasTyped(lead: TypedTownLead | null | undefined): boolean {
  if (!lead) return false;
  if (filled(lead.place_id)) return false;
  return filled(lead.lead_source) || filled(lead.import_batch);
}

/** `townGated`, EXCEPT a typed-town lead (townWasTyped) whose typed town is a real one. */
export function auditTownGated(lead: TypedTownLead | null | undefined): boolean {
  if (!townGated(lead)) return false;
  if (townWasTyped(lead) && cleanTypedTown(lead?.search_location || lead?.address)) return false;
  return true;
}
