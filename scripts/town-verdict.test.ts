/* ============================================================
   THE TOWN GATE'S REGRESSION SUITE — Paul's verify-and-gate build, 2026-08-14.

   The one predicate every gate reads (process-whatsapp-queue, instantly-push, bulk-jobs,
   create-ai-audit, the Outreach badge). Two properties are load-bearing and history
   says both will be broken by a well-meaning "fix" if they are not pinned:

   ⛔ 1. ABSENCE IS NEVER AN ANSWER (CLAUDE.md §6, ten instances). An all-null row — never checked —
        must grade `unchecked` and gate NOTHING. Gating on absence would hold every legacy lead and
        every lead whose enrichment simply has not run yet.
   ⛔ 2. TRANSIENT FAILURES NEVER GATE. A rate limit, an outage, our own cost cap, a missing API
        key — none of these may permanently hold a good lead. Only the two SETTLED notes (Google
        answered: no town / nothing to ask about) gate, and the settled set is IMPORTED from
        place-details.ts, the file that writes the notes, so the two cannot drift.
   ============================================================ */
import { townVerdict, townGated, TOWN_GATE_REASON } from "../src/lib/townVerdict.ts";
import { SETTLED_TOWN_NOTES } from "../supabase/functions/_shared/place-details.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── ⛔ THE ABSENT CASE: an all-null row is unchecked and never gated ──");
ok(townVerdict({}) === "unchecked", "empty row → unchecked");
ok(townVerdict({ derived_town: null, town_fetch_note: null }) === "unchecked", "all-null row → unchecked");
ok(townVerdict(null) === "unchecked", "null row → unchecked");
ok(townVerdict(undefined) === "unchecked", "undefined row → unchecked");
ok(!townGated({}), "…and unchecked never gates");
ok(!townGated({ derived_town: "", town_fetch_note: "" }), "blank strings are absence, not answers");

console.log("── Settled no-town answers GATE ──");
ok(townVerdict({ derived_town: null, town_fetch_note: "no_town_in_address" }) === "unverifiable",
  "Google answered, no town → unverifiable");
ok(townVerdict({ derived_town: null, town_fetch_note: "no_place_id" }) === "unverifiable",
  "nothing to ask Google about (match refused / no id) → unverifiable");
ok(townGated({ derived_town: null, town_fetch_note: "no_place_id" }), "…and unverifiable gates");

console.log("── ⛔ TRANSIENT notes never gate ──");
for (const note of ["no_api_key", "cost_cap_reached", "place_details_unavailable"]) {
  ok(townVerdict({ derived_town: null, town_fetch_note: note }) === "unchecked",
    `${note} → unchecked (retryable), never gated`);
}
ok(townVerdict({ derived_town: null, town_fetch_note: "some_future_note" }) === "unchecked",
  "an unknown future note → unchecked — a new note joins the SAFE side until place-details settles it");

console.log("── A verified town always wins ──");
ok(townVerdict({ derived_town: "Huntingdon", town_fetch_note: null }) === "verified", "town + no note → verified");
ok(townVerdict({ derived_town: "Huntingdon", town_fetch_note: "no_town_in_address" }) === "verified",
  "town present beats a stale settled note — derived_town is only ever written from Google's components");
ok(!townGated({ derived_town: "Huntingdon" }), "verified never gates");

console.log("── The settled set is the writer's, not a copy ──");
ok(SETTLED_TOWN_NOTES.has("no_town_in_address") && SETTLED_TOWN_NOTES.has("no_place_id") && SETTLED_TOWN_NOTES.size === 2,
  "SETTLED_TOWN_NOTES is exactly the two permanent answers (grow it in place-details.ts, never here)");
ok(TOWN_GATE_REASON.includes("town unverified"), "the shared gate reason names itself");

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? "" : "S"}`); process.exit(1); }
console.log("\nALL PASS");
