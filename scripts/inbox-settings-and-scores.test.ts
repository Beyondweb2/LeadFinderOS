/* ════════════════════════════════════════════════════════════════════════════════════════════════
   INBOX: ENGINE SCORE CHIPS + THE SETTINGS POPUP (2026-10-21, feat/inbox-settings-and-scores). Layout only: no setting changed what it does.
   Also pins what the fake-data production-build check proved (40 fake leads: no crash, no render loop, no request after load).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { engineScoresByLead, engineTone, engineChipTitle, ENGINE_KEYS } from '../src/lib/engineScores.ts';

let failures = 0;
const check = (ok: boolean, label: string) => { if (ok) console.log('  ok   ' + label); else { failures++; console.log('  FAIL ' + label); } };
const src = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('1. the chip rule: green named, red not named, grey no answer / no audit');
check(engineTone({ named: 2, answers: 3 }) === 'named', 'named in any answer = green');
check(engineTone({ named: 0, answers: 3 }) === 'not_named', 'answered and never named = red');
check(engineTone({ named: 0, answers: 0 }) === 'none' && engineTone(null) === 'none' && engineTone(undefined) === 'none', 'no answers / no audit = grey, never red');
check(engineChipTitle('overview', { named: 1, answers: 3 }).includes('Google AI') && engineChipTitle('gemini', null).includes('no answer'), 'hover says the engine and the counts');
check(ENGINE_KEYS.join() === 'chatgpt,gemini,overview', 'the three engines, in the order ChatGPT, Gemini, Google AI');

console.log('2. the newest audit with answers wins, per lead');
const audits = [{ id: 'new', lead_id: 'L1' }, { id: 'old', lead_id: 'L1' }, { id: 'x', lead_id: null }, { id: 'empty', lead_id: 'L2' }];
const by = engineScoresByLead(audits, [
  { audit_id: 'old', lead_id: 'L1', gemini_answers: 3, gemini_named: 3 },
  { audit_id: 'new', lead_id: 'L1', chatgpt_answers: 3, chatgpt_named: 0, overview_answers: 0, overview_named: 0 },
  { audit_id: 'empty', lead_id: 'L2', gemini_answers: 0, gemini_named: 0 },
]);
check(by.get('L1')?.chatgpt?.answers === 3 && by.get('L1')?.gemini === null, 'L1 reads its NEWEST audit, not the older one');
check(by.get('L1')?.overview === null, 'an engine with no answers is null (grey)');
check(!by.has('L2'), 'an audit with no answers at all gives the lead no scores');
check(engineScoresByLead([], []).size === 0, 'no audits, no scores');

console.log('3. loaded in ONE batched read, never per row');
const hook = src('src/hooks/useInbox.ts');
check(/rpc\('inbox_engine_signals'\)/.test(hook) && /optionalInboxRows<InboxData\['engineSignals'\]\[number\]>\(fetchEngineSignals\(\)\)/.test(hook), 'one rpc inside the existing parallel load; a failure degrades to grey');
const inbox = src('src/pages/Inbox.tsx');
check(!/supabase\.(from|rpc)/.test(src('src/lib/engineScores.ts')) && !/function EngineChips[\s\S]{0,900}(supabase|useQuery|fetch\()/.test(inbox), 'the chip component reads props only');
const mig = src('supabase/migrations/20261116100000_inbox_engine_signals.sql');
check(/security invoker/.test(mig) && !/generated always/i.test(mig) && /grant execute on function public\.inbox_engine_signals\(\) to authenticated/.test(mig), 'migration: security invoker, no generated column, authenticated only');

console.log('4. the list row: three chips replace the Gemini chip; the tab strip is gone');
check(/<EngineChips scores=\{c\.engineScores\} \/>/.test(inbox), 'every lead row draws the chips');
check(!/<EngagementPills reportOpenedAt=\{c\.reportOpenedAt\} siteVisitedAt=\{c\.siteVisitedAt\} geminiNamed/.test(inbox), 'the list row no longer draws the old "Gemini n/m" chip');
check(!/role="tablist"/.test(inbox), 'no tab strip');
check(/data-testid="inbox-views-select"/.test(inbox) && /INBOX_QUICK_FILTERS\.filter\(/.test(inbox), 'the views (incl. Needs you, Needs approving) are in the Show dropdown');
check(/quickCounts\.needsYou/.test(inbox) && /quickCounts\.approving/.test(inbox), 'the dropdown keeps the counts');

console.log('5. Settings: one button on the top row, everything inside it');
check(/<InboxSettings channel=\{channel\}/.test(inbox) && !/<AutoReplyToggle|<AiRepliesToggle/.test(inbox), 'the top row has Settings and no loose reply controls');
const set = src('src/components/InboxSettings.tsx');
/* 2026-10-21 (later): the reply rule and AI handles replies are ONE mode control (scripts/inbox-reply-mode.test.ts holds its rules). */
check(/<InboxReplyModeControl channel=\{channel\} \/>/.test(set) && /ReplyHoursDialog/.test(set) && !/<AutoReplyToggle|<AiRepliesToggle/.test(set), 'it holds the Inbox mode (with Draft outcomes) and reply hours');
const auto = src('src/components/InboxReplyModeControl.tsx');
check(/Can send by itself/.test(auto) && /<AutoSendSwitches/.test(auto), 'the mode that can send by itself is marked, with its switches under it');

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
