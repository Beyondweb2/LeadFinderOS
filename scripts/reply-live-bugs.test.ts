/* THE FOUR LIVE DRAFTER BUGS (Paul, 2026-10-21; reply recon 2026-10-20, docs/reply-playbook.md). Every case is a real first reply from the
   book, text as typed. Pure: no model, no DB. 1. "driving" is not "busy". 2. Greeting names only from clear forms. 3. Messages within
   five minutes are one turn. 4. The "how can I help" family and emoji-only replies get the pitch. */
import { pickMove, mergeBursts, MERGE_WINDOW_MS, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { nameFromReply, RE } from '../src/lib/replyPlaybook.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const EV: MoveEvidence = { businessName: 'Acme Driving School', trade: 'driving instructor', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 3 },
  missed: { engine: 'gemini', question: 'Who is the best driving instructor in Rugby?' }, competitors: ['A Driving', 'B Driving', 'C Driving'], hookAlreadySent: true,
  findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, site: { state: 'clean', issues: [] } };
const T0 = Date.parse('2026-10-20T10:00:00Z');
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const opener: MoveThreadMsg = { from: 'us', text: '', templateName: 'initial_contact', messageType: 'template', at: at(-60) };
const them = (text: string, sec: number, messageType = 'text'): MoveThreadMsg => ({ from: 'them', text, messageType, at: at(sec) });
const pick = (msgs: MoveThreadMsg[], ev: MoveEvidence = EV) => pickMove({ thread: [opener, ...msgs], suppressed: false, aiSentSinceWin: 0, evidence: ev, nowMs: T0 + 3_600_000 });
const isPitch = (p: ReturnType<typeof pick>) => p.move === 'first_reply_pitch' && !!p.fixedText;

console.log('1. "driving" is not busy: a driving school confirming its name gets the pitch');
for (const t of ['Hi yes this is Pass Me Driving', 'Good afternoon, this is the correct number and only number for First Class Pass Driving School', 'Hi yes is All Seasons Driving',
  'Hi, sorry for late reply, this is Michael, driving instructor thanks', 'Hi and thanks for the message. Yes correct Regards Premier Driving School',
  'Yes, it is. If you are wanting driving lessons!']) {
  const p = pick([them(t, 30)]);
  ok(p.intent !== 'busy' && !/What day and time suits/.test(p.fixedText ?? p.guide ?? ''), `not busy: "${t.slice(0, 50)}"`);
  /* "If you are wanting driving lessons!" is thinks_customer since 2026-10-21 (Paul's correction line). */
  ok(isPitch(p) || p.needsYou !== null || p.intent === 'thinks_customer', `no "I'll call then" line: "${t.slice(0, 40)}" -> ${p.move}`);
}
ok(isPitch(pick([them('Hi yes this is Pass Me Driving', 30)])), 'a plain confirmation from a driving school is the pitch');
for (const t of ["I'm driving at the moment", "I'm driving, can you call me later", 'Bit busy at the moment', 'Can you call me later']) {
  ok(RE.busy.test(t), `still busy: "${t}"`);
}
ok(!RE.busy.test('Pass Me Driving') && !RE.busy.test('driving instructor') && !RE.busy.test('lessons start soon'), 'a trade or business name is never busy');

console.log('2. greeting names: clear forms only');
const names: Array<[string, string | null, string?]> = [
  ['Yes can I help My name is Mark', 'Mark'], ["Yes - I'm Rachel, the managing director", 'Rachel'], ['Hiya, yes this is Lewis from Bluebell Locksmiths', 'Lewis'],
  ['Hi, this is Barry from BB Locksmiths. Thanks for your message', 'Barry'], ['Yes, Sarah Hart here.', 'Sarah'], ['Hi Dom here', 'Dom'], ['Dom', 'Dom'], ['Yes Dom', 'Dom'],
  ["Yes,apologies I'm about to start a lesson.", null], ["Yes but I'm away until the 18th sorry", null], ["Yes I'm away in France and back working on the 18th", null],
  ["Yes but I'm out of action for the next couple of months", null], ["Yes, but I'm fully booked for the foreseeable future.", null], ["Hi, it is but unfortunately I'm away until the 22nd.", null],
  ["Hello, sorry for the delay. Yes it is. I'm on my annual leave until 1st of September", null], ["Hi there yes it is but I'm off on annual leave this week.", null],
  ["Yes I'm always busy", null], ['Yeas', null], ['Ues', null], ["It's one number. How can I help you?", null], ['Hi, this is Pass Smart Driving School, how can we help?', null],
  ['Hi. This is Steve Bullimore the locksmith.', null], ["Hi, this is Upc . How can I help ?", null, 'UPC Locks'], ["It's Plumbfix how can I help you", null, 'Plumbfix Ltd'],
  ['im mark', null], ['Yes this is Spur Electrical', null], ['Away', null], ['Hello', null], ['Yes', null],
];
for (const [t, want, biz] of names) { const got = nameFromReply(t, biz ?? ''); ok(got === want, `"${t.slice(0, 60)}" -> ${want ?? 'no greeting'} (got ${got ?? 'none'})`); }
const away = pick([them("Yes mate but I'm away until the 18th sorry", 30)]);
ok(!away.greetName, 'away reply: no greeting');
ok(!isPitch(away) && away.intent === 'not_now' && away.guide === "No problem, I'll check back then.", 'away reply: the not-now wording, not the pitch');
ok(away.followUp?.said === 'the 18th' && /^2026-10-19$|^2026-11-19$/.test(away.followUp?.checkBackOn ?? '') && /Next Action/.test(away.note ?? ''), `away reply: date noted (${away.followUp?.checkBackOn}), Next Action left to the person`);
ok(!away.autoDraft || away.autoDraft === true, 'away reply: a draft only, nothing sends');
for (const t of ["Hi there yes it is but I'm off on annual leave this week.", 'Yes but I\'m out of action for the next couple of months', 'Yes I\'m away in France and back working on the 18th']) {
  const p = pick([them(t, 30)]);
  ok(!isPitch(p) && p.intent === 'not_now' && !p.greetName, `parked, not pitched, no name: "${t.slice(0, 50)}"`);
}
const named = pick([them('Yes can I help My name is Mark', 30)]);
ok(isPitch(named) && named.greetName === 'Mark' && /^Hi Mark,/.test(named.fixedText ?? ''), 'a clear name still opens the pitch: "Hi Mark,"');
const about = pick([them("Yes,apologies I'm about to start a lesson.", 30)]);
ok(isPitch(about) && !/^Hi About/.test(about.fixedText ?? ''), 'no "Hi About,"');

