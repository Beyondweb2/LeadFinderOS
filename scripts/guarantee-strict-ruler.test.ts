/* THE GUARANTEE'S NAME RULER, END TO END, NO STRIPE (Paul, 2026-11-15; docs/AUDIT_RULES.md "The guarantee count").
   A baseline created after the v2 cut-off must count "named" with the strict match at day 0 (the frozen snapshot,
   aggregateRuns — the one freeze path every function uses: stripe-webhook, paid-baseline and the queue reach it through
   advanceBaseline) AND at day 28 (compareMeasurements, both sides). An older or paid baseline keeps its ruler.
   Runs the real code against a fake database read; nothing is written, no provider or Stripe call. */
import { readFileSync } from "node:fs";
import { aggregateRuns } from "../supabase/functions/_shared/audit-baseline.ts";
import { compareMeasurements } from "../src/lib/measurementCompare.ts";
import { AUDIT_RULES_V2_FROM, guaranteeIdentityFor } from "../src/lib/auditVerdict.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const NAME = "Moments Wedding Content", SITE = "https://momentsweddingcontent.com", TRADE = "Wedding content creator";
const Q = "wedding content creator in Kildare";
// self_named/named are TRUE on every cell (the loose ruler's signal); only 2 of the 6 day-0 cells name her exactly.
const cell = (t: string) => ({ answer_text: t, self_named: true, named: true, competitors: [] });
const row = (run: string, chat: string, gem: string) => ({ run_id: run, question: Q, engines: ["chatgpt", "gemini"], status: "done", result: { chatgpt: cell(chat), gemini: cell(gem) } });
const day0 = [
  row("r1", "1. Moments Wedding Content - Co. Mayo", "1. MC Moments Wedding Content, Kildare"),
  row("r2", "1. MC Moments Wedding Content, Kildare", "Top pick: momentsweddingcontent.com"),
  row("r3", "1. MC Moments Wedding Content, Kildare", "* **Mc Moments Wedding Content**, Kildare"),
];
const day28 = [
  row("a1", "1. Moments Wedding Content - Co. Mayo", "1. Moments Wedding Content (Co. Mayo)"),
  row("a2", "1. Moments Wedding Content", "1. MC Moments Wedding Content"),
  row("a3", "1. MC Moments Wedding Content", "1. MC Moments Wedding Content"),
];
// The freeze reads ai_audit_queue rows by run id: a fake client that answers that one read.
const fakeService = { from: () => ({ select: () => ({ in: async (_c: string, ids: string[]) => ({ data: day0.filter((r) => ids.includes(r.run_id)), error: null }) }) }) };
const ctx = { businessName: NAME, trade: TRADE, town: null };

const afterCutoff = new Date(Date.parse(AUDIT_RULES_V2_FROM) + 60_000).toISOString();
const beforeCutoff = "2026-11-10T09:00:00Z";

// ── A NEW baseline (created after the cut-off) ──
const idNew = guaranteeIdentityFor(afterCutoff, NAME, SITE);
ok(!!idNew, "a baseline created after the cut-off gets the strict identity");
const snapNew = await aggregateRuns(fakeService, ["r1", "r2", "r3"], ctx, idNew);
ok(snapNew.summary.named_cells === 2 && snapNew.summary.answered_cells === 6, `day 0 (frozen snapshot): strict — 2 of 6 named (exact name + domain), the 4 "MC Moments" cells not counted [got ${snapNew.summary.named_cells}/${snapNew.summary.answered_cells}]`);
const cmpNew = compareMeasurements(day0 as never, day28 as never, { businessName: NAME, ownWebsite: SITE, trade: TRADE, strictIdentity: idNew });
const qn = cmpNew.questions.find((q) => q.question === Q)!;
ok(qn.before?.named === snapNew.summary.named_cells, `day 28 BEFORE side matches the frozen day-0 snapshot exactly (${qn.before?.named} = ${snapNew.summary.named_cells}): one ruler`);
ok(qn.after?.named === 3, `day 28 AFTER side: strict — 3 of 6 [got ${qn.after?.named}]`);

// ── An EXISTING / paid baseline (created before the cut-off) ──
const idOld = guaranteeIdentityFor(beforeCutoff, NAME, SITE);
ok(idOld === undefined, "a baseline created before the cut-off gets no strict identity");
const snapOld = await aggregateRuns(fakeService, ["r1", "r2", "r3"], ctx, idOld);
const cmpOld = compareMeasurements(day0 as never, day28 as never, { businessName: NAME, ownWebsite: SITE, trade: TRADE, strictIdentity: idOld });
const qo = cmpOld.questions.find((q) => q.question === Q)!;
ok(snapOld.summary.named_cells === qo.before?.named && snapOld.summary.named_cells > snapNew.summary.named_cells, `existing baseline: the old ruler on both sides, unchanged and looser than strict (day 0 = ${snapOld.summary.named_cells}, day-28 before = ${qo.before?.named}, strict = ${snapNew.summary.named_cells})`);

// ── Every live path passes the BASELINE's date to the one switch (source checks) ──
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
ok(/aggregateRuns\(service,[\s\S]{0,400}guaranteeIdentityFor\(audit\.created_at \?\? null, audit\.business_name, audit\.website\)\)/.test(src("supabase/functions/_shared/audit-baseline.ts")), "the freeze (advanceBaseline) keys the ruler on the baseline audit's created_at");
ok(src("supabase/functions/_shared/audit-baseline.ts").split("await aggregateRuns(").length - 1 === 1, "there is exactly one freeze call site");
ok(/strictIdentity: guaranteeIdentityFor\(\(bl as[^)]*\)\?\.created_at/.test(src("supabase/functions/_shared/remeasure-results.ts")), "the day-28 results (email + page) key the ruler on the BASELINE's created_at");
ok(/guaranteeIdentityFor\(text\(audit\.created_at\)/.test(src("supabase/functions/paid-client-hub/index.ts")), "the client hub's baseline summary uses the same switch");
ok(/guaranteeIdentityFor\(row\.created_at/.test(src("src/pages/Baseline.tsx")), "the Baseline page uses the same switch");
ok(/strictIdentity: guaranteeIdentityFor\(created/.test(src("src/components/ReportBeforeAfter.tsx")) && /strictIdentity: guaranteeIdentityFor\(beforeCreated/.test(src("src/pages/CompareMeasurements.tsx")), "Compare measurements and the report's before/after use the BEFORE audit's date");
ok(!/aggregateRuns|guaranteeIdentityFor/.test(src("supabase/functions/stripe-webhook/index.ts")), "stripe-webhook has no ruler of its own: it reaches the freeze only through audit-baseline.ts");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
