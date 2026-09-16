/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NAME REFUSAL REPLACES THE HERO — it does not annotate it.

   🔴 THE FAULT THIS PINS. `named` is nameMatches(answer_text, businessName), so a business whose
   name IS its trade and its town scores on the question itself. Measured over the 495 opened
   reports: 64 carry such a name, and it breaks BOTH ways —
     · "Burnley Locksmiths" was told 6 of 6: AI already names you everywhere. Kills the sale on a
       claim we cannot support.
     · "CJ Plumbing Services" (strips to `cj`) was told 0 of 6, which the renderer printed as
       "AI never named you". A false accusation, on the document that asks for their business.

   ⛔ THE PROPERTY IS ABSENCE, NOT PRESENCE. It is not enough that the refusal appears; the claims
   it replaces must be GONE from the whole document. A true sentence under a false headline is
   still a false headline — Paul's rule, 2026-09-15.

   Run: npx tsx scripts/report-name-refusal.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { renderReportHtml, type AiAuditReportData } from "../src/lib/aiAuditReportHtml.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const base = (over: Partial<AiAuditReportData>): AiAuditReportData => ({
  businessName: "CJ Plumbing Services",
  businessType: "plumber",
  locationText: "Kettering",
  named: 0,
  total: 6,
  questionsAsked: 3,
  measurementRuns: 1,
  enginesUsed: 2,
  pct: 0,
  perEngine: [],
  competitors: [],
  topCompetitors: [{ name: "Fen Property Services", count: 5 }],
  competitorMentions: 12,
  gutPunch: null,
  generatedAtLabel: "15 Sep 2026",
  ...over,
} as AiAuditReportData);

console.log("── 🔴 THE DAMNING CASE: \"AI never named you\" MUST NOT SURVIVE ──");
{
  const html = renderReportHtml(base({ nameNotJudgeable: true }));
  ok(!html.includes("AI never named"), "the accusation is absent from the whole document");
  ok(!/not once across/.test(html), "and so is \"not once across N answers\"");
  ok(html.includes("checking this one by hand"), "the refusal heading is present");
  ok(html.includes("same words as your trade and your town"),
     "Paul's wording: it leads with the NAME, not with what we cannot do");
  ok(html.includes("an automated check can&rsquo;t") || html.includes("an automated check can’t"),
     "“an automated check can't” — not “we cannot”: a person CAN tell, it just takes a person");
}

console.log("\n── 🔴 THE FLATTERING CASE: a 6-of-6 must not print either ──");
{
  const html = renderReportHtml(base({
    businessName: "Burnley Locksmiths", businessType: "Locksmiths", locationText: "Burnley",
    named: 6, total: 6, pct: 100, nameNotJudgeable: true,
  }));
  ok(!html.includes("AI named <b>Burnley Locksmiths</b> <b>6</b>"),
     "the 6-of-6 headline claim is gone");
  ok(!/>6<\/span>/.test(html), "and the hero number itself never renders");
  ok(html.includes("checking this one by hand"), "the refusal is what renders instead");
}

console.log("\n── ⛔ THE HERO IS REPLACED, NOT ANNOTATED ──");
{
  const html = renderReportHtml(base({ nameNotJudgeable: true }));
  ok(!html.includes('<div class="hero">'), "no hero block at all");
  ok(!html.includes('class="hero-verdict"'), "no verdict punch");
  /* The gutbox is GONE from the whole document (2026-09-16 redesign), so the refusal simply renders
     in the hero's place — assert it is present, not its order against a section that no longer exists. */
  ok(html.includes('<section class="namecheck">'), "the refusal section renders where the number used to be");
}

console.log("\n── ⚠️ THE WEBSITE SLOT IS INDEPENDENT OF THE NAME ──");
{
  const html = renderReportHtml(base({ nameNotJudgeable: true, hasWebsite: false }));
  ok(!/named most often instead/.test(html),
     "no “instead” claim anywhere — the exact thing being refused");
  ok(/build you (a|one)|website/i.test(html),
     "the website slot still renders — a site scan measures their SITE, not their name");
}

console.log("\n── ✅ A JUDGEABLE NAME IS COMPLETELY UNCHANGED ──");
{
  const before = renderReportHtml(base({ businessName: "Lockwood & Sons", businessType: "locksmiths", locationText: "Norwich", named: 2, total: 6 }));
  const after = renderReportHtml(base({ businessName: "Lockwood & Sons", businessType: "locksmiths", locationText: "Norwich", named: 2, total: 6, nameNotJudgeable: false }));
  ok(before === after, "nameNotJudgeable:false renders byte-identically to an absent field");
  ok(before.includes('<div class="hero">'), "and the hero is there, as it always was");
  ok(!before.includes('<section class="namecheck">'), "no name-refusal section for a judgeable name");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
