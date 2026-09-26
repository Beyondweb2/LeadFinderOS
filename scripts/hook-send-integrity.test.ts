/* The six-result hook's last three corrections (Paul, 2026-09-26):
     A/B. the WhatsApp rivals are the SELECTED hook result's own competitors (same question, same
          engine), driven through the real resolveAuditReplyVars and the real payload builder;
     C/D. a new hook has exactly three questions, topped up safely, or it is incomplete;
     E.   every user-facing hook surface says "Google AI", never "Gemini". */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOOK_ENGINE_LABELS, HOOK_SCORE_QUESTIONS, initialHookStateV2, scoreHookRun, topUpHookQuestions, type HookScoreRow } from '../src/lib/hookScore.ts';
import { buildHookReportSummary, hookReportCopy } from '../src/lib/hookAudit.ts';
import { buildReportData } from '../src/lib/auditReport.ts';
import { renderReportHtml } from '../src/lib/aiAuditReportHtml.ts';
import { TEMPLATE_SINGLE_ENGINE_CLAIM, templateEngineConflict } from '../src/lib/rivalHook.ts';
import { HOOK_INCOMPLETE_REASON, resolveAuditReplyVars } from '../supabase/functions/_shared/audit-reply.ts';
import { autoMarkSixOfSixNotInterested } from '../supabase/functions/_shared/hook-not-interested.ts';
import { WA_TEMPLATES, renderTemplateBody, templateBodyParams } from '../supabase/functions/_shared/whatsapp-send.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  if (value) console.log(`PASS ${message}`);
  else { failures++; console.error(`FAIL ${message}`); }
}

const BIZ = 'Jones Electrical';
const Q = [
  'Who are the best electricians in Addlestone?',
  'Who would you recommend for an EICR in Addlestone?',
  'Who is a reliable electrician for electrical repairs in Addlestone?',
];
/* Every cell names a DIFFERENT three firms, so any mixing is visible. "Everywhere Electrical" is
   in every cell except the ones a hook is picked from, so it is the audit-wide leader. A resolver
   that read the whole audit would name it. */
const CELL_RIVALS: Record<string, string[]> = {
  '0:chatgpt': ['Bright Spark Ltd', 'Current Electrical', 'Watt Works'],
  '0:gemini': ['Ohm Services', 'Volt Masters', 'Circuit Pros'],
  '1:chatgpt': ['Fuse Box Co', 'Live Wire Electrical', 'Amp Up Ltd'],
  '1:gemini': ['Switch Electrical', 'Socket Solutions', 'Mains Men'],
  '2:chatgpt': ['Plug Electrical', 'Cable Crew', 'Earthing Experts'],
  '2:gemini': ['Relay Electrical', 'Breaker Bros', 'Conduit Co'],
};
function cell(qi: number, engine: string, named: boolean, withLeader: boolean) {
  const rivals = [...CELL_RIVALS[`${qi}:${engine}`], ...(withLeader ? ['Everywhere Electrical'] : [])];
  const text = named ? `Good options: ${BIZ}, ${rivals.join(', ')}.` : `Good options: ${rivals.join(', ')}.`;
  return { named, self_named: named, answer_text: text, competitors: named ? rivals : rivals, citations: [] };
}
/** grid[i] = [chatgptNamed, geminiNamed]. Missed cells carry no leader, so a hook pick cannot see it. */
function rows(grid: Array<[boolean, boolean]>, questions = Q): HookScoreRow[] {
  return grid.map(([c, g], i) => ({
    question: questions[i], status: 'done', engines: ['chatgpt', 'gemini'],
    result: { chatgpt: cell(i, 'chatgpt', c, c), gemini: cell(i, 'gemini', g, g) },
  }));
}

