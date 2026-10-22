/* ═══════════════════════════════════════════════════════════
   INBOX SPEED PASS (2026-10-16, docs/PERF_AUDIT.md "Inbox messages load").
   1. The conversation list rows are ONE memoised component that redraws only when its own inputs change — opening a
      conversation used to redraw all 150 rows (0.5–1.8 s of browser work per click, measured headless on live-shaped data).
   2. The Gemini counts are one database call (inbox_gemini_signals), not a paged view read that re-ran the aggregate
      per page — with the paged read kept as the fallback.
   What it does NOT prove: pixels. The row markup is moved, not changed; inbox-channel-parity.test.ts still pins every element.
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { sameConvState, sameRowProps } from '../src/lib/inboxRowMemo.ts';
import type { ConversationState } from '../src/lib/conversationState.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const base: ConversationState = {
  unread: true, waitingSinceMs: 1000, waitingOnThem: false, windowOpen: true, templateRequired: false,
  failed: false, queued: false, followUpDue: false, tone: 'blue', label: 'Waiting 5m', failedError: null,
};

console.log('1. sameConvState: same fields = same row; any changed field = redraw');
{
  ok(sameConvState(base, { ...base }), 'a rebuilt object with the same fields is the same');
  ok(sameConvState(undefined, undefined), 'both absent is the same');
  ok(!sameConvState(base, undefined) && !sameConvState(undefined, base), 'absent vs present differs');
  for (const k of Object.keys(base) as Array<keyof ConversationState>) {
    if (k === 'failedError') continue;
    const v = base[k];
    const changed = typeof v === 'boolean' ? !v : typeof v === 'number' ? v + 1 : v === null ? 'x' : String(v) + '!';
    ok(!sameConvState(base, { ...base, [k]: changed } as ConversationState), `a change to ${k} redraws`);
  }
  const err = { code: '131047', title: 'Re-engagement', details: 'More than 24 hours' };
  ok(sameConvState({ ...base, failedError: { ...err } as ConversationState['failedError'] }, { ...base, failedError: { ...err } as ConversationState['failedError'] }), 'an equal failure (new object) is the same');
  ok(!sameConvState({ ...base, failedError: err as ConversationState['failedError'] }, { ...base, failedError: { ...err, code: '131026' } as ConversationState['failedError'] }), 'a different failure redraws');
  ok(!sameConvState(base, { ...base, extra: 1 } as unknown as ConversationState), 'a new field the row has never seen redraws');
}

console.log('2. sameRowProps: every other prop by identity');
{
  const fn = () => undefined; const c = { key: 'k' };
  const a = { c, st: base, isActive: false, onOpen: fn, clockTick: 1 };
  ok(sameRowProps(a, { ...a, st: { ...base } }), 'same props + rebuilt state = skip the redraw');
  ok(!sameRowProps(a, { ...a, isActive: true }), 'becoming the open conversation redraws');
  ok(!sameRowProps(a, { ...a, clockTick: 2 }), 'the minute tick redraws ("5m ago" keeps moving)');
  ok(!sameRowProps(a, { ...a, c: { key: 'k' } }), 'a new conversation object (its lead or message changed) redraws');
  ok(!sameRowProps(a, { ...a, onOpen: () => undefined }), 'a different handler redraws');
}

console.log('3. the Inbox list draws ConversationRow, and the row reads nothing from the page scope');
{
  const inbox = read('src/pages/Inbox.tsx');
  const rowSrc = inbox.slice(inbox.indexOf('const ConversationRow = memo('), inbox.indexOf('}, sameRowProps);'));
  ok(rowSrc.length > 500, 'ConversationRow is memo(…, sameRowProps)');
  ok(/shownList\.map\(\(c\) => \(\n\s+<ConversationRow\n\s+key=\{c\.key\}/.test(inbox), 'the list maps every shown conversation to ConversationRow');
  ok(!/\b(activeKey|stateByKey|savingStatusKey|hookSelected|bulkSelected|setActiveKey|ai\.forPhone)\b/.test(rowSrc), 'the row closes over no page state (everything is a prop)');
  ok(/st=\{stateByKey\.get\(c\.key\)\}/.test(inbox) && /\{\.\.\.rowAttention\(c\)\}/.test(inbox), 'state and the one attention pill are read per row by the page (the pill as words, compared by value)');
  ok(/clockTick=\{clockTick\}/.test(inbox), 'the minute clock reaches the row');
  ok(/const openConversation = useCallback\(\(key: string\) => rowHandlersRef\.current\.setActiveKey\(key\), \[\]\)/.test(inbox)
    && /const setStatusFromRow = useCallback\(\(c: WaConversation, status: PipelineStatus\) => rowHandlersRef\.current\.handleSetStatus\(c, status\), \[\]\)/.test(inbox)
    && /rowHandlersRef\.current = \{ setActiveKey, handleSetStatus \};/.test(inbox), 'row callbacks are stable and always call the newest handler');
  ok(/const toggleHookSelect = useCallback\(/.test(inbox) && /const toggleBulkSelect = useCallback\(/.test(inbox), 'the two select toggles are stable');
  /* Paul, 2026-10-22: "the status pill must remain" — the solid, editable pill stays on every row beside the attention pill. */
  ok(rowSrc.includes('onValueChange={(status) => handleSetStatus(c, status)}') && rowSrc.includes('stage={listStageOf(c.leadId)}'), 'the status pill keeps its one handler and its one stage');
}

console.log('4. the counts: no separate counting reads any more (2026-10-22) — the one stored score rides on the audits read');
{
  const hook = read('src/hooks/useInbox.ts');
  const sql = read('supabase/migrations/20261102090000_inbox_gemini_signals.sql');
  ok(!/\.rpc\('inbox_gemini_signals'\)/.test(hook) && !/\.rpc\('inbox_engine_signals'\)/.test(hook), 'the Inbox no longer asks inbox_gemini_signals() / inbox_engine_signals() (they disagreed with the card)');
  ok(/ai_audit_runs\(id, status, run_number, created_at, mention_rate, hook_score, score_dirty_at,/.test(hook), 'the score comes with the audits read (every audit refresh refreshes it)');
  ok(/const AUDIT_SELECTS = \[AUDIT_SELECT, AUDIT_SELECT_NO_SCORE\] as const;/.test(hook), 'without the score columns (deploy order) the read degrades to no score, never a wrong one');
  ok(/security invoker/.test(sql) && !/security definer/i.test(sql), 'the old function (kept, unused) still runs as the caller');
  ok(/from public\.audit_gemini_signal s;/.test(sql), 'it reads the same view, nothing else');
  ok(/revoke all on function public\.inbox_gemini_signals\(\) from public, anon;/.test(sql) && /grant execute on function public\.inbox_gemini_signals\(\) to authenticated;/.test(sql), 'signed-in only');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
