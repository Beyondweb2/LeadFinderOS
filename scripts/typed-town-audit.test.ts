/* ============================================================
   THE TYPED-TOWN AUDIT GATE (2026-10-15) — imported leads with a real typed town are audited.

   Ethan's CSV import (import_batch, no place id, no lead_source) was refused 409 town_unverified on all but one
   lead. The fix is ONE predicate (auditTownGated) read by bulk-jobs and create-ai-audit, plus a rule for what a
   typed location must be to count as a town. Pinned here:
   ⛔ 1. An imported / hand-added lead with NO place and a REAL typed town passes; with a junk location ("Online;
        team reports…") it is still gated, and a Google-resolved lead is gated exactly as before.
   ⛔ 2. A typed location that is not a place is never a town ("Online", "Remote", prose), and a derived "Online"
        is not a verified town either.
   ⛔ 3. Malaysia / Singapore questions name their country with the comma join; UK wording is byte-identical.
   ⛔ 4. The dialog's limits are the code's constants, never retyped.
   ============================================================ */
import { readFileSync } from "node:fs";
import { townGated, townVerdict } from "../src/lib/townVerdict.ts";
import { cleanTypedTown, isRealTown } from "../src/lib/typedTown.ts";
import { auditTownGated, townWasTyped } from "../supabase/functions/_shared/typed-town.ts";
import { hookPlaceFor, placeSuffixForCountry } from "../src/lib/seedGuard.ts";
import { pickAuditTown } from "../supabase/functions/_shared/place-town.ts";
import { AUDIT_BULK_JOB_MAX_LEADS, AUDIT_RUN_CAP_USD, auditLimitsSentence, prospectingRemainingUsd } from "../src/lib/auditLimits.ts";
import { APIFY_RESERVE_PCT, POOL_DAILY_CAP_USD } from "../src/lib/auditBudget.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── what a typed location must be to count as a town ──");
ok(cleanTypedTown("Kuala Lumpur") === "Kuala Lumpur", "a plain town passes");
ok(cleanTypedTown("Kuala Lumpur (Sunway Velocity 2)") === "Kuala Lumpur", "a bracketed landmark is dropped");
ok(cleanTypedTown("Klang (Pandamaran)") === "Klang", "…Klang");
ok(cleanTypedTown("Sibu") === "Sibu" && cleanTypedTown("Penang") === "Penang" && cleanTypedTown("Singapore") === "Singapore", "single-word towns, incl. Singapore");
ok(cleanTypedTown("Online") === "", "Online is not a town");
ok(cleanTypedTown("Online; team reports tutors in Singapore, Malaysia, Australia and Brunei") === "", "Online; prose is not a town and its prose is never mined");
ok(cleanTypedTown("Remote") === "" && cleanTypedTown("Worldwide") === "" && cleanTypedTown("n/a") === "", "Remote / Worldwide / n/a are not towns");
ok(cleanTypedTown("") === "" && cleanTypedTown(null) === "" && cleanTypedTown("   ") === "", "blank / null → no town");
ok(cleanTypedTown("we cover all of the central region and nearby areas") === "", "a sentence is not a town");
ok(cleanTypedTown("Tangga Batu / Tanjung Kling, Melaka") === "Melaka", "a neighbourhood list ending in the city → the city");
ok(cleanTypedTown("Teluk Kumbar / Balik Pulau, Penang") === "Penang", "…Penang");
ok(cleanTypedTown("team reports tutors in Singapore, Malaysia, Australia and Brunei") === "", "prose with commas is still not a town");
ok(cleanTypedTown("12 Jalan Bukit Bintang Utara, Kuala Lumpur 50200") === "", "a street address is not a town (digits)");
ok(isRealTown("Leeds") && !isRealTown("Online") && !isRealTown("Klang (Pandamaran)"), "isRealTown is 'a town exactly as written'");

console.log("── ⛔ the gate: imported + real town passes; everything else as before ──");
const imported = { place_id: null, lead_source: null, import_batch: "Language - school crm", derived_town: null, town_fetch_note: "no_place_id", search_location: "Kuala Lumpur" };
ok(townGated(imported), "premise: the old gate refuses an imported lead (settled no_place_id)");
ok(!auditTownGated(imported), "an imported lead with a real typed town now passes the audit gate");
ok(!auditTownGated({ ...imported, search_location: "Klang (Pandamaran)" }), "…bracketed landmark too");
ok(auditTownGated({ ...imported, search_location: "Online; team reports tutors in Singapore, Malaysia" }), "an imported lead whose location is not a town is still gated");
ok(auditTownGated({ ...imported, search_location: "" }), "…blank location is still gated");
ok(!auditTownGated({ ...imported, import_batch: null, lead_source: "other" }), "a hand-added lead (lead_source) with a typed town passes — as before");
ok(auditTownGated({ ...imported, import_batch: null, lead_source: null }), "neither imported nor hand-added → gated, exactly as before");
ok(auditTownGated({ ...imported, place_id: "ChIJabc" }), "a Google-resolved lead is NOT exempt (its town must come from Google)");
ok(!auditTownGated({ place_id: null, derived_town: null, town_fetch_note: null, import_batch: "x", search_location: "Penang" }), "an unchecked lead passes (absence never gates)");
ok(townWasTyped({ import_batch: "b" }) && !townWasTyped({ import_batch: "b", place_id: "p" }) && !townWasTyped({}) && !townWasTyped(null), "townWasTyped is a positive match");