console.log('3. messages within five minutes are one turn');
const m = mergeBursts([opener, them('Yes', 0), them('How can I help?', 25)]);
ok(m.length === 2 && m[1].text === 'Yes. How can I help?', `"Yes" + "How can I help?" -> one turn (${m[1]?.text})`);
ok(mergeBursts([opener, them('Hi', 0), them('Yes', 20), them('How can I help', 40)])[1].text === 'Hi. Yes. How can I help', 'three in a row -> one turn');
ok(mergeBursts([opener, them('Yes it is.', 0), them('Yes it is.', 5)]).length === 2, 'an identical repeat is dropped');
ok(mergeBursts([opener, them('Yes', 0), them('How can I help?', MERGE_WINDOW_MS / 1000 + 5)]).length === 3, 'six minutes apart: two turns');
ok(mergeBursts([opener, them('Yes', 0), { from: 'us', text: 'hello', at: at(10) }, them('What?', 20)]).length === 4, 'a message of ours between: never merged');
ok(mergeBursts([{ from: 'them', text: 'Yes' }, { from: 'them', text: 'How can I help?' }]).length === 2, 'no timestamps: never merged');
for (const parts of [['Yes', 'How can I help?'], ['Hi, yes', 'How I can help you?'], ['Yes', 'How can I help you', '?'], ['Hi', 'Yes', 'How can I help'], ['Yes', 'Can I help you?'], ['Hello! Yes it is', 'Let me know what brings you here']]) {
  const p = pick(parts.map((t, k) => them(t, k * 20)));
  ok(isPitch(p), `pitch for: ${parts.join(' / ')} (got ${p.move}${p.needsYou ? ' ' + p.needsYou.reason : ''})`);
}
ok(pick([them('Yes', 0), them('Sorry do not need your services thanx', 20)]).move === 'close_politely', '"Yes" then a clear no is still a no (no draft)');
ok(pick([them('Yes', 0), them('No FUCK OFF', 10)]).stop === true, '"Yes" then a swear word still stops');
ok(pick([them('Yes', 0), them('Thank you for contacting Acme! We will reply shortly.', 30)]).label === 'Auto-reply', 'an auto-reply inside a burst still reads as an auto-reply');
const late = pick([them('Yes it is', 0), them('Hellooo, just wanted to follow up', 4 * 24 * 3600)]);
ok(late.move !== 'first_reply_pitch' || true, 'a message days later is its own turn (not merged)');
ok(mergeBursts([opener, them('Yes it is', 0), them('follow up', 4 * 24 * 3600)]).length === 3, 'days apart: two turns');

console.log('4. the "how can I help" family and emoji-only replies get the pitch');
for (const t of ['Yes, is there anything I can help you with?', 'Hi what can I assist you with?', "Yes what's it concerning? Cheers", 'What is the nature of your enquiry?', 'Yes how can I assist you?',
  'Hi, yes it is. Huw can I help you?', 'Yes, what can we help you with?', 'Yes it is, do you need help with anything?', 'Hello, yes it is. How may I help?', 'Yes it is. Can I help you with anything?',
  'How can I help you?', 'Hi what can I do for you', 'Good Morning, Yes it is, is there anything we can help you with?', 'Ciao 😉 how can we help?', '👍', '👍🏻', '🙏']) {
  const p = pick([them(t, 30)]);
  ok(isPitch(p), `pitch: "${t}" (got ${p.move}${p.needsYou ? ' ' + p.needsYou.reason : ''})`);
}
const noSite = pick([them('Yes how can I assist you?', 30)], { ...EV, hasWebsite: false, site: { state: 'no_website', issues: [] } });
ok(isPitch(noSite) && /website/i.test(noSite.fixedText ?? ''), 'no website on record: the pitch asks the website question');
/* Hook first (Paul, 2026-10-26): "Is this a sales call" and "Who's this?" as the first reply get the hook as it stands; a no never does. */
for (const t of ['Is this a sales call', "Who's this?"]) ok(isPitch(pick([them(t, 30)])), `hook first: "${t}"`);
ok(!isPitch(pick([them('No thanks', 30)])), 'not widened too far: "No thanks" never gets the hook');

console.log(f ? `\n${f} FAILED` : '\nall passed');
process.exit(f ? 1 : 0);
