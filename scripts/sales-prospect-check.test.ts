/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "CHECK BEFORE CALLING" — the salesperson's bulk pre-call check (fix/07-sales-bulk-audit, 2026-10-04).
   docs/pre-sales-certification/fixes-07-sales-bulk-audit.md.

   THE REAL ENGINE (supabase/functions/_shared/sales-check.ts) against an in-memory database
   (scripts/fake-supabase.ts) with fake providers: create-ai-audit, crawl-check, the usage guard and the
   prospecting pool are stubs that RECORD every call, so "nothing was spent" and "nothing was sent" are
   counted, not assumed. Plus the pure rules (src/lib/salesCheck.ts), the import-closure sweep (no sender
   reachable), and the wiring of the function, the migration and the screens.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { FakeDb } from './fake-supabase.ts';
import {
  advance, auditRequestBody, batchView, cancelBatch, startBatch, adminOverview, type SalesCheckDeps, type StartAuditResult,
} from '../supabase/functions/_shared/sales-check.ts';
import {
  SALES_CHECK_BATCH_MAX, SALES_CHECK_AUDIT_REUSE_DAYS, SALES_CHECK_REFRESH_MIN_DAYS, SALES_CHECK_DEFAULT_PER_REP_PER_DAY,
  SALES_CHECK_AUDIT_WAIT_MAX_MS, SALES_CHECK_STARTING_STALE_MS, normalizeLeadIds, leadEligibility, planItem, runOutcome,
  startRefusalReason, guardRefusalReason, perRepDailyAllowance, batchStatusFor, readyItems, itemCounts,
  REASON_TEXT, checkedAgo,
} from '../src/lib/salesCheck.ts';
import { CLIENT_STATUSES } from '../src/lib/roleRules.ts';
import { DEFAULT_PROTECTION_LIMITS, GUARD_ACTIONS, validateLimits, withDefaultActions } from '../src/lib/protectionLimits.ts';
import { budgetDecision, budgetPoolForPurpose, POOL_DAILY_CAP_USD, APIFY_RESERVE_PCT } from '../src/lib/auditBudget.ts';
import { rollingSpendUsd } from '../supabase/functions/_shared/enrichment/runner.ts';
import { buildColdCallPlaybook, callCardAudit, STRONG_VISIBILITY_HEADLINE, type PlaybookInput } from '../src/lib/coldCallPlaybook.ts';
import { buildReportData } from '../src/lib/auditReport.ts';
import { initialHookStateV2, scoreHookRun } from '../src/lib/hookScore.ts';
import { sixResultHookForbidsAbsenceCopy } from '../supabase/functions/_shared/audit-reply.ts';
import { leadPermissions, maySetStatus } from '../src/lib/access.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  ✓ ${m}`); else { f++; console.log(`  ✗ FAIL ${m}`); } };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-05T09:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

/* ── people ── */
const OWNER = '00000000-0000-4000-8000-0000000000aa'; // the data account (book owner)
const PAUL = '00000000-0000-4000-8000-0000000000ad';  // admin
const REP_A = '00000000-0000-4000-8000-00000000000a';
const REP_B = '00000000-0000-4000-8000-00000000000b';
const A = { id: REP_A, role: 'sales' };
const B = { id: REP_B, role: 'sales' };

let seq = 0;
const uid = () => `11111111-1111-4111-8111-${String(++seq).padStart(12, '0')}`;

interface World {
  db: FakeDb; clock: { now: number };
  calls: { start: Record<string, unknown>[]; crawl: Array<{ leadId: string; url: string }>; guard: Array<{ actor: string; lead: string }> };
  cfg: { suppressed: Set<string>; townGated: Set<string>; guardRefuse: string | null; pool: { poolSpentUsd: number; apify: { usedUsd: number; capUsd: number } | null } | null; startFail: Map<string, StartAuditResult>; startThrows: Set<string> };
  deps: SalesCheckDeps;
}

function lead(over: Record<string, unknown> = {}) {
  return {
    id: uid(), user_id: OWNER, assigned_to_user_id: REP_A, amount_paid: null, status: 'not_contacted', is_archived: false,
    business_name: 'ZZ QA Brookfoot Plumbing', search_keyword: 'plumber', category: null, search_location: 'Halifax', address: null,
    derived_town: 'Halifax', town_fetch_note: null, country: 'UK', website: 'https://brookfoot-qa.example', phone: '07700 900611', email: null,
    services_included: ['Boiler repair'], service_areas: null, ...over,
  };
}

function world(): World {
  const db = new FakeDb();
  db.unique.sales_check_batches = [['actor_user_id', 'client_request_id']];
  db.unique.sales_check_items = [['batch_id', 'lead_id']];
  db.partialUnique.sales_check_batches = [{ cols: ['actor_user_id'], where: (r) => r.status === 'active' }];
  db.table('protection_settings').push({ id: 1, mode: 'running', limits: DEFAULT_PROTECTION_LIMITS });
  db.table('whatsapp_outreach_state').push({ id: 1, audit_complete_template: null });
  const clock = { now: T0 };
  const calls: World['calls'] = { start: [], crawl: [], guard: [] };
  const cfg: World['cfg'] = { suppressed: new Set(), townGated: new Set(), guardRefuse: null, pool: { poolSpentUsd: 1, apify: { usedUsd: 30, capUsd: 100 } }, startFail: new Map(), startThrows: new Set() };
  const deps: SalesCheckDeps = {
    service: db, now: () => clock.now, estUsd: 0.0331, questionCount: 3,
    suppressed: async (l) => cfg.suppressed.has(l.id),
    townGated: (l) => cfg.townGated.has(l.id),
    guard: async (actor, leadId) => { calls.guard.push({ actor, lead: leadId }); return cfg.guardRefuse ? { ok: false, reason: cfg.guardRefuse } : { ok: true }; },
    prospecting: async () => cfg.pool,
    startAudit: async (body) => {
      calls.start.push(body);
      const lid = String(body.lead_id);
      if (cfg.startThrows.has(lid)) throw new Error('network');
      const fail = cfg.startFail.get(lid);
      if (fail) return fail;
      const auditId = uid(), runId = uid();
      db.table('ai_audits').push({ id: auditId, lead_id: lid, user_id: body.user_id, created_at: iso(clock.now), audit_purpose: 'audit', baseline_target_runs: null, is_measurement: false, baseline_contract: null });
      db.table('ai_audit_runs').push({ id: runId, audit_id: auditId, status: 'pending', run_number: 1, created_at: iso(clock.now), actor_cost_usd: null });
      return { ok: true, status: 200, audit_id: auditId, run_id: runId };
    },
    runCrawl: async (leadId, url) => {
      calls.crawl.push({ leadId, url });
      db.table('lead_crawl_checks').push({ lead_id: leadId, created_at: iso(clock.now), result: { version: 2, evidenceVersion: 1, signals: { fetchFailed: false } } });
      return { ok: true };
    },
  };
  return { db, clock, calls, cfg, deps };
}
function addLead(w: World, over: Record<string, unknown> = {}) { const l = lead(over); w.db.table('outreach_leads').push(l); return l; }
/** An existing audit + run on a lead, `ageDays` old. */
function addAudit(w: World, leadId: string, ageDays: number, status = 'complete', purpose: string | null = 'audit') {
  const auditId = uid(), runId = uid(), at = iso(w.clock.now - ageDays * DAY);
  w.db.table('ai_audits').push({ id: auditId, lead_id: leadId, user_id: OWNER, created_at: at, audit_purpose: purpose, baseline_target_runs: null, is_measurement: false, baseline_contract: null });
  w.db.table('ai_audit_runs').push({ id: runId, audit_id: auditId, status, run_number: 1, created_at: at, actor_cost_usd: 0.031 });
  return { auditId, runId };
}
function addCrawl(w: World, leadId: string, ageDays: number, evidence = true) {
  w.db.table('lead_crawl_checks').push({ lead_id: leadId, created_at: iso(w.clock.now - ageDays * DAY), result: { version: 2, evidenceVersion: evidence ? 1 : 0, signals: { fetchFailed: false } } });
}
let rid = 0;
const req = () => `req-${String(++rid).padStart(6, '0')}`;
async function run(w: World, actor: typeof A, leadIds: string[], refresh = false) {
  const out = await startBatch(w.deps, actor, { lead_ids: leadIds, client_request_id: req(), refresh });
  if (out.status === 200) await advance(w.deps, actor);
  return out;
}
const items = (w: World, batchId?: string) => w.db.table('sales_check_items').filter((i) => !batchId || i.batch_id === batchId);
const itemFor = (w: World, leadId: string) => w.db.table('sales_check_items').filter((i) => i.lead_id === leadId).slice(-1)[0];
const setRun = (w: World, runId: unknown, status: string) => { const r = w.db.table('ai_audit_runs').find((x) => x.id === runId); if (r) r.status = status; };

