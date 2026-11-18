/* Send more info (2026-11-16, docs/send-more-info.md): Paul's wording word for word, the named swap, the blocks, the link rule,
   the price line setting, and the wiring (one SMS sender, email guards, no WhatsApp, no Next Action from the send path). */
import { readdirSync, readFileSync } from 'node:fs';
import { smsGateOpen } from '../src/lib/contactRouting.ts';
import path from 'node:path';
import {
  cleanPriceLine, DEFAULT_MORE_INFO_PRICE_LINE, moreInfoBlock, moreInfoEmailBody, moreInfoEmailSubject, moreInfoFollowUpDay, moreInfoHistoryLine,
  moreInfoSmsBody, moreInfoTextRefusal, moreInfoTrade, moreInfoWarning, senderFirstName, type MoreInfoVars,
  MORE_INFO_CONSENT_LABEL, moreInfoCallConsentGiven, moreInfoConsentLine, moreInfoConsentRecord, moreInfoOpensSmsGate,
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

Here's what we do about it:

- We find the questions your customers ask AI that you can actually win, then build your site to answer them, so AI understands who you are, what you do and where you work
- We can work with the design you already have, or make you a new, improved one at no extra cost
- We get your details right on the directories and listings AI checks
- We reply to your reviews for you, so your business looks active and looked after

It's £99 a month for 12 months (or £999 up front).

We improve your AI visibility or you get your money back. We measure 20 searches your customers make when you join, then again at 4 weeks, and if you're not named more we refund everything you've paid.

Any questions, just reply to this email, or have a look at findable.live

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

console.log('\n── call consent replaces the conversation rule (Send more info ONLY) ──');
ok(moreInfoCallConsentGiven(true) && !moreInfoCallConsentGiven('true') && !moreInfoCallConsentGiven(1) && !moreInfoCallConsentGiven(undefined) && !moreInfoCallConsentGiven(false), 'only a real true counts as the tick');
ok(MORE_INFO_CONSENT_LABEL === 'They asked for this info on a call', 'the tick-box wording');
ok(moreInfoConsentLine('Valentin') === 'Asked for info on a call, confirmed by Valentin', 'the History consent line');
const rec = moreInfoConsentRecord({ userId: 'u1', name: 'Valentin', channel: 'sms', at: new Date('2026-11-16T14:00:00Z') });
ok(rec.confirmed_by === 'Valentin' && rec.confirmed_by_user_id === 'u1' && rec.channel === 'sms' && rec.confirmed_at === '2026-11-16T14:00:00.000Z' && rec.source === 'call', 'consent record = who, when, channel');
/* The SMS sender's gate exactly as written there: isCold || smsGateOpen(...) || moreInfoOpensSmsGate(a). */
const noConversation = { loggedConversation: false, inboundSms: false, inboundWhatsapp: false, isAdmin: false };
const gateFor = (a: { moreInfo?: { callConsent?: unknown } | null }, isCold = false) => isCold || smsGateOpen(noConversation) || moreInfoOpensSmsGate(a);
ok(gateFor({ moreInfo: { callConsent: true } }) === true, 'more info + ticked, no conversation on record: the text may go');
ok(gateFor({ moreInfo: { callConsent: false } }) === false && gateFor({ moreInfo: {} }) === false, 'more info NOT ticked, no conversation: still closed');
ok(gateFor({}) === false && gateFor({ moreInfo: null }) === false, 'any other text (free text, template, link) with no conversation: still closed, unchanged');
ok(smsGateOpen({ ...noConversation, loggedConversation: true }) === true, 'the existing conversation rule itself is unchanged');

const fnC = read('supabase/functions/send-more-info/index.ts');
const consentAt = fnC.indexOf('moreInfoCallConsentGiven(body.call_consent)');
ok(consentAt > 0 && /error: "consent_required"/.test(fnC), 'the server refuses a send without the tick');
ok(consentAt < fnC.indexOf('sendSmsToLead(service, {') && consentAt < fnC.indexOf('api.resend.com') && consentAt > fnC.indexOf('// ── send ──'), '…for a text AND an email, before anything is sent');
ok(/moreInfo: \{ body: text, reportLink: b\.vars\.reportLink, callConsent: true \}/.test(fnC), 'the text carries the consent into the one SMS sender');
ok(/moreInfoConsentLine\(senderName\)/.test(fnC) && /consent, \.\.\.data/.test(fnC) && /moreInfoConsentRecord\(/.test(fnC), 'History records the consent (line + who/when/channel)');
ok(/checkSuppressed\(service, \{ email: to/.test(fnC) && /qaEmailHold\(/.test(fnC) && /"email_send"/.test(fnC) && /outside_hours/.test(fnC), 'email still: opt-out/DNC, test-lead rule, send limit; text still: texting hours');

const smsC = read('supabase/functions/_shared/twilio-sms.ts');
ok(/const gate = isCold \|\| smsGateOpen\(\{[\s\S]*?\}\) \|\| moreInfoOpensSmsGate\(a\);/.test(smsC), 'the SMS gate: cold OR conversation OR (more info + tick)');
const gateAt = smsC.indexOf('moreInfoOpensSmsGate(a)');
ok(smsC.indexOf('checkSuppressed(') < gateAt && gateAt < smsC.indexOf('loadQaExclusions(service)') && gateAt < smsC.indexOf('guardAction(service, a.actor.id, "sms_send"'), 'opt-out/DNC before it; test-lead rule and send limits after it — all still run');
ok(/if \(isCold\) \{[\s\S]*already_texted[\s\S]*in_whatsapp_conversation[\s\S]*contacted_logged/.test(smsC), 'the cold-text rule is unchanged');
const fnDir = path.join(ROOT, 'supabase/functions');
const otherMoreInfo = readdirSync(fnDir).filter((d) => d !== '_shared' && d !== 'send-more-info').filter((d) => {
  try { return /moreInfo\s*:/.test(read(`supabase/functions/${d}/index.ts`)); } catch { return false; }
});
ok(otherMoreInfo.length === 0, `no other function sends the more-info kind (found: ${otherMoreInfo.join(', ') || 'none'})`);

const uiC = read('src/components/SendMoreInfo.tsx');
ok(/MORE_INFO_CONSENT_LABEL/.test(uiC) && /type="checkbox"/.test(uiC) && /useState\(false\)/.test(uiC), 'the dialog shows the tick-box, unticked to start');
ok(/disabled=\{!!busy \|\| !!unavailable \|\| !callConsent\}/.test(uiC) && /callConsent \}\)/.test(uiC), 'Send stays off until ticked, and the tick is sent');
ok(/call_consent: a\.callConsent === true/.test(read('src/lib/moreInfoClient.ts')), 'the client sends call_consent');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
