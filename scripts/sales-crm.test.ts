/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES READING OF A LEAD (multi-user, 2026-09-27) — src/lib/salesCrm.ts.
   ⛔ No second lifecycle: every status the app knows maps to a stage explicitly, and the one new
   status ('won_pending_onboarding') never counts as money.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { OUTREACH_STATUS_OPTIONS } from "../src/types/outreach.ts";
import { isPaidLead } from "../src/lib/leadPayment.ts";
import {
  QUEUE_SKIP_LABEL, followUpBucket, initialsOf, londonToday, refusalText, salesStageOf,
} from "../src/lib/salesCrm.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── every status is mapped, none falls through ──");
for (const o of OUTREACH_STATUS_OPTIONS) ok(salesStageOf(o.value) !== "other", `${o.value} → ${salesStageOf(o.value)}`);
ok(salesStageOf("something_new") === "other" && salesStageOf(null) === "other" && salesStageOf("") === "other", "unknown / absent → 'other' (shown raw), never 'new'");
ok(salesStageOf("won_pending_onboarding") === "won", "won_pending_onboarding → won");
ok(salesStageOf("payment_received") === "client" && salesStageOf("refunded") === "client", "money statuses → client");

console.log("\n── won is not money ──");
ok(!isPaidLead({ amount_paid: null, status: "won_pending_onboarding" }), "isPaidLead: a won lead with no payment is NOT paid");

console.log("\n── follow-up buckets (London calendar days) ──");
ok(followUpBucket("2026-09-26", "2026-09-27") === "overdue", "yesterday → overdue");
ok(followUpBucket("2026-09-27", "2026-09-27") === "today", "today → today");
ok(followUpBucket("2026-10-01", "2026-09-27") === "upcoming", "later → upcoming");
ok(followUpBucket(null, "2026-09-27") === "none" && followUpBucket("garbage", "2026-09-27") === "none", "absent / malformed → none");
ok(londonToday(new Date("2026-09-27T23:30:00Z")) === "2026-09-28", "23:30 UTC in BST is already tomorrow in London");
ok(/^\d{4}-\d{2}-\d{2}$/.test(londonToday()), "londonToday is YYYY-MM-DD");

/* needs attention / My Leads filters: removed 2026-09-30 with the helpers (the My Leads page was deleted
   2026-09-27). A booked meeting and a due follow-up are now the sales state and Next best actions:
   scripts/lead-state.test.ts. */

console.log("\n── wording ──");
ok(initialsOf("Paul Smith") === "PS" && initialsOf("Sumi") === "SU" && initialsOf("") === "?" && initialsOf(null) === "?", "initials");
ok(refusalText("already_owned", "Paul") === "Already added · Paul", "owned → 'Already added · Paul'");
ok(refusalText("exists", "Sumi") === "Already added · Sumi", "exists → 'Already added · Sumi'");
ok(refusalText("brand_new_code").includes("brand_new_code"), "an unknown code is shown as itself, not hidden behind a catch-all");
const q = readFileSync(new URL("../supabase/migrations/20260927100400_sales_queue_opener.sql", import.meta.url), "utf8");
const reasons = [...new Set([...q.matchAll(/v_reason := '([a-z_]+)'/g)].map((m) => m[1]))];
ok(reasons.length >= 8, `found the queue's skip reasons (${reasons.length})`);
for (const r of reasons) ok(typeof QUEUE_SKIP_LABEL[r] === "string", `skip reason '${r}' has plain wording`);

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
