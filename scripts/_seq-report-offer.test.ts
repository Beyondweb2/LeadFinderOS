/* THROWAWAY (deploy check, 2026-10-15, never committed): the report-offer send path through the REAL
   resolveAuditReplyVars with mocked data. A sequential hook that stopped is accepted; a still-running,
   provider-failed or failed-run audit is refused. Nothing sends. */
import { HOOK_ENGINES, advanceSequentialHook, initialSequentialHookStateV2, type HookScoreRow, type HookStateV2 } from '../src/lib/hookScore.ts';
import { HOOK_INCOMPLETE_REASON, resolveAuditReplyVars } from '../supabase/functions/_shared/audit-reply.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  if (value) console.log(`PASS ${message}`);
  else { failures++; console.error(`FAIL ${message}`); }
}

const BIZ = 'Jones Electrical';
const NAMED = { businessName: BIZ, trade: 'electricians', town: 'Addlestone' };
const Q = [
  'Who are the best electricians in Addlestone?',
  'Who would you recommend for an EICR in Addlestone?',
  'Who is a reliable electrician for electrical repairs in Addlestone?',
];
const RIVALS = { chatgpt: ['Bright Spark Ltd', 'Current Electrical', 'Watt Works'], gemini: ['Ohm Services', 'Volt Masters', 'Circuit Pros'] };
function cell(engine: 'chatgpt' | 'gemini', named: boolean | 'fail') {
  if (named === 'fail') return { named: false, answer_text: '', competitors: [], error: 'timeout' };
  const r = RIVALS[engine];
  return { named, self_named: named, answer_text: named ? `Good options: ${BIZ}, ${r.join(', ')}.` : `Good options: ${r.join(', ')}.`, competitors: r, citations: [] };
}
type Pair = [boolean | 'fail', boolean | 'fail'];

/** Drive the sequential rule exactly as the queue does; stop early with `stopAfter` to leave it mid-run. */
function drive(answers: Pair[], stopAfter?: number): { state: HookStateV2; rows: HookScoreRow[] } {
  let state = initialSequentialHookStateV2(Q);
  const rows: HookScoreRow[] = [];
  for (let i = 0; i < answers.length; i++) {
    const q = Q[Number(state.next_index) - 1];
    const result = { chatgpt: cell('chatgpt', answers[i][0]), gemini: cell('gemini', answers[i][1]) };
    rows.push({ question: q, status: 'done', engines: [...HOOK_ENGINES], result });
    if (stopAfter !== undefined && i + 1 >= stopAfter) break;
    const step = advanceSequentialHook(state, result, NAMED);
    state = step.state;
    if (step.action === 'stop') break;
  }
  return { state, rows };
}

function fakeService(opts: { hookState: unknown; qrows: HookScoreRow[]; runStatus?: string }) {
  const audit = {
    id: 'audit-1', short_code: 'abc234', business_name: BIZ, business_type: 'electricians', location_text: 'Addlestone',
    specialism: null, country: 'UK', created_at: '2026-10-15T08:00:00Z', baseline_target_runs: null, is_measurement: false,
    ai_audit_runs: [{ id: 'run-1', run_number: 1, status: opts.runStatus ?? 'complete', mention_rate: 0.5, created_at: '2026-10-15T08:00:00Z',
      results: { hook: opts.hookState, competitor_cleaning: { complete: true, at: '2026-10-15T08:05:00Z', attempts: 1, errors: [] } } }],
  };
  const tableData = (t: string): unknown => t === 'ai_audits' ? [audit]
    : t === 'ai_audit_queue' ? opts.qrows.map((r, i) => ({ id: String(i), ...r }))
    : t === 'outreach_leads' ? { category: 'electricians', search_keyword: null, website: null }
    : null;
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'not', 'or', 'in']) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: tableData(table), error: null });
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tableData(table), error: null }).then(res);
      return chain;
    },
  };
}

const T = 'ai_visibility_report_offer';

await (async () => {
  /* 1. Sequential, stopped on Q1 (Gemini missed): 1 question asked, 2 results. ACCEPTED. */
  {
    const { state, rows } = drive([[true, false]]);
    ok(state.stop_reason === 'not_named' && state.executed === 1, `1: stopped not_named after 1 question (${state.stop_reason}, ${state.executed})`);
    const v = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows }), 'lead-1', { templateName: T });
    ok(v.ok, `1: sequential not_named after Q1 is ACCEPTED (${v.ok ? 'ok' : (v as { reason: string }).reason})`);
    if (v.ok) {
      ok(JSON.stringify(v.rivals) === JSON.stringify(RIVALS.gemini), `1: rivals are Q1's Gemini rivals (${v.rivals.join(', ')})`);
      ok(v.visibilityPct === 50, `1: {{4}} score is the asked prefix's, 1 of 2 named = 50% (${v.visibilityPct})`);
    }
  }
  /* 2. Sequential, stopped on Q2 (ChatGPT missed). ACCEPTED. */
  {
    const { state, rows } = drive([[true, true], [false, true]]);
    const v = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows }), 'lead-1', { templateName: T });
    ok(state.stop_reason === 'not_named' && state.executed === 2, '2: stopped not_named after 2 questions');
    ok(v.ok, `2: sequential not_named after Q2 is ACCEPTED (${v.ok ? 'ok' : (v as { reason: string }).reason})`);
  }
  /* 3. Sequential, STILL RUNNING (Q1 settled, next queued, no stop_reason). REFUSED as incomplete. */
  {
    const { state, rows } = drive([[true, true], [true, true]], 1);
    const running = { ...state, next_index: 2, stop_reason: null };
    const v = await resolveAuditReplyVars(fakeService({ hookState: running, qrows: rows }), 'lead-1', { templateName: T });
    ok(!v.ok && (v as { reason: string }).reason.startsWith(HOOK_INCOMPLETE_REASON), `3: in-progress sequential is REFUSED (${v.ok ? 'ok' : (v as { reason: string }).reason.slice(0, 40)})`);
  }
  /* 4. Sequential, provider failure on Q1. REFUSED. */
  {
    const { state, rows } = drive([[true, 'fail']]);
    ok(state.stop_reason === 'provider_failure', '4: stopped provider_failure');
    const v = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows }), 'lead-1', { templateName: T });
    ok(!v.ok && (v as { reason: string }).reason.startsWith(HOOK_INCOMPLETE_REASON), `4: provider-failed sequential is REFUSED (${v.ok ? 'ok' : (v as { reason: string }).reason.slice(0, 40)})`);
  }
  /* 5. The RUN itself failed (or is still running). REFUSED before any scoring: no completed audit. */
  for (const runStatus of ['failed', 'running', 'pending']) {
    const { state, rows } = drive([[true, false]]);
    const v = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows, runStatus }), 'lead-1', { templateName: T });
    ok(!v.ok && /No completed audit/.test((v as { reason: string }).reason), `5: run status ${runStatus} is REFUSED (${v.ok ? 'ok' : (v as { reason: string }).reason.slice(0, 40)})`);
  }
  /* 6. Sequential, all named to the ceiling (3/3): no absence to claim. REFUSED by the all-named guard. */
  {
    const { state, rows } = drive([[true, true], [true, true], [true, true]]);
    ok(state.stop_reason === 'max_questions_reached', '6: stopped max_questions_reached');
    const v = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows }), 'lead-1', { templateName: T });
    ok(!v.ok && /hook_no_visibility_gap/.test((v as { reason: string }).reason), `6: all-named sequential is REFUSED as no gap`);
  }
})();

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll sequential report-offer checks passed.');
