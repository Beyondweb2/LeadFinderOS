/* ════════════════════════════════════════════════════════════════════════════════════════════════
   BULK SEND PRE-CHECK (Paul, 2026-09-27: "Sent 0, 19 failed", every one hook_engine_mismatch).

   ROOT CAUSE, PROVEN LIVE: the batch used audit_followup, whose Meta-approved words say "I asked
   chatgpt". Every one of the 19 leads' best missed search is on Google AI, so the server refused each
   (templateEngineConflict) — correctly. The hook itself was never stale: the bulk send stores no
   prepared message; the server resolves the lead's newest audit at send time with the same pick the
   Inbox card shows. The fault was that the confirm could not see a server refusal until after Send.

   These tests pin: the refusal is still made (the guard is not weakened); the hook is the newest
   audit's pick, so a re-audit is handled by construction; the confirm asks the server in dry-run mode
   first and sends only leads that passed; the failed ones can be re-selected; nothing is sent twice.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { initialHookStateV2, type HookScoreRow } from '../src/lib/hookScore.ts';
import { templateEngineConflict } from '../src/lib/rivalHook.ts';
import { resolveAuditReplyVars } from '../supabase/functions/_shared/audit-reply.ts';
import { scoreHookAuditForCard } from '../src/lib/hookVisibility.ts';
import { selectVoiceNoteEvidence } from '../src/lib/voiceNoteScript.ts';
import { applyBulkChecks, explainBulkRefusal, planBulkSend, type BulkCandidate } from '../src/lib/inboxBulkSend.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const BIZ = 'Firebeard Electrical';
const Q = ['reliable electrical maintenance in Shrewsbury UK', 'emergency electrician in Shrewsbury UK who can come today', 'residential electrical installation services in Shrewsbury UK'];
const RIVALS: Record<string, string[]> = {
  '0:chatgpt': ['Wired On Time Ltd.', 'AJK Electrical', 'Fazey Electrical'], '0:gemini': ['RW Electrics Ltd', 'Ben Morris Electrical', 'AJK Electrical'],
  '1:chatgpt': ['Brookes Electrical', 'Wired On Time Ltd.', 'AJK Electrical'], '1:gemini': ['Whitfield Plumbing, Heating & Air Conditioning', 'JCE & SONS LTD', '24/7 Electrical Services Shrewsbury'],
  '2:chatgpt': ['Plug Electrical', 'Mains Men', 'Socket Solutions'], '2:gemini': ['Wired On Time Ltd.', 'RW Electrics Ltd', 'Ben Morris Electrical'],
};
const cell = (qi: number, e: string, named: boolean) => {
  const r = RIVALS[`${qi}:${e}`];
  return { named, self_named: named, answer_text: named ? `Options: ${BIZ}, ${r.join(', ')}.` : `Options: ${r.join(', ')}.`, competitors: r, citations: [] };
};
/** grid[i] = [chatgptNamed, geminiNamed] */
const rows = (grid: Array<[boolean, boolean]>): HookScoreRow[] => grid.map(([c, g], i) => ({
  question: Q[i], status: 'done', engines: ['chatgpt', 'gemini'], result: { chatgpt: cell(i, 'chatgpt', c), gemini: cell(i, 'gemini', g) },
}));

