/* THE HOOK CARRIES THE LEAD'S REPORT LINK (Paul, 2026-10-23; docs/reply-playbook.md §5f). The first-reply pitch keeps every word;
   when the lead's audit is finished one short line "Here's the full report: <link>" goes before the final question. Not finished:
   no link, the draft is flagged audit pending. Pure: no model, no DB. */
import { pickMove, firstReplyPitch, pitchText, PITCH_REPORT_LEAD, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { checkAiReply, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const URL = 'https://findable.live/r/k4m2p9';
const E: MoveEvidence = { businessName: 'Sample Locksmiths', trade: 'Locksmiths', town: 'Halstead', engineWords: 'ai', named: { named: 0, valid: 3 },
  missed: { engine: 'gemini', question: 'who is the best locksmith in Halstead' }, competitors: ['Alpha Locks', 'Beta Locks'], hookAlreadySent: false, findings: [],
  hasWebsite: true, ownerName: null, foundOnGoogle: true, site: { state: 'issues', issues: ['a', 'b'], pitch: ['Your homepage does not say where you work', 'There is no phone number on your homepage'] } };
const opener: MoveThreadMsg = { from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' };
const thread: MoveThreadMsg[] = [opener, { from: 'them', text: 'Yes this is Sample Locksmiths' }];
const pm = (e: MoveEvidence) => pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: e });
const ctx = (e: MoveEvidence): AiReplyContext => ({ businessName: e.businessName, latestInbound: 'Yes this is Sample Locksmiths', thread: thread.map((m) => ({ from: m.from, text: m.text })), plan: pm(e), evidence: e });

console.log('1. finished audit: the hook is unchanged plus one link line before the question');
{
  const base = firstReplyPitch(E);
  const withLink = firstReplyPitch({ ...E, reportUrl: URL });
  ok(withLink.question === base.question && withLink.structure === base.structure, 'same question and structure');
  ok(JSON.stringify(withLink.lines.slice(0, -1)) === JSON.stringify(base.lines), 'every existing line identical, in order');
  ok(withLink.lines[withLink.lines.length - 1] === `${PITCH_REPORT_LEAD} ${URL}`, 'one link line, last before the question');
  const t = pitchText(withLink);
  ok(t.endsWith(base.question) && (t.match(/https?:\/\//g) ?? []).length === 1, 'the question stays last; exactly one link');
  const p = pm({ ...E, reportUrl: URL });
  ok(p.move === 'first_reply_pitch' && p.linkOk === true && !p.auditPending, 'plan allows its own link, not pending');
  const w = checkAiReply(p.fixedText ?? '', ctx({ ...E, reportUrl: URL }));
  ok(w.length === 0, `passes the checker${w.length ? ' - ' + w.join(' | ') : ''}`);
}

console.log('2. audit not ready: no link, flagged audit pending');
{
  for (const reportUrl of [null, undefined, '', 'https://findable.live/sign-up', 'http://evil.example/r/abc123']) {
    const p = pm({ ...E, reportUrl });
    ok(!/https?:\/\//.test(p.fixedText ?? '') && p.auditPending === true && !p.linkOk, `reportUrl ${JSON.stringify(reportUrl)} → no link, audit pending`);
  }
}

console.log('3. Australia prospect-only: link allowed, no price, guarantee or sign-up near it');
{
  const p = pm({ ...E, reportUrl: URL, prospectOnly: true });
  ok(p.move === 'first_reply_pitch' && !!p.fixedText && !p.needsYou, 'still a draft');
  ok(!/£|guarantee|sign[\s-]?up|money back/i.test(p.fixedText ?? ''), 'no price, guarantee or sign-up');
}

console.log('4. a typed link that is not the report is still caught');
{
  const p = pm({ ...E, reportUrl: URL });
  const w = checkAiReply(`${p.fixedText}\nhttps://findable.live/onboarding/x`, ctx({ ...E, reportUrl: URL }));
  ok(w.some((x) => /link/i.test(x)), 'a second, different link warns');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nAll passed.');