/** Enough of supabase-js for resolveAuditReplyVars: every chain resolves to its table's data. */
function fakeService(opts: { hookState: unknown; qrows: HookScoreRow[] }) {
  const audit = {
    id: 'audit-1', short_code: 'abc234', business_name: BIZ, business_type: 'electricians', location_text: 'Addlestone',
    specialism: null, country: 'UK', created_at: '2026-09-26T08:00:00Z', baseline_target_runs: null, is_measurement: false,
    ai_audit_runs: [{ id: 'run-1', run_number: 1, status: 'complete', mention_rate: 0.5, created_at: '2026-09-26T08:00:00Z',
      results: { hook: opts.hookState, competitor_cleaning: { complete: true, at: '2026-09-26T08:05:00Z', attempts: 1, errors: [] } } }],
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

function competitorHookParams(rivals: string[]): string {
  return JSON.stringify(templateBodyParams(WA_TEMPLATES.competitor_hook.vars, BIZ, 'https://findable.live/r/abc234',
    { trade: 'electricians', rivals, auditUrl: 'https://findable.live/r/abc234', templateName: 'competitor_hook' }));
}

const state = initialHookStateV2(Q);

await (async () => {
  /* A. Google AI hook → that question's own Google AI competitors */
  {
    const grid: Array<[boolean, boolean]> = [[true, true], [true, false], [true, true]];
    const v = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows(grid) }), 'lead-1', { templateName: 'competitor_hook' });
    ok(v.ok, 'A: resolves');
    if (v.ok) {
      ok(v.hookEngine === 'gemini' && v.hookQuestion === Q[1], 'A: the selected hook is the Google AI miss on Q2');
      ok(JSON.stringify(v.rivals) === JSON.stringify(CELL_RIVALS['1:gemini']), `A: the rivals are exactly Q2's Google AI competitors (${v.rivals.join(', ')})`);
      ok(!v.rivals.includes('Everywhere Electrical') && !v.competitors.includes('Everywhere Electrical'), 'A: the audit-wide leader is never used');
      ok(!v.rivals.some((n) => CELL_RIVALS['1:chatgpt'].includes(n) || CELL_RIVALS['0:gemini'].includes(n)), 'A: no ChatGPT names and no other question\'s names');
      const params = competitorHookParams(v.rivals);
      ok(CELL_RIVALS['1:gemini'].every((n) => params.includes(n)) && !params.includes('Everywhere Electrical'), 'A: the competitor_hook payload sent to Meta carries exactly those three');
      const body = renderTemplateBody('competitor_hook', v.business, v.link, v.trade, v.competitors);
      ok(body.includes('Switch Electrical, Socket Solutions and Mains Men'), 'A: the rendered transcript names the same three');
    }
    // A single-engine body cannot carry a Google AI hook's names.
    const f = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows(grid) }), 'lead-1', { templateName: 'audit_followup' });
    ok(!f.ok && f.reason.startsWith('hook_engine_mismatch'), 'A: audit_followup ("I asked chatgpt") is refused for a Google AI hook, never misattributed');
  }
  /* B. ChatGPT fallback hook → that ChatGPT result's competitors */
  {
    const grid: Array<[boolean, boolean]> = [[true, true], [true, true], [false, true]];
    const v = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows(grid) }), 'lead-1', { templateName: 'competitor_hook' });
    ok(v.ok && v.hookEngine === 'chatgpt' && v.hookQuestion === Q[2], 'B: Google AI named them everywhere, so the ChatGPT miss on Q3 is the hook');
    if (v.ok) {
      ok(JSON.stringify(v.rivals) === JSON.stringify(CELL_RIVALS['2:chatgpt']), `B: the rivals are exactly Q3's ChatGPT competitors (${v.rivals.join(', ')})`);
      ok(!v.rivals.some((n) => CELL_RIVALS['2:gemini'].includes(n)) && !v.rivals.includes('Everywhere Electrical'), 'B: no Google AI names, no audit-wide leader');
      ok(competitorHookParams(v.rivals).includes('Plug Electrical'), 'B: the payload carries the ChatGPT cell\'s names');
    }
    const f = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: rows(grid) }), 'lead-1', { templateName: 'audit_followup' });
    ok(f.ok, 'B: audit_followup ("I asked chatgpt") is allowed when the hook really is a ChatGPT result');
  }
  /* An ordinary (non-hook) audit keeps the audit-wide leaders, exactly as before. */
  {
    const v = await resolveAuditReplyVars(fakeService({ hookState: undefined, qrows: rows([[false, false], [false, false], [false, false]]) }), 'lead-1', { templateName: 'competitor_hook' });
    ok(v.ok && v.hookEngine === null, 'an audit with no hook still resolves from the whole audit (unchanged behaviour)');
  }

  /* D (resolver): an incomplete six-result hook has nothing to quote. */
  {
    const short = initialHookStateV2(Q.slice(0, 2));
    const v = await resolveAuditReplyVars(fakeService({ hookState: short, qrows: rows([[true, false], [true, true]]) }), 'lead-1', { templateName: 'competitor_hook' });
    ok(!v.ok && v.reason.startsWith(HOOK_INCOMPLETE_REASON), 'D: a two-question hook is refused (no hook search), never backfilled from the audit');
    const failed = rows([[true, false], [true, true], [true, true]]);
    failed[2] = { ...failed[2], result: { chatgpt: cell(2, 'chatgpt', true, true), gemini: { error: 'timeout', answer_text: '', competitors: [], citations: [] } } };
    const w = await resolveAuditReplyVars(fakeService({ hookState: state, qrows: failed }), 'lead-1', { templateName: 'competitor_hook' });
    ok(!w.ok && w.reason.startsWith(HOOK_INCOMPLETE_REASON), 'D: a hook with a failed result is refused too (no final score)');
  }
})();

