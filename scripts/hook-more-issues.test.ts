/* THE HOOK SAYS WHEN THERE ARE MORE ISSUES (Paul, 2026-10-26): "it needs to be more clear that the issues mentioned aren't the
   only issues". More listed (length rule 115), and "That's just a couple / a few of them." only when the check really found
   more than the list shows. Pure: no model, no DB. Run: npx tsx scripts/hook-more-issues.test.ts */
import { readFileSync } from 'node:fs';
import { firstReplyPitch, pitchMoreLine, pitchText, pickMove, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { checkAiReply, fallbackAiReply, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const base: MoveEvidence = { businessName: 'ZZ QA Electrics 93', trade: 'electrician', town: 'Gravesend', engineWords: 'gemini', named: { named: 0, valid: 6 },
  missed: { engine: 'gemini', question: 'Who is the best electrician in Gravesend?' }, competitors: ['Hale Electrics Ltd', 'Priority Electrical & Renewables Ltd', 'L J Gray Electrical Services'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, reportUrl: 'https://findable.live/r/bapus4' };
const TWO = ['Some links on your site are broken', "Your services don't have their own pages"];
const FOUR = [...TWO, "Your site doesn't say which areas you cover", 'Your main pages say very little about what you do'];
const ev = (pitch: string[], found?: number, extra: Partial<MoveEvidence> = {}): MoveEvidence => ({ ...base, site: { state: 'issues', issues: pitch, pitch, ...(found === undefined ? {} : { found }) }, ...extra });
const hook = (e: MoveEvidence) => pitchText(firstReplyPitch(e));

console.log('1. the line, only when true');
{
  ok(pitchMoreLine(2, 7, true) === "That's just a couple of them. The full report below has the rest.", 'two shown of seven, with the report');
  ok(pitchMoreLine(3, 9, true) === "That's just a few of them. The full report below has the rest.", 'three shown');
  ok(pitchMoreLine(1, 4, false) === "That's just one of them.", 'one shown, no report link: no "report below"');
  ok(pitchMoreLine(2, 2, true) === null && pitchMoreLine(4, 3, true) === null, 'nothing more found → no claim');
  ok(pitchMoreLine(2, undefined, true) === null && pitchMoreLine(0, 5, true) === null, 'unknown count or nothing listed → no claim');
}

console.log('2. the hook');
{
  const t = hook(ev(TWO, 7));
  ok(t.includes("• Your services don't have their own pages\n\nThat's just a couple of them. The full report below has the rest.\n\nI specialise"), 'right after the issues, before what we do');
  ok(t.indexOf('The full report below') < t.indexOf("Here's the full report: https://findable.live/r/bapus4"), '"below" is true: the report link comes after it');
  ok(!hook(ev(TWO, 2)).includes("That's just"), 'all issues listed → no "just a couple"');
  ok(!hook(ev(TWO)).includes("That's just"), 'no count on record (older callers) → no claim');
  const noLink = hook(ev(TWO, 7, { reportUrl: null }));
  ok(noLink.includes("That's just a couple of them.") && !noLink.includes('report below'), 'no report link → no "report below"');
  ok(!hook(ev(TWO, 7, { prospectOnly: true })).includes('report below'), 'Australia (no report link) → no "report below"');
  ok(!hook(ev([], 5, { site: { state: 'clean', issues: [], found: 5 } })).includes("That's just"), 'no issues listed → no line');
  const four = hook(ev(FOUR, 9));
  ok((four.match(/^• /gm) ?? []).length === 4 && four.includes("That's just a few of them."), 'four issues now fit (list more), then "a few of them"');
  const sentence = hook(ev([TWO[0]], 3));
  ok(sentence.includes("I looked into why and found some links on your site are broken.\n\nThat's just one of them."), 'one issue: the sentence, then "just one of them"');
}

console.log('3. the draft still passes the checker (lines, length, links)');
{
  const T0 = Date.parse('2026-10-26T10:00:00Z');
  const opener: MoveThreadMsg = { from: 'us', text: '', templateName: 'initial_contact', messageType: 'template', at: new Date(T0 - 600 * 60_000).toISOString() };
  for (const [label, e] of [['two of seven', ev(TWO, 7)], ['four of nine', ev(FOUR, 9)], ['four of nine, no link', ev(FOUR, 9, { reportUrl: null })]] as const) {
    const thread = [opener, { from: 'them', text: 'yes', messageType: 'text', at: new Date(T0).toISOString() } as MoveThreadMsg];
    const plan = pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: e, nowMs: T0 + 60_000 });
    const ctx: AiReplyContext = { businessName: e.businessName, latestInbound: 'yes', thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence: e };
    const text = fallbackAiReply(ctx);
    const w = checkAiReply(text, ctx);
    ok(plan.move === 'first_reply_pitch' && text.includes("That's just") && w.length === 0, `${label}: no checker warning${w.length ? ` (${w.join(' | ')})` : ''}`);
  }
}

console.log('4. the count comes from the one website check');
{
  const fn = readFileSync('supabase/functions/ai-reply-drafts/index.ts', 'utf8').replace(/\r\n/g, '\n');
  ok(/found: found\.check\.serious\.length \+ found\.check\.minor\.length/.test(fn), 'found = serious + minor issues of the check');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