type FakeAudit = { id: string; created_at: string; hook: unknown; qrows: HookScoreRow[] };
/** Enough of supabase-js for resolveAuditReplyVars, with several audits (newest first, as the query orders them). */
function fakeService(audits: FakeAudit[]) {
  const auditRows = audits.map((a) => ({
    id: a.id, short_code: 'abc234', business_name: BIZ, business_type: 'electricians', location_text: 'Shrewsbury',
    specialism: null, country: 'UK', created_at: a.created_at, baseline_target_runs: null, is_measurement: false,
    ai_audit_runs: [{ id: `run-${a.id}`, run_number: 1, status: 'complete', mention_rate: 0.3, created_at: a.created_at,
      results: { hook: a.hook, competitor_cleaning: { complete: true, at: a.created_at, attempts: 1, errors: [] } } }],
  })).sort((x, y) => y.created_at.localeCompare(x.created_at));
  let runFilter: string | null = null;
  const data = (t: string): unknown => t === 'ai_audits' ? auditRows
    : t === 'ai_audit_queue' ? (audits.find((a) => `run-${a.id}` === runFilter)?.qrows ?? []).map((r, i) => ({ id: String(i), ...r }))
    : t === 'outreach_leads' ? { category: 'electricians', search_keyword: null, website: null } : null;
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit', 'not', 'or', 'in']) chain[m] = () => chain;
      chain.eq = (col: string, v: string) => { if (table === 'ai_audit_queue' && col === 'run_id') runFilter = v; return chain; };
      chain.maybeSingle = async () => ({ data: data(table), error: null });
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: data(table), error: null }).then(res);
      return chain;
    },
  };
}
const V2 = initialHookStateV2(Q);
const resolve = (audits: FakeAudit[], templateName: string) => resolveAuditReplyVars(fakeService(audits), 'lead-fb', { templateName });