/* The single-engine map covers every registered body that says it asked ONE engine. */
{
  const single = /\basked\s+(chatgpt|gemini|google(?:'s)? ai)\b(?!\s+(?:and|or)\b)/i;
  for (const name of Object.keys(WA_TEMPLATES)) {
    let body = '';
    try { body = renderTemplateBody(name, BIZ, 'https://x', 'electricians', 'A, B and C', 'Sam', 'Addlestone', 'fault', 'findings'); } catch { continue; }
    const m = body.match(single);
    if (m) ok(!!TEMPLATE_SINGLE_ENGINE_CLAIM[name], `${name}'s body says "asked ${m[1]}" and is in TEMPLATE_SINGLE_ENGINE_CLAIM`);
  }
  ok(templateEngineConflict('competitor_hook', 'gemini') === null, 'competitor_hook ("ChatGPT and Gemini") can carry either engine\'s hook');
  ok(templateEngineConflict('audit_followup_call', 'gemini') === null, 'audit_followup_call ("i asked AI") can carry either engine\'s hook');
}

/* C. The planner returned two valid questions → a safe generic third is added. */
{
  const two = ['Who are the best electricians in Addlestone UK?', 'Who would you recommend for an EICR in Addlestone UK?'];
  const out = topUpHookQuestions(two, { trade: 'electricians', place: 'Addlestone UK' });
  ok(out.length === HOOK_SCORE_QUESTIONS && out[0] === two[0] && out[1] === two[1], 'C: topped up to three, the two planned kept in order');
  ok(/^(Who is the best|Can you recommend a reliable|Who is a recommended local) electrician in Addlestone UK\?$/.test(out[2]), `C: the third is a generic trade + place question (${out[2]})`);
  ok(!/eicr|rewire|repair|install|boiler/i.test(out[2]), 'C: no service is invented');
  const one = topUpHookQuestions(['Who is the best electrician in Addlestone UK?'], { trade: 'electricians', place: 'Addlestone UK' });
  ok(one.length === 3 && new Set(one.map((q) => q.toLowerCase())).size === 3, 'C: one question tops up to three distinct ones (a duplicate generic is skipped)');
  ok(topUpHookQuestions(Q, { trade: 'electricians', place: 'Addlestone' }).length === 3, 'C: a full plan is untouched');
}

/* D. Cannot safely produce three → incomplete, no X/6, no auto Not Interested. */
await (async () => {
  ok(topUpHookQuestions(['q1'], { trade: '', place: 'Addlestone' }).length === 1, 'D: no trade → nothing added');
  ok(topUpHookQuestions(['q1'], { trade: 'electricians', place: '' }).length === 1, 'D: no place → nothing added');
  ok(topUpHookQuestions(['q1'], { trade: 'plumbing, heating & gas 24/7', place: 'Addlestone' }).length === 1, 'D: an unreadable trade → nothing added (articleTrade refuses)');
  const short = initialHookStateV2(Q.slice(0, 2));
  const allNamed = rows([[true, true], [true, true]]);
  const s = scoreHookRun(short, allNamed, { named: { businessName: BIZ, trade: 'electricians', town: 'Addlestone' } });
  ok(s.questionShortfall && !s.complete && s.percent === null && !s.allNamed && s.hook === null, 'D: two questions all named → incomplete, no percentage, no 4/4 dressed as a result, no hook');
  ok(buildHookReportSummary({ state: short, rows: allNamed, engineOrder: ['chatgpt', 'gemini'], engineLabel: (e) => HOOK_ENGINE_LABELS[e], namedInstead: (c) => c }) === null, 'D: no hook report summary');
  const calls: string[] = [];
  const svc = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'not', 'or']) chain[m] = () => chain;
      chain.update = () => { calls.push(`update:${table}`); return chain; };
      chain.maybeSingle = async () => ({ data: table === 'ai_audits' ? { lead_id: 'lead-1', business_name: BIZ, business_type: 'electricians', location_text: 'Addlestone' } : { results: { hook: short } }, error: null });
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: table === 'ai_audit_queue' ? allNamed : [{ id: 'lead-1' }], error: null }).then(res);
      return chain;
    },
  };
  const out = await autoMarkSixOfSixNotInterested(svc, 'audit-1', 'run-1');
  ok(!out.applied && out.reason === 'not_six_of_six' && calls.length === 0, 'D: never auto-marked Not Interested, nothing written');
})();

