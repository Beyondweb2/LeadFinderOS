/* ============================================================
   AUDIT-REPORT ORIGIN — one domain, enforced, because this exact class of bug has cost real
   prospects three times.

   Run: npx tsx scripts/report-origin.test.ts

   🔴 THE HISTORY THIS GUARDS AGAINST, all three of them the same shape — a report URL built from
   the wrong origin, shipped, and only noticed because someone happened to click it:
     · The "View online" footer inside EVERY report ever sent pointed at yoursites.uk/a/<slug>,
       a route that was never fronted. Dead in every document.
     · free-check-result built https://yoursites.uk/a/<auditId> and it REACHED A REAL PROSPECT.
     · 27 onboarding links went out on a preview domain because a CORS allowlist's first entry was
       read as the canonical public address (CLAUDE.md §12).
   Paul's instruction, 2026-09-09: "all audit reports should be from the findable.live domain."

   ⛔ WHAT THIS ASSERTS IS THE PROPERTY, NOT THE SPELLING OF ONE CONSTANT. Every origin constant a
   report URL can be built from must be findable.live, AND no source file may build a report URL on
   any other host in live code. Comments are stripped first — this file, and several others, discuss
   yoursites.uk at length precisely because it is the thing that went wrong, and a guard that fails
   on its own explanation gets deleted rather than fixed.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANONICAL = 'https://findable.live';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Strip // line comments and block comments so a cautionary note is never read as live code.
 *  Deliberately crude: it also blanks the inside of strings containing "//" (a URL's scheme is
 *  guarded against by requiring a preceding non-colon), which is acceptable — the cost is a
 *  missed detection in an odd string, never a false alarm on prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments, but not the "//" in "https://"
}

console.log('\n── EVERY REPORT-ORIGIN CONSTANT IS findable.live ──');

/* Each entry: the file, and the constant whose value becomes a report URL. Named individually
   rather than discovered, so DELETING one is a visible change to this list rather than a silently
   shrinking test. */
const ORIGIN_CONSTANTS: { file: string; name: string }[] = [
  { file: 'src/lib/findableOffer.ts', name: 'REPORT_PUBLIC_ORIGIN' },
  { file: 'src/lib/aiAuditReportHtml.ts', name: 'REPORT_SITE_URL' },
  { file: 'supabase/functions/render-audit-report/index.ts', name: 'REPORT_PUBLIC_ORIGIN' },
  { file: 'supabase/functions/_shared/audit-reply.ts', name: 'REPORT_SITE_ORIGIN' },
  { file: 'functions/a/[slug].ts', name: 'REPORT_PUBLIC_ORIGIN' },
];

for (const { file, name } of ORIGIN_CONSTANTS) {
  const src = stripComments(read(file));
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`));
  ok(!!m, `${file}: ${name} is declared`);
  if (m) ok(m[1] === CANONICAL, `${file}: ${name} === ${CANONICAL} (got ${m[1]})`);
}

console.log('\n── NO LIVE CODE BUILDS A REPORT URL ON ANOTHER HOST ──');

/* Walk every source file we ship and look for a RETIRED PRODUCT DOMAIN in CODE. A future wrong
   host is caught by the constant checks above, which are the exhaustive half of this test.
   ⚠️ pages.dev is deliberately NOT in this list, and that is a scoping decision rather than an
   oversight. Two legitimate uses exist — SEOHead's BASE_URL (the operator app really does live at
   leadfinderos.pages.dev) and findable-checkout's CORS allowlist — so including it would make this
   test fail on correct code and train the next person to widen the exemption list instead of
   reading it. "Is a preview domain leaking into a customer-facing URL" is a different question
   with its own guard: resolveSiteOrigin + scripts/site-origin.test.ts. */
const RETIRED_HOSTS = ['yoursites.uk', 'bookmybarber.uk'];
const SCAN_DIRS = ['src', 'supabase/functions', 'functions'];
const SCAN_EXT = new Set(['.ts', '.tsx']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (SCAN_EXT.has(path.extname(entry.name))) out.push(rel);
  }
  return out;
}

const offenders: string[] = [];
for (const dir of SCAN_DIRS) {
  for (const rel of walk(dir)) {
    /* This test file itself names the retired hosts on purpose. */
    if (rel.endsWith('scripts/report-origin.test.ts')) continue;
    const code = stripComments(read(rel));
    for (const host of RETIRED_HOSTS) {
      if (code.includes(host)) offenders.push(`${rel} → ${host}`);
    }
  }
}
/* ⚠️ KNOWN AND ACCEPTED, each with a reason — an unexplained entry here is a bug, not a fixture.
   Anything NOT on this list fails the test. */
const ACCEPTED = new Set<string>([
  /* The LLM business-PROFILE pages (business_reports, generate-report). A different document from
     the audit report and still served from this repo's own Pages deploy; retiring or moving it is
     an open decision, flagged to Paul 2026-09-09. Listed so it cannot be forgotten. */
  'functions/r/[slug].ts → yoursites.uk',
  'supabase/functions/generate-report/index.ts → yoursites.uk',
  'src/pages/AiAudit.tsx → yoursites.uk',
  /* Barber-era claim links in the message queues. Inert (no lead carries a share_token any more)
     and left in place rather than given surgery in the same pass as the product deletion. */
  'supabase/functions/process-whatsapp-queue/index.ts → yoursites.uk',
  'supabase/functions/send-whatsapp-message/index.ts → yoursites.uk',
  /* Synthetic phone-signup addresses (@claimed.yoursites.uk) the webhook still has to RECOGNISE
     to avoid emailing a dead inbox — a string it reads, never a URL it builds. */
  'supabase/functions/stripe-webhook/index.ts → yoursites.uk',
  'supabase/functions/stripe-webhook/index.ts → bookmybarber.uk',
]);

for (const o of offenders) {
  if (!ACCEPTED.has(o)) ok(false, `unexpected retired host in live code: ${o}`);
}
ok(
  offenders.every((o) => ACCEPTED.has(o)),
  `no unexplained retired host in live code (${offenders.length} known, all accounted for)`,
);

console.log('\n── THE RETIRED /a/ ROUTE REDIRECTS, IT DOES NOT SERVE ──');
{
  const src = read('functions/a/[slug].ts');
  const code = stripComments(src);
  ok(/status:\s*301/.test(code), 'functions/a/[slug].ts answers 301');
  ok(code.includes('/report/'), 'functions/a/[slug].ts sends the visitor to /report/');
  ok(
    !/fetch\s*\(/.test(code),
    'functions/a/[slug].ts no longer PROXIES — a proxy is what served a report at the old domain',
  );
  /* ⛔ The identifier must travel through untouched: render-audit-report accepts a UUID audit id
     OR a name-plus-8-hex slug, and every one of the 64 already-sent links is the UUID form. A
     redirect that dropped or rewrote it would 404 links that are in people's phones. */
  ok(
    /params\.slug/.test(code) && /encodeURIComponent\(\s*slug\s*\)/.test(code),
    'functions/a/[slug].ts forwards the identifier verbatim (encoded once)',
  );
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
if (failures) throw new Error(`${failures} failures`);
