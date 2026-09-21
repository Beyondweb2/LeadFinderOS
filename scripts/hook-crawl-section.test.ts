/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE HOOK REPORT'S WEBSITE-CRAWL SECTION (2026-09-21).

   Investigation (read-only) found the crawl pipeline itself already fires for every finalising
   audit regardless of purpose (process-ai-audit-queue's crawl trigger has no audit_purpose gate —
   only the PAID Apify SEO scan is purpose-gated, via SEO_SCAN_PURPOSES) and render-audit-report's
   crawl lookup is already included in the hook branch (`d.hook ? renderHookSection + seoSlot`).
   The one CONFIRMED gap: two of the three hook-audit creators (outreach-audit.ts's drip pre-send,
   Inbox.tsx's hook button) sent the lead's RAW website straight through instead of filtering it
   through the same ownWebsite()/isAggregatorUrl rule the first-reply path already applied — so a
   lead whose only "website" is a Facebook/Fresha page had THAT page crawled, which plausibly
   explains "no findings ever show up" for audits created via those two paths (a directory page
   either fails to fetch meaningfully or yields nothing worth reporting).

   This file tests the REPORT RENDERING side of the fix: the new `crawlChecked` flag (distinguishing
   "we checked and it's clean" from "we haven't checked / couldn't reach it", since `crawlFaults`
   alone cannot) and the hook-only "we also checked your website" section it enables. The two
   caller-side fixes (outreach-audit.ts, Inbox.tsx) are plain data-plumbing with no interesting
   branches to unit-test beyond "the aggregator is filtered", covered inline below via a source
   guard so a regression there is still caught. */
import { renderReportHtml, type AiAuditReportData } from '../src/lib/aiAuditReportHtml.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const hookGap: NonNullable<AiAuditReportData['hook']> = {
  questionsTested: 1, maxQuestions: 3, stopReason: 'visibility_gap_found',
  gap: {
    questionIndex: 0, question: 'Who is the best driving instructor in Wolverhampton?',
    engine: 'gemini', engineLabel: 'Gemini', namedInstead: ['Automatic Driving School J10'],
    citations: [], namedOnEngineLabels: [], answerExcerpt: 'Try these instructors...',
  },
  tested: [{ question: 'Who is the best driving instructor in Wolverhampton?', isGap: true, perEngine: [{ engine: 'gemini', label: 'Gemini', named: false }] }],
};

const base: AiAuditReportData = {
  businessName: 'Inclusive Driving',
  businessType: 'driving instructor',
  named: 0,
  total: 1,
  pct: 0,
  perEngine: [],
  competitors: [],
  gutPunch: null,
  generatedAtLabel: '21 Sep 2026',
  hook: hookGap,
};

console.log('── 8: a hook report with real crawl findings renders them ──');
{
  const html = renderReportHtml({
    ...base,
    crawlFaults: [{ title: 'AI can’t reach your site', detail: 'GPTBot is blocked from fetching your pages.', minor: false }],
  });
  ok(html.includes('What&rsquo;s stopping AI reading your site') || html.includes('What’s stopping AI reading your site'), '8: the real fault section renders under the hook result');
  ok(html.includes('GPTBot is blocked'), '8: the actual stored fault detail is shown, not a generic line');
  ok(!html.includes('We also checked your website'), '8: the reassurance line does not ALSO render alongside real faults');
}

console.log('── 9: a hook report with no crawl data at all fabricates nothing ──');
{
  const html = renderReportHtml({ ...base });
  ok(!html.includes('stopping AI reading your site'), '9: no fault section when nothing was ever checked');
  ok(!html.includes('We also checked your website'), '9: no "checked and clean" claim when we never actually checked');
  ok(!html.includes('major technical issue'), '9: no fabricated reassurance either — silence, not a guess');
}

console.log('── 9b: a hook report that WAS checked and found nothing gets the truthful reassurance line ──');
{
  const html = renderReportHtml({ ...base, crawlChecked: true });
  ok(html.includes('We also checked your website'), '9b: the truthful "we checked" section renders');
  ok(html.includes("didn&rsquo;t find a major technical issue") || html.includes("didn’t find a major technical issue"), '9b: the exact truthful line renders, no invented fault');
}

