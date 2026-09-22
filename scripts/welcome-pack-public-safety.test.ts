/* ============================================================
   THE PUBLIC WELCOME PACK ROUTE LEAKS NOTHING — a SOURCE-level guard on the one document a paid
   client can open without logging in.

   Why source-level and not a rendered-output check: the guarantee is STRUCTURAL. The renderer reads
   every table through an explicit column allowlist, so an operator-only column is never fetched and
   there is no variable holding one for a future edit to print. A test that only grepped the output
   would pass on a pack whose operator data simply happened to be blank that day.

   Run: npx tsx scripts/welcome-pack-public-safety.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { LEAD_CLIENT_COLUMNS, ONBOARDING_CLIENT_COLUMNS } from '../supabase/functions/_shared/welcome-pack-render.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const renderer = read('supabase/functions/_shared/welcome-pack-render.ts');
const fn = read('supabase/functions/render-welcome-pack/index.ts');
const packHtml = read('src/lib/welcomePackHtml.ts');

console.log('\n── 6a. NO OPERATOR-ONLY COLUMN IS EVEN FETCHED ──');
/* The columns that must never reach a client document. website_build is the new one; the rest are
   the operator fields the hub reads and the pack must not. */
const FORBIDDEN = [
  'website_build', 'notes', 'delivery_notes', 'project_overview', 'project_status',
  'delivery_ref', 'delivery_checklist', 'next_action', 'checkin_notes', 'user_id',
  'must_not_say', 'gbp_manager_email', 'baseline_questions',
];
const leadCols = LEAD_CLIENT_COLUMNS.split(',').map((c) => c.trim());
const obCols = ONBOARDING_CLIENT_COLUMNS.split(',').map((c) => c.trim());
for (const col of FORBIDDEN) {
  ok(!leadCols.includes(col), `lead allowlist excludes "${col}"`);
  ok(!obCols.includes(col), `onboarding allowlist excludes "${col}"`);
}

console.log('\n── 6b. THE ALLOWLISTS ARE WHAT THE QUERIES ACTUALLY USE ──');
ok(/\.select\(LEAD_CLIENT_COLUMNS\)/.test(renderer), 'the lead read uses LEAD_CLIENT_COLUMNS');
ok(/\.select\(ONBOARDING_CLIENT_COLUMNS\)/.test(renderer), 'the onboarding read uses ONBOARDING_CLIENT_COLUMNS');
ok(!/select\(\s*["'`]\*/.test(renderer), 'nothing is read with select("*")');

console.log('\n── 6c. THE INTERNAL / WINNABILITY VIEW CANNOT REACH IT ──');
ok(/report\.internal = false/.test(renderer), 'the renderer forces report.internal = false');
ok(/hidePitch: true/.test(packHtml), 'buildWelcomePackHtml forces hidePitch');
ok(!/internal:\s*true/.test(renderer) && !/internal:\s*true/.test(fn),
  'neither the renderer nor the public function ever sets internal:true');

console.log('\n── 6d. THE PUBLIC ROUTE IS READ-ONLY ──');
for (const [label, src] of [['renderer', renderer], ['edge function', fn]] as const) {
  ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(src),
    `${label} performs no insert/update/upsert/delete/rpc`);
}

console.log('\n── 6e. IT REFUSES ANYTHING THAT IS NOT A CLAIMED PAID BASELINE ──');
ok(/welcomePackReadiness\(/.test(renderer), 'it runs the SAME readiness rule the hub shows');
ok(/baseline_audit_id/.test(renderer), 'it checks the lead claims this audit as its baseline');
ok(/is_market/.test(renderer), 'a market audit is refused');
/* One refusal page for every miss — a distinguishable refusal would tell an outsider which codes
   exist. The function has exactly one unavailable() body. */
ok((fn.match(/function unavailable\(/g) ?? []).length === 1, 'one refusal page, used for every miss');

console.log('\n── 6f. NOINDEX, ON THE ROUTE AND IN THE DOCUMENT ──');
ok(/x-robots-tag/.test(fn) && /noindex/.test(fn), 'the response carries a noindex robots header');
ok(/robots["'][^>]*noindex|name="robots" content="noindex/.test(packHtml), 'the document carries its own robots meta');

console.log('\n── 6g. ONE BUILDER FOR BOTH DELIVERIES ──');
const hub = read('supabase/functions/paid-client-hub/index.ts');
ok(/renderWelcomePack\(/.test(hub), 'the operator download calls the SAME renderWelcomePack');
ok(/renderWelcomePack\(/.test(fn), 'the public route calls renderWelcomePack');
ok((renderer.match(/buildWelcomePackHtml\(/g) ?? []).length === 1,
  'buildWelcomePackHtml is called in exactly one place, so the two deliveries cannot drift');

console.log('\n── 6h. THE CLIENT-SAFE FACTS SHAPE HAS NO OPERATOR FIELD ──');
const factsShape = packHtml.slice(packHtml.indexOf('export interface WelcomePackFacts'));
const factsBody = factsShape.slice(0, factsShape.indexOf('}'));
for (const col of FORBIDDEN) {
  ok(!factsBody.includes(col), `WelcomePackFacts has no "${col}" field`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