await (async () => {
  /* 1. Firebeard's shape: a newer 3×2 audit whose best miss is Google AI Q2, an older one whose was ChatGPT. */
  const older: FakeAudit = { id: 'a-old', created_at: '2026-09-25T18:39:00Z', hook: V2, qrows: rows([[true, true], [true, true], [false, true]]) };
  const newer: FakeAudit = { id: 'a-new', created_at: '2026-09-27T02:34:00Z', hook: V2, qrows: rows([[false, true], [true, false], [false, false]]) };
  {
    const v = await resolve([older, newer], 'audit_followup_call');
    ok(v.ok && v.auditId === 'a-new' && v.hookEngine === 'gemini' && v.hookQuestion === Q[1], '1: re-audited lead → the NEWEST audit\'s best miss (Google AI, Q2), never the older one');
    ok(v.ok && JSON.stringify(v.rivals) === JSON.stringify(RIVALS['1:gemini']), '1: …with exactly that answer\'s own three competitors (tuple intact)');
    const af = await resolve([older, newer], 'audit_followup');
    ok(!af.ok && af.reason.startsWith('hook_engine_mismatch'), '1: audit_followup ("I asked chatgpt") is STILL refused for the Google AI hook — the guard is not weakened');
    const oldOnly = await resolve([older], 'audit_followup');
    ok(oldOnly.ok && oldOnly.hookEngine === 'chatgpt', '1: before the re-audit the same lead WAS sendable with audit_followup (its hook was ChatGPT) — a rerun changes the answer, resolved fresh at send time');
  }
  /* 2. A current Google AI miss. */
  {
    const a: FakeAudit = { id: 'a', created_at: '2026-09-27T00:00:00Z', hook: V2, qrows: rows([[true, true], [true, false], [true, true]]) };
    const v = await resolve([a], 'audit_followup_fault');
    ok(v.ok && v.hookEngine === 'gemini' && JSON.stringify(v.rivals) === JSON.stringify(RIVALS['1:gemini']), '2: Google AI miss → engine-neutral templates carry it, same tuple');
    ok(templateEngineConflict('audit_followup_call', 'gemini') === null && templateEngineConflict('audit_followup_fault', 'gemini') === null, '2: "i asked AI" templates never conflict');
  }
  /* 3. Google AI 3/3, ChatGPT supplies the miss. */
  {
    const a: FakeAudit = { id: 'a', created_at: '2026-09-27T00:00:00Z', hook: V2, qrows: rows([[true, true], [true, true], [false, true]]) };
    const v = await resolve([a], 'audit_followup');
    ok(v.ok && v.hookEngine === 'chatgpt' && v.hookQuestion === Q[2] && JSON.stringify(v.rivals) === JSON.stringify(RIVALS['2:chatgpt']), '3: Google AI 3/3 → the ChatGPT miss, and audit_followup is allowed with ChatGPT\'s own names');
  }
  /* 4. An old early-stop (v1) audit only: its stored gap is the hook. */
  {
    const v1 = { version: 1, planned: Q, next_index: 2, executed: 2, stop_reason: 'visibility_gap_found', named_in: [],
      gap: { question_index: 1, question: Q[1], engine: 'gemini', target_named: false, named_instead: RIVALS['1:gemini'], citations: [], named_on_engines: ['chatgpt'], answer_excerpt: 'x' } };
    const a: FakeAudit = { id: 'a', created_at: '2026-09-20T00:00:00Z', hook: v1, qrows: rows([[true, true], [true, false]]).slice(0, 2) };
    const af = await resolve([a], 'audit_followup');
    ok(!af.ok && af.reason.startsWith('hook_engine_mismatch'), '4: old early-stop Google AI gap → audit_followup refused the same way');
    const call = await resolve([a], 'audit_followup_call');
    ok(call.ok && call.hookEngine === 'gemini', '4: …and an engine-neutral template carries it');
  }
  /* 4b. Locksmiths-Manchester (live, 2026-09-27): an early-stop audit stored its gap on Q3, but re-ranking
         its misses picked Q1 — the Inbox card and voice note showed one search while the send quoted
         another. The card's pick is now the stored gap, the same one the send uses. */
  {
    const v1 = { version: 1, planned: Q, next_index: 3, executed: 3, stop_reason: 'visibility_gap_found', named_in: [],
      gap: { question_index: 2, question: Q[2], engine: 'gemini', target_named: false, named_instead: RIVALS['2:gemini'], citations: [], named_on_engines: [], answer_excerpt: 'x' } };
    const qrows = rows([[true, false], [true, true], [true, false]]);
    const a: FakeAudit = { id: 'a-v1', created_at: '2026-09-21T10:33:00Z', hook: v1, qrows };
    const send = await resolve([a], 'audit_followup_call');
    const card = scoreHookAuditForCard({ audit: { business_name: BIZ, business_type: 'electricians', location_text: 'Shrewsbury' }, state: v1, runResults: { hook: v1 }, rows: qrows });
    ok(send.ok && send.hookQuestion === Q[2] && send.hookEngine === 'gemini', '4b: the send quotes the early-stop audit\'s STORED gap (Q3, Google AI)');
    ok(card.score.hook?.questionIndex === 2 && card.score.hook?.engine === 'gemini', `4b: the Inbox card's best missed search is that same stored gap (card q${(card.score.hook?.questionIndex ?? -1) + 1})`);
    ok(send.ok && JSON.stringify(send.rivals) === JSON.stringify(card.score.hook?.competitors.slice(0, 3)), '4b: …with the same competitors, from that one answer');
    const voice = selectVoiceNoteEvidence(card.score.results, { business: BIZ, town: 'Shrewsbury', trade: 'electricians' }, card.score.hook);
    ok(voice.ok && voice.evidence.questionIndex === 2 && voice.evidence.engine === 'gemini', '4b: and the voice note uses it too');
  }
  /* 6. Result did not change: resolving twice gives the same tuple. */
  {
    const a: FakeAudit = { id: 'a', created_at: '2026-09-27T00:00:00Z', hook: V2, qrows: rows([[true, true], [true, false], [true, true]]) };
    const x = await resolve([a], 'audit_followup_call'); const y = await resolve([a], 'audit_followup_call');
    ok(x.ok && y.ok && x.hookQuestion === y.hookQuestion && x.hookEngine === y.hookEngine && x.rivals.join() === y.rivals.join(), '6: unchanged audit → identical tuple every time');
  }
  /* 7. Named 6/6 → no hook is manufactured. */
  {
    const a: FakeAudit = { id: 'a', created_at: '2026-09-27T00:00:00Z', hook: V2, qrows: rows([[true, true], [true, true], [true, true]]) };
    for (const t of ['audit_followup', 'audit_followup_call']) {
      const v = await resolve([a], t);
      ok(!v.ok && !/hook_engine_mismatch/.test(v.reason), `7: 6/6 named → ${t} refused as "no absence to message about", never a manufactured hook`);
    }
  }
})();

