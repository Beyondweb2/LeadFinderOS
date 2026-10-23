/* ONE AUDIT SCORE, EVERYWHERE (2026-10-22, Paul: "the audit results in the Inbox do not sync up"). Record:
   docs/audit-score-one-ruler.md. The stored shape, the one picker, the one read, and the wiring (list row, thread header,
   Visible judge, drafter fallback, the tick, the migration) read as source. Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import {
  AUDIT_SCORE_VERSION, leadAuditScore, leadAuditScores, parseStoredScore, pickHookAudit, scoreHookAuditForCard, storedScoreOf,
  visibleCountsOf, type ScoredAudit,
} from '../src/lib/auditScore.ts';
import * as hv from '../src/lib/hookVisibility.ts';
import { isVisible } from '../src/lib/visibleFlag.ts';
import { scoreHookRun, type HookScore } from '../src/lib/hookScore.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('1. one scorer, one picker (the card\'s own)');
{
  ok(hv.scoreHookAuditForCard === scoreHookAuditForCard && hv.pickHookAudit === pickHookAudit, 'the card and the stored score use the SAME functions (re-exported, not copied)');
  const leaf = read('src/lib/auditScore.ts');
  ok(!/from '\.\/[A-Za-z]+'(;|\s)/.test(leaf) && /from '\.\/hookScore\.ts'/.test(leaf), 'the leaf is edge-reachable (relative imports with .ts)');
}

console.log('2. the stored shape');
{
  const s = {
    complete: true,
    perEngine: [{ engine: 'chatgpt', label: 'ChatGPT', named: 2, valid: 3, expected: 3, failed: 0, pending: 0 }, { engine: 'gemini', label: 'Gemini', named: 0, valid: 3, expected: 3, failed: 0, pending: 0 }],
    scored: { method: 2, named: 3, expected: 7, percent: 43, googleAi: { shown: 1, named: 1, notShown: 2, inScore: true } },
  } as unknown as HookScore;
  const st = storedScoreOf(s);
  ok(st.v === AUDIT_SCORE_VERSION && st.chatgpt?.named === 2 && st.chatgpt?.valid === 3 && st.gemini?.named === 0, 'per engine: named of valid answers');
  ok(st.googleAi.named === 1 && st.googleAi.shown === 1, 'Google AI: only questions where Google showed an AI answer ("No AI answer shown" left out)');
  ok(st.scored.named === 3 && st.scored.expected === 7 && st.scored.method === 2, 'the card\'s headline score');
  ok(st.share?.named === 1 && st.share?.total === 4, 'the one-third share: Gemini + Google AI where scored, never ChatGPT (namedShareOf)');
  ok(JSON.stringify(parseStoredScore(JSON.parse(JSON.stringify(st)))) === JSON.stringify(st), 'stored → read back unchanged');
  ok(parseStoredScore({ ...st, v: AUDIT_SCORE_VERSION + 1 }) === null && parseStoredScore(null) === null && parseStoredScore({ v: AUDIT_SCORE_VERSION }) === null, 'another version, absent or unreadable = no score (never a guess)');
  const vc = visibleCountsOf(st);
  ok(vc.gemini?.answers === 3 && vc.overview?.answers === 1 && vc.overview?.named === 1, 'the Visible flag reads Gemini + Google AI from the same score');
  ok(isVisible(vc, 'either', 'half') && !isVisible(vc, 'both', 'half'), '…and judges it with its own rule');
}

console.log('3. the one read per lead');
{
  const sc = (named: number) => ({ v: AUDIT_SCORE_VERSION, complete: true, chatgpt: { named, valid: 3 }, gemini: { named: 0, valid: 3 }, googleAi: { named: 0, shown: 0 }, scored: { named, expected: 6, method: 1 }, share: { named: 0, total: 3 } });
  const audits: ScoredAudit[] = [
    { id: 'disc', lead_id: 'L1', created_at: '2026-10-21T10:00:00Z', audit_purpose: 'discovery', ai_audit_runs: [{ id: 'rd', status: 'complete', run_number: 1, hook_score: sc(3) }] },
    { id: 'hook2', lead_id: 'L1', created_at: '2026-10-20T10:00:00Z', audit_purpose: 'audit', ai_audit_runs: [
      { id: 'r1', status: 'complete', run_number: 1, hook_score: sc(1) },
      { id: 'r2', status: 'complete', run_number: 2, hook_score: sc(2) },
    ] },
    { id: 'hook1', lead_id: 'L1', created_at: '2026-10-01T10:00:00Z', audit_purpose: 'audit', ai_audit_runs: [{ id: 'r0', status: 'complete', run_number: 1, hook_score: sc(0) }] },
    { id: 'mkt', lead_id: 'L1', created_at: '2026-10-22T10:00:00Z', audit_purpose: 'audit', is_market: true, ai_audit_runs: [{ id: 'rm', status: 'complete', run_number: 1, hook_score: sc(3) }] },
  ];
  const r = leadAuditScore(audits);
  ok(r?.auditId === 'hook2' && r.runId === 'r2', 'the newest OUTREACH audit (not a Discovery scan or a market audit) and its newest run — never every run summed');
  ok(r?.score?.chatgpt?.named === 2 && r.updating === false, 'that run\'s stored score, current');
  const dirty = leadAuditScore([{ ...audits[1], ai_audit_runs: [{ id: 'r2', status: 'complete', run_number: 2, hook_score: sc(2), score_dirty_at: '2026-10-22T11:00:00Z' }] }]);
  ok(dirty?.updating === true && dirty.dirty === true && dirty.score !== null, 'a run marked dirty reads as updating (shown greyed, never as final)');
  const none = leadAuditScore([{ ...audits[1], ai_audit_runs: [{ id: 'r2', status: 'running', run_number: 1 }] }]);
  ok(none?.score === null && none.updating === true, 'no score yet = updating, never zeros');
  ok(leadAuditScores(audits).get('L1')?.runId === 'r2' && leadAuditScore([audits[0]]) === null, 'grouped by lead; a lead with only a Discovery scan has no score');
}

console.log('4. the scorer reads the answer TEXT first (the report\'s ruler), not the stored verdict');
{
  /* Orbit Driving School Rugby (22 Oct): the model verdict said named on Gemini, the answer text does not name them. */
  const rows = ['driving school in Rugby', 'automatic driving lessons Rugby', 'driving instructor Rugby'].map((q, i) => ({
    id: `q${i}`, question: q, status: 'done', engines: ['chatgpt', 'gemini'],
    result: {
      chatgpt: { answer_text: 'Try Orbit Driving School Rugby Automatic, a local favourite.', self_named: true, named: true },
      gemini: { answer_text: 'Popular choices include Acme Driving and Best Learners.', self_named: true, named: true },
    },
  }));
  const audit = { business_name: 'Orbit Driving School Rugby Automatic', business_type: 'driving school', location_text: 'Rugby', created_at: '2026-10-01T10:00:00Z' };
  const card = scoreHookAuditForCard({ audit, state: null, runResults: null, rows });
  const st = storedScoreOf(card.score);
  ok(st.gemini?.named === 0 && st.chatgpt?.named === 3, `text first: Gemini 0 named (verdict said 3), ChatGPT 3 — got ${JSON.stringify([st.chatgpt, st.gemini])}`);
  ok(JSON.stringify(storedScoreOf(scoreHookRun(null, rows, { named: { businessName: audit.business_name, trade: audit.business_type, town: audit.location_text }, scoringMethod: 1 })).gemini) === JSON.stringify(st.gemini), 'the same numbers as scoreHookRun with the report\'s context');
}

