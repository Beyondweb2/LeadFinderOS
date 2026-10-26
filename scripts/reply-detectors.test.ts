/* Reply detectors (2026-10-26 conversation review, docs/convo-review-2026-10-26.md §2.2, §2.4). Every phrase below is a
   real prospect message from 12–25 Oct (names and numbers removed). Run: npx tsx scripts/reply-detectors.test.ts */
import { pickMove, isAutoReply, CHATBOT, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { RE } from '../src/lib/replyPlaybook.ts';
import { domainEmailLine, unansweredDomainQuestions } from '../src/lib/domainEmailLine.ts';
import { domainAuthority, domainInputFromRow, type DomainRow } from '../src/lib/domainAuthority.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const ev: MoveEvidence = { businessName: 'ZZ Fixture Driving School 26', trade: 'driving instructors', town: 'Rugby', engineWords: 'ai', named: { named: 0, valid: 6 }, competitors: ['Rival A Driving', 'Rival B Driving'], hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true };
const opener: MoveThreadMsg = { from: 'us', text: 'Hi, is this ZZ Fixture Driving School 26?', templateName: 'initial_contact_short' };
const pitch: MoveThreadMsg = { from: 'us', text: 'Hi mate, I asked AI "Who is the best driving instructor in Rugby?" and it mentioned Rival A Driving and Rival B Driving.' };
const pm = (thread: MoveThreadMsg[]) => pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: ev });
const them = (text: string, messageType = 'text'): MoveThreadMsg => ({ from: 'them', text, messageType });

console.log('1. they think we are the customer');
{
  const live = [
    'Hiya, yes. Are you looking for manual driving lessons?',
    'Is it manual or Automatic you need and where do you live postcode wise ?',
    'Hi. Yes, it is. You need driving lessons?',
    'Are you looking to start lessons ?',
    'Are you looking for lessons?',
    'Automatic or manual',
  ];
  for (const t of live) ok(RE.thinksCustomer.test(t), `detector reads: "${t}"`);
  for (const t of live) {
    const p = pm([opener, them('Yes it is, how can I help?'), pitch, them(t)]);
    ok(p.intent === 'thinks_customer' && !p.allowPrice, `after the pitch → thinks_customer, no price: "${t}"`);
  }
  const first = pm([opener, them('Hiya, yes. Are you looking for manual driving lessons?')]);
  ok(first.intent === 'thinks_customer', 'as the first reply too → thinks_customer');
  for (const t of ['Yes it is, how can I help?', 'Hi yes this is Pass Me Driving', 'I do it myself', 'Thank you for your interest, I\'m currently building a website with a friend.']) {
    ok(!RE.thinksCustomer.test(t), `not read as a customer mistake: "${t}"`);
  }
}

console.log('2. a chatbot is an automated reply: no price, no pitch');
{
  const bot = "I'm sorry, I didn't quite catch that. Could you please rephrase your message or let me know how I can help you with driving lessons?";
  ok(CHATBOT.test(bot) && isAutoReply(bot), 'the live chatbot message reads as automated');
  ok(!RE.catch.test(bot), '"didn\'t quite catch that" is not the "what\'s the catch?" question');
  ok(RE.catch.test("What's the catch?") && RE.catch.test('Is there a catch?'), 'a real catch question still reads');
  for (const thread of [[opener, them(bot)], [opener, them('Yes it is'), pitch, them(bot)]]) {
    const p = pm(thread);
    ok(p.move === 'auto_reply' && !p.autoDraft && !p.fixedText && !p.allowPrice && p.intent !== 'catch', `chatbot → Auto-reply, nothing drafted (${thread.length} messages)`);
  }
  ok(!isAutoReply("Sorry, I don't understand what you're offering"), 'a person saying they do not understand is not a chatbot');
}

console.log('3. "no competition" is not interest');
{
  for (const t of ["That fine I'm in no competition thanks though, Let gods will be done", 'They ain\'t competition mate 😂']) {
    const p = pm([opener, them('Yes it is'), pitch, them(t)]);
    ok(p.intent !== 'interested' && !p.allowPrice && !p.autoDraft, `not interested, nothing drafted: "${t}"`);
  }
  const keen = pm([opener, them('Yes'), pitch, them("I'm in")]);
  ok(keen.intent === 'interested', 'a bare "I\'m in" still reads as a yes');
  const keen2 = pm([opener, them('Yes'), pitch, them("I'm interested, tell me more")]);
  ok(keen2.intent === 'interested', '"I\'m interested, tell me more" still reads as interested');
}

console.log('4. a sticker or a reaction is an acknowledgement');
{
  for (const m of [them('[sticker]'), them('', 'sticker'), them('[reaction]'), them('👍', 'reaction')]) {
    const p = pm([opener, them('Yes it is'), pitch, m]);
    ok(p.move === 'ack' && !p.autoDraft && !/voice note/i.test([p.question ?? '', ...p.points].join(' ')), `no voice-note line: ${m.messageType} "${m.text}"`);
  }
  const voice = pm([opener, them('Yes it is'), pitch, them('[audio]')]);
  ok(voice.move === 'media', 'a voice note from them is still media (listen first)');
}

console.log('5. the alert email domain line says what happened');
{
  const line = (r: DomainRow) => domainEmailLine(domainAuthority(domainInputFromRow(r)), r);
  /* Professor Plumb NI shape: new site, the domain question blank, boxes unticked. */
  const blankRow: DomainRow = { plan_tier: 'new_site', domain_status: null, dns_permission: false, materials_confirmed: false };
  ok(/^NOT ANSWERED/.test(line(blankRow) ?? '') && !/^Answered/.test(line(blankRow) ?? ''), 'domain question blank → "NOT ANSWERED", never "Answered"');
  const partial: DomainRow = { plan_tier: 'new_site', domain_status: 'existing', domain_owned: 'yes', business_website: 'x.co.uk' };
  ok(unansweredDomainQuestions(partial).length === 2 && /registrar \/ DNS access, whether a third party controls it/.test(line(partial) ?? ''), 'partly answered → names the blank questions');
  /* Best Drive / Ambition2drive shape: everything answered and ticked. */
  const ready: DomainRow = { plan_tier: 'new_site', domain_status: 'existing', domain_owned: 'yes', domain_third_party: 'no', domain_access: 'yes', business_website: 'x.co.uk', site_rights: 'yes', authority_confirmed: true, dns_permission: true, materials_confirmed: true };
  ok(line(ready) === 'Answered — DOMAIN READY', 'all answered and ticked → "Answered — DOMAIN READY"');
  const issue: DomainRow = { ...ready, domain_owned: 'no' };
  ok(line(issue) === 'Answered — DOMAIN / AGENCY ISSUE (see NEEDS YOU)', 'answered with a problem → "Answered — DOMAIN / AGENCY ISSUE"');
  ok(line({ plan_tier: 'keep', domain_status: 'existing' }) === 'Not needed — we would work on their own site', 'keep route → not needed');
  ok(line({}) === null, 'never reached the questions → no line');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
