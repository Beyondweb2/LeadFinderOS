/* THE HOOK IS SIGNED WITH THE SENDER'S NAME (Paul, 2026-10-26). Only the hook; always the sending person's own chosen name;
   no name → not sent by them. Pure + source checks; nothing is read from or sent to anyone.
   Run: npx tsx scripts/hook-signature.test.ts */
import { readFileSync } from 'node:fs';
import { hookSignatureName, isHookDraft, signHook } from '../src/lib/hookSignature.ts';
import { pickMove, firstReplyPitch, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { fallbackAiReply, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const ev: MoveEvidence = { businessName: 'ZZ QA Plumbing 92', trade: 'plumbers', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 6 },
  missed: { engine: 'gemini', question: 'Who is the best plumber in Rugby?' }, competitors: ['Rival A Plumbing', 'Rival B Plumbing'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, site: { state: 'issues', issues: ['Some pages have no main heading'] } };
const T0 = Date.parse('2026-10-26T10:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const opener: MoveThreadMsg = { from: 'us', text: '', templateName: 'initial_contact', messageType: 'template', at: at(-600) };
const them = (text: string, min = 0): MoveThreadMsg => ({ from: 'them', text, messageType: 'text', at: at(min) });
const pitchMsg: MoveThreadMsg = { from: 'us', text: [...firstReplyPitch(ev).lines, firstReplyPitch(ev).question].join('\n\n'), at: at(-300) };
const plan = (thread: MoveThreadMsg[]) => pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: ev, nowMs: T0 + 60_000 });
const draft = (thread: MoveThreadMsg[]) => {
  const p = plan(thread);
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: '', thread: thread.map((m) => ({ from: m.from, text: m.text })), plan: p, evidence: ev };
  return { p, text: fallbackAiReply(ctx) };
};

console.log('1. only the hook is a hook');
{
  const hook = draft([opener, them('yes')]);
  ok(isHookDraft(hook.p), 'the first reply ("yes") → the hook');
  ok(isHookDraft(plan([opener, them('who is this?')])), 'a question as the first reply still gets the hook');
  ok(!isHookDraft(plan([opener, them('Yes it is', -400), pitchMsg, them('what do you do?')])), 'a later answer ("what do you do?") is not the hook');
  ok(!isHookDraft(plan([opener, them('Yes it is', -400), pitchMsg, them('I manage it myself')])), 'the agency answer is not the hook');
  ok(!isHookDraft({ move: 'site_shared', structure: 'list' }), 'the site-shared reply is not the hook');
  ok(!isHookDraft({ move: 'auto_reply' }), 'a plain "no rush" auto-reply line is not the hook');
  ok(isHookDraft({ move: 'auto_reply', structure: 'plain' }), 'an auto-reply answered with the code-built pitch is the hook');
  ok(!isHookDraft(null), 'nothing → no');
}

console.log('2. signing: the name alone on the last line, once');
{
  const hook = draft([opener, them('yes')]);
  const signed = signHook(hook.text, 'Sam');
  ok(signed === `${hook.text.replace(/\s+$/, '')}\n\nSam`, 'the hook ends "…?\\n\\nSam"');
  ok(signed.trim().split('\n').pop() === 'Sam' && /\?\n\nSam$/.test(signed), 'the question stays the last sentence, the name under it');
  ok(signHook(signed, 'Sam') === signed, 'never twice');
  ok(signHook('Hi.\n\n', '  Sam  ') === 'Hi.\n\nSam', 'trailing space trimmed, name tidied');
  ok(signHook('Hi?', '') === 'Hi?', 'an empty name signs nothing');
  ok(!/[-–—]/.test(signed.slice(hook.text.length)), 'no dash in the sign-off');
}

console.log('3. the name: the chosen one only, never an email fallback');
{
  ok(hookSignatureName('Sam') === 'Sam' && hookSignatureName('  Ethan  Lee ') === 'Ethan Lee', 'a chosen name');
  ok(hookSignatureName(null) === null && hookSignatureName('') === null && hookSignatureName('a\nb') === null, 'none / blank / two lines → none');
  const shared = read('supabase/functions/_shared/sender-name.ts');
  const fn = shared.slice(shared.indexOf('export async function senderChosenName'));
  ok(fn.includes('hookSignatureName(') && !fn.includes('getUserById') && !fn.includes('email'), 'the server reads the chosen name only (no email fallback)');
}

console.log('4. who signs: the person who sends it');
{
  const ib = read('src/pages/Inbox.tsx');
  ok(ib.includes('const myMessageName = useMyMessageName().data ?? null;') && /signHook\(rawActiveAi\.draft_text, myMessageName\)/.test(ib), 'Inbox: the hook draft shows and sends with the VIEWER\'s own name (the approver is the sender)');
  ok(/if \(activeAiIsHook && !myMessageName\) \{[\s\S]{0,260}OPEN_MESSAGE_NAME_EVENT[\s\S]{0,40}return;/.test(ib), 'Inbox: no name → Approve opens the name box and sends nothing');
  const ard = read('supabase/functions/ai-reply-drafts/index.ts');
  ok(/if \(isHookDraft\(a\.plan\)\) \{\n\s+const name = await senderChosenName\(service, st\.sendAs\);\n\s+if \(!name\) \{ await record\(\{ send: false, reason: "no_sender_name", intent: key \}\); return; \}\n\s+body = signHook\(body, name\);/.test(ard),
    'auto-send: signed with the "send as" person\'s own name; none → not sent by itself');
  ok(/kind: "text", body,/.test(ard), 'auto-send queues the signed body');
  const drain = read('supabase/functions/inbox-scheduled-send/index.ts');
  ok(/const signedBy = isHookDraft\(d\.why[^)]*\) \? await senderChosenName\(service, r\.queued_by\) : null;\n\s+if \(!signedBy \|\| signHook\(d\.draft_text \?\? "", signedBy\) !== \(r\.body \?\? ""\)\) return "ai_text_changed";/.test(drain),
    'the last check accepts exactly the draft signed by the queuing person, nothing looser');
  for (const p of ['src/lib/hookSignature.ts']) {
    const s = read(p);
    ok(!/\bPaul\b(?![,'])/.test(s.replace(/\(Paul, \d{4}-\d{2}-\d{2}\)/g, '').replace(/"Paul"/g, '')), `${p}: never signs "Paul" by default`);
  }
}

console.log('5. the name box is required');
{
  const dlg = read('src/components/MessageNameDialog.tsx');
  ok(!/Skip for now/.test(dlg) && dlg.includes('hideClose={required}'), 'no skip, no close button the first time');
  ok(/const cancel = \(\) => \{ if \(editing\) setOpen\(false\); \};/.test(dlg), 'only an edit from the account menu can be cancelled');
  ok(/invalidateQueries\(\{ queryKey: MY_MESSAGE_NAME_KEY \}\)/.test(dlg), 'saving refreshes the name the Inbox signs with');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