/* E. Every user-facing hook surface says Google AI. */
{
  ok(HOOK_ENGINE_LABELS.gemini === 'Google AI' && HOOK_ENGINE_LABELS.chatgpt === 'ChatGPT', 'E: one label map: ChatGPT / Google AI');
  const c = (n: boolean) => ({ named: n, self_named: n, answer_text: n ? `Try ${BIZ} or Sparks Ltd.` : 'Try Sparks Ltd, Volt Electrical or Power Co.', competitors: ['Sparks Ltd', 'Volt Electrical', 'Power Co'], citations: [] });
  for (const g of [[true, false, true], [true, true, true]]) {
    const qr = Q.map((q, i) => ({ id: String(i), question: q, status: 'done', result: { chatgpt: c(true), gemini: c(g[i]) } }));
    const run = { id: 'r', run_number: 1, status: 'complete', mention_rate: 1, results: { hook: state, competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
    const d = buildReportData(qr as never, run as never, { businessName: BIZ, businessType: 'electricians', locationText: 'Addlestone', specialisms: '', isAggregatorUrl: () => false });
    const html = renderReportHtml({ ...(d as object), generatedAtLabel: '26 September 2026' } as never);
    const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    const label = g.every(Boolean) ? '6/6 hook report' : 'gap hook report';
    ok(!/gemini/i.test(text) && /Google AI/.test(text), `E: the ${label} says Google AI and never Gemini`);
    if (d?.hook?.gap) ok(hookReportCopy(d.hook, BIZ).headline === "Google AI didn't name you for this search.", 'E: the prospect headline is "Google AI didn\'t name you for this search."');
  }
  const root = resolve(import.meta.dirname, '..');
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const card = strip(readFileSync(resolve(root, 'src/components/HookVisibilityCard.tsx'), 'utf8'));
  ok(!/Gemini/.test(card), 'E: the Inbox AI visibility card never says Gemini');
  const inbox = readFileSync(resolve(root, 'src/pages/Inbox.tsx'), 'utf8');
  ok(inbox.includes('Google AI {geminiNamed}/{geminiAnswers}') && !/>\s*Gemini \{geminiNamed\}/.test(inbox), 'E: the Inbox list pill reads "Google AI n/m"');
  const playbook = strip(readFileSync(resolve(root, 'src/lib/coldCallPlaybook.ts'), 'utf8'));
  ok(!/Gemini/.test(playbook), 'E: the cold-call playbook script says Google AI');
}

if (failures) throw new Error(`${failures} hook send-integrity checks failed`);
console.log('hook-send-integrity: all checks passed');
