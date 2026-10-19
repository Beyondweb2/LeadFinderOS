/* WhatsApp never tries a non-mobile (2026-10-19) — now that Find Leads adds landlines and no-phone leads.
   The rule (src/lib/whatsAppDestination.ts) and EVERY place that queues or sends, pinned. The places and their gates
   are listed in docs/find-leads-bulk-add.md ("WhatsApp: every place checked"). */
import { readFileSync } from 'node:fs';
import { templateDestinationRefusal, NOT_A_MOBILE } from '../src/lib/whatsAppDestination.ts';
import { coldWhatsAppVerdict } from '../src/lib/coldWhatsAppEligibility.ts';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(p, 'utf8');
const d = (p: string, c: string) => toWhatsAppDigits(p, c);

console.log('── the rule ──');
ok(templateDestinationRefusal(d('07700 900123', 'UK')) === null, 'UK mobile: sendable');
ok(templateDestinationRefusal(d('012-345 6789', 'Malaysia')) === null && templateDestinationRefusal(d('+65 9123 4567', 'Singapore')) === null, 'MY / SG mobiles: sendable');
for (const [p, c] of [['01632 960001', 'UK'], ['020 7946 0001', 'UK'], ['0333 010 0001', 'UK'], ['+44 1632 960001', 'UK'], ['03-2345 6789', 'Malaysia'], ['+60 3 0000 0001', 'Malaysia'], ['6123 4567', 'Singapore']] as const) {
  ok(templateDestinationRefusal(d(p, c)) === NOT_A_MOBILE, `${c} ${p}: refused (not a mobile)`);
}
ok(templateDestinationRefusal(null) === 'no_number' && templateDestinationRefusal('') === 'no_number', 'no number: refused');
ok(templateDestinationRefusal('61412345678') === null, 'another country is left to the existing checks (never refused on absence)');

console.log('── the cold verdict (bulk queue, sales queue, campaigns, drip) refuses the three non-mobile fixtures ──');
const on = new Set(['UK', 'MY', 'SG'] as const);
ok(coldWhatsAppVerdict('07700 900123', 'UK', on).eligible === true, 'fixture mobile: queueable');
for (const [p, c] of [['01632 960001', 'UK'], ['03-0000 0001', 'Malaysia'], [null, 'UK']] as const) {
  ok(coldWhatsAppVerdict(p, c, on).eligible === false, `fixture ${p ?? 'no phone'} (${c}): not queueable`);
}

console.log('── every place that queues or sends ──');
const swm = read('supabase/functions/send-whatsapp-message/index.ts');
ok(/if \(templateDestinationRefusal\(to\) === NOT_A_MOBILE\)/.test(swm), 'send-whatsapp-message: EVERY template refuses a non-mobile (Inbox, Quick Close link, client-hub link, follow-ups)');
ok(swm.indexOf('templateDestinationRefusal(to)') > swm.indexOf('if (templateName) {'), '…inside the template branch (a free-form reply in an open thread is not touched)');
ok(/const BUILD_ID = "2026-10-19a-template-non-mobile"/.test(swm), 'send-whatsapp-message BUILD_ID bumped (the deploy marker)');
const pwq = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/trigger !== "first_reply" && templateDestinationRefusal\(/.test(pwq) && /finish\("skipped_not_mobile"/.test(pwq), 'auto-reply drain: the audit-complete pitch to a stored landline is skipped');
ok(/!lineType\.whatsappEligible \|\| knownNonMobile/.test(pwq), 'the drip backstop: the digit rule as well as the phone library');
ok(/isColdOutreachTemplate\(templateName\) && !isUkColdDestination\(toNumber\) && !\(coldMarket && coldMarket !== "UK"\)/.test(pwq), 'the drip still refuses a cold opener to anything but a UK / MY / SG mobile');
const ctl = read('src/components/WhatsAppLeadControls.tsx');
ok(/if \(v\.eligible === false\) \{[\s\S]{0,400}Not sendable on WhatsApp/.test(ctl), 'admin per-lead toggle: the whole cold verdict, with a toast');
ok(/!whatsappEligible \|\| knownNonMobile/.test(ctl) && /Skipped: landline, not sendable on WhatsApp\./.test(ctl), '…and any template: a landline is not queued, and says so');
const ot = read('src/components/OutreachTable.tsx');
ok(/templateDestinationRefusal\(toWhatsAppDigits\(lead\?\.phone, lead\?\.country\)\) !== null/.test(ot), 'admin bulk queue (follow-up templates): the digit rule');
ok(/not queued — /.test(ot) || /notReachable\[reason\]/.test(ot), 'admin bulk queue: skipped leads are counted with their reason');
const opener = read('supabase/migrations/20261030090000_initial_contact_short.sql');
ok(/mobile_market/.test(opener) && /not_a_uk_mobile/.test(opener), 'sales_queue_opener (sales queue + campaign launch): mobile_market, skipped as not_a_uk_mobile');
const launch = read('supabase/migrations/20261009150000_campaign_launch_owner_scope.sql');
ok(/sales_queue_opener/.test(launch) && /call_campaign/.test(launch), 'campaign_launch goes through sales_queue_opener; a Call campaign never sends');
const sms = read('supabase/functions/_shared/twilio-sms.ts');
ok(/mobileMarketOf/.test(sms), 'SMS (not WhatsApp) also needs a mobile');

console.log('── calls accept landlines ──');
const markets = read('src/lib/outreachMarkets.ts');
ok(/\^44\[1237\]/.test(markets) && /\[3-9\]\\d\{7,8\}/.test(markets), 'callMarketOf: UK 01/02/03 and Malaysian landlines are callable');
ok(/data-testid="phone-kind-label"/.test(ot) && /title="Callable\. Not sendable on WhatsApp\."/.test(ot), 'Outreach: a landline keeps its Call button with a grey "Landline" label');

console.log(f ? `\n${f} FAILED` : '\nall passed');
if (f) process.exit(1);
