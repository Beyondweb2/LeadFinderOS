/* Tests for collectIssues' presentation fix (seo-scan-core.ts) — the "@graph bug" that was really
   a wording bug: per-page actor issues read as whole-site failures. With scope, the schema issue
   reconciles against the site-level truth and every partial issue carries "on N of M crawled
   pages". What counts as a finding / dedupe / severity is untouched.
   Run: npx tsx scripts/seo-scan-findings.test.ts */
import { collectIssues, type IssueScope } from '../supabase/functions/_shared/enrichment/seo-scan-core.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/** One crawled page carrying actor issues (the verified stored shape). */
const page = (issues: { message: string; fixHint?: string; estimatedImpact?: string; pagesAffected?: string[] }[]) => ({
  pageUrl: 'https://x/', audit: { issues: { structured: { warnings: issues } } },
});

// ── The exact Solene case: 3 pages crawled, schema on 2, ONE subpage raises the absolute claim. ──
const SOLENE_SCOPE: IssueScope = { totalPages: 3, schemaPages: 2, hasStructuredData: true };
{
  const pages = [
    page([{ message: 'No structured data found', fixHint: 'Add JSON-LD, Microdata or RDFa to improve SEO.' }]),
    page([{ message: '1 images without alt text', fixHint: 'Add descriptive alt attributes.', estimatedImpact: 'high' }]),
    page([]),
  ];
  const out = collectIssues(pages, 10, SOLENE_SCOPE);
  const schema = out.find((x) => /structured data/i.test(x.title))!;
  ok(schema.title === 'Structured data missing on 1 of 3 crawled pages (present on the others)',
    'the false whole-site schema claim is reconciled with the site-level truth');
  const alt = out.find((x) => /alt text/i.test(x.title))!;
  ok(alt.title === '1 images without alt text — on 1 of 3 crawled pages',
    'a one-page alt issue says its page scope');
  ok(alt.severity === 'high' && alt.detail.includes('alt attributes'), '  severity and detail untouched');
  ok(out.length === 2, '  nothing added or dropped — wording only');
}

// ── A site with genuinely NO structured data anywhere keeps the original wording. ──
{
  const pages = [page([{ message: 'No structured data found' }]), page([{ message: 'No structured data found' }])];
  const out = collectIssues(pages, 10, { totalPages: 2, schemaPages: 0, hasStructuredData: false });
  ok(out[0].title === 'No structured data found — on 2 of 2 crawled pages'.replace(' — on 2 of 2 crawled pages', ''),
    'no-schema-anywhere keeps the original wording (site-wide is TRUE, no suffix at full coverage)');
}

// ── An issue affecting EVERY crawled page gets no suffix (it IS site-wide). ──
{
  const pages = [page([{ message: 'Missing viewport tag' }]), page([{ message: 'Missing viewport tag' }])];
  const out = collectIssues(pages, 10, { totalPages: 2, schemaPages: 2, hasStructuredData: true });
  ok(out[0].title === 'Missing viewport tag', 'a genuinely site-wide issue keeps its plain title');
}

// ── Single-page crawls never gain a redundant "on 1 of 1" suffix. ──
{
  const out = collectIssues([page([{ message: 'Some page issue' }])], 10, { totalPages: 1, schemaPages: 1, hasStructuredData: true });
  ok(out[0].title === 'Some page issue', 'a 1-page crawl gets no scope suffix');
}

// ── No scope (legacy callers) → byte-identical old behaviour. ──
{
  const out = collectIssues([page([{ message: 'No structured data found' }])], 10);
  ok(out[0].title === 'No structured data found', 'without scope, titles are untouched (back-compat)');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f > 0) process.exit(1);
