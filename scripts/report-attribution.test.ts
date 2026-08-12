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
  gutPunch: { question: "emergency lockouts locksmiths in St neots UK", engineLabel: "Gemini", rivals: ["Keytek Locksmiths St Neots"] },
  generatedAtLabel: "11 Aug 2026",
} as AiAuditReportData);

console.log("── ⛔ NAMED SOMEWHERE -> THE WORD 'never' MUST NOT APPEAR IN THE ATTRIBUTION ──");
{
  const html = renderReportHtml(base(8, 24));
  const attr = html.match(/<div class="gb-attr">([\s\S]*?)<\/div>/)?.[1] ?? "";
  console.log(`   attribution: ${attr.trim()}`);
  ok(attr.length > 0, "the attribution line renders");
  ok(!/never named/i.test(attr), "⛔ it does NOT say 'never named' when the business WAS named");
  ok(/wasn/i.test(attr) && /this answer/i.test(attr), "  it scopes to the quoted answer instead");
  ok(/Gemini/.test(attr), "  and still attributes the engine");
  /* The headline and the attribution must be able to sit together without contradicting. */
  ok(/8 times in 24 answers/.test(html), "the headline still states the audit-wide count");
}

console.log("\n── THE STRONG LINE SURVIVES FOR A GENUINELY ABSENT BUSINESS ──");
{
  const html = renderReportHtml(base(0, 24));
  const attr = html.match(/<div class="gb-attr">([\s\S]*?)<\/div>/)?.[1] ?? "";
  console.log(`   attribution: ${attr.trim()}`);
  ok(/never named/i.test(attr), "named === 0 still reads 'was never named' — the absent case is not softened");
}

console.log("\n── EDGE: named 1 of 24 is still 'named somewhere' ──");
/* The boundary that matters: one mention anywhere forbids the word. */
{
  const attr = renderReportHtml(base(1, 24)).match(/<div class="gb-attr">([\s\S]*?)<\/div>/)?.[1] ?? "";
  ok(!/never named/i.test(attr), "a single mention across the whole audit is enough to forbid 'never'");
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
