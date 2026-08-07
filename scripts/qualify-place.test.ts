/* ============================================================
   THE COUNTRY MARKER ON A LOCAL QUESTION.

   ⛔ 104 OF 104 market-audit questions carried no country, while business audits carried "UK".
   That is the exposure that put Stamford, CONNECTICUT plumbers — FAIRCONN, JNR Plumbing LLC,
   United Sewer & Water — into four reports already sent to prospects.

   The cause was not a disobedient model. create-ai-audit's forced-local prompt said both
   "ALWAYS write the place EXACTLY as 'Wisbech UK'" and "no national/uk terms", and the ban won
   every single time. The prompt is fixed; this is the guarantee that does not depend on it.
   ============================================================ */
import { qualifyPlace, hasCountryMarker, mentionsTown } from "../src/lib/seedGuard.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const one = (q: string, town = "Wisbech") => qualifyPlace([q], town).questions[0];

console.log("── ⛔ THE REAL MARKET-AUDIT QUESTIONS, AS GENERATED ──");
/* Verbatim from ai_audit_queue for the Wisbech driving-instructor market. Every one lacked a
   country marker; every one is repaired. */
for (const q of [
  "driving lessons in Wisbech",
  "intensive driving courses in Wisbech",
  "best driving instructor for beginners in Wisbech",
  "local driving schools in Wisbech",
]) {
  const got = one(q);
  ok(got === `${q} UK`, `"${q}" -> "${got}"`);
  ok(hasCountryMarker(got), "  and it now carries a country marker");
}

console.log("\n── IDEMPOTENT: A QUESTION ALREADY PINNED IS UNTOUCHED ──");
/* Business audits already say "Wisbech UK". Running this over them must be a no-op — otherwise a
   re-run produces "Wisbech UK UK" and the stored string a week-eight re-measurement replays drifts. */
for (const q of [
  "emergency locksmith in Wisbech UK",
  "key cutting services in Wisbech UK",
  "lock repair services in wisbech uk",
]) ok(one(q) === q, `unchanged: "${q}"`);
ok(one(one(one("driving lessons in Wisbech"))) === "driving lessons in Wisbech UK",
  "applying it three times gives the same result as once");

console.log("\n── IT DOES NOT TOUCH WHAT IT DOES NOT OWN ──");
/* A town-less question is dropMissingTown's business. Repairing it here would smuggle back a
   question that guard exists to remove. */
const noTown = "tax services for small businesses in england";
ok(one(noTown) === noTown, "a question naming no town is left alone (dropMissingTown owns it)");
ok(!mentionsTown(noTown, "Wisbech"), "  and it genuinely does not name the town");
ok(one("payroll management services in england") === "payroll management services in england",
  "an 'england' question is already marked and is not double-qualified");

console.log("\n── CASING AND ODD TOWN NAMES ──");
/* ⚠️ The ORIGINAL casing is preserved. The stored string is what a re-measurement replays verbatim,
   so silently lowercasing it would change the comparison for no reason. */
ok(one("lock repair in wisbech") === "lock repair in wisbech UK", "lowercase town matched, casing kept");
ok(one("locksmith in St Ives", "St Ives") === "locksmith in St Ives UK", "two-word town");
/* A dot in a town name must not act as a regex wildcard. */
ok(one("plumber in St. Neots", "St. Neots") === "plumber in St. Neots UK", "a dot in the town is escaped, not a wildcard");
ok(one("driving lessons in Wisbech", "") === "driving lessons in Wisbech", "no town supplied -> nothing to do");

console.log("\n── THE TOWN APPEARING TWICE ──");
/* The place sits at the END of "[service] in [town]", so the LAST occurrence is the one qualified. */
ok(one("Wisbech driving schools in Wisbech") === "Wisbech driving schools in Wisbech UK",
  "the trailing occurrence is qualified, not the leading one");

console.log("\n── hasCountryMarker IS WORD-BOUNDED ──");
/* CLAUDE.md, twice over: "bing" matches plumBING and "acca" matches Macca-Gas. */
ok(!hasCountryMarker("ukulele lessons in Wisbech"), '"ukulele" does not count as "uk"');
ok(hasCountryMarker("plumber in Wisbech UK"), "a real UK does");
ok(hasCountryMarker("accountant in england"), "england counts");
ok(!hasCountryMarker("driving lessons in Wisbech"), "and a bare town does not");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