/* ═══ 1. The pure rules ═════════════════════════════════════════════════════════════════════════ */
console.log('── the rules ──');
{
  const n = normalizeLeadIds([...Array(25)].map(() => '22222222-2222-4222-8222-000000000001').concat(['x', 7 as unknown as string]));
  ok(n.ok && n.ids.length === 1 && n.duplicates === 24 && n.invalid === 2, 'duplicate lead ids collapse to one; junk is counted, never sent on');
  const many = normalizeLeadIds([...Array(SALES_CHECK_BATCH_MAX + 1)].map((_, i) => `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`));
  ok(!many.ok && many.error === 'too_many' && many.count === SALES_CHECK_BATCH_MAX + 1, 'over the batch maximum is REFUSED (counted after de-duplication), never sliced');
  ok(!normalizeLeadIds([]).ok && !normalizeLeadIds(null).ok, 'no leads → refused');
  ok(SALES_CHECK_BATCH_MAX === 20, 'the launch batch maximum is 20 (brief)');
  ok(SALES_CHECK_DEFAULT_PER_REP_PER_DAY === DEFAULT_PROTECTION_LIMITS.actions.sales_check.per_day && SALES_CHECK_DEFAULT_PER_REP_PER_DAY > 0, 'the per-rep allowance lives once (protectionLimits sales_check.per_day)');
  ok(SALES_CHECK_DEFAULT_PER_REP_PER_DAY === 30, 'the launch allowance is 30 fresh checks per rep per day (Paul, 2026-10-05)');
  ok(SALES_CHECK_BATCH_MAX === 20 && SALES_CHECK_DEFAULT_PER_REP_PER_DAY > SALES_CHECK_BATCH_MAX, '…one full batch plus a partial second; the per-batch maximum stays 20');
  ok(perRepDailyAllowance(null) === SALES_CHECK_DEFAULT_PER_REP_PER_DAY && perRepDailyAllowance({ actions: { sales_check: { per_day: 'x' } } }) === SALES_CHECK_DEFAULT_PER_REP_PER_DAY, 'absent / malformed allowance → the default, never unlimited');
  ok(perRepDailyAllowance({ actions: { sales_check: { per_day: 0 } } }) === 0, 'Paul can set the allowance to 0 (switch off fresh checks)');
  ok([...CLIENT_STATUSES].every((s) => leadEligibility(REP_A, { id: 'x', assigned_to_user_id: REP_A, status: s, business_name: 'n', search_keyword: 't', derived_town: 'x' }).ok === false), 'every client status is refused (held equal to roleRules CLIENT_STATUSES)');
  // Privacy order: another rep's archived client answers "not yours", never "archived" or "client".
  const other = { id: 'x', assigned_to_user_id: REP_B, is_archived: true, amount_paid: 99, business_name: 'n', search_keyword: 't', derived_town: 'x' };
  const e = leadEligibility(REP_A, other);
  ok(!e.ok && e.reason === 'not_yours', "another rep's archived client → 'not yours' (no state of another person's lead is told)");
  ok((leadEligibility(REP_A, null) as { reason?: string }).reason === 'not_yours', 'a missing lead → the same "not yours" (no existence oracle)');
  ok((leadEligibility(REP_A, { id: 'x', user_id: REP_A, assigned_to_user_id: null, business_name: 'n', search_keyword: 't', derived_town: 'x' }) as { reason?: string }).reason === 'not_yours', 'ownership is assigned_to_user_id — never outreach_leads.user_id');
  ok((leadEligibility(REP_A, { id: 'x', assigned_to_user_id: REP_A, business_name: 'n', search_keyword: '', category: '', derived_town: 'x' }) as { reason?: string }).reason === 'missing_trade', 'no trade → refused with a reason');
  ok((leadEligibility(REP_A, { id: 'x', assigned_to_user_id: REP_A, status: 'not_interested', business_name: 'n', search_keyword: 't', derived_town: 'x' }) as { reason?: string }).reason === 'not_interested', 'not interested → refused');
  ok(runOutcome({ status: 'capped', answered: 0 }, T0, T0).kind === 'failed', 'a capped run with no answer is NOT a result (bulk-jobs zero-answer lesson)');
  ok(runOutcome({ status: 'capped', answered: 2 }, T0, T0).kind === 'usable', 'a capped run with answers is a result');
  ok(runOutcome({ status: 'pending' }, T0, T0 + SALES_CHECK_AUDIT_WAIT_MAX_MS + 1).kind === 'failed', 'a check that never finishes times out');
  ok(startRefusalReason({ error: 'town_unverified: Google could not…' }).reason === 'town_unverified' && startRefusalReason({ error: 'weird' }).reason === 'start_failed', 'create-ai-audit refusals map positively; anything unknown is a failed start');
  ok(guardRefusalReason('paused') === 'paused' && guardRefusalReason('rate_limit') === 'allowance_used' && guardRefusalReason('suspended') === 'not_allowed' && guardRefusalReason('guard_unavailable') === 'budget_unknown', 'guard refusals map to plain reasons');
  ok(batchStatusFor([{ status: 'queued' }, { status: 'done' }]) === 'active' && batchStatusFor([{ status: 'running' }]) === 'waiting' && batchStatusFor([{ status: 'done' }, { status: 'failed' }]) === 'finished' && batchStatusFor([{ status: 'mystery' }]) === 'active', 'batch status: active / waiting / finished; an unknown item status keeps it open');
  ok(readyItems([{ status: 'failed', position: 0 }, { status: 'skipped', position: 1 }, { status: 'reused', position: 3 }, { status: 'done', position: 2 }]).map((i) => i.position).join() === '2,3', 'only done/reused items are "ready" — a failed or skipped item is never offered as ready');
  const c = itemCounts([{ status: 'failed' }, { status: 'done' }, { status: 'reused' }, { status: 'skipped' }]);
  ok(c.failed === 1 && c.done === 1 && c.reused === 1 && c.skipped === 1, 'counts keep failures apart from successes');
  ok(Object.values(REASON_TEXT).every((t) => !/\$|£|apify|openai|cost|spend/i.test(t)), 'no reason a rep reads names a cost or a provider');
  ok(REASON_TEXT.allowance_used === "Today's checking allowance is used — try again tomorrow or ask Paul.", 'the allowance sentence is the brief\'s wording');
  ok(checkedAgo(iso(T0 - 3 * DAY), T0) === 'checked 3 days ago', 'reused results say how old they are');
  const body = auditRequestBody(lead() as never, 'https://x.example', 3);
  ok(body.hook_audit === true && body.fresh_audit === true && body.question_count === 3 && !('purpose' in body) && !('queue_pitch_on_complete' in body) && !('questions' in body) && !('audit_id' in body) && !('run_id' in body),
    'the create-ai-audit body is the rep\'s own hook check: no purpose, no pitch-on-complete, no supplied questions, no audit/run id');
  ok(budgetPoolForPurpose('audit') === 'prospecting', 'a bulk check is an ordinary audit → PROSPECTING pool (never guarantee/client)');
}

