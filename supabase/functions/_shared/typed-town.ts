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
import { cleanTypedTown, isRealTown } from "../../../src/lib/typedTown.ts";

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

export interface AuditTownLead extends TypedTownLead {
  derived_town?: string | null;
}

/** Why an audit cannot use this lead's town. Stored item statuses read these, so never rename the tokens. */
export type AuditTownProblem = "town_unverified" | "no_usable_town";

/**
 * bulk-jobs' audit town rule, in ONE place (2026-10-15) — bulk-jobs calls it before it spends a call, and
 * src/lib/leadReadiness.ts calls it to say up front what a lead needs. Order and wording are bulk-jobs' own:
 *   1. auditTownGated → town_unverified (Google could not confirm the town, and no real typed one);
 *   2. no real town (derived, else the typed search location / address) and nothing Google can derive it from
 *      (a place id with no derived town yet keeps the old behaviour: create-ai-audit derives it) → no_usable_town.
 * Returns the town the audit will ask about ('' when create-ai-audit will derive it from the place).
 */
export function auditTownCheck(lead: AuditTownLead | null | undefined): { ok: true; town: string } | { ok: false; problem: AuditTownProblem } {
  if (auditTownGated(lead)) return { ok: false, problem: "town_unverified" };
  const derived = String(lead?.derived_town ?? "").trim();
  const town = isRealTown(derived) ? derived : (cleanTypedTown(lead?.search_location) || cleanTypedTown(lead?.address));
  const googleCanDerive = filled(lead?.place_id) && !derived;
  if (!town && !googleCanDerive) return { ok: false, problem: "no_usable_town" };
  return { ok: true, town };
}

/** bulk-jobs' item note for no_usable_town (unchanged wording). */
export const NO_USABLE_TOWN_REASON = "No usable town: this lead's location is blank or not a place (for example \"Online\"). Add the town on the lead, then retry";
