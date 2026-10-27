/* THE HOOK NAMES THE ENGINE, AS WRITTEN (Paul, 2026-10-26; googleAI 2026-10-27): "I asked chatgpt …" when the missed search was ChatGPT's,
   "I asked googleAI …" when it was Gemini's or Google's AI answers. Only the hook; every other draft keeps "AI".
   Pure: no model, no DB. Run: npx tsx scripts/hook-engine-name.test.ts */
import { firstReplyPitch, auditLine, hookEngineWords, pickMove, tidyCaps, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { checkAiReply, fallbackAiReply, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const ev = (engine: string, engineWords = engine): MoveEvidence => ({ businessName: 'ZZ QA Electrics 95', trade: 'electrician', town: 'Gravesend', engineWords,
  named: { named: 0, valid: 6 }, missed: { engine, question: 'Who is the best electrician in Gravesend?' }, competitors: ['Hale Electrics Ltd', 'Rival B Electrics'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, reportUrl: 'https://findable.live/r/bapus4',
  site: { state: 'issues', issues: ['Some links on your site are broken', "Your services don't have their own pages"], pitch: ['Some links on your site are broken', "Your services don't have their own pages"], found: 2 } });
const T0 = Date.parse('2026-10-26T10:00:00Z');
const opener: MoveThreadMsg = { from: 'us', text: '', templateName: 'initial_contact', messageType: 'template', at: new Date(T0 - 3_600_000).toISOString() };
const hookDraft = (e: MoveEvidence) => {
  const thread: MoveThreadMsg[] = [opener, { from: 'them', text: 'yes', messageType: 'text', at: new Date(T0).toISOString() }];
  const plan = pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: e, nowMs: T0 + 60_000 });
  const ctx: AiReplyContext = { businessName: e.businessName, latestInbound: 'yes', thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence: e };
  const text = fallbackAiReply(ctx);
  return { plan, ctx, text, warnings: checkAiReply(text, ctx) };
};

console.log('1. which words for which engine');
{
  ok(hookEngineWords('chatgpt') === 'chatgpt', 'chatgpt → "chatgpt"');
  ok(hookEngineWords('gemini') === 'googleAI' && hookEngineWords('overview') === 'googleAI' && hookEngineWords('google_ai') === 'googleAI', 'gemini / overview / google_ai → "googleAI"');
  ok(hookEngineWords('perplexity') === null && hookEngineWords(null) === null, 'anything else → none ("AI")');
}

console.log('2. the hook, lower case, no warning');
for (const [engine, words] of [['chatgpt', 'chatgpt'], ['gemini', 'googleAI'], ['overview', 'googleAI']] as const) {
  const d = hookDraft(ev(engine));
  ok(d.text.includes(`\n\nI asked ${words} "Who is the best electrician in Gravesend?" and it named Hale Electrics Ltd`), `${engine} → "I asked ${words} …" (as written, after the capitals tidy)`);
  ok(d.plan.hookEngine === words && d.warnings.length === 0, `${engine}: the checker allows it${d.warnings.length ? ` (${d.warnings.join(' | ')})` : ''}`);
  ok(d.text.includes('get AI recommending you?'), `${engine}: the rest still says "AI"`);
}

console.log('3. "AI" when the engine is unknown, or the conversation already named the other tool');
{
  ok(hookDraft(ev('perplexity')).text.includes('I asked AI "Who'), 'unknown engine → "I asked AI"');
  ok(hookDraft(ev('gemini', 'chatgpt')).text.includes('I asked AI "Who'), 'missed on Gemini but the conversation named ChatGPT → "AI" (never two tools)');
  ok(hookDraft(ev('chatgpt', 'chatgpt')).text.includes('I asked chatgpt "Who'), 'same tool as the conversation → named');
}

console.log('4. only the hook');
{
  ok((auditLine(ev('chatgpt')) ?? '').includes('I asked AI'), 'a follow-up\'s audit line still says "AI"');
  const d = hookDraft(ev('gemini'));
  ok(checkAiReply(d.text.replace('Hale Electrics Ltd', 'Hale Electrics Ltd. Gemini said so too'), d.ctx).some((w) => /Names an AI tool/.test(w)), 'any OTHER tool name in the hook still warns');
  const later = { ...d.ctx, plan: { ...d.ctx.plan, hookEngine: null } };
  ok(checkAiReply('I asked chatgpt again. Quick call?', later).some((w) => /Names an AI tool/.test(w)), 'a non-hook draft naming a tool still warns');
}

console.log('5. the capitals tidy');
{
  ok(tidyCaps('Hi mate,\n\nI asked chatgpt "Who?"') === 'Hi mate,\n\nI asked chatgpt "Who?"', 'the hook\'s "I asked chatgpt" stays as written');
  ok(tidyCaps('I asked googleAI "Who?"') === 'I asked googleAI "Who?"', '"I asked googleAI" stays as written');
  ok(tidyCaps('i asked chatgpt and gemini') === 'I asked ChatGPT and Gemini', 'a model\'s sloppy "i asked chatgpt" is still tidied');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