console.log('── the plan (reuse windows) ──');
{
  const L = 'lead-1';
  const audit = (age: number, status = 'complete', purpose: string | null = 'audit', answered?: number) => ({
    audits: [{ id: 'a', lead_id: L, created_at: iso(T0 - age * DAY), audit_purpose: purpose }],
    runs: [{ id: 'r', audit_id: 'a', status, created_at: iso(T0 - age * DAY), answered }],
  });
  const base = { leadId: L, crawl: null, ownWebsite: 'https://x', refresh: false, nowMs: T0, townGated: false, pitchWaiting: false, autoMessageOn: false };
  ok(planItem({ ...base, ...audit(3) }).audit.kind === 'reuse', `a result ${3} days old is reused (window ${SALES_CHECK_AUDIT_REUSE_DAYS} days)`);
  ok(planItem({ ...base, ...audit(SALES_CHECK_AUDIT_REUSE_DAYS + 1) }).audit.kind === 'start', 'a result older than the window → a new check');
  ok(planItem({ ...base, ...audit(3), refresh: true }).audit.kind === 'start', `refresh re-checks a result ≥ ${SALES_CHECK_REFRESH_MIN_DAYS} days old`);
  ok(planItem({ ...base, ...audit(1), refresh: true }).audit.kind === 'reuse', 'refresh never re-buys a result younger than the refresh minimum');
  ok(planItem({ ...base, ...audit(0.01, 'running') }).audit.kind === 'attach', 'an AI check already running → waited on, never duplicated');
  ok(planItem({ ...base, ...audit(3, 'capped', 'audit', 0) }).audit.kind === 'start', 'a capped run with no answers is not reused');
  ok(planItem({ ...base, ...audit(3, 'complete', 'baseline') }).audit.kind === 'start', 'a baseline is never reused as a prospect check');
  ok(planItem({ ...base, ...audit(3, 'complete', 'free_check') }).audit.kind === 'reuse', 'a free check (the hook questions, 3 runs) is reused');
  ok((planItem({ ...base, audits: [], runs: [], townGated: true }).audit as { reason?: string }).reason === 'town_unverified', 'a new check on an unconfirmed town is refused with the reason');
  ok((planItem({ ...base, audits: [], runs: [], autoMessageOn: true }).audit as { reason?: string }).reason === 'auto_message_on', 'a new check is refused while finishing an audit would send a WhatsApp');
  ok(planItem({ ...base, ...audit(3), autoMessageOn: true }).audit.kind === 'reuse', '…but a reuse (no new completion) still works');
  ok((planItem({ ...base, audits: [], runs: [], pitchWaiting: true }).audit as { reason?: string }).reason === 'pitch_waiting', 'a pitch parked on an audit → no new check (completing it would send)');
  ok(planItem({ ...base, ...audit(3), crawl: { created_at: iso(T0 - 2 * DAY), result: { version: 2, evidenceVersion: 1 } } }).crawl === 'reuse', 'a fresh crawl with sales evidence is reused');
  ok(planItem({ ...base, ...audit(3), crawl: { created_at: iso(T0 - 2 * DAY), result: { version: 2, evidenceVersion: 0 } } }).crawl === 'run', 'a shallow crawl (no evidence) is re-crawled — free');
  ok(planItem({ ...base, ...audit(3), ownWebsite: null }).crawl === 'none', 'no website → no crawl');
  ok(planItem({ ...base, audits: [], runs: [] }).crawl === 'with_audit', 'a new check crawls at finalise (the audit queue) — not twice');
}

/* ═══ 2. Authorization ══════════════════════════════════════════════════════════════════════════ */
console.log('── authorization: only the rep\'s own active prospects ──');
{
  const w = world();
  const own = addLead(w);
  const repB = addLead(w, { assigned_to_user_id: REP_B, business_name: 'Rep B Private Ltd' });
  const paulsBook = addLead(w, { assigned_to_user_id: null, business_name: 'Paul Unassigned Ltd' });
  const paulsOwn = addLead(w, { assigned_to_user_id: PAUL, business_name: 'Paul Own Ltd' });
  const client = addLead(w, { amount_paid: 99, status: 'payment_received', business_name: 'Client Ltd' });
  const archived = addLead(w, { is_archived: true });
  const ghost = '33333333-3333-4333-8333-333333333333';
  const out = await run(w, A, [own.id, repB.id, paulsBook.id, paulsOwn.id, client.id, archived.id, ghost]);
  ok(out.status === 200, 'a mixed batch is accepted — the unsafe items are refused one by one, the valid one still runs');
  const st = (id: string) => `${itemFor(w, id)?.status}/${itemFor(w, id)?.reason ?? ''}`;
  ok(st(own.id) === 'running/', 'rep A own lead → accepted and started');
  ok(st(repB.id) === 'skipped/not_yours', "rep A cannot check rep B's lead");
  ok(st(paulsBook.id) === 'skipped/not_yours' && st(paulsOwn.id) === 'skipped/not_yours', "rep A cannot check Paul's leads (unassigned or Paul's own)");
  ok(st(client.id) === 'skipped/client', 'a client (own, paid) is refused');
  ok(st(archived.id) === 'skipped/archived', 'an archived lead is refused');
  ok(st(ghost) === 'skipped/not_yours', 'a nonexistent id is refused safely (same answer as another rep\'s lead)');
  ok(w.calls.start.length === 1 && w.calls.start[0].lead_id === own.id, 'exactly ONE paid check started — for the own lead only');
  ok(w.calls.guard.length === 1 && w.calls.guard[0].actor === REP_A, 'one guard row, naming rep A (per-rep attribution)');
  const v = await batchView(w.deps, A);
  const vi = (id: string) => v.items.find((i) => i.lead_id === id)!;
  ok(vi(repB.id).business_name === null && vi(repB.id).phone === null && vi(repB.id).website === null && vi(repB.id).audit_id === null, "the view leaks nothing of rep B's lead (no name, phone, website, audit id)");
  ok(vi(paulsOwn.id).business_name === null && vi(ghost).business_name === null && vi(client.id).business_name === null, "nor of Paul's lead, a client or a ghost id");
  ok(!JSON.stringify(v).includes('Rep B Private') && !JSON.stringify(v).includes('Paul Own') && !JSON.stringify(v).includes('Client Ltd'), 'no other person\'s business name appears anywhere in the rep\'s view');
  const wS = world();
  const said = addLead(wS, { business_name: 'Said Stop Ltd' });
  wS.cfg.suppressed.add(said.id);
  await run(wS, A, [said.id]);
  ok(itemFor(wS, said.id).reason === 'suppressed' && wS.calls.start.length === 0 && wS.calls.guard.length === 0, 'a business that asked not to be contacted is skipped (nobody calls someone who said stop), nothing spent');
  const admin = await startBatch(w.deps, { id: PAUL, role: 'admin' }, { lead_ids: [own.id], client_request_id: req() });
  ok(admin.status === 403, 'the admin cannot use the sales path (positive match on the sales role)');
  const noRole = await startBatch(w.deps, { id: REP_A, role: '' }, { lead_ids: [own.id], client_request_id: req() });
  ok(noRole.status === 403, 'no role → refused');
  const vB = await batchView(w.deps, B);
  ok(vB.batch === null, "rep B sees none of rep A's batches");
  const vBpeek = await batchView(w.deps, B, String(items(w)[0].batch_id));
  ok(vBpeek.batch === null && vBpeek.items.length === 0, "naming rep A's batch id does not let rep B read it");
  ok(!(await cancelBatch(w.deps, B, String(items(w)[0].batch_id))).ok, "rep B cannot stop rep A's batch");
}