/* ── the confirm: server dry-run first, send only what passed ── */
{
  const c = (k: string): BulkCandidate => ({ key: k, leadId: `lead-${k}`, label: k.toUpperCase(), phone: `4477000000${k.length}${k}` });
  const send = [c('a'), c('b'), c('d'), c('e')];
  const mismatch = "hook_engine_mismatch: audit_followup's approved wording says it asked ChatGPT, but this lead's hook search was measured on Google AI";
  const r = applyBulkChecks(send, { a: { ok: true }, b: { ok: false, error: 'audit_reply_unavailable', reason: mismatch }, d: { ok: false, error: 'pitch_already_sent' } });
  ok(r.ready.map((x) => x.key).join() === 'a', 'only a lead whose dry run PASSED is ready to send');
  ok(r.pending.map((x) => x.key).join() === 'e', 'a lead with no check yet is pending — never sent (fail closed)');
  ok(r.refused.length === 2 && /missed search is on Google AI/.test(r.refused.find((x) => x.key === 'b')!.reason) && /Audit follow-up \+ call/.test(r.refused.find((x) => x.key === 'b')!.reason), 'hook_engine_mismatch is listed before sending, with the template to use instead');
  ok(r.refused.find((x) => x.key === 'd')!.reason === 'already had this template', 'an already-sent pitch is listed, not sent twice');
  ok(applyBulkChecks(send, { a: { ok: undefined as unknown as boolean } }).ready.length === 0, 'an unclear answer is not a pass');
  ok(explainBulkRefusal('x', 'some new server reason') === 'some new server reason', 'an unknown refusal keeps the server\'s own words');
  const plan = planBulkSend(send, 'audit_followup_call', { auditByLeadId: Object.fromEntries(send.map((x) => [x.leadId!, { auditId: 'r' }])) });
  ok(!plan.refusal && plan.send.length === 4, 'the engine-neutral follow-up is bulk-sendable to the same leads');
}

/* ── structure: the Inbox wiring ── */
{
  const INBOX = read('src/pages/Inbox.tsx');
  const run = INBOX.slice(INBOX.indexOf('const runBulkSend = async'), INBOX.indexOf('const queueHookFollowups'));
  ok(/const targets = bulkChecked\.ready;/.test(run) && /for \(const target of targets\)/.test(run), 'the send loops over the CHECKED-ready leads only');
  ok(/bulkChecking \|\| bulkChecked\.pending\.length \|\| !bulkChecked\.ready\.length\) return/.test(run), 'no send while any check is pending');
  ok(!/allowResend/.test(run), 'no resend override in the batch — the server refuses a template a lead already had');
  const checks = INBOX.slice(INBOX.indexOf('const runBulkChecks = async'), INBOX.indexOf('const openBulkConfirm'));
  ok(/await preview\(\{ phone: target\.phone, leadId: target\.leadId, templateName: template \}\)/.test(checks) && !/\bsend\(/.test(checks), 'the check is the dry-run preview (same server path), never a send');
  ok(/useEffect\(\(\) => \{ setBulkChecks\(\{\}\); \}, \[bulkTemplate, bulkSelected\]\)/.test(INBOX), 'checks are cleared when the template or selection changes');
  ok(/data-testid="bulk-reselect-failed"/.test(INBOX) && /setBulkSelected\(new Set\(bulkReport\.failed\.map\(\(x\) => x\.key\)\)\)/.test(INBOX), 'the report offers "Select these N again" for the failed ones');
  ok(/onClick=\{openBulkConfirm\}/.test(INBOX), 'opening the confirm starts the checks');
  const HOOK = read('src/hooks/useInbox.ts');
  ok(/mode: 'dry_run'/.test(HOOK) && /data\?\.mode !== 'dry_run'/.test(HOOK), 'the preview refuses to count an old deploy (which would SEND) as a check');
  const RES = read('supabase/functions/_shared/audit-reply.ts');
  ok(/\.eq\("lead_id", leadId\)\s*\n\s*\.order\("created_at", \{ ascending: false \}\)/.test(RES), 'the server always resolves the lead\'s NEWEST audit at send time — nothing prepared can go stale');
}

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
