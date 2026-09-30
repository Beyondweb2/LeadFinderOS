/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SEARCH CONSOLE PORT (2026-09-30) — the audit's fixes, pinned so they cannot quietly regress.
   Run: npx tsx scripts/search-console-port.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolvePerformanceState } from '../src/lib/searchPerformance.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const mig = read('supabase/migrations/20261001160000_search_console.sql');
ok(!/create policy/i.test(mig), 'no RLS policy: a browser session can never write traffic rows or flip a connection to connected');
ok((mig.match(/enable row level security/g) ?? []).length === 3, 'RLS is on for all three tables');
ok(!/alter table public\.outreach_leads/.test(mig), 'no second domain column on outreach_leads (the domain lives on the connection row)');
ok(/revoke all on function public\.invoke_performance_sync\(\) from anon, authenticated/.test(mig), 'the cron invoker cannot be called with the public key');
ok(/grant execute on function public\.search_console_page_totals\(uuid, date, date\) to service_role;/.test(mig) && !/to authenticated, service_role/.test(mig), 'the SQL functions are service-role only');

const fn = read('supabase/functions/performance-sync/index.ts');
ok(/isInternalCall\(req\) && req\.headers\.get\("x-internal-job"\) === "1"/.test(fn) && /requireAdmin\(req, service\)/.test(fn), 'callers: the cron (constant-time secret + x-internal-job) or the admin — nobody else');
ok(!/SUPABASE_SERVICE_ROLE_KEY"\);\s*const authHeader/.test(fn) && !/\.limit\(MAX_CLIENTS_PER_RUN\)/.test(fn), 'no dead service-role bearer, no arbitrary first-10 clients');
ok(/admin_job_claim/.test(fn) && /isPaidLead\(l\) && !l\.is_archived && !l\.service_terminated_at/.test(fn), 'single-flight, and only live paying clients are synced');
ok(/status: "not_configured"/.test(fn), 'no Google credential → "not configured", nothing touched');

ok(resolvePerformanceState(null, 0) === 'not_connected' && resolvePerformanceState({ status: 'connected', gsc_property: 'sc-domain:x.co.uk' }, 0) === 'no_data', 'no connection → Not connected; connected with no rows → no data (never zero traffic)');
const overview = read('supabase/functions/_shared/admin-overview-load.ts');
ok(/\.\.\.\(state === "populated" \? \{/.test(overview) && /prevCovered \?/.test(overview), 'figures only when populated; "vs previous" only when stored data covers the previous window');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