/* ═══ 3. Batch ═════════════════════════════════════════════════════════════════════════════════ */
console.log('── batch: maximum, duplicates, double submit, overlap, refresh ──');
{
  const w = world();
  const ls = [...Array(SALES_CHECK_BATCH_MAX + 1)].map(() => addLead(w));
  const tooMany = await startBatch(w.deps, A, { lead_ids: ls.map((l) => l.id), client_request_id: req() });
  ok(tooMany.status === 400 && (tooMany.body as { error: string }).error === 'too_many', 'over the maximum → refused server-side');
  ok(w.db.table('sales_check_batches').length === 0 && w.calls.start.length === 0, '…and nothing was created or started');
  const dup = await startBatch(w.deps, A, { lead_ids: [ls[0].id, ls[0].id, ls[0].id, ls[1].id], client_request_id: req() });
  ok(dup.status === 200 && items(w).length === 2, 'the same lead three times is one item');
  await advance(w.deps, A);
  ok(w.calls.start.filter((b) => b.lead_id === ls[0].id).length === 1, '…and one paid check');
  // double submit / network retry: the same request id twice
  const w2 = world();
  const l2 = [addLead(w2), addLead(w2)];
  const body = { lead_ids: l2.map((l) => l.id), client_request_id: 'press-0001' };
  const [s1, s2] = await Promise.all([startBatch(w2.deps, A, body), startBatch(w2.deps, A, body)]);
  const b1 = (s1.body as { batch_id?: string }).batch_id, b2 = (s2.body as { batch_id?: string }).batch_id;
  ok(s1.status === 200 && s2.status === 200 && b1 === b2, 'double-click (same request id, at once) → ONE batch, both answers name it');
  ok(w2.db.table('sales_check_batches').length === 1 && items(w2).length === 2, '…one batch row, two items');
  const s3 = await startBatch(w2.deps, A, body);
  ok((s3.body as { replayed?: boolean }).replayed === true && (s3.body as { batch_id?: string }).batch_id === b1, 'a retry after a network timeout (same id) → the same batch, replayed');
  // two tabs: two advances at once
  await Promise.all([advance(w2.deps, A), advance(w2.deps, A), advance(w2.deps, A)]);
  ok(w2.calls.start.length === 2 && new Set(w2.calls.start.map((b) => b.lead_id)).size === 2, 'three advances at once (two tabs + a retry) → exactly one check per lead');
  // overlapping batch: a different press while the first is still starting
  const w3 = world();
  const l3 = [addLead(w3), addLead(w3)];
  const first = await startBatch(w3.deps, A, { lead_ids: [l3[0].id], client_request_id: req() });
  const second = await startBatch(w3.deps, A, { lead_ids: [l3[1].id], client_request_id: req() });
  ok(first.status === 200 && second.status === 409 && (second.body as { error: string }).error === 'batch_active', 'an overlapping batch (another tab, another press) is refused while the first is starting');
  ok(w3.db.table('sales_check_batches').length === 1, '…and no second batch exists');
  await advance(w3.deps, A);
  const third = await startBatch(w3.deps, A, { lead_ids: [l3[1].id], client_request_id: req() });
  ok(third.status === 200, 'once every check has STARTED (batch waiting), a new batch may start');
  const repBStart = await startBatch(w3.deps, B, { lead_ids: [l3[0].id], client_request_id: req() });
  ok(repBStart.status === 200, 'one rep\'s active batch never blocks another rep');
  // refresh / navigation: the state is the database's
  const before = JSON.stringify((await batchView(w3.deps, A)).items.map((i) => i.status));
  const after = JSON.stringify((await batchView(w3.deps, A)).items.map((i) => i.status));
  ok(before === after && before.length > 2, 'a reload reads the same progress (state lives in the database, not the page)');
  // cancel
  const w4 = world();
  const l4 = [addLead(w4), addLead(w4)];
  const c4 = await startBatch(w4.deps, A, { lead_ids: l4.map((l) => l.id), client_request_id: req() });
  await cancelBatch(w4.deps, A, String((c4.body as { batch_id?: string }).batch_id));
  ok(items(w4).every((i) => i.status === 'skipped' && i.reason === 'cancelled') && w4.calls.start.length === 0, 'Stop before anything started → every lead skipped, nothing spent');
  ok(w4.db.table('sales_check_batches')[0].status === 'finished', '…and the batch is finished');
}

/* ═══ 4. Budget ═════════════════════════════════════════════════════════════════════════════════ */
console.log('── budget: per-rep allowance, prospecting pool, guarantee untouched ──');
{
  const w = world();
  w.db.table('protection_settings')[0].limits = { ...DEFAULT_PROTECTION_LIMITS, actions: { ...DEFAULT_PROTECTION_LIMITS.actions, sales_check: { paid: true, per_day: 2 } } };
  const ls = [addLead(w), addLead(w), addLead(w), addLead(w)];
  const reused = addLead(w); addAudit(w, reused.id, 3); addCrawl(w, reused.id, 3);
  await run(w, A, [...ls.map((l) => l.id), reused.id]);
  const st = items(w).map((i) => i.status);
  ok(st.filter((s) => s === 'running').length === 2, 'allowance 2 → exactly two fresh checks start');
  ok(items(w).filter((i) => i.reason === 'allowance_used').length === 2, 'the rest → "Today\'s checking allowance is used…" before any spend');
  ok(itemFor(w, reused.id).status === 'reused', 'a reused result is not blocked by the allowance (it costs nothing)');
  ok(w.calls.start.length === 2 && w.calls.guard.length === 2, 'two create-ai-audit calls, two guard rows — no more');
  const v = await batchView(w.deps, A);
  ok(v.allowance?.used === 2 && v.allowance?.remaining === 0 && v.allowance?.limit === 2, 'the rep sees "checks left today: 0 of 2" (a count, never a cost)');
  for (const r of w.db.table('ai_audit_runs')) r.status = 'complete';
  await advance(w.deps, A);
  const next = addLead(w);
  await run(w, A, [next.id]);
  ok(itemFor(w, next.id).reason === 'allowance_used', 'the allowance holds across batches (24 h, per rep)');
  const otherRep = addLead(w, { assigned_to_user_id: REP_B });
  await run(w, B, [otherRep.id]);
  ok(itemFor(w, otherRep.id).status === 'running', "rep A's used allowance does not touch rep B's");

  const wp = world();
  wp.cfg.pool = { poolSpentUsd: POOL_DAILY_CAP_USD.prospecting, apify: { usedUsd: 10, capUsd: 100 } };
  const lp = addLead(wp);
  await run(wp, A, [lp.id]);
  ok(itemFor(wp, lp.id).reason === 'budget_used' && wp.calls.start.length === 0 && wp.calls.guard.length === 0, 'the prospecting pool at its cap → refused before any spend (plain sentence)');
  const wr = world();
  wr.cfg.pool = { poolSpentUsd: 0, apify: { usedUsd: APIFY_RESERVE_PCT.prospecting + 1, capUsd: 100 } };
  const lr = addLead(wr);
  await run(wr, A, [lr.id]);
  ok(itemFor(wr, lr.id).reason === 'budget_used' && wr.calls.start.length === 0, 'Apify above the prospecting reserve → refused (headroom kept for baselines and re-measures)');
  const wu = world();
  wu.cfg.pool = null;
  const lu = addLead(wu);
  await run(wu, A, [lu.id]);
  ok(itemFor(wu, lu.id).reason === 'budget_unknown' && wu.calls.start.length === 0, 'an unreadable pool → nothing starts (fail closed on a spending path)');
  const wg = world();
  wg.cfg.guardRefuse = 'paused';
  const lg = addLead(wg);
  await run(wg, A, [lg.id]);
  ok(itemFor(wg, lg.id).reason === 'paused' && wg.calls.start.length === 0, 'Paul\'s "pause paid prospecting" (the guard) stops new checks');
  // The guarantee: an exhausted prospecting pool leaves the guarantee and client pools untouched.
  const ledger = new FakeDb();
  for (let i = 0; i < 400; i++) ledger.table('enrichment_usage').push({ id: `u${i}`, user_id: OWNER, cost_usd: 0.05, created_at: iso(Date.now() - 3600_000), budget_pool: 'prospecting' });
  const pros = await rollingSpendUsd(ledger, OWNER, 'prospecting');
  const guar = await rollingSpendUsd(ledger, OWNER, 'guarantee');
  const cli = await rollingSpendUsd(ledger, OWNER, 'client');
  ok(!!pros && pros.spent >= POOL_DAILY_CAP_USD.prospecting && !budgetDecision({ pool: 'prospecting', poolSpentUsd: pros.spent, estCostUsd: 0.0331 }).allowed, '(real runner) prospecting spend is at its cap → prospecting refused');
  ok(!!guar && guar.spent === 0 && budgetDecision({ pool: 'guarantee', poolSpentUsd: guar.spent, estCostUsd: 0.25 }).allowed, '…a client BASELINE (guarantee pool) is still allowed');
  ok(budgetDecision({ pool: 'guarantee', poolSpentUsd: guar!.spent, estCostUsd: 0.25, apify: { usedUsd: 90, capUsd: 100 } }).allowed, '…a client RE-MEASURE (guarantee pool) is still allowed, even with Apify past the prospecting reserve');
  ok(!!cli && cli.spent === 0 && budgetDecision({ pool: 'client', poolSpentUsd: cli.spent, estCostUsd: 0.1 }).allowed, '…and other client work keeps its own pool');
  ok(w.db.table('sales_check_items').every((i) => i.actor_user_id === REP_A || i.actor_user_id === REP_B) && w.db.table('sales_check_items').filter((i) => i.audit_source === 'new').every((i) => Number(i.est_cost_usd) > 0), 'actor stored on every item; every fresh check carries its estimate');
  const act = w.db.table('lead_activity').filter((a) => a.kind === 'audit_run');
  ok(act.length >= 2 && act.every((a) => (a.actor_user_id === REP_A || a.actor_user_id === REP_B) && (a.data as { source?: string }).source === 'sales_check'), "each fresh check is on the lead's history under the rep who ran it");
}

