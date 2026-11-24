/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUDIT TRADE ORDER (2026-11-24; docs/reports/whatsapp-followup-report-2026-11-24.md §5). The search keyword
   (the campaign's trade) wins over the Google Maps category, on every audit path. 30 AUS driving instructors
   tagged "Educational Institution" were audited as "best educational institution in [town]".
   Rule: src/lib/leadTrade.ts auditTradeOf.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { auditTradeOf, customerCorrectedTrade, CUSTOMER_TRADE_NOTE } from "../src/lib/leadTrade.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

// The case from the report.
ok(auditTradeOf({ category: "Educational Institution", search_keyword: "Driving instructors" }) === "Driving instructors",
  "a driving lead tagged 'Educational Institution' is audited as a driving instructor");
ok(auditTradeOf({ category: "Educational Institution", search_keyword: "Driving instructors", notes: "called, no answer" }) === "Driving instructors",
  "ordinary notes do not change the order");
ok(auditTradeOf({ category: "Plumber", search_keyword: null }) === "Plumber", "no keyword -> category");
ok(auditTradeOf({ category: "  ", search_keyword: " Locksmiths " }) === "Locksmiths", "blank category -> trimmed keyword");
ok(auditTradeOf({}) === "", "neither -> empty (callers refuse the audit)");

// The one exception: the customer's own correction at signup (findable-onboarding writes category + this note line).
const note = `[2026-11-20] ${CUSTOMER_TRADE_NOTE}: "Driving instructors" -> "Motorcycle instructor"`;
ok(customerCorrectedTrade(note) === "Motorcycle instructor", "reads the correction note");
ok(auditTradeOf({ category: "Motorcycle instructor", search_keyword: "Driving instructors", notes: note }) === "Motorcycle instructor",
  "the customer's corrected trade still wins");
ok(auditTradeOf({ category: "Educational Institution", search_keyword: "Driving instructors", notes: note }) === "Driving instructors",
  "a stale correction (category changed since) does not let a Google category win");
const two = `${note}\n[2026-11-21] ${CUSTOMER_TRADE_NOTE}: "Motorcycle instructor" -> "HGV trainer"`;
ok(auditTradeOf({ category: "hgv trainer", search_keyword: "Driving instructors", notes: two }) === "hgv trainer", "the latest correction counts, case-insensitive");

// The onboarding writer still produces exactly the line the reader looks for.
const onb = read("supabase/functions/findable-onboarding/index.ts");
ok(onb.includes('trade corrected by the customer at signup: "${was}" -> "${tradeFix}"'), "findable-onboarding writes the note in the parsed format");

// Every named path uses the one rule; none keeps the old category-first order.
const paths = [
  "supabase/functions/_shared/first-reply-audit.ts",
  "supabase/functions/_shared/audit-baseline.ts",
  "supabase/functions/findable-onboarding/index.ts",
  "supabase/functions/_shared/site-research.ts",
  "supabase/functions/quick-close/index.ts",
];
const oldOrder = /category\s*(\?\?|\|\|)\s*(\(\s*)?(lead\??\.|l\.|row\.)?search_keyword|category as string\)\s*\|\|\s*\(lead\.search_keyword/;
for (const p of paths) {
  const src = read(p);
  ok(/import \{ auditTradeOf \} from "(\.\.\/){3}src\/lib\/leadTrade\.ts"/.test(src), `${p} imports auditTradeOf`);
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !l.includes("const was =")).join("\n");
  ok(!oldOrder.test(code), `${p} has no category-before-keyword trade`);
}
ok(read("supabase/functions/_shared/audit-baseline.ts").match(/category, search_keyword, notes/g)?.length === 3, "the paid baseline reads notes (so a customer correction is seen)");

console.log(f ? `\n${f} FAILED` : "\nall passed");
if (f) process.exit(1);
