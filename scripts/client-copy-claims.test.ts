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

   ⚠️ src/lib/templateBodies.ts IS NOT SCANNED AS A FILE, AND THAT IS DELIBERATE. It is the Inbox's
   mirror of what was SENT, and it keeps the OLD `re_engage` body ("£49.99 instead of £99") because
   21 August rows genuinely contained those words — rewriting it would falsify the transcript
   (I did exactly that once on 2026-09-12 and had to restore it). Meta is current: `re_engage_49`
   carries a one-variable body with no price, mirrored below character for character. So the
   property that matters is not "the file has no £49.99" but "NO SENDABLE TEMPLATE'S BODY does" —
   and that is asserted at the bottom, against WA_TEMPLATE_REQS, the sendable list.
   (A first version of this header claimed Meta still said £49.99. It did not; I had read the
   historical mirror and called it the live template. Paul caught it.)
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { FINDABLE_GUARANTEE, FINDABLE_SETUP_PRICE_GBP } from "../src/lib/findableOffer.ts";
import { READABLE_TEMPLATE_BODIES } from "../src/lib/templateBodies.ts";
import { WA_TEMPLATE_REQS } from "../src/lib/whatsappTemplates.ts";

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

console.log("\n── NO OPERATOR SCREEN CARRIES A STALE CLAIM EITHER (2026-09-13) ──");
/* The renderer list above is the CLIENT boundary. This list is the operator's: the Baseline
   screen's band descriptions said "keep it for the week-8 comparison" ten days after the cycle
   became four weeks, and the client-facing sweep could not see it because baselineView.ts is not a
   client document. An operator screen that states a stale fact is a lie the operator repeats to a
   client on the phone. Scanned as WHOLE comment-stripped source (JSX text is not a string literal,
   and a .tsx label sits in JSX), not just literals.
   ALLOWED: exact strings that are TRUE and must stay — RG Locksmiths really is on eight weeks by
   his contract (CLAUDE.md §1). Add to this list only a sentence that is true, never to silence one. */
const OPERATOR_SCREENS: Array<[string, string]> = [
  ["baseline bands (operator)", "src/lib/baselineView.ts"],
  ["Baseline screen (operator)", "src/pages/Baseline.tsx"],
  ["delivery cockpit logic (operator)", "src/lib/deliveryCockpit.ts"],
  ["delivery cockpit (operator)", "src/components/LeadDeliveryCockpit.tsx"],
  ["audit pills (operator)", "src/components/audit/AuditPills.tsx"],
  ["page-plan queue logic (operator)", "src/lib/pagePlanQueue.ts"],
  ["page-plan queue screen (operator)", "src/pages/PagePlanQueue.tsx"],
  ["dashboard tasks (operator)", "src/lib/dashboardTasks.ts"],
  ["next actions card (operator)", "src/components/dashboard/NextActionsCard.tsx"],
  ["client delivery card (operator)", "src/components/dashboard/ClientDeliveryCard.tsx"],
  ["shared delivery checklist (operator)", "src/components/delivery/DeliveryChecklist.tsx"],
  ["client pages hook (operator)", "src/hooks/useClientPages.ts"],
];
const OPERATOR_ALLOWED: string[] = [
  "(RG Locksmiths: eight weeks, by his contract)",
];
function operatorText(src: string): string {
  let s = src.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  for (const a of OPERATOR_ALLOWED) s = s.split(a).join("");
  return s;
}
for (const [label, path] of OPERATOR_SCREENS) {
  const text = operatorText(read(path));
  for (const [re, why] of STALE) {
    const m = text.match(re);
    ok(!m, `${label}: no "${m?.[0] ?? re.source}" — ${why}`.slice(0, 160));
  }
}
ok(/week-four comparison/.test(read("src/lib/baselineView.ts")), "the HELD band says week-four (was week-8 until 2026-09-13)");


console.log("\n── THE GUARANTEE APPEARS ONLY AS THE CONSTANT ──");
const welcome = read("src/lib/welcomePackHtml.ts");
ok(/esc\(FINDABLE_GUARANTEE\)/.test(welcome), "the welcome pack renders FINDABLE_GUARANTEE, escaped");
ok(!/you get your money back/i.test(renderedText(welcome)), "…and no hand-written refund sentence beside it");
ok(FINDABLE_GUARANTEE.includes(`£${FINDABLE_SETUP_PRICE_GBP}`), `the constant itself names £${FINDABLE_SETUP_PRICE_GBP}`);
ok(/four weeks|week four/.test(FINDABLE_GUARANTEE), "…and four weeks");
const playbook = read("src/lib/playbookDoc.ts");
ok(/\$\{FINDABLE_GUARANTEE\}/.test(playbook), "the playbook document renders FINDABLE_GUARANTEE");
ok(!/No client has completed/.test(renderedText(playbook)), "…and no longer asserts how many clients have completed a cycle (a sentence that goes stale by itself)");

console.log("\n── NO SENDABLE WHATSAPP TEMPLATE QUOTES A RETIRED PRICE OR A HEDGE ──");
/* The sendable list is WA_TEMPLATE_REQS. A body is rendered with a neutral name so a stale claim
   cannot hide behind an interpolation. The historical `re_engage` body is NOT in this list — it is
   not sendable — and that is asserted too, because the day it becomes sendable again it becomes a
   "shown £49.99, charged £99" send. */
const sendable = Object.keys(WA_TEMPLATE_REQS);
ok(sendable.length > 0, `WA_TEMPLATE_REQS lists ${sendable.length} sendable template(s)`);
ok(!sendable.includes("re_engage"), "the OLD `re_engage` is not sendable (its £49.99 body is history for 21 rows, not copy)");
ok(sendable.includes("re_engage_49"), "re_engage_49 is the sendable one");
type BodyFn = (b: string, u: string) => string;
const bodies = READABLE_TEMPLATE_BODIES as unknown as Record<string, BodyFn | undefined>;
for (const name of sendable) {
  const render = bodies[name];
  if (!render) { console.log(`  (no mirrored body for ${name} — nothing to scan)`); continue; }
  const text = render("Example Business", "https://example.invalid/x");
  for (const [re, why] of STALE) {
    const m = text.match(re);
    ok(!m, `sendable template ${name}: no "${m?.[0] ?? re.source}" — ${why}`.slice(0, 160));
  }
}
const re49 = bodies["re_engage_49"]?.("Example Business", "") ?? "";
ok(/Where did we get to with this\? Happy to pick it back up, or leave it if now.s not the time\./.test(re49) && !/£/.test(re49),
   "re_engage_49's mirror is the one-variable, no-price body Paul registered");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
