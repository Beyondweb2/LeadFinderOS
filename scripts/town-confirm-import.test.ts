/* ============================================================
   A PERSON VOUCHES FOR A TOWN (2026-10-16) — import checkbox + Confirm town in the audit popup. FAKE ROWS ONLY.

   Root cause (read from the live row): an import with the Batch name blank left import_batch NULL, and the audit town gate
   recognised a typed-town lead only by lead_source / import_batch. Pinned here:
   ⛔ 1. A person-confirmed lead with a REAL town passes the audit gate; blank, "Online", "Not established" stay blocked.
   ⛔ 2. Unticked (the default) sends no confirmations; ticked sends only the rows whose town is a real one.
   ⛔ 3. The refusal is shown in plain words with the fix; the dialog and the server are wired to it.
   ⛔ 4. The cost caps are unchanged and still read from their one home.
   ============================================================ */
import { readFileSync } from "node:fs";
import { cleanTypedTown, isRealTown } from "../src/lib/typedTown.ts";
import { auditTownGated, auditTownCheck, townConfirmedByPerson } from "../supabase/functions/_shared/typed-town.ts";
import { isTownRefusal, townRefusalWords } from "../src/lib/townRefusal.ts";
import { townRowsToConfirm, runImport, type ImportRow, type ImportRpc } from "../src/lib/csvLeadImport.ts";
import { TOWN_GATE_REASON } from "../src/lib/townVerdict.ts";
import { AUDIT_BULK_JOB_MAX_LEADS, AUDIT_RUN_CAP_USD } from "../src/lib/auditLimits.ts";
import { APIFY_RESERVE_PCT, POOL_DAILY_CAP_USD } from "../src/lib/auditBudget.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

console.log("── the real-town check now also refuses the researcher's 'unknown' words ──");
for (const t of ["Not established", "not found", "No town given", "Unclear", "Unspecified", "Online", "", "   "]) {
  ok(cleanTypedTown(t) === "" && !isRealTown(t), `"${t}" is not a town`);
}
ok(isRealTown("Kuala Lumpur") && isRealTown("Nottingham") && isRealTown("Notting Hill") && isRealTown("Novara"), "real towns that start with 'no'/'not' still pass");

console.log("── ⛔ the gate: a person-confirmed lead ──");
const base = { place_id: null, lead_source: null, import_batch: null, derived_town: null, town_fetch_note: "no_place_id", search_location: "Kuala Lumpur" };
ok(auditTownGated(base), "premise: an unmarked lead (the Majesty Event shape) is gated");
const researcher = { ...base, town_confirmed_by: "researcher" };
ok(townConfirmedByPerson(researcher) && !auditTownGated(researcher), "confirmed by the researcher + real town → passes");
ok(auditTownCheck(researcher).ok === true, "…and the bulk check agrees (one predicate)");
ok(auditTownGated({ ...researcher, search_location: "" }), "confirmed but BLANK town stays blocked");
ok(auditTownGated({ ...researcher, search_location: "Not established" }), "confirmed but 'Not established' stays blocked");
ok(auditTownGated({ ...researcher, search_location: "Online; team reports tutors in Singapore" }), "confirmed but a non-place stays blocked");
ok(auditTownGated({ ...base, town_confirmed_by: "" }) && auditTownGated({ ...base, town_confirmed_by: null }), "an empty marker is not a confirmation");
ok(!auditTownGated({ ...base, import_batch: "wedding and event services" }), "an import with a batch name still passes (unchanged)");
const op = auditTownCheck({ ...researcher, search_location: "Not established" });
ok(op.ok === false, "the bulk check refuses a confirmed lead with no real town");

