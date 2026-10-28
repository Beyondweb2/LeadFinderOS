/* THE HOOK SAYS WHEN THERE ARE MORE ISSUES (Paul, 2026-10-26; wording 2026-10-27): "There's more in the full report: <link>"
   only when the check really found more than the list shows AND a report link exists; otherwise "Here's the full result: <link>"
   (or no line with no link). Pure: no model, no DB. Run: npx tsx scripts/hook-more-issues.test.ts */
import { readFileSync } from 'node:fs';
import { firstReplyPitch, hookReportLine, pitchText, pickMove, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { checkAiReply, fallbackAiReply, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const URL = 'https://findable.live/r/bapus4';
const base: MoveEvidence = { businessName: 'ZZ QA Electrics 93', trade: 'electrician', town: 'Gravesend', engineWords: 'gemini', named: { named: 0, valid: 6 },
  missed: { engine: 'gemini', question: 'Who is the best electrician in Gravesend?' }, competitors: ['Hale Electrics Ltd', 'Priority Electrical & Renewables Ltd', 'L J Gray Electrical Services'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, reportUrl: URL };
const TWO = ['Some links on your site are broken', "Your services don't have their own pages"];
const FOUR = [...TWO, "Your site doesn't say which areas you cover", 'Your main pages say very little about what you do'];
const ev = (pitch: string[], found?: number, extra: Partial<MoveEvidence> = {}): MoveEvidence => ({ ...base, site: { state: 'issues', issues: pitch, pitch, ...(found === undefined ? {} : { found }) }, ...extra });
const hook = (e: MoveEvidence) => pitchText(firstReplyPitch(e));

console.log('1. the report line, only when true');
{
  ok(hookReportLine(URL, 2, 7) === `There's more in the full report: ${URL}`, 'two shown of seven, with the report');
  ok(hookReportLine(URL, 2, 2) === `Here's the full result: ${URL}` && hookReportLine(URL, 4, 3) === `Here's the full result: ${URL}`, 'nothing more found → "Here\'s the full result"');
  ok(hookReportLine(URL, 2, undefined) === `Here's the full result: ${URL}` && hookReportLine(URL, 0, 5) === `Here's the full result: ${URL}`, 'unknown count or nothing listed → no "more" claim');
  ok(hookReportLine(null, 2, 7) === null, 'no report link → no line');
}

console.log('2. the hook');
{
  const t = hook(ev(TWO, 7));
  ok(t.includes(`• Your services don't have their own pages\n\nThere's more in the full report: ${URL}\n\nCan I send you`), 'right after the issues, before the question');
  ok(!hook(ev(TWO, 2)).includes("There's more") && hook(ev(TWO, 2)).includes(`Here's the full result: ${URL}`), 'all issues listed → "Here\'s the full result"');
  ok(!hook(ev(TWO)).includes("There's more"), 'no count on record (older callers) → no claim');
  ok(!/There's more|full result|https?:/.test(hook(ev(TWO, 7, { reportUrl: null }))), 'no report link → no report line at all');
  ok(!/There's more|full result|https?:/.test(hook(ev(TWO, 7, { prospectOnly: true }))), 'Australia (no report link) → no report line');
  const clean = hook(ev([], 5, { site: { state: 'clean', issues: [], found: 5 } }));
  ok(!clean.includes("There's more") && clean.includes(`Here's the full result: ${URL}`), 'no issues listed → "Here\'s the full result"');
  const four = hook(ev(FOUR, 9));
  ok((four.match(/^• /gm) ?? []).length === 4 && four.includes('a few things could be holding you back:') && four.includes("There's more in the full report"), 'four issues fit, then "There\'s more"');
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
    ok(plan.move === 'first_reply_pitch' && w.length === 0, `${label}: no checker warning${w.length ? ` (${w.join(' | ')})` : ''}`);
  }
}

console.log('4. the count comes from the one website check');
{
  const fn = readFileSync('supabase/functions/ai-reply-drafts/index.ts', 'utf8').replace(/\r\n/g, '\n');
  ok(/found: found\.check\.serious\.length \+ found\.check\.minor\.length/.test(fn), 'found = serious + minor issues of the check');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
