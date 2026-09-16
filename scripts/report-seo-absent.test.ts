/* ============================================================
   THE REPORT'S WEBSITE SECTION — three branches, none silent (2026-08-17).

   The email lane's audits skip the SEO scan up-front, and the "has a website, no scan" case used
   to render NOTHING — a silent gap in a document a prospect reads. It now states the sequencing.
   This suite pins all three branches so a refactor cannot quietly reintroduce the silence, and
   asserts on strings each branch alone renders (§4: assert on something only the target has).
   ============================================================ */
import { renderReportHtml, type AiAuditReportData } from "../src/lib/aiAuditReportHtml.ts";
import { isRenderableSeo } from "../src/lib/auditReport.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const base: AiAuditReportData = {
  businessName: "Test Plumbing",
  businessType: "plumber",
  named: 1,
  total: 6,
  pct: 17,
  perEngine: [],
  competitors: ["Fen Property Services"],
  gutPunch: null,
  generatedAtLabel: "17 Aug 2026",
};

const GRADED_SEO = {
  overallGrade: "C",
  categories: { onPage: { grade: "C", score: 55 }, contentTechnical: { grade: "B", score: 70 } },
  leadFindings: [],
};

console.log("── Branch 1: a real scan renders the graded panel ──");
{
  const html = renderReportHtml({ ...base, seo: GRADED_SEO as never, hasWebsite: true });
  ok(html.includes("How findable is your website?"), "graded panel present");
  ok(!html.includes("full check comes when we start work"), "pending line absent when a scan exists");
}

console.log("── Branch 2: no website renders the build-you-one section ──");
{
  const html = renderReportHtml({ ...base, seo: undefined, hasWebsite: false });
  ok(html.includes("You don&rsquo;t have a website yet"), "no-website section present");
  ok(!html.includes("full check comes when we start work"), "pending line absent — a site they don't have can't be checked later");
}

console.log("── Branch 3 (2026-09-16 redesign): website but no scan → the crawl-check faults section, or silent ──");
{
  // No graded SEO, no crawl faults yet → the website slot is SILENT (the "check comes with the work"
  // pending line was removed; the crawl-check section replaces it when there are faults to show).
  const silent = renderReportHtml({ ...base, seo: undefined, hasWebsite: true });
  ok(!silent.includes("full check comes when we start work"), "the old sequencing line is gone");
  ok(!silent.includes("How findable is your website?"), "no graded panel without a grade");
  ok(!silent.includes("You don&rsquo;t have a website yet"), "and never the no-website copy for a business that has one");
  ok(!silent.includes("What&rsquo;s stopping AI reading your site"), "with no crawl faults, the website section is silent");
  // With crawl faults, the section renders and carries each fault's specific number.
  const withFaults = renderReportHtml({ ...base, seo: undefined, hasWebsite: true,
    crawlFaults: [{ title: "Your pages are too similar", detail: "20 near-identical pages, 98% the same. AI reads them as one.", minor: false }] });
  ok(withFaults.includes("What&rsquo;s stopping AI reading your site"), "with crawl faults, the section renders");
  ok(withFaults.includes("20 near-identical pages"), "and carries the specific number");
}

console.log("── The gate that feeds the branch: markers are not grades ──");
ok(!isRenderableSeo({ skipped: "seo_scan_not_requested", checked_at: "2026-08-08" }), "the email lane's skip marker is not renderable SEO");
ok(!isRenderableSeo({ error: "Apify start HTTP 402" }), "a failure marker is not renderable SEO");
ok(isRenderableSeo(GRADED_SEO), "a graded object is");

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? "" : "S"}`); process.exit(1); }
console.log("\nALL PASS");
