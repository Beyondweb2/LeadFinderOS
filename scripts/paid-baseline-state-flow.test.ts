/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAID-BASELINE STATE MACHINE — approve once, start once, one poller, no duplicate audit.

   🔴 THE INCIDENT (MCLocksmiths, 2026-09-22). The Prepare Baseline dialog ran save → approve → run
   and after EACH step reloaded the parent page, whose page-level `loading` unmounted the dialog
   mid-chain (the spinner loop). The run step was then silently deferred by the engine
   ("awaiting_questionnaire_2 (services)") because approve never asked the engine's own start gate,
   so the row sat at `approved` with the frozen questions on screen and nothing to press. And
   three starters (operator, 30-second backstop, webhook) all read "no baseline yet" before writing,
   so two inside one second could both buy one.

   Run: npx tsx scripts/paid-baseline-state-flow.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { approveAndStart, createSingleFlight, startApproved, type FlowBaseline } from '../src/lib/paidBaselineFlow';
import {
  START_CLAIM_STALE_MS, START_IN_PROGRESS_SKIP, EDITABLE_BASELINE_STATUS_FILTER,
  canClaimStart, describeStartSkip, hubBaselineStatus, isFrozenBaselineStatus, isStartedBaselineStatus,
  normalizePaidBaselineStatus, paidBaselineRunState, paidBaselineStatusLabel, startClaimFilter,
} from '../src/lib/paidBaselineState';
import { auditKind, findPaidBaseline } from '../src/lib/auditKind';
import { BASELINE_QUESTIONS, BASELINE_RUNS } from '../src/lib/auditQuestionCounts';
import { mergeClientContext } from '../src/lib/clientContext';

const root = resolve(import.meta.dirname, '..');
/* LF-normalised: the checkout is CRLF (CLAUDE.md §0), and every multi-line needle below is written with \n. */
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const hub = read('src/pages/ClientHub.tsx');
const setup = read('src/pages/PaidBaselineSetup.tsx');
const edge = read('supabase/functions/paid-baseline/index.ts');
const engine = read('supabase/functions/_shared/audit-baseline.ts');
const hubFn = read('supabase/functions/paid-client-hub/index.ts');
const helper = read('src/lib/paidBaseline.ts');
const startPaidBaseline = engine.slice(engine.indexOf('export async function startPaidBaseline'), engine.indexOf('export async function preparePaidBaselineQuestions'));

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const twenty = Array.from({ length: BASELINE_QUESTIONS }, (_, i) => `Question ${i + 1} for Canterbury?`);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/* A fake paid-baseline server: records every call, answers like the edge function. */
function fakeServer(runOutcome: 'running' | 'starting' | 'throw' | 'legacy_skip') {
  const calls: string[] = [];
  let status = 'needs_approval';
  const invoke = async (action: string, extra: Record<string, unknown> = {}): Promise<FlowBaseline> => {
    calls.push(action);
    await new Promise((r) => setTimeout(r, 5));
    if (action === 'approve') { status = 'approved'; return { status, questions: extra.questions as string[] }; }
    if (action === 'run') {
      if (runOutcome === 'throw') throw new Error('The baseline did not start: create-ai-audit refused: Apify monthly cap reached. The approved questions are kept — fix the cause and press Start again.');
      if (runOutcome === 'legacy_skip') return { status: 'approved', questions: twenty, start_note: 'awaiting_questionnaire_2 (services)' };
      status = runOutcome;
      return { status, questions: twenty, ...(runOutcome === 'running' ? { audit_id: 'audit-1' } : {}) };
    }
    return { status, questions: twenty };
  };
  return { calls, invoke, status: () => status };
}

