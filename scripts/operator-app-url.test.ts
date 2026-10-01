/* ============================================================
   OPERATOR-APP URL — one address, written once (2026-10-01).

   Run: npx tsx scripts/operator-app-url.test.ts

   🔴 WHY. Before the move to app.leadfinderos.com the app's address was typed out in four places
   and they had already drifted: the security email and the team invite links named
   leadfinderos-next.pages.dev, while SEOHead's canonical named leadfinderos.pages.dev — a stale,
   disconnected project. The TEAM_APP_URL secret that was meant to override the invite fallback had
   never been set. Nothing failed; the links just went to the wrong host.

   ⛔ WHAT THIS ASSERTS:
     1. the ONE constant (src/config/operatorApp.ts) is https://app.leadfinderos.com;
     2. no live code (comments stripped) names a pages.dev host of THIS app as a string;
     3. no live code other than the constant spells out app.leadfinderos.com;
     4. each consumer reaches the constant: the security email, the team invite/new-link URL,
        SEOHead's canonical, verify-live;
     5. SEOHead always says noindex, and public/_headers says it on every response.
   The client-site preview tooling (*.pages.dev for CLIENT projects) is a different thing and is
   untouched — only this app's own two pages.dev hosts are matched.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { OPERATOR_APP_URL, operatorAppUrl } from '../src/config/operatorApp.ts';
import { SECURITY_SCREEN_URL, alertEmail } from '../src/lib/securityAlerts.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANONICAL = 'https://app.leadfinderos.com';
let failures = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Same crude stripper as report-origin.test.ts: a cautionary comment is never read as code. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

console.log('\n── THE ONE CONSTANT ──');
ok(OPERATOR_APP_URL === CANONICAL, `OPERATOR_APP_URL === ${CANONICAL} (got ${OPERATOR_APP_URL})`);
ok(!OPERATOR_APP_URL.endsWith('/'), 'no trailing slash');
ok(operatorAppUrl('/team') === `${CANONICAL}/team`, 'operatorAppUrl joins a path');
ok(!/^\s*import\s/m.test(read('src/config/operatorApp.ts')), 'the constant file imports nothing (safe in every runtime)');

console.log('\n── NO LIVE CODE NAMES THE APP ON pages.dev, NO SECOND COPY OF THE ADDRESS ──');
const LEGACY = /leadfinderos(-next)?\.pages\.dev/;
const SCAN_DIRS = ['src', 'supabase/functions', 'functions', 'scripts'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.mjs', '.js']);
const walk = (dir: string, out: string[] = []): string[] => {
  if (!fs.existsSync(path.join(ROOT, dir))) return out;
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (SCAN_EXT.has(path.extname(e.name))) out.push(rel);
  }
  return out;
};
const legacyHits: string[] = [];
const copies: string[] = [];
for (const dir of SCAN_DIRS) {
  for (const rel of walk(dir)) {
    /* Scratch scripts (scripts/_*) are never committed; tests may name the address to assert on it. */
    if (/^scripts\/_/.test(rel) || /\.test\.ts$/.test(rel)) continue;
    const code = stripComments(read(rel));
    if (LEGACY.test(code)) legacyHits.push(rel);
    if (rel !== 'src/config/operatorApp.ts' && code.includes('app.leadfinderos.com')) copies.push(rel);
  }
}
ok(legacyHits.length === 0, `no live code names leadfinderos(-next).pages.dev${legacyHits.length ? ': ' + legacyHits.join(', ') : ''}`);
ok(copies.length === 0, `app.leadfinderos.com is written only in src/config/operatorApp.ts${copies.length ? ' — also in: ' + copies.join(', ') : ''}`);

console.log('\n── EVERY CONSUMER REACHES THE CONSTANT ──');
ok(SECURITY_SCREEN_URL === `${CANONICAL}/admin/api-usage`, 'security screen link is the canonical app');
{
  const mail = alertEmail([{ kind: 'spend_cap', severity: 'restricted', created_at: '2026-10-01T10:00:00Z', detail: {} }], '2026-10-01T10:01:00Z');
  const text = mail.lines.join('\n');
  ok(text.includes(`${CANONICAL}/admin/api-usage`) && !/pages\.dev/.test(text), 'the security alert EMAIL links to the canonical app, never pages.dev');
}
{
  const au = stripComments(read('supabase/functions/admin-users/index.ts'));
  ok(/import\s*\{\s*OPERATOR_APP_URL\s*\}\s*from\s*'\.\.\/\.\.\/\.\.\/src\/config\/operatorApp\.ts'/.test(au), 'admin-users imports OPERATOR_APP_URL (relative, explicit .ts)');
  ok(/Deno\.env\.get\('TEAM_APP_URL'\)\?\.trim\(\)\s*\|\|\s*OPERATOR_APP_URL/.test(au), 'team links: TEAM_APP_URL secret, else the constant');
  ok(/SET_PASSWORD_URL\s*=\s*`\$\{TEAM_APP_URL\}\/set-password`/.test(au), 'invite + new-link redirect is <app>/set-password');
  ok((au.match(/redirectTo:\s*SET_PASSWORD_URL/g) ?? []).length === 2, 'both team_invite and team_new_link use it');
}
{
  const seo = stripComments(read('src/components/SEOHead.tsx'));
  ok(/from '@\/config\/operatorApp'/.test(seo) && /\$\{OPERATOR_APP_URL\}\$\{canonical\}/.test(seo), 'SEOHead canonical/og:url is built from OPERATOR_APP_URL');
  ok(/<meta name="robots" content="noindex,nofollow" \/>/.test(seo) && !/\{noindex &&/.test(seo), 'SEOHead ALWAYS emits noindex (not left to the caller)');
}
{
  const vl = read('scripts/verify-live.mjs');
  ok(/import \{ OPERATOR_APP_URL \} from '\.\.\/src\/config\/operatorApp\.ts'/.test(vl) && /const SPA = OPERATOR_APP_URL;/.test(vl), 'verify-live checks the canonical app');
}
{
  const h = read('public/_headers').replace(/\r\n/g, '\n');
  ok(/^\/\*\n\s+X-Robots-Tag: noindex, nofollow$/m.test(h), 'public/_headers: X-Robots-Tag noindex on every path');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
if (failures) process.exit(1);