console.log("── ⛔ the import checkbox: default off, real towns only ──");
const rows: ImportRow[] = [
  { row: 2, business_name: "Fake A", town: "Kuala Lumpur" }, { row: 3, business_name: "Fake B", town: "" },
  { row: 4, business_name: "Fake C", town: "Not established" }, { row: 5, business_name: "Fake D", town: "Online" },
  { row: 6, business_name: "Fake E", town: "Penang" }, { row: 7, business_name: "Fake F" },
];
ok(townRowsToConfirm(rows, undefined).length === 0 && townRowsToConfirm(rows, false).length === 0, "unticked (default) confirms nothing");
ok(JSON.stringify(townRowsToConfirm(rows, true)) === "[2,6]", "ticked confirms only rows 2 and 6 (blank / not established / online / missing stay out)");
const sent: Array<{ rows: number[] | undefined; batch: string | null }> = [];
const rpc: ImportRpc = async (a) => { sent.push({ rows: a._confirmed_rows, batch: a._batch }); return { data: { ok: true, committed: a._commit, counts: {}, rows: [] }, error: null }; };
await runImport(rpc, rows, true, "fake-file.csv", undefined, false, { campaignId: "c1" });
await runImport(rpc, rows, true, "fake-file.csv", undefined, false, { campaignId: "c1", townsChecked: true });
ok(sent[0].rows?.length === 0, "the default call carries no confirmed rows");
ok(JSON.stringify(sent[1].rows) === "[2,6]", "the ticked call carries exactly the real-town rows");

console.log("── ⛔ the popup words ──");
ok(isTownRefusal("town_unverified: We couldn't confirm which town") && isTownRefusal("local_scope_needs_town") && isTownRefusal(TOWN_GATE_REASON), "town refusals are recognised");
ok(!isTownRefusal("usage_paused") && !isTownRefusal("") && !isTownRefusal(null), "other errors are not mistaken for it");
ok(/couldn't confirm which town/i.test(townRefusalWords("").headline) && /Type the town/.test(townRefusalWords("").detail) && /Kuala Lumpur/.test(townRefusalWords("Kuala Lumpur").detail), "plain headline; the detail names the town on the lead");
ok(!/town_unverified|409|Google could not/.test(townRefusalWords("X").headline + townRefusalWords("X").detail), "the popup text carries no code");
const panel = read("src/components/LeadCrmPanel.tsx");
ok(/lead_confirm_town/.test(panel) && /data-testid="hook-confirm-town"/.test(panel) && /isTownRefusal/.test(panel), "the audit popup offers Confirm town through lead_confirm_town");
const dlg = read("src/components/CSVImportDialog.tsx");
ok(/Towns in this file were checked by the researcher/.test(dlg) && /useState\(false\); \/\/ 2026-10-16: default OFF/.test(dlg), "the import dialog has the checkbox, default off");

console.log("── the server side ──");
const mig = read("supabase/migrations/20261101090000_town_confirmed_import.sql");
ok(/add column if not exists town_confirmed_by text/.test(mig) && /import_leads_v4/.test(mig) && /lead_confirm_town/.test(mig), "migration adds the column and both functions");
ok(/_require_work\(_lead_id\)/.test(mig), "lead_confirm_town uses the same ownership rule as lead_set_details");
ok(/revoke all on function public\.import_leads_v4\(jsonb, boolean, text, boolean, uuid, text, uuid, integer\[\]\) from public, anon;/.test(mig), "anon cannot call import_leads_v4");
ok(/outcome' = 'created'/.test(mig) && /= any \(_confirmed_rows\)/.test(mig), "only leads CREATED by the call, in the confirmed list, are stamped");
for (const p of ["supabase/functions/create-ai-audit/index.ts", "supabase/functions/bulk-jobs/index.ts", "supabase/functions/_shared/sales-check.ts"]) {
  ok(/town_confirmed_by/.test(read(p)), `${p} reads town_confirmed_by`);
}

console.log("── ⛔ caps unchanged ──");
ok(AUDIT_RUN_CAP_USD === 1, "per-run cap is still $1");
ok(AUDIT_BULK_JOB_MAX_LEADS === 100, "leads per job is still 100");
ok(POOL_DAILY_CAP_USD.prospecting === 12, "rolling prospecting pool is still $12");
ok(APIFY_RESERVE_PCT.prospecting === 85, "the Apify reserve is still 85%");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
