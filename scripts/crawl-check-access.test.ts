/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CRAWL-CHECK: A REP'S IDS MUST BELONG TO THE REP'S LEAD (2026-10-04, pre-sales certification
   M-006 / E-06, and the off-boarding half of M-054 / E-09; docs/pre-sales-certification/
   fixes-01-security-inbound.md).

   crawl-check proved the rep works lead X, then trusted `job_id` (read ANY lead's crawl result) and
   `run_id` (write the rep's crawl into ANY audit run — a paying client's baseline report included).
   The rule (src/lib/crawlAccess.ts), driven on every arrival:
     · own lead + own job → allowed;   · own lead + another lead's job → refused;
     · own lead + a job we cannot place (missing / no lead) → refused;
     · any run_id from a salesperson → refused (only the audit pipeline files into a run);
     · neither → allowed.
   And the wiring in crawl-check: the shared actor check (a signed-out session or a removed role is
   refused on the next call), the lead check BEFORE the id check, both BEFORE the status read and
   the run write; another rep's lead and a client (Paid Client) lead are still refused.
   Run: npx tsx scripts/crawl-check-access.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { salesCrawlIdsRefusal } from '../src/lib/crawlAccess.ts';
import { canWorkLead, isClientLead, pickRole } from '../src/lib/roleRules.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const OWN = 'lead-own';
console.log('── the id rule ──');
{
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: null, jobLeadId: null, runId: undefined }) === null, 'own lead, no ids → allowed');
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: 'job-1', jobLeadId: OWN, runId: null }) === null, 'own lead + own job → allowed');
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: 'job-2', jobLeadId: 'lead-other', runId: null }) === 'job_not_your_lead', 'own lead + ANOTHER lead\'s job → refused');
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: 'job-x', jobLeadId: null, runId: null }) === 'job_not_your_lead', 'own lead + a job that does not exist / has no lead → refused');
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: 'job-x', jobLeadId: undefined, runId: null }) === 'job_not_your_lead', '…undefined job lead → refused (absent is never a match)');
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: '  ', jobLeadId: null, runId: null }) === null, 'a blank job id is no job id');
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: null, jobLeadId: null, runId: 'run-1' }) === 'run_id_not_allowed', 'any run_id → refused (an unrelated run, a client baseline run)');
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: 'job-1', jobLeadId: OWN, runId: 'run-1' }) === 'run_id_not_allowed', 'own job + a run_id → still refused');
  ok(salesCrawlIdsRefusal({ leadId: OWN, jobId: null, jobLeadId: null, runId: 123 }) === 'run_id_not_allowed', 'a non-string run_id → refused, not ignored');
}

console.log('\n── the lead rule it sits behind (unchanged, re-proved) ──');
{
  const rep = { id: 'rep-a', role: 'sales' as const };
  ok(canWorkLead(rep, { assigned_to_user_id: 'rep-a' }), 'own assigned lead → workable');
  ok(!canWorkLead(rep, { assigned_to_user_id: 'rep-b' }), 'another rep\'s lead → refused');
  ok(!canWorkLead(rep, { assigned_to_user_id: null }), 'an unassigned (Paul\'s) lead → refused');
  ok(isClientLead({ amount_paid: 99, status: 'payment_received' }) && isClientLead({ amount_paid: null, status: 'in_delivery' }), 'a Paid Client lead is a client → crawl-check refuses it for a rep');
  ok(pickRole([]) === null && pickRole(null) === null && pickRole([{ role: 'something' }]) === null, 'no role row (Team → Disable removes it) → no role → refused');
}

console.log('\n── wiring in crawl-check ──');
{
  const src = read('supabase/functions/crawl-check/index.ts');
  ok(!/getClaims\(/.test(src), 'no local getClaims token check (a signed-out session kept working until expiry)');
  ok(/const who = await resolveActor\(req, service\);/.test(src) && /if \(!who\.ok\) return json\(refusalBody\(who\), who\.status\);/.test(src),
    'the shared actor check: revoked session → 401, no role → 403, auth outage → 503');
  const salesAt = src.indexOf('if (role === "sales") {');
  const leadCheck = src.indexOf('return json({ ok: false, error: "not_your_lead" }, 403);');
  const idCheck = src.indexOf('salesCrawlIdsRefusal({');
  const statusAt = src.indexOf('if (body?.action === "status") {');
  const runWrite = src.indexOf('if (runId) {');
  ok(salesAt > 0 && salesAt < leadCheck && leadCheck < idCheck, 'the lead check runs first, then the id check, inside the sales branch');
  ok(idCheck < statusAt, 'the id check runs BEFORE the status read (no foreign job result is ever read)');
  ok(idCheck < runWrite, '…and before the run write (no crawl is ever filed into a foreign run)');
  ok(/salesCrawlIdsRefusal\(\{ leadId: wl\.id as string, jobId: jobIdIn \|\| null, jobLeadId, runId: body\?\.run_id \?\? null \}\)/.test(src),
    'the job is judged against the lead that was just checked (wl.id), the run id is passed through untouched');
  ok(/if \(jrErr\) return json\(\{ ok: false, error: "lookup_failed" \}, 503\);/.test(src), 'a failed job lookup refuses (fails closed)');
  ok(/if \(body\?\.url \|\| body\?\.audit_id\) return json\(\{ ok: false, error: "lead_website_only"/.test(src), 'a rep still cannot pass a url or an audit id');
  ok(/import \{ salesCrawlIdsRefusal \} from "\.\.\/\.\.\/\.\.\/src\/lib\/crawlAccess\.ts";/.test(src), 'relative .ts import (edge-safe)');
  ok(/const internal = req\.headers\.get\("x-internal-job"\) === "1"/.test(src), 'the internal pipeline path (CRON_SECRET) is unchanged — it still files crawls into runs');
}

console.log(`\n${f === 0 ? 'ALL PASS' : `${f} FAILED`}`);
if (f) process.exit(1);
