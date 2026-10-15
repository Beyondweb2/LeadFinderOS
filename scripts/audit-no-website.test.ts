/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NO-WEBSITE LEADS ARE AUDITED BY DEFAULT (Paul, 2026-10-14). They are the best targets — AI not naming them is
   the pitch. The Outreach bulk "Run AI audits" box used to hold them back behind a tick box; now they are
   eligible, the website scan is skipped for them (nothing to scan, nothing charged), the AI questions still run
   on the stored business type + location, the report shows its no-website section, and the report-offer guard
   judges them like any other lead (score, competitors, report link, not named).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { estimateBatchCost } from "../src/lib/auditBatchPlan.ts";
import { reportOfferRefusal } from "../src/lib/reportOfferTemplate.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("── the bulk dialog ──");
{
  const ot = read("src/components/OutreachTable.tsx");
  ok(!/auditIncludeNoWebsite/.test(ot), "no hold-back switch any more");
  ok(/const auditEligibleLeads = auditSelectedLeads;/.test(ot), "eligible = every selected, unaudited lead with a type and a location — website or not");
  ok(/data-testid="audit-no-website-info"/.test(ot) && !/held back, saving/.test(ot) && !/Tick to audit/.test(ot), "the no-website count is an info line, not a checkbox");
  ok(/no site scan\)/.test(ot) && !/with no website, no scan/.test(ot), "the confirm line says no audit here runs a site scan (2026-10-15)");
}

console.log("── the price ──");
{
  const c = estimateBatchCost([{ website: "" }, { website: "https://www.facebook.com/x" }, { website: "https://acme.co.uk" }] as never, 3,
    { usdPerQuestion: 0.01 });
  ok(c.leads === 3, "every lead is counted");
  ok(Math.abs(c.totalUsd - 0.09) < 1e-9 && Math.abs(c.questionsUsd - 0.09) < 1e-9, "questions only for every lead, website or not: a hook audit runs no scan (2026-10-15)");
}

console.log("── the server path ──");
{
  const bj = read("supabase/functions/bulk-jobs/index.ts");
  ok(/has_website: !!website,/.test(bj) && /website: website \|\| undefined,/.test(bj), "bulk-jobs sends has_website false and no URL for a lead without its own site");
  ok(/business_type: \(lead\.search_keyword \|\| lead\.category \|\| ""\)\.trim\(\)/.test(bj) && /location_text: auditTown \|\| \(lead\.search_location \|\| lead\.address \|\| ""\)\.trim\(\)/.test(bj) && /cleanTypedTown\(lead\.search_location\)/.test(bj), "the questions use the stored business type and location (the typed town cleaned, never raw free text)");
  const q = read("supabase/functions/process-ai-audit-queue/index.ts");
  ok(/if \(!audit\?\.has_website \|\| !audit\?\.website\) continue; \/\/ no-website audits get no SEO section/.test(q), "the queue never scans a no-website audit");
  ok(/crawl_check: \{ status: "unavailable", reason: "no_website" \}/.test(q), "the crawl is recorded as not possible, not as a failure");
}

console.log("── the report ──");
{
  const r = read("src/lib/aiAuditReportHtml.ts");
  ok(/d\.hasWebsite === false \? noWebsiteSection\(\)/.test(r), "the report's website slot becomes the no-website section (never an empty grade)");
}

console.log("── the report-offer guard ──");
{
  ok(reportOfferRefusal({ hasAudit: true, competitors: "A and B", score: "17%", link: "https://findable.live/r/abc123", namedInAnswers: false }) === null,
    "score + competitors + report link + not named = ready (no website input at all)");
  const t = read("src/lib/reportOfferTemplate.ts");
  const facts = t.slice(t.indexOf("interface ReportOfferFacts"), t.indexOf("export function reportOfferRefusal"));
  ok(facts.length > 0 && !/website|site/i.test(facts), "the guard's facts have no website field");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
