/* ============================================================
   THE REPORT MUST NOT CONTRADICT ITSELF, AND MUST NOT NAME FRAGMENTS AS FIRMS.

   ⛔ FAULT 1 — A FIXED STRING PRESENTED AS A FINDING. The quote's attribution line read
   "— {engine}. {business} was never named." unconditionally, with no branch on the data. On RG
   Locksmiths' live report that sat directly under the headline "AI names you 8 times in 24
   answers": two claims about the same run, one of them false, about two inches apart. Same shape as
   the audit page's catch-all error message — a hardcoded sentence that reads as derived.

   ⛔ FAULT 2 — EXTRACTION FRAGMENTS PRINTED AS COMPETITORS. "Safe" was RG's third-biggest
   "competitor" at 14×, alongside "Locksmith" 9× and "Emergency" 7×. The generic-word sets that
   isRealCompetitor tests against were built for accountancy and hospitality and contained no trades
   vocabulary at all, so a bare category token passed as a business name on a CLIENT-facing document.

   Both drive the REAL exported functions — renderReportHtml and isRealCompetitor.
   ============================================================ */
import { renderReportHtml, type AiAuditReportData } from "../src/lib/aiAuditReportHtml.ts";
import { isRealCompetitor } from "../src/lib/auditReport.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const base = (named: number, total: number): AiAuditReportData => ({
  businessName: "RG Locksmiths cambs",
  businessType: "locksmiths",
  named,
  total,
  questionsAsked: 12,
  enginesUsed: 2,
  pct: total > 0 ? Math.round((named / total) * 100) : 0,
  perEngine: [{ label: "ChatGPT", named: Math.max(0, named - 1), total: 12 }, { label: "Gemini", named: Math.min(1, named), total: 12 }],
  competitors: ["LockFit Locksmiths Huntingdon"],
  topCompetitors: [{ name: "LockFit Locksmiths Huntingdon", count: 25 }],
  competitorMentions: 470,
  gutPunch: { question: "emergency lockouts locksmiths in St neots UK", engineLabel: "Gemini", rivals: ["Keytek Locksmiths St Neots"], answer: "Here are some locksmiths in St Neots.", businesses: ["Keytek Locksmiths St Neots"] },
  generatedAtLabel: "11 Aug 2026",
} as AiAuditReportData);

/* 🔴 REVISED 2026-10-02. The quote's attribution line (div.gb-attr) was REMOVED on 2026-09-16, when
   Paul replaced the quote with the chat card ("What AI actually said": one engine, the exact question,
   the firms it named, and the callout "{business} wasn't mentioned in this search"). These blocks read
   gb-attr, so three of them failed and the edge case passed VACUOUSLY on an empty string. They now
   read what the report renders today. FAULT 1 is still the thing guarded: no sentence on the page may
   claim "never named" when the audit-wide count says otherwise, and the card's claim must be scoped
   to the one answer it shows. The absent case is stated by the COUNT ("0 times"), not by a stronger
   sentence: that is the 2026-09-16 design. */
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&rsquo;/g, "\u2019").replace(/&times;/g, "x").replace(/\s+/g, " ");
const card = (html: string) => html.match(/<section class="chatcard">([\s\S]*?)<\/section>/)?.[1] ?? "";

console.log("── ⛔ NAMED SOMEWHERE -> NOTHING ON THE PAGE MAY SAY 'never' ──");
{
  const html = renderReportHtml(base(8, 24));
  const c = card(html);
  ok(c.length > 0, "the chat card renders (a not-named answer that carries firms)");
  ok(!/never (named|mentioned|appear)/i.test(text(html)), "⛔ no 'never named' anywhere when the business WAS named");
  ok(/wasn\u2019t mentioned in this search/.test(text(c)), "  the card's claim is scoped to the one search it shows");
  ok(/cc-brand[^>]*>[\s\S]*?Gemini/.test(c), "  and it attributes the engine");
  ok(/8 times RG Locksmiths cambs showed up/.test(text(html)) && /out of 24 answers/.test(text(html)), "the headline still states the audit-wide count");
}

console.log("\n── THE ABSENT BUSINESS IS STATED BY THE COUNT ──");
{
  const t = text(renderReportHtml(base(0, 24)));
  ok(/0 times RG Locksmiths cambs showed up/.test(t), "named === 0 says 0 times, plainly; the absent case is not softened");
}

console.log("\n── EDGE: named 1 of 24 is still 'named somewhere' ──");
/* The boundary that matters: one mention anywhere forbids the word. Asserted on the whole page now,
   so it can no longer pass on an empty match. */
{
  const html = renderReportHtml(base(1, 24));
  ok(card(html).length > 0 && !/never (named|mentioned|appear)/i.test(text(html)), "a single mention across the whole audit is enough to forbid 'never'");
}

console.log("\n── ⛔ FRAGMENTS ARE NOT FIRMS (the names measured on RG's own report) ──");
for (const junk of ["Safe", "Locksmith", "Locksmiths", "Emergency", "Based", "Lock", "Locks", "Repairs", "Services", "Engineers"]) {
  ok(!isRealCompetitor(junk, "Huntingdon"), `rejects ${JSON.stringify(junk)}`);
}

console.log("\n── ⛔ AND REAL FIRMS STILL SURVIVE (the whole risk of a stopword list) ──");
/* Every one of these contains a word just added to the generic sets. `words.every(generic)` is what
   keeps them: one distinctive token is enough. If this block ever fails, the list went too far. */
for (const real of [
  "Abbey Locksmiths", "LockFit Locksmiths Huntingdon", "Cambs Lock & Safe", "Keytek Locksmiths",
  "Safe And Secure Locksmiths", "Panther Locksmiths Ltd", "Timpson Locksmiths", "LockRite Locksmiths",
]) {
  ok(isRealCompetitor(real, "Huntingdon"), `keeps ${JSON.stringify(real)}`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