/* ═══ 5. Caching / reuse ═══════════════════════════════════════════════════════════════════════ */
console.log('── the launch allowance end to end: 30 fresh a day, reuse free ──');
{
  const w = world(); // the default limits — no per-day override
  const fresh = [...Array(31)].map(() => addLead(w));
  const cached = addLead(w); addAudit(w, cached.id, 3); addCrawl(w, cached.id, 3);
  const b1 = await run(w, A, fresh.slice(0, SALES_CHECK_BATCH_MAX).map((l) => l.id));
  ok(b1.status === 200 && items(w).filter((i) => i.status === 'running').length === SALES_CHECK_BATCH_MAX, 'batch 1: a full batch of 20 fresh checks starts');
  const tooBig = await startBatch(w.deps, A, { lead_ids: fresh.slice(0, SALES_CHECK_BATCH_MAX + 1).map((l) => l.id), client_request_id: req() });
  ok(tooBig.status === 400, 'the batch maximum is still 20 even though the day allows 30');
  await run(w, A, [...fresh.slice(SALES_CHECK_BATCH_MAX).map((l) => l.id), cached.id]);
  const second = fresh.slice(SALES_CHECK_BATCH_MAX).map((l) => itemFor(w, l.id));
  ok(second.filter((i) => i.status === 'running').length === 10 && second.filter((i) => i.reason === 'allowance_used').length === 1, 'batch 2: ten more fresh checks start (30 in the day), the 31st is refused with the plain sentence');
  ok(itemFor(w, cached.id).status === 'reused', 'a cached result still comes through after the allowance is used — reuse is free');
  ok(w.calls.start.length === 30 && w.calls.guard.length === 30, 'exactly 30 paid checks and 30 guard rows; the reused one made neither');
  const v = await batchView(w.deps, A);
  ok(v.allowance?.used === 30 && v.allowance?.limit === 30 && v.allowance?.remaining === 0, 'the rep sees "Checks left today: 0 of 30"');
}

console.log('── caching: reuse costs nothing ──');
{
  const w = world();
  const r1 = addLead(w); const a1 = addAudit(w, r1.id, 3); addCrawl(w, r1.id, 3);
  const r2 = addLead(w); const a2 = addAudit(w, r2.id, 5);                // audit fresh, no crawl
  const stale = addLead(w); addAudit(w, stale.id, SALES_CHECK_AUDIT_REUSE_DAYS + 2);
  const inflight = addLead(w); const af = addAudit(w, inflight.id, 0.01, 'running');
  await run(w, A, [r1.id, r2.id, stale.id, inflight.id]);
  ok(itemFor(w, r1.id).status === 'reused' && itemFor(w, r1.id).audit_id === a1.auditId && itemFor(w, r1.id).crawl_source === 'reused', 'a recent audit AND crawl are reused');
  ok(itemFor(w, r2.id).status === 'reused' && itemFor(w, r2.id).audit_id === a2.auditId && itemFor(w, r2.id).crawl_source === 'new', 'a recent audit with no crawl → the audit reused, the (free) crawl run');
  ok(w.calls.crawl.length === 1 && w.calls.crawl[0].leadId === r2.id && w.calls.crawl[0].url === r2.website, 'exactly one crawl — the lead\'s own website, its own id');
  ok(itemFor(w, stale.id).status === 'running' && itemFor(w, stale.id).audit_source === 'new', 'stale data → a fresh check');
  ok(itemFor(w, inflight.id).status === 'running' && itemFor(w, inflight.id).audit_source === 'in_flight' && itemFor(w, inflight.id).audit_id === af.auditId, 'an in-flight check is waited on, not duplicated');
  ok(w.calls.start.length === 1 && w.calls.start[0].lead_id === stale.id && w.calls.guard.length === 1, 'reuse created no provider spend: one paid check (the stale lead), one guard row');
  ok(Number(itemFor(w, r1.id).est_cost_usd ?? 0) === 0 && Number(itemFor(w, r2.id).est_cost_usd ?? 0) === 0, 'reused items carry no cost');
  setRun(w, af.runId, 'complete');
  await advance(w.deps, A);
  ok(itemFor(w, inflight.id).status === 'reused', 'the in-flight check finishing → that lead is ready (reused)');
  const v = await batchView(w.deps, A);
  ok(v.allowance?.used === 1, 'only the one fresh check counts toward the allowance');
  // refresh
  const wf = world();
  const old = addLead(wf); addAudit(wf, old.id, SALES_CHECK_REFRESH_MIN_DAYS + 1); addCrawl(wf, old.id, SALES_CHECK_REFRESH_MIN_DAYS + 1);
  const young = addLead(wf); const ay = addAudit(wf, young.id, 1); addCrawl(wf, young.id, 1);
  await run(wf, A, [old.id, young.id], true);
  ok(itemFor(wf, old.id).audit_source === 'new' && itemFor(wf, young.id).status === 'reused' && itemFor(wf, young.id).audit_id === ay.auditId, '"Check again" re-checks only results old enough; a day-old one is still reused');
}