async function main() {
  // 1 + 2. Approve fires once, start fires once — even when the button is pressed twice mid-flight.
  {
    const server = fakeServer('running');
    const flight = createSingleFlight();
    const first = flight.run(() => approveAndStart(server.invoke, twenty));
    const second = flight.run(() => approveAndStart(server.invoke, twenty));
    const [r1, r2] = await Promise.all([first, second]);
    check('1. approval fires once under a double click', server.calls.filter((c) => c === 'approve').length === 1);
    check('2. start fires once under a double click', server.calls.filter((c) => c === 'run').length === 1);
    check('2. the chain is exactly approve then run — no redundant save', server.calls.join(',') === 'approve,run');
    check('2. the second press is refused without a request', r2 === undefined && !flight.busy());
    check('5. a successful chain ends in the running state', r1?.ok === true && r1.baseline.status === 'running' && r1.baseline.audit_id === 'audit-1');
  }
  // 5. A claim lost to another starter is shown as starting, not as a failure.
  {
    const server = fakeServer('starting');
    const r = await approveAndStart(server.invoke, twenty);
    check('5. a start claimed by another caller is reported as starting', r.ok && r.baseline.status === 'starting');
    check('5. run state helper maps start_in_progress to starting', paidBaselineRunState({ skipped: START_IN_PROGRESS_SKIP }).status === 'starting');
    check('5. run state helper still maps a created audit to running', paidBaselineRunState({ audit_id: 'a' }).status === 'running');
  }
  // 6. The backend's real error is what the operator reads.
  {
    const thrown = await startApproved(fakeServer('throw').invoke, { status: 'approved', questions: twenty });
    check('6. a thrown server refusal is surfaced verbatim', !thrown.ok && thrown.step === 'run' && thrown.error.includes('Apify monthly cap reached'));
    const legacy = await startApproved(fakeServer('legacy_skip').invoke, { status: 'approved', questions: twenty });
    check('6. an "approved but waiting" skip becomes a sentence naming the missing field', !legacy.ok && legacy.error === describeStartSkip('awaiting_questionnaire_2 (services)') && legacy.error.includes('services'));
    check('6. the helper prefers the server detail sentence over the token', read('src/lib/edgeInvokeCore.ts').includes("payload?.detail === 'string'") && helper.includes('e.detail || (e.code && (FRIENDLY_ERRORS[e.code] ?? e.code))'));
    check('6. run refusals carry a detail sentence and never mark the row failed', edge.includes('detail: describeStartSkip(started.skipped)') && !edge.includes('baseline_status: "failed"'));
    check('6. approve asks the engine’s own start gate before freezing', edge.includes('const refusal = contextRefusal(row, details);') && edge.includes('baseline_context_incomplete') && edge.includes('missingQuestionnaireFields'));
    check('6. the dialog shows the error inline, not only as a toast', count(hub, 'role="alert"') >= 2 && hub.includes('{error && <div role="alert"'));
    // 4. Stale state: the parent refresh no longer unmounts the dialog, and the chain refreshes it once.
    const refreshBlock = hub.slice(hub.indexOf('const refresh = useCallback'), hub.indexOf('const bs = hubBaselineStatus'));
    check('4. the hub refresh never flips the page-level loading flag', refreshBlock.length > 0 && !refreshBlock.includes('setLoading'));
    check('4. the dialog refreshes the parent once per chain, not per step', count(hub, 'await onChanged();') === 1 && !hub.includes("await onChanged(); return next;"));
    check('4. the dialog is mounted from state the parent keeps across refreshes', hub.includes('<BaselineSetupDialog leadId={lead.id} open={baselineOpen}') && hub.includes('onChanged={refresh}'));
  }
  // 3 + 10. One poller, read-only; the start is claimed atomically so two starters cannot both buy.
  {
    check('3. the hub has exactly one poller', count(hub, 'setInterval(') === 1 && hub.includes("if (!(bs === 'starting' || bs === 'running')) return;"));
    check('3. the poller only reads the hub', hub.includes('void refresh();') && !hubFn.includes('startPaidBaseline') && !hubFn.includes('create-ai-audit'));
    const now = Date.now();
    const row = { baseline_status: 'approved', updated_at: new Date(now).toISOString() };
    const aClaims = canClaimStart(row, now);
    row.baseline_status = 'starting'; row.updated_at = new Date(now).toISOString();
    const bClaims = canClaimStart(row, now + 1_000);
    check('10. the first starter claims, the second cannot', aClaims && !bClaims);
    check('10. a crashed claim is reclaimable only after it goes stale', !canClaimStart(row, now + START_CLAIM_STALE_MS) && canClaimStart(row, now + START_CLAIM_STALE_MS + 1));
    check('10. a starting row with no readable claim time is left alone', !canClaimStart({ baseline_status: 'starting', updated_at: null }, now));
    check('10. running and complete rows are never claimable', !canClaimStart({ baseline_status: 'running', updated_at: '2020-01-01T00:00:00Z' }, now) && !canClaimStart({ baseline_status: 'complete', updated_at: '2020-01-01T00:00:00Z' }, now));
    check('10. the database filter encodes the same rule', startClaimFilter(now) === `baseline_status.eq.approved,and(baseline_status.eq.starting,updated_at.lt.${new Date(now - START_CLAIM_STALE_MS).toISOString()})`);
    const claimAt = startPaidBaseline.indexOf('.update({ baseline_status: "starting", updated_at: new Date().toISOString() })');
    const createAt = startPaidBaseline.indexOf('const res = await fetch(`${supabaseUrl}/functions/v1/create-ai-audit`');
    check('10. the engine claims before it spends', claimAt > 0 && createAt > claimAt && startPaidBaseline.includes('.or(startClaimFilter(Date.now())).select("id").maybeSingle()'));
    check('10. a lost claim returns start_in_progress without calling create-ai-audit', startPaidBaseline.includes('if (!claimed) return { ok: true, skipped: START_IN_PROGRESS_SKIP };'));
    check('10. a refused create releases the claim back to approved', startPaidBaseline.includes('await releaseClaim();\n      return { ok: false, error: `create-ai-audit refused') && engine.includes('.eq("id", onboardingId).eq("baseline_status", "starting");'));
    check('10. a throw after the claim releases it too', engine.includes('try { await releaseClaim(); } catch {'));
    check('10. an existing audit repairs the row instead of buying again', startPaidBaseline.includes('.in("baseline_status", ["approved", "starting"]);\n      return { ok: true, audit_id: already.id, skipped: "already_has_baseline" };'));
    check('10. the edge function answers a starting row before it can start anything', edge.indexOf('if (isStartedBaselineStatus(status)) return json({ ok: true, baseline: details, skipped: "already_started" });') < edge.indexOf('await startPaidBaseline(service') && isStartedBaselineStatus('starting'));
    check('10. approving an already-approved row is a no-op', edge.includes('if (status === "approved") return json({ ok: true, baseline: details, skipped: "already_approved" });'));
  }
  // 7. The spinner is the app's blue accent.
  {
    check('7. the hub spinner component carries the primary accent', hub.includes('animate-spin text-primary'));
    check('7. no bare white spinner remains in the hub', !/<Loader2 className="animate-spin"\s*\/>/.test(hub));
    check('7. page and dialog loading states use the accented spinner', hub.includes('<div className="flex justify-center py-16"><Spinner') && hub.includes('<div className="flex justify-center py-12"><Spinner'));
    check('7. the setup page spinner keeps the accent', setup.includes('animate-spin text-primary'));
  }
  // 8. Discovery remains separate research.
  {
    const discovery = { id: 'disc', audit_purpose: 'discovery', baseline_target_runs: 3, baseline_contract: null };
    check('8. a discovery scan is graded discovery, never a baseline', auditKind(discovery) === 'discovery' && findPaidBaseline([discovery]) === null);
    const discoverySelect = edge.match(/\.select\("([^"]+)"\)\s*\n\s*\.eq\("lead_id", row\.lead_id\)\.eq\("audit_purpose", "discovery"\)/)?.[1] ?? '';
    check('8. the baseline reads discovery business facts only, never its questions', discoverySelect.length > 0 && !discoverySelect.includes('question'));
    const merged = mergeClientContext({
      onboarding: { confirmed_location: 'Canterbury' },
      lead: { search_keyword: 'Locksmiths', website: 'https://mc-locksmiths.com/' },
      discovery: { business_type: 'Locksmiths', location_text: 'Canterbury', specialism: 'Emergency entry, Lock changes' },
    });
    check('8. discovery services prefill with their source named', merged.services.join('|') === 'Emergency entry|Lock changes' && merged.service_sources['Emergency entry']?.includes('discovery') === true);
    const bare = mergeClientContext({ onboarding: { confirmed_location: 'Canterbury' }, lead: { search_keyword: 'Locksmiths' }, discovery: { specialism: null } });
    check('8. nothing is invented when no verified source holds services (MCLocksmiths today)', bare.services.length === 0 && bare.business_category === 'Locksmiths');
  }
  // 9. The paid baseline stays exactly 20 x 3.
  {
    check('9. the constants are 20 questions and 3 runs', BASELINE_QUESTIONS === 20 && BASELINE_RUNS === 3);
    check('9. approve refuses any count but BASELINE_QUESTIONS', edge.includes('if (next.length !== BASELINE_QUESTIONS) {'));
    check('9. the engine queues the approved set verbatim for BASELINE_RUNS runs', startPaidBaseline.includes('baseline_target_runs: BASELINE_RUNS') && startPaidBaseline.includes('questions: approvedQuestions'));
    check('9. the dialog disables approve until exactly BASELINE_QUESTIONS are present', hub.includes('disabled={!!busy || count !== BASELINE_QUESTIONS'));
    check('9. the setup page does the same', setup.includes('lines.length !== BASELINE_QUESTIONS'));
  }
  // 11. Existing baselines and legacy rows are unaffected.
  {
    check('11. a finished legacy baseline (no stored status) reads complete', hubBaselineStatus({ baseline_status: null }, { baseline_completed_at: '2026-09-01T00:00:00Z' }) === 'complete');
    check('11. an unfinished legacy baseline reads running', hubBaselineStatus(null, { baseline_completed_at: null }) === 'running');
    check('11. a stored status wins over the audit', hubBaselineStatus({ baseline_status: 'complete' }, null) === 'complete' && hubBaselineStatus({ baseline_status: 'approved' }, null) === 'approved');
    check('11. a null status is still needs_questions and still editable', normalizePaidBaselineStatus(null) === 'needs_questions' && EDITABLE_BASELINE_STATUS_FILTER.includes('baseline_status.is.null'));
    check('11. the engine still skips rows without approved questions', startPaidBaseline.includes('? "awaiting_operator_run" : "needs_baseline_questions"'));
    check('11. the freeze hook marks starting rows complete too', engine.includes('.in("baseline_status", ["running", "starting", "approved"]);'));
    check('11. frozen and started sets are the documented ones', isFrozenBaselineStatus('approved') && isFrozenBaselineStatus('starting') && !isFrozenBaselineStatus('needs_approval') && isStartedBaselineStatus('running') && !isStartedBaselineStatus('approved'));
    check('11. the hub function reads a real runs column list', hubFn.includes('select("id,run_number,status,created_at")') && !/from\("ai_audit_runs"\)\.select\("[^"]*completed_at/.test(hubFn));
  }
  // UX: one label per state.
  {
    const labels = ['needs_questions', 'needs_approval', 'approved', 'starting', 'running', 'complete', 'failed'].map(paidBaselineStatusLabel);
    check('UX. every status has a distinct operator label', new Set(labels).size === labels.length && labels.includes('Starting baseline') && labels.includes('Ready for approval') && labels.includes('Baseline running') && labels.includes('Baseline completed') && labels.includes('Error'));
    check('UX. the section A save is only offered when something changed', hub.includes('disabled={!!busy || !contextDirty}'));
    check('UX. context stays editable on an approved row so a missing service can be added', hub.includes('disabled={started || !!busy}') && edge.includes('if (isStartedBaselineStatus(status)) return json'));
  }

  let failures = 0;
  for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
  if (failures) throw new Error(`${failures} failures`);
}

main().catch((e) => { console.error(e); process.exit(1); });
