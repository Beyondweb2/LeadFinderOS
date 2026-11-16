/* Send more info (2026-11-16, docs/send-more-info.md): Paul's wording word for word, the named swap, the blocks, the link rule,
   the price line setting, and the wiring (one SMS sender, email guards, no WhatsApp, no Next Action from the send path). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  cleanPriceLine, DEFAULT_MORE_INFO_PRICE_LINE, moreInfoBlock, moreInfoEmailBody, moreInfoEmailSubject, moreInfoFollowUpDay, moreInfoHistoryLine,
  moreInfoSmsBody, moreInfoTextRefusal, moreInfoTrade, moreInfoWarning, senderFirstName, type MoreInfoVars,
} from '../src/lib/moreInfoMessage.ts';
import { DEFAULT_PROTECTION_LIMITS, GUARD_ACTIONS } from '../src/lib/protectionLimits.ts';
import { ACTIVITY_LABEL } from '../src/lib/salesCrm.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const LINK = 'https://findable.live/r/AbC123';
const v = (o: Partial<MoreInfoVars> = {}): MoreInfoVars => ({
  businessName: 'Smith Plumbing Ltd', reportLink: LINK, trade: 'a plumber', priceLine: DEFAULT_MORE_INFO_PRICE_LINE, senderName: 'Valentin', named: { kind: 'none' }, ...o,
});

console.log('── the wording, exactly ──');
ok(moreInfoEmailSubject(v()) === 'Smith Plumbing Ltd: the info you asked for', 'subject');
const EMAIL = `Hi Smith Plumbing Ltd,

Here's the info you asked for, and your AI report: ${LINK}

When people ask ChatGPT, Gemini or Google AI for a plumber near you, it recommends your competitors instead of you.

AI builds its answers from what it can read about your business online. If that's unclear or hard to read, it picks someone else. We fix what AI reads, so it understands who you are, what you do and where you work, and starts recommending you.

It's £99 a month for 12 months (or £999 up front). There's a smaller option too if you'd prefer, just ask.

We improve your AI visibility or you get your money back. We measure 20 searches your customers make when you join, then again at 4 weeks, and if you're not named more we refund everything you've paid.

More at https://findable.live, or just reply with any questions.

Valentin
Findable`;
ok(moreInfoEmailBody(v()) === EMAIL, 'email body = Paul\'s text with only the variables filled');
const SMS = `Hi Smith Plumbing Ltd, here's your AI report: ${LINK}

AI recommends your competitors right now. We fix what it reads so you get named.

£99 a month for 12 months (or £999 up front), money back if your AI visibility doesn't improve.

findable.live
Valentin, Findable
Reply STOP to opt out`;
ok(moreInfoSmsBody(v()) === SMS, 'text body = Paul\'s text, the price from the ONE price line setting');
ok(!moreInfoSmsBody(v()).includes('£99/month'), 'the text never names the monthly figure on its own (the setting carries both)');

console.log('\n── already named in some answers ──');
const some = v({ named: { kind: 'some', named: 2, total: 9 } });
ok(moreInfoEmailBody(some).includes('When people ask ChatGPT, Gemini or Google AI for a plumber near you, AI mentions you sometimes, but mostly recommends your competitors.'), 'email swaps the competitor sentence');
ok(!moreInfoEmailBody(some).includes('instead of you'), '…and drops the "instead of you" sentence');
ok(moreInfoSmsBody(some).includes('AI mentions you sometimes, but mostly recommends your competitors. We fix what it reads'), 'text swaps it too');
ok(moreInfoWarning(some.named) === null, 'named in 2 of 9: no warning');
ok(moreInfoWarning({ kind: 'some', named: 5, total: 9 })?.includes('56%') === true, 'named in more than half: a warning (never a block)');
ok(moreInfoBlock({ businessName: 'X', reportLink: LINK, trade: 'a plumber', senderName: 'V', named: { kind: 'all', total: 9 } }) !== null, 'named in every answer: nothing can be sent');
ok(moreInfoEmailBody(v({ named: { kind: 'unknown' } })) === EMAIL, 'unknown named count: the standard sentence');

console.log('\n── the blocks ──');
ok(/no report/i.test(moreInfoBlock({ businessName: 'X', reportLink: null, trade: 'a plumber', senderName: 'V', named: { kind: 'none' } }) ?? ''), 'no report yet: a clear block');
ok(moreInfoBlock({ businessName: '  ', reportLink: LINK, trade: 'a plumber', senderName: 'V', named: { kind: 'none' } }) !== null, 'no business name: blocked');
ok(moreInfoBlock({ businessName: 'X', reportLink: LINK, trade: '', senderName: 'V', named: { kind: 'none' } }) !== null, 'no trade: blocked');
ok(moreInfoBlock({ businessName: 'X', reportLink: LINK, trade: 'a plumber', senderName: '', named: { kind: 'none' } }) !== null, 'no sender name: blocked');
ok(moreInfoBlock({ businessName: 'X', reportLink: LINK, trade: 'a plumber', senderName: 'V', named: { kind: 'none' } }) === null, 'everything there: no block');

console.log('\n── the variables ──');
ok(moreInfoTrade('Electrician') === 'an electrician' && moreInfoTrade('Plumbers') === 'a plumber', 'trade with its article, singular (the shared articleTrade rule)');
ok(moreInfoTrade('') === null && moreInfoTrade(null) === null, 'no trade = null');
ok(senderFirstName('Valentin Popescu') === 'Valentin' && senderFirstName('  ') === '', 'first name only');
ok(cleanPriceLine('  £79 a month  ') === '£79 a month' && cleanPriceLine('') === DEFAULT_MORE_INFO_PRICE_LINE && cleanPriceLine('x'.repeat(400)).length === 160, 'price line cleaned, default when empty, capped');
ok(moreInfoHistoryLine('Valentin', 'sms') === 'More info sent by Valentin via SMS' && moreInfoHistoryLine('Ana', 'email') === 'More info sent by Ana via email', 'History line');
ok(moreInfoFollowUpDay(new Date('2026-11-16T23:30:00Z')) === '2026-11-18', 'follow-up = two UK days on');

console.log('\n── an edit may change words, never add a link ──');
ok(moreInfoTextRefusal(EMAIL, LINK) === null && moreInfoTextRefusal(SMS, LINK) === null, 'the built messages pass');
ok(moreInfoTextRefusal(EMAIL.replace('just ask', 'just ask, we are lovely'), LINK) === null, 'edited words pass');
ok(moreInfoTextRefusal(EMAIL.replace(LINK, 'https://findable.live/r/ZZZ999'), LINK) !== null, 'a changed report link is refused');
ok(moreInfoTextRefusal(`${SMS} see https://evil.example.com`, LINK) !== null, 'an added link is refused');
ok(moreInfoTextRefusal(`${SMS} or bit.ly/x`, LINK) !== null && moreInfoTextRefusal(`${SMS} www.other.co.uk`, LINK) !== null, 'bare domains are refused');
ok(moreInfoTextRefusal('', LINK) !== null, 'empty is refused');

console.log('\n── the wiring ──');
const fn = read('supabase/functions/send-more-info/index.ts');
ok(/resolveActor\(req, service\)/.test(fn) && /leadAccess\(service, actor, leadId\)/.test(fn), 'role from user_roles + lead access before anything is read or sent');
ok(/sendSmsToLead\(service, \{/.test(fn) && !/twilioSendSms|api\.twilio\.com/.test(fn), 'texts go through the ONE SMS sender (opt-out, conversation gate, QA, usage guard)');
ok(/queueOutsideWindow: async/.test(fn) && /replyWindowOpen\(w\)/.test(fn) && /outside_hours/.test(fn), 'outside the lead\'s texting hours a text is refused, never queued');
ok(/checkSuppressed\(service, \{ email: to/.test(fn) && /qaEmailHold\(service, leadId, to\)/.test(fn) && /guardAction\(service, actor\.id, "email_send"/.test(fn), 'email: suppression, the QA sink and the usage guard first');
ok(fn.indexOf('checkSuppressed(service, { email: to') < fn.indexOf('api.resend.com'), '…all before Resend');
ok(/reply_to: replyTo/.test(fn) && /@findable\.live/.test(fn) && /"Idempotency-Key"/.test(fn) && !/html:/.test(fn), 'from the Findable domain, reply-to the salesperson, plain text, one send per press');
ok(!/send-whatsapp|whatsapp_messages|sendViaGraph|graph.facebook/.test(fn), 'no WhatsApp send anywhere in the sender');
ok(!/next_action|lead_set_follow_up\(/.test(fn.replace(/lead_set_follow_up\)/g, '')), 'the send path writes no Next Action (the person\'s screen does)');
ok(/prospectOnlyLead\(/.test(fn) && /lfos_campaign/.test(fn), 'prospect-only countries and LeadFinderOS campaigns are refused (no Findable price there)');
ok(/resolveLeadReportAudit\(/.test(fn), 'the report is the one the Inbox resolves (never a measurement)');
ok(/actor\.role !== "admin"/.test(fn.slice(fn.indexOf('save_settings'))), 'only the admin saves the price line');
const sms = read('supabase/functions/_shared/twilio-sms.ts');
ok(/moreInfoTextRefusal\(body, a\.moreInfo\.reportLink\)/.test(sms) && /isApprovedSmsLink\(a\.moreInfo\.reportLink\)/.test(sms), 'the SMS sender checks the more-info link rule itself');
const ui = read('src/components/SendMoreInfo.tsx');
ok(/saveNextAction\(leadId, \{ nextAction: MORE_INFO_NEXT_ACTION/.test(ui), 'the follow-up goes through the one Next Action write');
ok(read('src/components/ClosePanel.tsx').includes('<SendMoreInfo leadId={leadId} />'), 'the button sits in the Close section with the sign-up sends');
const mig = read('supabase/migrations/20261221090000_send_more_info.sql');
ok(mig.includes(`default '${DEFAULT_MORE_INFO_PRICE_LINE}'`), 'the SQL default price line = DEFAULT_MORE_INFO_PRICE_LINE');
ok(/'more_info_sent'\]\)\) not valid/.test(mig) && ACTIVITY_LABEL.more_info_sent === 'More info sent', 'History kind allowed and labelled');
ok(GUARD_ACTIONS.includes('email_send') && DEFAULT_PROTECTION_LIMITS.actions.email_send.paid === false, 'email_send guard action, unpaid');
ok(/\[functions\.send-more-info\]\nverify_jwt = true/.test(read('supabase/config.toml')), 'config.toml verify_jwt entry');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