console.log('5. wiring');
{
  const FN = read('supabase/functions/ai-reply-drafts/index.ts');
  const SH = read('supabase/functions/_shared/audit-scores.ts');
  const INBOX = read('src/pages/Inbox.tsx');
  const HOOK = read('src/hooks/useInbox.ts');
  const MIG = read('supabase/migrations/20261124110000_audit_score_one_ruler.sql');
  ok(FN.indexOf('await rescoreDirtyRuns(service)') > 0 && FN.indexOf('await rescoreDirtyRuns(service)') < FN.indexOf('await refreshVisibleFlags(service, started)'), 'the tick rescores BEFORE the Visible sweep (it judges current numbers)');
  ok(/isVisible\(visibleCountsOf\(picked\.score\), vs\.rule, vs\.share\)/.test(FN) && /if \(picked\.updating \|\| !picked\.score\) return was;/.test(FN), 'Visible is judged on the stored score, never while it is updating');
  ok(/if \(auditsErr\) return was;/.test(FN), 'an unreadable audit list never sets or clears Visible');
  ok(/:s\$\{AUDIT_SCORE_VERSION\}/.test(FN), 'the score version is part of the judged rule key (a new ruler re-judges every lead)');
  ok(/storedShare\?\.named/.test(FN) && !/audit\?\.namedDatapoints/.test(FN), 'the drafter\'s fallback is the stored share, never the ChatGPT-inclusive run summary');
  ok(/\.eq\("score_dirty_at", run\.score_dirty_at\)/.test(SH), 'the dirty mark clears only if nothing re-marked the run while it was scored');
  ok(/ai_visible_checked_audit_id: null/.test(SH), 'a changed score re-judges Visible on that audit');
  ok(!/rpc\('inbox_engine_signals'\)|rpc\('inbox_gemini_signals'\)/.test(HOOK) && /scored_at/.test(HOOK), 'the Inbox reads no separate counts; a rescore is caught by the changed-since read');
  ok(/<ScoreLine score=\{auditScore\}/.test(INBOX) && /data-testid="interest-buttons"/.test(INBOX) && !/Gemini \{geminiNamed\}/.test(INBOX), 'list row draws the score line (the header has the Interested / Not interested buttons instead); the old Gemini pill is gone');
  ok(/after insert or update of result, status on public\.ai_audit_queue/.test(MIG) && /before insert or update of status on public\.ai_audit_runs/.test(MIG) && /after update on public\.ai_audits/.test(MIG), 'the database marks a run dirty on every answer, run status and audit-context write');
  ok(/and not exists \(select 1 from public\.ai_audit_runs where score_dirty_at is not null\)/.test(MIG), 'the tick also runs while a score is waiting');
  ok(!/generated always/i.test(MIG) && /set local lock_timeout/.test(MIG), 'plain columns, no rewrite, a lock timeout');
}

if (f) { console.log(`${f} FAILURE(S)`); process.exit(1); }
console.log('audit-score-one-ruler: all passed');
