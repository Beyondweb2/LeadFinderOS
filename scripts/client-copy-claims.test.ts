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
import { FINDABLE_GUARANTEE, FINDABLE_SETUP_PRICE_GBP, REMEASURE_CLAIM_SENTENCE, STALE_OFFER_TEMPLATES } from "../src/lib/findableOffer.ts";
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
  /* 2026-10-02: the Client Service Agreement page, its words and the signed PDF (paying client). */
  ["agreement page (paying client)", "src/lib/agreementPageHtml.ts"],
  ["agreement words (paying client)", "src/lib/clientAgreement.ts"],
  ["signed agreement PDF (paying client)", "src/lib/agreementPdf.ts"],
  /* 2026-10-02: the lines above the paid form's pre-filled services / towns (findable.live renders them). */
  ["post-payment form prefill lines (paying client)", "src/lib/setupPrefill.ts"],
  ["audit report (prospect + client)", "src/lib/aiAuditReportHtml.ts"],
  ["four-week results document (client)", "src/lib/remeasureResultsHtml.ts"],
  /* 2026-10-02: the monthly update Paul copies to a paying client (prepared by hand, sent by him). */
  ["monthly client update words (client)", "src/lib/monthlyUpdate.ts"],
  ["four-week results words (client)", "src/lib/remeasureResults.ts"],
  ["free-check result email (prospect)", "supabase/functions/_shared/free-check-result.ts"],
  ["onboarding follow-up (prospect)", "supabase/functions/_shared/onboarding-followup.ts"],
  ["Stripe checkout line (payer)", "supabase/functions/findable-checkout/index.ts"],
  ["billing emails + card notice (client)", "src/lib/findableOffer.ts"],
  ["prospect preview homepage (prospect)", "src/lib/prospectPreview/templates/localTrade.ts"],
  ["prospect preview evidence card + message (prospect)", "src/lib/prospectPreview/copy.ts"],
  ["prospect preview card layout (prospect)", "src/lib/prospectPreview/evidenceCard.ts"],
  /* 2026-10-04: the Quick Close payment-link message and email (prospect) and the rep's spoken words. */
  ["Quick Close link message + email (prospect)", "src/lib/quickClose.ts"],
  /* 2026-10-05 (v3): the Access Date confirmation email (clause 5.1) sent to a paying client. */
  ["Access Date email (paying client)", "supabase/functions/_shared/client-terms.ts"],
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

/* The FINDABLE OFFER's retired words (2026-09-23). Applied to every renderer, and to every sendable
   template EXCEPT the two blocked in STALE_OFFER_TEMPLATES (their Meta-registered bodies are kept on
   purpose until re-registered) and the dead barber product's own templates (its price, not ours). */
const OFFER_STALE: Array<[RegExp, string]> = [
  /* 🔴 2026-10-05 (v3 Client Service Agreement, clause 9A): £29.99 is TRUE again — as the Continuing
     Service after the minimum term, never as the monthly. A £29.99 is allowed only when the words around it
     say so (continuingServiceContext below); a bare "£29.99 a month" offer still fails. */
  [/29\.99/, "£29.99 not described as the Continuing Service — the monthly is £99; £29.99 is only the clause 9A Continuing Service after the minimum term (2026-10-05)"],
  [/(cancel|stop)( it)?( at)? any ?time|not binding|cancel before (it|week)/i, "a free exit — a 12-month minimum term since 2026-09-23 (the guarantee is the only early exit)"],
  [/that same day/i, "billing 'that same day' as the claim window — billing runs from sign-up since 2026-09-18"],
];

/* TRUE sentences that a rule would otherwise catch — Paul's own legal text, verbatim. Removed before the
   scan; add one only when it is true and binding, never to silence a stale claim. */
const ALLOWED_TRUE: readonly string[] = [
  /* v3 clause 12.2(e): where the data may be accessed from — a fact, not the retired founder offer. */
  "including from Thailand where our founder is based",
];
/** Every £29.99 in `text` sits beside words that make it the Continuing Service (v3 clause 9A). */
const CONTINUING_WORDS = /Continuing Service|until you cancel|until cancelled|after the minimum term|clause 9A|FINDABLE_CONTINUING_GBP|continuingGbp|minimum term\)?, then|After that|Then £/i;
function bare2999(text: string): string | null {
  for (const m of text.matchAll(/29\.99/g)) {
    const at = m.index ?? 0;
    const around = text.slice(Math.max(0, at - 220), at + 220);
    if (!CONTINUING_WORDS.test(around)) return around.replace(/\s+/g, " ").slice(150, 290);
  }
  return null;
}