console.log("── ⛔ a derived 'Online' is not a verified town ──");
ok(townVerdict({ derived_town: "Online", town_fetch_note: null }) === "unchecked", "derived 'Online' + no note → unchecked, not verified");
ok(townVerdict({ derived_town: "Leeds" }) === "verified", "a real derived town is verified");
ok(pickAuditTown({ derivedTown: "Online", searchLocation: "Online; team reports tutors in Singapore" }).source === "none", "pickAuditTown: neither Online is a town");
ok(pickAuditTown({ derivedTown: "Online", searchLocation: "Singapore" }).town === "Singapore", "…falls back to a real typed town when there is one");
ok(pickAuditTown({ searchLocation: "Kuala Lumpur (Sunway Velocity 2)" }).town === "Kuala Lumpur", "pickAuditTown cleans the typed town");
ok(pickAuditTown({ confirmedLocation: "Leeds", derivedTown: "Online" }).source === "confirmed", "a human-confirmed town still outranks");

console.log("── ⛔ question wording: Malaysia and Singapore name their country ──");
ok(placeSuffixForCountry("Malaysia") === "Malaysia" && placeSuffixForCountry("Singapore") === "Singapore", "suffixes exist for both");
ok(hookPlaceFor("Kuala Lumpur", "Malaysia") === "Kuala Lumpur, Malaysia", "Malaysia: comma join");
ok(hookPlaceFor("Kuala Lumpur, Malaysia", "Malaysia") === "Kuala Lumpur, Malaysia", "…never pinned twice");
ok(hookPlaceFor("Singapore", "Singapore") === "Singapore", "Singapore's town IS the country — not pinned twice");
ok(hookPlaceFor("Leeds", "UK") === "Leeds UK" && hookPlaceFor("Leeds UK", "GB") === "Leeds UK", "UK wording is byte-identical");
ok(hookPlaceFor("Pune", "India") === "Pune India", "India keeps its space");
ok(hookPlaceFor("Leeds", null) === "Leeds", "blank country is left bare, as before");

console.log("── ⛔ the dialog's limits are the code's constants ──");
const s = auditLimitsSentence();
ok(s.includes(`${AUDIT_BULK_JOB_MAX_LEADS} leads`) && s.includes(`${APIFY_RESERVE_PCT.prospecting}%`) && s.includes(`$${POOL_DAILY_CAP_USD.prospecting}`) && s.includes(`$${AUDIT_RUN_CAP_USD}`),
  "the sentence names the run cap, the daily pool, the job size and the reserve from their constants");
const rem = prospectingRemainingUsd({ monthlyUsageUsd: 33.64, maxMonthlyUsageUsd: 40 });
ok(rem !== null && rem >= 0 && rem < 0.4, "prospecting headroom stops at the reserve line, not the whole cap");
ok(prospectingRemainingUsd({ monthlyUsageUsd: 39, maxMonthlyUsageUsd: 40 }) === 0 && prospectingRemainingUsd(null) === null, "never negative; unknown stays unknown");
const dialog = readFileSync("src/components/OutreachTable.tsx", "utf8");
ok(!/\$3\/audit|\$15\/day/.test(dialog), "the stale '$3/audit + $15/day' wording is gone");
ok(/auditLimitsSentence\(\)/.test(dialog) && /POOL_DAILY_CAP_USD\.prospecting/.test(dialog) && /AUDIT_BULK_JOB_MAX_LEADS/.test(dialog), "the dialog reads the constants");
ok(!/const AUDIT_DAILY_CAP_USD = \d/.test(dialog) && !/const AUDIT_JOB_CAP = \d/.test(dialog), "no retyped number in the dialog");
const queue = readFileSync("supabase/functions/process-ai-audit-queue/index.ts", "utf8");
ok(/const CAP_USD = AUDIT_RUN_CAP_USD/.test(queue), "the queue's run cap is the shared constant");
const bulk = readFileSync("supabase/functions/bulk-jobs/index.ts", "utf8");
ok(/audit: AUDIT_BULK_JOB_MAX_LEADS/.test(bulk) && /auditTownGated\(lead\)/.test(bulk), "bulk-jobs uses the shared cap and the shared gate");

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? "" : "S"}`); process.exit(1); }
console.log("\nALL PASS");
