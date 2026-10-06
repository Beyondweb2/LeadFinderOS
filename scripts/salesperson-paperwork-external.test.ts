/* ============================================================
   SALESPERSON PAPERWORK IS HANDLED OUTSIDE LEADFINDEROS (Paul, 2026-10-05).
   The contractor agreement and the salesperson privacy notice never block Ready to Sell, and nothing a
   salesperson sees asks them to open, tick or sign one. The CLIENT Service Agreement v3 is untouched.
   🔴 SINCE 2026-10-06 (sales-team-today, Paul): the practical checklist no longer gates either — only genuine
   account restrictions (SELLING_GATE_KEYS: no sales role, login off, suspended, ended) stop selling, Find Leads
   included, server-side (migration 20261012120000_selling_gate_account_only.sql).
   Live behaviour: supabase/tests/ready-to-sell-paperwork.sql (rolled back).
   Run: npx tsx scripts/salesperson-paperwork-external.test.ts
   ============================================================ */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CHECKLIST_KEYS, SELLING_GATE_KEYS } from '../src/lib/salespersonOnboarding.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('── not a blocker ──');
ok(JSON.stringify([...SELLING_GATE_KEYS].sort()) === JSON.stringify(['ended', 'login', 'not_sales', 'suspended']),
  `Ready to Sell = exactly the account restrictions (${SELLING_GATE_KEYS.join(', ')})`);
ok(JSON.stringify([...CHECKLIST_KEYS].sort()) === JSON.stringify(['age_18', 'bank_details', 'contractor_status', 'login', 'right_to_work', 'start_date', 'team_guide', 'vat']),
  `the admin checklist = exactly the practical items, paperwork not among them (${CHECKLIST_KEYS.join(', ')})`);
/* The live definition = the NEWEST migration that redefines the function (found, not named). */
const definers = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((n) => n.endsWith('.sql'))
  .filter((n) => read(`supabase/migrations/${n}`).includes('create or replace function public.salesperson_onboarding_missing')).sort();
const mig = read(`supabase/migrations/${definers[definers.length - 1]}`);
const fn = code(mig.slice(mig.indexOf('create or replace function public.salesperson_onboarding_missing'), mig.indexOf('revoke all on function')).replace(/--[^\n]*/g, ''));
ok(!/'agreement'|'privacy_notice'|contractor_agreement|privacy_notice/.test(fn), 'the database rule checks neither the contractor agreement nor the privacy notice');
ok(!/tps|ctps/i.test(fn), 'TPS/CTPS is still not part of it (postponed)');

console.log('\n── no salesperson-facing signing UI ──');
const repFacing = ['src/components/NotReadyToSellBanner.tsx', 'src/pages/SalesDashboard.tsx', 'src/pages/Index.tsx', 'src/components/LeadDetailDialog.tsx', 'src/hooks/useMyReadiness.ts'];
for (const f of repFacing) {
  const t = code(read(f));
  ok(!/contractor agreement|privacy notice|sign (the|your) agreement|I agree/i.test(t), `${f}: no agreement / privacy notice wording, no "I agree"`);
}
const banner = read('src/components/NotReadyToSellBanner.tsx');
ok(/Your sales access is not active/.test(banner) && !/onboarding|Ready to Sell/i.test(code(banner)), 'the banner speaks of an account restriction, never of onboarding (2026-10-06)');
ok((code(banner).match(/<Button/g) ?? []).length === 0 && !/team guide/i.test(code(banner)), 'the banner has no buttons: nothing to sign, tick or acknowledge (2026-10-06)');
const rpc = read('supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql');
const grantsToReps = [...rpc.matchAll(/grant execute on function public\.([a-z_]+)\([^)]*\) to authenticated/g)].map((m) => m[1]);
ok(grantsToReps.length > 0 && !grantsToReps.some((g) => /agreement|privacy|notice|sign|document/.test(g)), `no function a salesperson can call signs or acknowledges paperwork (${grantsToReps.join(', ')})`);

console.log('\n── Find Leads stays gated on a genuine account restriction ──');
const search = read('supabase/functions/search-leads/index.ts');
ok(/guardAction\(serviceClient, userId, 'lead_search'/.test(search) && /if \(!guard\.ok\) return jsonResponse/.test(search), 'search-leads asks the usage guard (lead_search) and stops on a refusal');
const guard = read('supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql');
ok(/not_onboarded/.test(guard.slice(guard.indexOf('create or replace function public.guard_action'))), 'guard_action refuses a restricted salesperson (not_onboarded) — every guarded action, Find Leads included');
const index = read('src/pages/Index.tsx');
const hs = index.slice(index.indexOf('const handleSearch = useCallback'), index.indexOf('search(filters, false, false)'));
ok(/<NotReadyToSellBanner \/>/.test(index) && /if \(readiness\.gated && !readiness\.ready\)[\s\S]{0,200}return;/.test(hs) && /onSearch=\{handleSearch\}/.test(index),
  'Find Leads shows the banner, and the ONE search handler (Search button and Coverage) does not start a search for a not-ready rep');

console.log('\n── the CLIENT agreement is untouched ──');
const co = read('supabase/functions/findable-checkout/index.ts');
ok(/checkoutAgreementGate\(\{/.test(co) && /kind: "agreement_required"/.test(co), 'the client v3 agreement-before-payment gate is still in findable-checkout');
const newer = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((n) => n.slice(0, 14) >= '20261010140000');
ok(newer.every((n) => !/client_agreement|client_service|checkout/i.test(read(`supabase/migrations/${n}`).replace(/--[^\n]*/g, ''))), 'this change touches no client agreement / checkout object');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