console.log("── NO CLIENT-FACING RENDERER CARRIES A STALE CLAIM ──");
for (const [label, path] of RENDERERS) {
  let text = renderedText(read(path));
  for (const s of ALLOWED_TRUE) text = text.split(s).join("");
  for (const [re, why] of [...STALE, ...OFFER_STALE]) {
    if (re.source.startsWith("29")) { const bad = bare2999(text); ok(!bad, `${label}: no bare £29.99 — ${why}${bad ? ` (near "${bad}")` : ""}`.slice(0, 220)); continue; }
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
  ["Website Build simple screen (operator)", "src/components/SimpleWebsiteBuild.tsx"],
  ["Website Build simple flow + master prompt (operator)", "src/lib/simpleBuild.ts"],
  ["Baseline screen (operator)", "src/pages/Baseline.tsx"],
  ["delivery cockpit logic (operator)", "src/lib/deliveryCockpit.ts"],
  ["delivery cockpit (operator)", "src/components/LeadDeliveryCockpit.tsx"],
  ["audit pills (operator)", "src/components/audit/AuditPills.tsx"],
  ["page-plan queue logic (operator)", "src/lib/pagePlanQueue.ts"],
  ["page-plan queue screen (operator)", "src/pages/PagePlanQueue.tsx"],
  ["dashboard tasks (operator)", "src/lib/dashboardTasks.ts"],
  ["admin control centre (operator)", "src/components/admin/controlCentre.tsx"],
  ["admin control centre: sales intelligence (operator)", "src/components/admin/intelligence.tsx"],
  ["admin control centre: paid client health (operator)", "src/components/admin/clientHealth.tsx"],
  ["admin control centre: site traffic (operator)", "src/components/admin/traffic.tsx"],
  ["admin control centre: AI business summary (operator)", "src/components/admin/businessSummary.tsx"],
  ["shared delivery checklist (operator)", "src/components/delivery/DeliveryChecklist.tsx"],
  ["client pages hook (operator)", "src/hooks/useClientPages.ts"],
  ["monthly update panel (operator)", "src/components/MonthlyUpdatePanel.tsx"],
  /* 2026-10-05 (v3): the Paid Client timeline card — Access Date, Results Date, Payment Start, Continuing Service. */
  ["client timeline card (operator)", "src/components/ClientTimelineCard.tsx"],
  ["client timeline rules (operator)", "src/lib/clientTimeline.ts"],
  /* Read aloud to prospects on the phone — a stale claim here is said to a client verbatim. */
  ["cold call playbook logic (operator)", "src/lib/coldCallPlaybook.ts"],
  ["cold call playbook panel (operator)", "src/components/ColdCallPlaybook.tsx"],
  ["prospect preview panel (operator)", "src/components/ProspectPreviewPanel.tsx"],
  /* Multi-user (2026-09-27): a salesperson reads these while on the phone to a prospect. */
  ["lead CRM panel (operator, both roles)", "src/components/LeadCrmPanel.tsx"],
  ["hook audit popup (operator, both roles)", "src/components/HookAuditDialog.tsx"],
  ["sales CRM wording (operator)", "src/lib/salesCrm.ts"],
  /* Abuse / cost protection (2026-09-29): the admin's security screen and its alert wording. */
  ["security panel (admin)", "src/components/SecurityPanel.tsx"],
  ["security alert wording (admin)", "src/lib/securityAlerts.ts"],
  /* Sales Team Board (2026-10-01): Paul's words to the team, and the team's view of them. */
  ["team board wording (operator)", "src/lib/teamBoard.ts"],
  ["team board (salesperson)", "src/components/team/TeamBoard.tsx"],
  ["send to sales team composer (admin)", "src/components/team/TeamComposer.tsx"],
  /* 2026-10-04: read aloud on the closing call — terms, minimum term, guarantee (fixes-02-quick-close.md). */
  ["Quick Close screen (salesperson)", "src/components/QuickCloseDialog.tsx"],
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
/* The claim sentence the four-week results email says when the number has not gone up IS the
   guarantee's second sentence — one promise, one wording (2026-09-13). Cross-repo, the sync script
   locks it to findable-site's REFUND_CLAIM_SENTENCE, which /refunds renders. */
ok(FINDABLE_GUARANTEE.endsWith(REMEASURE_CLAIM_SENTENCE), "the guarantee ends with REMEASURE_CLAIM_SENTENCE (the four-week results email's refund sentence)");

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
  const offerRules = STALE_OFFER_TEMPLATES.has(name) || /barber/.test(name) ? [] : OFFER_STALE;
  for (const [re, why] of [...STALE, ...offerRules]) {
    const m = text.match(re);
    ok(!m, `sendable template ${name}: no "${m?.[0] ?? re.source}" — ${why}`.slice(0, 160));
  }
}
const re49 = bodies["re_engage_49"]?.("Example Business", "") ?? "";
ok(/Where did we get to with this\? Happy to pick it back up, or leave it if now.s not the time\./.test(re49) && !/£/.test(re49),
   "re_engage_49's mirror is the one-variable, no-price body Paul registered");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
