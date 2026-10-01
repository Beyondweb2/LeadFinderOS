/* ============================================================
   THE yoursites.uk/r/<slug> PROFILE LISTINGS ARE RETIRED (2026-10-01, Paul).
   Run: npx tsx scripts/r-profile-retired.test.ts

   What this pins, so the feature cannot creep back and the one thing that still matters cannot be
   broken by the clean-up:
     1. the /r/[slug] Pages Function answers 410 + noindex for every URL and reads nothing;
     2. generate-report is a 410 stub: no model call, no insert;
     3. nothing calls generate-report (the queue's auto-report, AI Audit's "Generate listing");
     4. no screen links to yoursites.uk/r/ or shows the "listing" / "Credentials for listing" UI;
     5. ⛔ no code deletes or unpublishes business_reports rows, and render-audit-report STILL
        resolves the legacy name-plus-8-hex report slug through them (status 'published').
   Record: docs/r-profile-pages-audit.md.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
};

console.log('\n── 1. the page route is gone ──');
{
  const r = code('functions/r/[slug].ts');
  ok(/status:\s*410/.test(r), '/r/[slug] answers 410 Gone');
  ok(/"x-robots-tag":\s*"noindex, nofollow"/.test(r) && /name="robots" content="noindex, nofollow"/.test(r), '…with noindex, nofollow (header and meta)');
  ok(!/fetch\(|business_reports|SUPABASE|application\/ld\+json|canonical|og:/.test(r), '…and reads nothing: no fetch, no row, no schema, no canonical, no OG tags');
}

console.log('\n── 2. the generator is a stub ──');
{
  const g = code('supabase/functions/generate-report/index.ts');
  ok(/status:\s*410/.test(g) && /"retired"/.test(g), 'generate-report answers 410 retired');
  ok(!/openai|chat\/completions|\.insert\(|\.from\(|createClient/.test(g), '…with no model call, no client and no write');
  ok(/\[functions\.generate-report\]\nverify_jwt = false/.test(read('supabase/config.toml').replace(/\r\n/g, '\n')), 'its config.toml entry stays (a stray caller gets the 410, not a gateway error)');
}

console.log('\n── 3 + 4. nothing calls it, nothing shows it ──');
{
  const callers: string[] = []; const links: string[] = [];
  for (const rel of [...walk('src'), ...walk('supabase/functions'), ...walk('functions')]) {
    if (rel === 'supabase/functions/generate-report/index.ts') continue;
    const c = code(rel);
    if (/functions\/v1\/generate-report|invoke\(\s*['"]generate-report['"]/.test(c)) callers.push(rel);
    if (/yoursites\.uk\/r\//.test(c)) links.push(rel);
  }
  ok(callers.length === 0, `no code calls generate-report${callers.length ? ': ' + callers.join(', ') : ''}`);
  ok(links.length === 0, `no code links to yoursites.uk/r/${links.length ? ': ' + links.join(', ') : ''}`);
  const ai = code('src/pages/AiAudit.tsx');
  ok(!/Generate listing|View listing|Credentials for listing|business_reports/.test(ai), 'AI Audit has no listing items, no credentials-for-listing panel, no business_reports read');
  ok(!/report_slug/.test(code('src/components/audit/AuditPills.tsx')) && !/report_slug/.test(code('src/types/auditBook.ts')), 'the "report" (listing) pill and its field are gone');
}

console.log('\n── 5. the rows are kept, and the legacy report slug still resolves ──');
{
  const writers: string[] = [];
  for (const rel of [...walk('src'), ...walk('supabase/functions')]) {
    const c = code(rel);
    if (/from\(\s*["']business_reports["']\s*\)\s*\.(delete|update|upsert)\(/.test(c)) writers.push(rel);
  }
  ok(writers.length === 0, `no code deletes, updates or upserts business_reports${writers.length ? ': ' + writers.join(', ') : ''}`);
  const rar = code('supabase/functions/render-audit-report/index.ts');
  ok(/\.from\("business_reports"\)\s*\.select\("audit_id"\)\s*\.like\("slug", `%-\$\{code\}`\)\.eq\("status", "published"\)/.test(rar),
    'render-audit-report still maps a name-plus-8-hex slug to its audit through a published business_reports row');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
if (failures) process.exit(1);
