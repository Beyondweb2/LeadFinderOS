/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT A CLIENT OR PROSPECT CAN READ MUST NOT RESTATE A CONSTANT THAT HAS SINCE MOVED.

   🔴 WHAT THIS PINS (2026-09-12). The welcome pack — the document a PAYING client receives — carried
   a hand-written 8-week guarantee ending "no honest company can promise AI will always name you":
   nine days after the cycle became four weeks, and the exact hedge CLAUDE.md §1 says must never sit
   beside a conditional refund. RG Locksmiths and Ronnie both received it. Nothing failed, because
   nothing READ the rendered strings — the sync check guards constants, not prose that restates them.

   ⛔ THE RULE: a client-facing renderer may carry the guarantee ONLY as FINDABLE_GUARANTEE, the
   price ONLY as the constant, the cycle ONLY as "four weeks"/"day 28", and never a hedge. The scan
   below reads the STRING LITERALS of each renderer (comments and HTML comments stripped, so the
   design commentary that never reaches a prospect cannot trip it) and fails on any stale claim.

   ⚠️ src/lib/templateBodies.ts is DELIBERATELY NOT HERE. It mirrors what Meta has registered, and
   re_engage_49 genuinely still says "£49.99 instead of £99" at Meta — the mirror is TRUE and the
   template is WRONG. Fixing the mirror would make the Inbox lie about what the prospect receives;
   the fix is Paul re-registering or retiring the template. Recorded in CLAUDE.md §19.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { FINDABLE_GUARANTEE, FINDABLE_SETUP_PRICE_GBP } from "../src/lib/findableOffer.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Everything a reader could see: the bodies of template literals and quoted strings, with JS
 *  comments and HTML comments removed first. Identifiers (founderOfferSection) are not strings. */
function renderedText(src: string): string {
  /* ⚠️ HTML comments are stripped from the WHOLE source FIRST. The report nests template literals
     (`${d.hidePitch ? "" : `…`}`), so a lazy backtick pairing splits a comment across captures and
     its text survives the strip — which is exactly how the first run of this test "found" the
     retired founder pitch inside a design comment the renderer never emits (stripHtmlComments). */
  const noHtml = src.replace(/<!--[\s\S]*?-->/g, "");
  const noJs = noHtml.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const literals: string[] = [];
  for (const m of noJs.matchAll(/`([\s\S]*?)`/g)) literals.push(m[1]);
  for (const m of noJs.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) literals.push(m[1]);
  for (const m of noJs.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) literals.push(m[1]);
  return literals.join("\n");
}

const RENDERERS: Array<[string, string]> = [
  ["welcome pack (paying client)", "src/lib/welcomePackHtml.ts"],
  ["client request form (client)", "src/lib/clientRequestDoc.ts"],
  ["client request asks (client)", "src/lib/clientRequestAsks.ts"],
  ["audit report (prospect + client)", "src/lib/aiAuditReportHtml.ts"],
  ["playbook document (operator, printed for delivery)", "src/lib/playbookDoc.ts"],
  ["free-check result email (prospect)", "supabase/functions/_shared/free-check-result.ts"],
  ["onboarding follow-up (prospect)", "supabase/functions/_shared/onboarding-followup.ts"],
  ["Stripe checkout line (payer)", "supabase/functions/findable-checkout/index.ts"],
];

/* Each pattern is a claim that has been false since a dated change. Keep the date in the label. */
const STALE: Array<[RegExp, string]> = [
  [/\b(8|eight)[- ]weeks?\b/i, "eight weeks — the cycle has been four since 2026-09-03"],
  [/week[- ]eight\b/i, "week eight — four since 2026-09-03"],
  [/\b56 days\b/, "56 days — 28 since 2026-09-03 (RG's +56 is a stored date, never copy)"],
  [/£\s?49\.99|\b49\.99\b|£\s?19\.99|\b19\.99\b/, "a retired price — £99 flat since 2026-09-12"],
  [/\bfounder\b/i, "founder offer — retired 2026-09-03"],
  [/first (10|ten) (businesses|at)\b/i, "the 'first ten' pitch — retired"],
  [/\b(two|2) months\b/i, "'two months' — the one-off never bought two months"],
  [/(don.?t|can.?t|cannot) promise|no honest company|the engines decide|anyone who promises/i, "a hedge beside a conditional refund — deleted 2026-09-12 (CLAUDE.md §1)"],
  [/Bing Places/i, "Bing Places — tested negative, zero citations in 10,615 (CLAUDE.md §5); never a lever"],
];

console.log("── NO CLIENT-FACING RENDERER CARRIES A STALE CLAIM ──");
for (const [label, path] of RENDERERS) {
  const text = renderedText(read(path));
  for (const [re, why] of STALE) {
    const m = text.match(re);
    ok(!m, `${label}: no "${m?.[0] ?? re.source}" — ${why}`.slice(0, 160));
  }
}

console.log("\n── THE GUARANTEE APPEARS ONLY AS THE CONSTANT ──");
const welcome = read("src/lib/welcomePackHtml.ts");
ok(/esc\(FINDABLE_GUARANTEE\)/.test(welcome), "the welcome pack renders FINDABLE_GUARANTEE, escaped");
ok(!/you get your money back/i.test(renderedText(welcome)), "…and no hand-written refund sentence beside it");
ok(FINDABLE_GUARANTEE.includes(`£${FINDABLE_SETUP_PRICE_GBP}`), `the constant itself names £${FINDABLE_SETUP_PRICE_GBP}`);
ok(/four weeks|week four/.test(FINDABLE_GUARANTEE), "…and four weeks");
const playbook = read("src/lib/playbookDoc.ts");
ok(/\$\{FINDABLE_GUARANTEE\}/.test(playbook), "the playbook document renders FINDABLE_GUARANTEE");
ok(!/No client has completed/.test(renderedText(playbook)), "…and no longer asserts how many clients have completed a cycle (a sentence that goes stale by itself)");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