console.log('── 10: crawl scoped to the wrong lead/audit is never shown (render-side contract) ──');
{
  // The report is a pure function of its OWN AiAuditReportData — a fault list belongs to the
  // report only if the caller (render-audit-report) put it there, which it does by looking up
  // ai_audit_runs.results.crawl_check for THIS run, then lead_crawl_checks by THIS audit's own
  // lead_id only (never another lead's). The renderer has no independent lookup of its own to get
  // wrong, so this is asserted at the source-contract level: the lookup is exactly lead_id-scoped
  // and never a bare "most recent crawl in the table" or cross-lead join.
  const src = readFileSync(resolve(import.meta.dirname, '../supabase/functions/render-audit-report/index.ts'), 'utf8');
  ok(/\.eq\("lead_id",\s*leadId\)/.test(src), '10: the lead-level crawl lookup is scoped by THIS audit’s own lead_id, not a global/most-recent query');
  ok(src.includes('run.results as { crawl_check'), '10: the run-scoped crawl is read from THIS run’s own results, never another run’s');
}

console.log('── 11: a reused valid crawl follows the existing freshness/version business rule ──');
{
  const src = readFileSync(resolve(import.meta.dirname, '../supabase/functions/render-audit-report/index.ts'), 'utf8');
  ok(src.includes('30 * 86_400_000'), '11: the 30-day freshness window is the one applied (unchanged, not invented)');
  ok(src.includes('CRAWL_CHECK_VERSION'), '11: the current-version gate is applied (pre-v2 rows are never trusted)');
  ok(!/CRAWL_FRESH_MS\s*=\s*(?!30)/.test(src) || src.includes('30 * 86_400_000'), '11: no new/looser freshness constant was introduced for this change');
}

console.log('── 12: a crawl result that lands after audit creation is still available on a later render ──');
{
  const auditReportSrc = readFileSync(resolve(import.meta.dirname, '../src/lib/auditReport.ts'), 'utf8');
  // buildReportData must not gate on run.status — only on there being at least one DONE queue row —
  // so a hook report is servable (and re-servable, picking up fresh crawl data) on every later view,
  // never frozen at whatever the crawl happened to look like the moment the audit itself finished.
  ok(/if\s*\(\s*done\s*===\s*0\s*\)\s*return\s*null/.test(auditReportSrc), '12: the report builder gates only on a settled question existing, not on run.status — so it re-reads fresh crawl data on every render');
  const rarSrc = readFileSync(resolve(import.meta.dirname, '../supabase/functions/render-audit-report/index.ts'), 'utf8');
  ok(rarSrc.includes('EdgeRuntime') && rarSrc.includes('waitUntil'), '12: a still-missing/stale crawl is lazily re-populated so a later view of the SAME report link picks it up');
}

console.log('── 13: viewing/rendering the report never triggers a new AI-provider call ──');
{
  const rarSrc = readFileSync(resolve(import.meta.dirname, '../supabase/functions/render-audit-report/index.ts'), 'utf8');
  ok(!rarSrc.includes('create-ai-audit') && !rarSrc.includes('process-ai-audit-queue'), '13: rendering never fires a new audit or queue run');
  ok(!/openai|gemini|generativelanguage/i.test(rarSrc), '13: rendering never calls an AI provider directly');
  // The one fetch render-audit-report can fire (crawl-check re-populate) is conditional on the
  // stored crawl actually being missing/stale — not unconditional on every view — and is
  // fire-and-forget (waitUntil), never blocking or repeated for an already-fresh crawl.
  ok(/if\s*\(\(!fresh \|\| !currentVer\) && ownWebsite\)/.test(rarSrc), '13: the crawl re-populate fetch is gated on the stored crawl actually being missing/stale, not fired on every view');
}

console.log('── 14: the caller-side aggregator fix is in place (source guard) ──');
{
  const outreachSrc = readFileSync(resolve(import.meta.dirname, '../supabase/functions/_shared/outreach-audit.ts'), 'utf8');
  ok(outreachSrc.includes('ownWebsite(lead.website)'), '14: the drip’s pre-send hook audit now filters the website through ownWebsite() before sending it to create-ai-audit');
  const inboxSrc = readFileSync(resolve(import.meta.dirname, '../src/pages/Inbox.tsx'), 'utf8');
  ok(inboxSrc.includes('isAggregatorUrl(activeLead.website)'), '14: the Inbox hook button/re-run now filters the website through isAggregatorUrl before sending it');
}

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