/* ═══ 6. State changes during a job ═══════════════════════════════════════════════════════════ */
console.log('── state: reassigned / archived / failures ──');
{
  const w = world();
  const pre = addLead(w), mid = addLead(w), arc = addLead(w), fail = addLead(w), cap = addLead(w), slow = addLead(w), queued = addLead(w);
  const s = await startBatch(w.deps, A, { lead_ids: [pre.id, mid.id, arc.id, fail.id, cap.id, slow.id, queued.id], client_request_id: req() });
  ok(s.status === 200, 'batch created');
  (w.db.table('outreach_leads').find((l) => l.id === pre.id) as { assigned_to_user_id: string }).assigned_to_user_id = REP_B; // reassigned BEFORE its turn
  (w.db.table('outreach_leads').find((l) => l.id === queued.id) as { is_archived: boolean }).is_archived = true;           // archived BEFORE its turn
  await advance(w.deps, A);
  ok(itemFor(w, pre.id).reason === 'not_yours' && !w.calls.start.some((b) => b.lead_id === pre.id), 'reassigned before its turn → refused, nothing started');
  ok(itemFor(w, queued.id).reason === 'archived' && !w.calls.start.some((b) => b.lead_id === queued.id), 'archived before its turn → refused, nothing started');
  const started = w.calls.start.length;
  (w.db.table('outreach_leads').find((l) => l.id === mid.id) as { assigned_to_user_id: string }).assigned_to_user_id = REP_B;   // reassigned DURING
  (w.db.table('outreach_leads').find((l) => l.id === arc.id) as { is_archived: boolean }).is_archived = true;                   // archived DURING
  setRun(w, itemFor(w, mid.id).run_id, 'complete');
  setRun(w, itemFor(w, fail.id).run_id, 'failed');
  setRun(w, itemFor(w, cap.id).run_id, 'capped');
  await advance(w.deps, A);
  ok(itemFor(w, mid.id).reason === 'no_longer_yours', 'reassigned during the job → stopped for this rep');
  ok(itemFor(w, arc.id).reason === 'archived', 'archived during the job → stopped');
  ok(w.calls.start.length === started && w.calls.crawl.length === 0, '…and no further work was started for either');
  const v = await batchView(w.deps, A);
  const vm = v.items.find((i) => i.lead_id === mid.id)!;
  ok(vm.audit_id === null && vm.business_name === null, "the old rep can no longer read the reassigned lead's result");
  ok(itemFor(w, fail.id).status === 'failed' && itemFor(w, fail.id).reason === 'audit_failed', 'a failed AI check → failed, with a reason');
  ok(itemFor(w, cap.id).status === 'failed' && itemFor(w, cap.id).reason === 'audit_not_run', 'a capped check with no answers → failed "didn\'t run, nothing spent"');
  ok(v.items.find((i) => i.lead_id === fail.id)!.audit_id === null || v.items.find((i) => i.lead_id === fail.id)!.status === 'failed', 'a failed item is never shown as ready');
  w.clock.now += SALES_CHECK_AUDIT_WAIT_MAX_MS + 60_000;
  await advance(w.deps, A);
  ok(itemFor(w, slow.id).status === 'failed' && itemFor(w, slow.id).reason === 'audit_timeout', 'a check that never finishes → failed (timeout), never left "running" for ever');
  ok(w.db.table('sales_check_batches')[0].status === 'finished', 'the batch finishes; the successful and failed items both remain listed');
  // a failed start does not hide the successes in the same batch
  const w2 = world();
  const good = addLead(w2), bad = addLead(w2), town = addLead(w2), net = addLead(w2);
  w2.cfg.startFail.set(bad.id, { ok: false, status: 409, error: 'business_not_in_town', detail: 'The business is 48 km from Halifax.' });
  w2.cfg.startFail.set(town.id, { ok: false, status: 409, error: 'town_unverified: …' });
  w2.cfg.startThrows.add(net.id);
  await run(w2, A, [good.id, bad.id, town.id, net.id]);
  ok(itemFor(w2, good.id).status === 'running', 'one lead failing never makes the others disappear');
  ok(itemFor(w2, bad.id).status === 'failed' && itemFor(w2, bad.id).reason === 'not_in_town' && String(itemFor(w2, bad.id).detail).includes('48 km'), 'not-in-town → failed with the server\'s own sentence');
  ok(itemFor(w2, town.id).status === 'skipped' && itemFor(w2, town.id).reason === 'town_unverified', 'town unconfirmed → skipped "confirm it on the lead"');
  ok(itemFor(w2, net.id).status === 'failed' && itemFor(w2, net.id).reason === 'start_failed', 'a provider timeout / network error → failed "couldn\'t start"');
  ok([bad, town, net].every((l) => itemFor(w2, l.id).audit_source === null), 'a check that did not start releases its allowance slot');
  const v2 = await batchView(w2.deps, A);
  ok(v2.allowance?.used === 1, '…so only the one real start counts');
  // interrupted start (the isolate died mid-call) is recovered exactly once
  const w3 = world();
  const l3 = addLead(w3);
  const s3 = await startBatch(w3.deps, A, { lead_ids: [l3.id], client_request_id: req() });
  const it = items(w3)[0];
  Object.assign(it, { status: 'starting', started_at: iso(w3.clock.now), attempts: 1, audit_source: 'new' });
  w3.clock.now += SALES_CHECK_STARTING_STALE_MS + 1000;
  const made = addAudit(w3, l3.id, 0, 'pending');
  (w3.db.table('ai_audits').find((a) => a.id === made.auditId) as { created_at: string }).created_at = iso(w3.clock.now - 60_000);
  await advance(w3.deps, A);
  ok(it.status === 'running' && it.audit_id === made.auditId && w3.calls.start.length === 0, 'an interrupted start whose audit exists → attached to it, never a second paid check');
  ok(!!s3, 'batch made');
  const w4 = world();
  const l4 = addLead(w4);
  await startBatch(w4.deps, A, { lead_ids: [l4.id], client_request_id: req() });
  const it4 = items(w4)[0];
  Object.assign(it4, { status: 'starting', started_at: iso(w4.clock.now), attempts: 1, audit_source: null });
  w4.clock.now += SALES_CHECK_STARTING_STALE_MS + 1000;
  await advance(w4.deps, A);
  ok(w4.calls.start.length === 1 && it4.status === 'running', 'an interrupted start that made nothing → put back in line and started once');
}

/* ═══ 7. Result integrity + never contacts anyone ═════════════════════════════════════════════ */
console.log('── results attach to the right lead; nothing is sent ──');
{
  const w = world();
  const l1 = addLead(w, { website: 'https://www.facebook.com/brookfoot' });
  const l2 = addLead(w);
  await run(w, A, [l1.id, l2.id]);
  for (const b of w.calls.start) {
    const l = w.db.table('outreach_leads').find((x) => x.id === b.lead_id)!;
    ok(b.user_id === OWNER && b.lead_id === l.id, `the check for ${String(b.lead_id).slice(-4)} is filed under the book owner, on its own lead id`);
  }
  ok(w.calls.start.find((b) => b.lead_id === l1.id)!.has_website === false && !('website' in w.calls.start.find((b) => b.lead_id === l1.id)! && w.calls.start.find((b) => b.lead_id === l1.id)!.website), 'a Facebook "website" is not their website (no crawl of facebook.com)');
  for (const it of items(w)) {
    const audit = w.db.table('ai_audits').find((a) => a.id === it.audit_id)!;
    ok(audit.lead_id === it.lead_id, 'each item points at an audit OF ITS OWN LEAD');
  }
  // A client lead's baseline must never be touched: a client is refused, and no body names an audit / run / purpose.
  const cl = addLead(w, { amount_paid: 99 });
  const base = addAudit(w, cl.id, 3, 'complete', 'baseline');
  await run(w, A, [cl.id]);
  ok(itemFor(w, cl.id).reason === 'client' && !w.calls.start.some((b) => b.lead_id === cl.id) && !itemFor(w, cl.id).audit_id && !itemFor(w, cl.id).run_id, "a client's run is never written to or attached");
  ok(w.db.table('ai_audit_runs').find((r) => r.id === base.runId)!.status === 'complete', '…its baseline run is untouched');
  // auto contact
  const wm = world();
  wm.db.table('whatsapp_outreach_state')[0].audit_complete_template = 'audit_result_hook';
  const fresh = addLead(wm), reusedL = addLead(wm); addAudit(wm, reusedL.id, 3); addCrawl(wm, reusedL.id, 3);
  await run(wm, A, [fresh.id, reusedL.id]);
  ok(itemFor(wm, fresh.id).reason === 'auto_message_on' && wm.calls.start.length === 0, 'while finishing an audit would queue a WhatsApp, no new check starts');
  ok(itemFor(wm, reusedL.id).status === 'reused', '…a reuse still works (it finishes nothing)');
  const wp = world();
  const parked = addLead(wp);
  wp.db.table('whatsapp_auto_replies').push({ id: 'p1', lead_id: parked.id, status: 'awaiting_audit' });
  await run(wp, A, [parked.id]);
  ok(itemFor(wp, parked.id).reason === 'pitch_waiting' && wp.calls.start.length === 0, 'a pitch parked on this lead\'s audit → no new check (it would fire the pitch)');
  const touched = new Set([...w.db.writes, ...wm.db.writes, ...wp.db.writes].map((x) => x.table));
  const allowed = new Set(['sales_check_batches', 'sales_check_items', 'lead_activity', 'lead_crawl_checks']);
  ok([...touched].every((t) => allowed.has(t)), `the engine wrote only its own tables + lead history (wrote: ${[...touched].sort().join(', ')})`);
  ok(!touched.has('outreach_leads'), 'no lead row is written — no status change, no "interested", no "replied", no Next Action');
  ok(!touched.has('whatsapp_messages') && !touched.has('whatsapp_auto_replies') && !touched.has('whatsapp_sends'), 'no WhatsApp row of any kind');
  ok(w.db.table('lead_activity').every((a) => a.kind === 'audit_run' || a.kind === 'crawl_run'), 'history rows are only "AI check run" / "website checked"');
}

/* ═══ 8. The import closure: no sender is reachable ═══════════════════════════════════════════ */
console.log('── no sender in the function\'s import closure ──');
{
  const entry = path.join(ROOT, 'supabase/functions/sales-prospect-check/index.ts');
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return; seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+["']([^"']+)["']/gm)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const next = path.resolve(path.dirname(file), spec);
      if (existsSync(next)) walk(next);
    }
  };
  walk(entry);
  const files = [...seen].map((p) => path.relative(ROOT, p).replace(/\\/g, '/'));
  const BANNED_MODULES = ['whatsapp-send.ts', 'whatsapp-inbound.ts', 'voice-note-send.ts', 'media-attachment-send.ts', 'audit-reply.ts', 'first-reply-audit.ts', 'free-check-result.ts', 'remeasure-results.ts', 'onboarding-followup.ts', 'operator-alert.ts', 'warm-lead-reply'];
  ok(files.length > 5 && files.every((p) => !BANNED_MODULES.some((b) => p.endsWith(b) || p.includes(b))), `no sender module among the ${files.length} files the function reaches`);
  const BANNED_TEXT = [/graph\.facebook\.com/, /api\.resend\.com/, /functions\/v1\/send-whatsapp-message/, /functions\/v1\/process-whatsapp-queue/, /whatsapp_auto_replies"\)\s*\.insert/, /whatsapp_messages"\)\s*\.insert/, /\.from\("outreach_leads"\)\s*\.update/];
  const offenders = files.filter((p) => BANNED_TEXT.some((re) => re.test(read(p))));
  ok(offenders.length === 0, `no file in the closure posts to Meta / Resend / a sender, or writes a lead (${offenders.join(', ') || 'none'})`);
  const door = read('supabase/functions/sales-prospect-check/index.ts');
  const targets = [...door.matchAll(/functions\/v1\/([a-z0-9-]+)/g)].map((m) => m[1]);
  ok(targets.sort().join() === 'crawl-check,create-ai-audit', 'the function calls exactly two functions: create-ai-audit and crawl-check');
  ok(!/run_id|job_id/.test(door.slice(door.indexOf('runCrawl:'))), 'the crawl call names no run id and no job id (M-006 stays closed)');
  ok(/who\.actor\.role !== "sales"/.test(door) && door.indexOf('who.actor.role !== "sales"') < door.indexOf('action === "start"'), 'every rep action is behind a POSITIVE sales-role match');
  ok(/requireAdmin\(req, service\)/.test(door) && door.indexOf('requireAdmin') < door.indexOf('adminOverview(depsFor'), 'the admin overview is behind requireAdmin');
  ok(/x-sales-check-build/.test(door) && /BUILD_ID = "sales-prospect-check-\d+"/.test(door), 'the deploy marker exists (OPTIONS answers x-sales-check-build)');
  const queue = read('supabase/functions/process-ai-audit-queue/index.ts');
  ok(/audit_complete_template/.test(queue) && /awaiting_audit/.test(queue), 'the two completion-send triggers this path refuses on are the queue\'s real ones (audit_complete_template, awaiting_audit)');
}

/* ═══ 9. The database, the config, the guard action ═══════════════════════════════════════════ */
console.log('── migration, config, limits ──');
{
  const mig = read('supabase/migrations/20261006070000_sales_prospect_checks.sql');
  ok(/unique \(actor_user_id, client_request_id\)/.test(mig) && /sales_check_batches_one_active[\s\S]*where status = 'active'/.test(mig) && /unique \(batch_id, lead_id\)/.test(mig), 'the dedupe is in the database: request id, one active batch per rep, one lead once per batch');
  ok(/revoke insert, update, delete, truncate, references, trigger on public\.sales_check_batches from authenticated/.test(mig) && /revoke insert, update, delete, truncate, references, trigger on public\.sales_check_items from authenticated/.test(mig) && /revoke all on public\.sales_check_items from anon/.test(mig), 'no browser can write a batch or an item (service role only)');
  ok((mig.match(/create policy/g) ?? []).length === 2 && /for select to authenticated[\s\S]*actor_user_id = \(select auth\.uid\(\)\) or \(select public\.my_role\(\)\) = 'admin'/.test(mig), 'read: own rows, or the admin — no other policy');
  ok(/enable row level security/.test(mig), 'RLS on');
  const m = mig.match(/'\{actions,sales_check\}', '(\{[^']*\})'::jsonb/);
  ok(!!m && JSON.stringify(JSON.parse(m[1])) === JSON.stringify(DEFAULT_PROTECTION_LIMITS.actions.sales_check), "the live row's new action equals DEFAULT_PROTECTION_LIMITS.actions.sales_check");
  ok(/where id = 1 and not \(limits -> 'actions' \? 'sales_check'\)/.test(mig), '…added only if absent (an edited value is never overwritten)');
  ok(GUARD_ACTIONS.includes('sales_check') && validateLimits(DEFAULT_PROTECTION_LIMITS).ok, 'sales_check is a guard action and the defaults validate');
  const liveBefore = { ...DEFAULT_PROTECTION_LIMITS, actions: Object.fromEntries(Object.entries(DEFAULT_PROTECTION_LIMITS.actions).filter(([k]) => k !== 'sales_check')) } as typeof DEFAULT_PROTECTION_LIMITS;
  ok(!validateLimits(liveBefore).ok && validateLimits(withDefaultActions(liveBefore)).ok, 'a live row from before the SQL still saves from the Security panel (the missing action is filled from the defaults)');
  const cfg = read('supabase/config.toml');
  ok(/\[functions\.sales-prospect-check\]\nverify_jwt = true/.test(cfg), 'config.toml lists the function (verify_jwt true, same commit)');
  ok(leadPermissions('sales').salesChecks === true && leadPermissions('admin').salesChecks === false && leadPermissions(null).salesChecks === false, 'the button is the salesperson\'s (the admin keeps the admin bulk runner; no role, nothing)');
  ok(leadPermissions('sales').bulkAudits === false, 'the admin bulk runner is still NOT exposed to sales');
}

/* ═══ 10. The screens ══════════════════════════════════════════════════════════════════════════ */
console.log('── the screens ──');
{
  const panel = read('src/components/SalesCheckPanel.tsx');
  const hook = read('src/hooks/useSalesChecks.ts');
  const outreach = read('src/pages/Outreach.tsx');
  const table = read('src/components/OutreachTable.tsx');
  ok(/useCallCardSummaries/.test(panel) && /summary\.headline/.test(panel), 'each ready lead shows the call card\'s own one-line result');
  ok(/onOpenLead\(it\.lead_id, tab\)/.test(panel) && /setLaunchIntent\(\{ leadId, channel: 'open', tab \}\)/.test(outreach) && /setDetailTab\(launchIntent\.tab\)/.test(table), '"Call screen" / "Open the next ready lead" open the lead\'s workspace on the call script');
  ok(!/invokeEdge\(|functions\.invoke|\.insert\(|\.update\(|\.rpc\(/.test(panel), 'the panel calls nothing and writes nothing (tel: link and the workspace only)');
  ok((hook.match(/invokeEdge/g) ?? []).length >= 1 && !/send-whatsapp|whatsapp|email/i.test(hook.replace(/\/\*[\s\S]*?\*\//g, '')), 'the hook talks to sales-prospect-check only');
  ok(/client_request_id: pressRef\.current\.id/.test(hook) && /e\.status !== null\) throw e;/.test(hook), 'a dropped connection is retried with the SAME request id (never a second batch)');
  ok(/data-testid="sales-check-button"/.test(table) && /perms\.salesChecks/.test(table), 'the Outreach selection toolbar has "Check before calling" for sales');
  ok(!/\$\{?usd|cost|\bspend\b/i.test(panel.replace(/\/\*[\s\S]*?\*\//g, '')), 'no cost is shown to a salesperson');
  ok(/readyItems\(items\)/.test(panel), 'only done/reused leads are offered as ready');
  ok(/SalesChecksAdminCard/.test(read('src/pages/AdminApiUsage.tsx')), 'the admin sees batches, reps, spend and problems on API Usage & Security');
  // One ruler: the panel's line IS the call screen's line.
  const input: PlaybookInput = {
    lead: { id: 'l', business_name: 'ZZ QA Brookfoot Plumbing', phone: '07700 900611', website: null },
    reportAudit: null, report: null, auditRunning: false, runCrawls: [], leadCrawl: null, messages: [], nowMs: T0,
  };
  ok(JSON.stringify(callCardAudit(input)) === JSON.stringify(buildColdCallPlaybook(input).audit), 'callCardAudit is exactly the call screen\'s audit line (one copy)');
  ok(/export function callCardAudit/.test(read('src/lib/coldCallPlaybook.ts')) && /const audit = callCardAudit\(input\);/.test(read('src/lib/coldCallPlaybook.ts')), 'buildColdCallPlaybook reads the same helper');
}

/* ═══ 11. The admin overview ═════════════════════════════════════════════════════════════════ */
console.log('── admin overview ──');
{
  const w = world();
  w.db.table('team_members').push({ user_id: REP_A, display_name: 'Sam QA' });
  const l1 = addLead(w), l2 = addLead(w); addAudit(w, l2.id, 3); addCrawl(w, l2.id, 3);
  const l3 = addLead(w, { assigned_to_user_id: REP_B });
  await run(w, A, [l1.id, l2.id, l3.id]);
  const r = w.db.table('ai_audit_runs').find((x) => x.id === itemFor(w, l1.id).run_id)!;
  r.status = 'complete'; r.actor_cost_usd = 0.0312;
  await advance(w.deps, A);
  const o = await adminOverview(w.deps, 7);
  const rep = o.reps.find((x) => x.actor_user_id === REP_A)!;
  ok(rep.actor_name === 'Sam QA' && rep.leads === 3 && rep.fresh === 1 && rep.reused === 1 && rep.skipped === 1, 'per rep: leads, fresh, reused, skipped');
  ok(Math.abs(rep.est_usd - 0.0331) < 1e-9 && Math.abs(rep.actual_usd - 0.0312) < 1e-9, 'estimated and ACTUAL spend (the run\'s billed Apify cost)');
  ok(o.problems.some((p) => p.reason === 'not_yours'), 'refusals are visible to the admin');
  ok(!JSON.stringify(o).match(/sk_|secret|apify_token|service_key/i), 'no secret in the overview');
}

/* ═══ 12. An audit result never sets "Not interested" (Paul, 2026-10-04) ══════════════════════ */
console.log('── 6/6: a fact on screen, never a status change ──');
{
  const Q6 = ['Who are the best plumbers in Halifax, UK?', 'Can you recommend a reliable plumber in Halifax, UK?', 'Which plumbers in Halifax, UK have the best reviews?'];
  const BIZ = 'ZZ QA Elland Drains';
  const cell6 = (named: boolean) => ({ named, self_named: named, position: named ? 1 : null, citations: [], competitors: ['ZZ Rival Pennine Plumbing'], answer_text: named ? `${BIZ} is well reviewed, as is ZZ Rival Pennine Plumbing.` : 'Try ZZ Rival Pennine Plumbing or ZZ Rival Calder Gas Services.' });
  const state6 = initialHookStateV2(Q6);
  const rows6 = (grid: Array<[boolean, boolean]>) => Q6.map((q, i) => ({ id: `q${i}`, question: q, status: 'done', engines: ['chatgpt', 'gemini'], result: { chatgpt: cell6(grid[i][0]), gemini: cell6(grid[i][1]) } }));
  const run6 = { id: 'r6', audit_id: 'a6', run_number: 1, status: 'complete', mention_rate: 1, results: { hook: state6, competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
  const report6 = (grid: Array<[boolean, boolean]>) => buildReportData(rows6(grid) as never, run6 as never, { businessName: BIZ, businessType: 'plumbers', locationText: 'Halifax', specialisms: '', isAggregatorUrl: () => false, ownWebsite: 'https://zz-qa-6.example' });
  const card = (grid: Array<[boolean, boolean]>) => callCardAudit({
    lead: { id: 'l6', business_name: BIZ, phone: '07700 900636', website: 'https://zz-qa-6.example' },
    reportAudit: { id: 'a6', short_code: null, created_at: iso(T0 - DAY), business_name: BIZ, business_type: 'plumbers', location_text: 'Halifax' },
    report: report6(grid) as never, auditRunning: false, runCrawls: [], leadCrawl: null, nowMs: T0,
  });
  const all = [[true, true], [true, true], [true, true]] as Array<[boolean, boolean]>;
  const five = [[true, true], [true, false], [true, true]] as Array<[boolean, boolean]>;
  const ctx6 = { named: { businessName: BIZ, trade: 'plumbers', town: 'Halifax' }, town: 'Halifax', trade: 'plumbers' };
  ok(STRONG_VISIBILITY_HEADLINE === 'Strong AI visibility — named in all 6 answers', 'the finding reads "Strong AI visibility — named in all 6 answers"');
  ok(card(all).state === 'ready' && card(all).headline === STRONG_VISIBILITY_HEADLINE, '6/6 → the call card (and the bulk panel, same helper) shows the strong-visibility finding');
  ok(card(five).headline !== STRONG_VISIBILITY_HEADLINE && /did not name them/.test(card(five).headline), '5/6 → the missed search is still shown, never "strong"');
  const score = scoreHookRun(state6, rows6(all) as never, ctx6);
  ok(score.complete && score.allNamed && score.expected === 6, 'the stored 6/6 result itself is unchanged: scored complete, all named, six answers');
  ok(sixResultHookForbidsAbsenceCopy(state6, rows6(all) as never, ctx6), 'no contact on 6/6: every audit-based WhatsApp template is still refused (no "not named" claim), for every sender');

  // The bulk check: a 6/6 lead keeps its status, star and Next Action.
  const w = world();
  const l = addLead(w, { status: 'contacted', is_potential_work: true, next_action: 'call', next_action_date: '2026-10-06' });
  const before = JSON.stringify(l);
  await run(w, A, [l.id]);
  const it = itemFor(w, l.id);
  w.db.table('ai_audit_runs').find((r) => r.id === it.run_id)!.status = 'complete';
  await advance(w.deps, A);
  ok(itemFor(w, l.id).status === 'done', 'bulk: the 6/6 lead\'s check finishes as ready');
  ok(JSON.stringify(w.db.table('outreach_leads').find((x) => x.id === l.id)) === before, 'bulk 6/6: the lead row is byte-identical — status, star and Next Action unchanged, no follow-up created');
  ok(!w.db.writes.some((x) => x.table === 'outreach_leads' || x.table === 'lead_follow_ups'), '…and nothing wrote to the lead or a follow-up');

  // The single check and the bulk check share the audit queue: no status rule is left in it, or anywhere server-side.
  const queue = read('supabase/functions/process-ai-audit-queue/index.ts');
  ok(!existsSync(path.join(ROOT, 'supabase/functions/_shared/hook-not-interested.ts')), 'the auto "Not interested" writer (_shared/hook-not-interested.ts) is deleted');
  ok(!/autoMarkHookLeadNotInterested|autoMarkSixOfSixNotInterested|hook-not-interested/.test(queue), 'single + bulk: the audit queue no longer calls any audit → status rule (3/3 or 6/6)');
  const fnFiles: string[] = [];
  const walkFns = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walkFns(p); else if (/\.ts$/.test(e.name)) fnFiles.push(p); } };
  walkFns(path.join(ROOT, 'supabase/functions'));
  const writers = fnFiles.filter((p) => /status["']?\s*:\s*["']not_interested["']/.test(readFileSync(p, 'utf8')));
  ok(fnFiles.length > 100 && writers.length === 0, `no edge function writes a "not_interested" status at all (${writers.map((p) => path.relative(ROOT, p)).join(', ') || 'none'})`);
  const hv = read('src/components/HookVisibilityView.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/score\.allNamed \?/.test(hv) && !/\.update\(|\.rpc\(|invoke\(/.test(hv), 'single check: the card shows "Named in all six results" and writes nothing');

  // A person can still record it.
  ok(maySetStatus(leadPermissions('sales'), 'not_interested') && maySetStatus(leadPermissions('admin'), 'not_interested'), 'a salesperson (and the admin) can still set Not interested by hand');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
