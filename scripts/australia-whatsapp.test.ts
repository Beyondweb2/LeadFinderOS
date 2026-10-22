/* ============================================================
   AUSTRALIA AS A WHATSAPP MARKET (2026-10-22, feat/australia-whatsapp, docs/australia-whatsapp.md).

   Pins:
     A. The market: an Australian mobile (61 4…) is 'AU'; landlines are not mobiles; the SQL twin agrees.
     B. WhatsApp only: texts and browser calls to Australia are never on, whatever is stored (TS + SQL).
     C. The lead's zone comes from its state (address → Coverage town → search → derived town); a bare town is never
        turned into a state; no state = "needs state".
     D. The window: 09:00–17:00 Mon–Fri in the LEAD's zone, DST-correct; no zone never opens; the next opening skips
        the weekend; the UK / Malaysia / Singapore windows are byte for byte unchanged.
     E. The Inbox: the header shows their day, time and city; a needs-state send is refused, never queued.
     F. Budgets: the queue's team count leaves Australia out and the team cap never stops Australia; Australia has its
        own cap (100), its own auto-off and no automatic retry; the drip asks prospect-only.
     G. Cold verdict: an AU mobile is eligible only when Australia's switch is on.

   Run: npx tsx scripts/australia-whatsapp.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  ABROAD_MARKETS, AU_LEAD_ZONES, channelOn, countrySettingsFrom, DEFAULT_COUNTRY_SETTINGS, MARKETS, marketsOn, mobileMarketOf,
  windowForMarket,
} from '../src/lib/outreachMarkets.ts';
import { auLeadZone, AU_STATE_TIME_ZONES, NEEDS_STATE_DETAIL } from '../src/lib/auLeadZone.ts';
import { anyWindowOpen, LONDON_SEND_WINDOW, marketWindowOpen, sendWindowForDigits, windowOpenForDigits } from '../src/lib/sendWindow.ts';
import { nextWindowOpenAt, queueDecision, queuedLabel, replyWindowFor, windowStatusLine, NEEDS_STATE_REFUSAL } from '../src/lib/inboxSendWindow.ts';
import { templateDestinationRefusal, NOT_A_MOBILE } from '../src/lib/whatsAppDestination.ts';
import { coldWhatsAppVerdict } from '../src/lib/coldWhatsAppEligibility.ts';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';
import { prospectOnlyTemplateRefusal } from '../src/lib/prospectOnly.ts';
import { UK_WORDED_TEMPLATES } from '../src/lib/reportOfferTemplate.ts';
import { deriveQueue, rowNeedsState, QUEUE_ROW_COLUMNS } from '../src/lib/whatsappQueueView.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const ON = countrySettingsFrom([{ country: 'AU', whatsapp_on: true }]);
const AU_MOBILE = '61412345678';

console.log('A. The market');
ok(mobileMarketOf(AU_MOBILE) === 'AU', '61 4… is an Australian mobile');
ok(mobileMarketOf(toWhatsAppDigits('0412 345 678', 'Australia')) === 'AU', 'a national 04… number on an Australian lead is one too');
ok(mobileMarketOf('61298765432') === null && templateDestinationRefusal('61298765432') === NOT_A_MOBILE, 'a Sydney landline is not a mobile — no template goes to it');
ok(mobileMarketOf('447700900123') === 'UK' && mobileMarketOf('60123456789') === 'MY' && mobileMarketOf('6591234567') === 'SG', 'UK / MY / SG unchanged');
ok(MARKETS.includes('AU') && ABROAD_MARKETS.includes('AU'), 'AU is listed with the other markets');
const mig = read('supabase/migrations/20261120090000_australia_whatsapp.sql');
ok(/when _pk ~ '\^4\[0-9\]\{8\}\$' then 'AU'/.test(mig), 'SQL mobile_market: phone_key 4 + 8 digits is AU (twin of the TS rule)');
ok(/check \(country in \('UK', 'MY', 'SG', 'AU'\)\)/.test(mig) && /values \('AU', true, false, false, 100, null, 540, 1020, 'Australia\/Sydney', now\(\)\)/.test(mig),
  'the AU row: WhatsApp ON, SMS / calls OFF, cap 100, 09:00–17:00');

console.log('B. WhatsApp only');
const allOn = countrySettingsFrom([{ country: 'AU', whatsapp_on: true, sms_on: true, call_on: true }]);
ok(channelOn(allOn, 'AU', 'whatsapp') && !channelOn(allOn, 'AU', 'sms') && !channelOn(allOn, 'AU', 'call'), 'stored sms_on / call_on are ignored for Australia');
ok(!marketsOn(allOn, 'sms').has('AU') && marketsOn(allOn, 'whatsapp').has('AU'), 'marketsOn agrees');
ok(!channelOn(DEFAULT_COUNTRY_SETTINGS, 'AU', 'whatsapp'), 'no stored row = Australia OFF (like Malaysia)');
ok(/when _market = 'AU' and _channel <> 'whatsapp' then false/.test(mig), 'SQL outreach_channel_on: AU texts / calls never on');
ok(/_country = 'AU' and k in \('sms_on', 'call_on'\)/.test(mig) && /'error', 'whatsapp_only'/.test(mig), 'set_outreach_country refuses switching AU texts / calls on');

console.log('C. The lead\'s zone from its state');
const z = (l: Parameters<typeof auLeadZone>[0]) => auLeadZone(l).tz;
ok(z({ address: '12 Smith St, Richmond VIC 3121, Australia' }) === 'Australia/Melbourne', 'address state word → VIC → Melbourne');
ok(z({ address: '1 Hay St, Perth 6000, Australia' }) === 'Australia/Perth', 'address postcode alone → WA → Perth');
ok(z({ address: null, coverage_town: 'Toowoomba QLD' }) === 'Australia/Brisbane', 'Coverage town state → QLD → Brisbane');
ok(z({ search_location: 'Darwin NT, Australia' }) === 'Australia/Darwin', 'search location state → NT → Darwin');
ok(z({ address: '5 King William St, Adelaide SA 5000, Australia', coverage_town: 'Ballarat VIC' }) === 'Australia/Adelaide', 'the address wins over the Coverage town');
ok(z({ coverage_town: 'Ballarat', search_location: 'Ballarat, Australia' }) === null, 'a bare town is never guessed into a state → needs state');
ok(z({}) === null && z(null) === null, 'nothing to go on → needs state');
ok(AU_STATE_TIME_ZONES.TAS === 'Australia/Hobart' && AU_STATE_TIME_ZONES.ACT === 'Australia/Sydney' && AU_STATE_TIME_ZONES.NSW === 'Australia/Sydney',
  'TAS Hobart, ACT/NSW Sydney');
ok(Object.values(AU_STATE_TIME_ZONES).every((tz) => AU_LEAD_ZONES.includes(tz)), 'every state zone is on the allowed list');
ok(NEEDS_STATE_DETAIL === NEEDS_STATE_REFUSAL, 'one needs-state sentence');

console.log('D. The window — 09:00–17:00 Mon–Fri in the lead\'s zone');
const w = (tz: string | null) => sendWindowForDigits(AU_MOBILE, ON, tz);
// Thu 22 Oct 2026, 23:30 UTC = Fri 10:30 Sydney (AEDT, UTC+11), Fri 07:30 Perth (UTC+8), Fri 09:30 Brisbane (UTC+10).
const friMorning = new Date('2026-10-22T23:30:00Z');
ok(windowOpenForDigits(AU_MOBILE, friMorning, ON, 'Australia/Sydney'), 'Fri 10:30 Sydney: open');
ok(!windowOpenForDigits(AU_MOBILE, friMorning, ON, 'Australia/Perth'), 'Fri 07:30 Perth: closed');
ok(windowOpenForDigits(AU_MOBILE, friMorning, ON, 'Australia/Brisbane'), 'Fri 09:30 Brisbane (no DST): open');
// Sat 24 Oct 2026 00:00 UTC = Sat 11:00 Sydney.
const satMorning = new Date('2026-10-24T00:00:00Z');
ok(!windowOpenForDigits(AU_MOBILE, satMorning, ON, 'Australia/Sydney'), 'Saturday 11:00 Sydney: closed (weekday only)');
ok(!windowOpenForDigits(AU_MOBILE, friMorning, ON, null) && w(null).needsState === true, 'no zone: never open, marked needs state');
ok(!windowOpenForDigits(AU_MOBILE, friMorning, ON, 'Europe/London'), 'a non-Australian zone is not accepted as a lead zone');
// 17:00 Sydney Fri = 06:00 UTC Fri 23 Oct.
ok(!windowOpenForDigits(AU_MOBILE, new Date('2026-10-23T06:00:00Z'), ON, 'Australia/Sydney')
  && windowOpenForDigits(AU_MOBILE, new Date('2026-10-23T05:59:00Z'), ON, 'Australia/Sydney'), '17:00 is the end (exclusive)');
const nextFromSat = nextWindowOpenAt({ ...w('Australia/Sydney') }, satMorning);
ok(nextFromSat.toISOString() === '2026-10-25T22:00:00.000Z', `next opening from Saturday = Mon 09:00 Sydney (got ${nextFromSat.toISOString()})`);
const nextPerth = nextWindowOpenAt({ ...w('Australia/Perth') }, friMorning);
ok(nextPerth.toISOString() === '2026-10-23T01:00:00.000Z', `next Perth opening from 07:30 Fri = 09:00 Fri (got ${nextPerth.toISOString()})`);
// DST: Sydney goes from AEST to AEDT on Sun 4 Oct 2026. Fri 2 Oct 22:00 UTC = Sat 08:00 AEST → next = Mon 5 Oct 09:00 AEDT = Sun 4 Oct 22:00 UTC.
ok(nextWindowOpenAt({ ...w('Australia/Sydney') }, new Date('2026-10-02T22:00:00Z')).toISOString() === '2026-10-04T22:00:00.000Z',
  'next opening across the clock change is 09:00 on the new clock');
ok(marketWindowOpen(['AU'], 'whatsapp', friMorning, ON) && !marketWindowOpen(['AU'], 'whatsapp', satMorning, ON)
  && !marketWindowOpen(['AU'], 'whatsapp', friMorning, DEFAULT_COUNTRY_SETTINGS), 'the queue\'s outer gate: open when any Australian zone is open on a weekday, and only while switched on');
ok(JSON.stringify(sendWindowForDigits('447700900123', ON)) === JSON.stringify(LONDON_SEND_WINDOW), 'UK window unchanged');
ok(JSON.stringify(sendWindowForDigits('60123456789', ON)) === JSON.stringify({ ...windowForMarket('MY', ON, LONDON_SEND_WINDOW), label: 'MY' })
  && sendWindowForDigits('60123456789', ON).days === undefined, 'Malaysia window unchanged (every day)');
// Sat 24 Oct 2026 00:00 UTC: London 01:00 (closed), Malaysia/Singapore off by default, Australia weekend → nothing open.
ok(!anyWindowOpen(satMorning, ON), 'anyWindowOpen: an Australian weekend opens nothing');

console.log('E. The Inbox');
const rw = replyWindowFor('whatsapp', AU_MOBILE, { countrySettings: ON, leadTz: 'Australia/Perth' });
const line = windowStatusLine(rw, friMorning).text;
ok(line === 'Their time Fri 07:30 (Perth) · opens 09:00', `header names day, time, city (got "${line}")`);
ok(windowStatusLine(replyWindowFor('whatsapp', AU_MOBILE, { countrySettings: ON, leadTz: 'Australia/Sydney' }), satMorning).text
  === 'Their time Sat 11:00 (Sydney) · opens Mon 09:00', 'a weekend names the opening day');
ok(windowStatusLine(replyWindowFor('whatsapp', AU_MOBILE, { countrySettings: ON, leadTz: 'Australia/Sydney' }), friMorning).text
  === 'Their time Fri 10:30 (Sydney) · open until 17:00', 'open: until 17:00');
ok(windowStatusLine(replyWindowFor('whatsapp', AU_MOBILE, { countrySettings: ON }), friMorning).text.startsWith('Needs state'), 'no state: the header says Needs state');
const ukLine = windowStatusLine(replyWindowFor('whatsapp', '447700900123', {}), new Date('2026-10-22T10:00:00Z')).text;
ok(ukLine === 'Their time 11:00 · open until 21:30', `UK header unchanged (got "${ukLine}")`);
const qd = queueDecision({ channel: 'whatsapp', kind: 'template', window: replyWindowFor('whatsapp', AU_MOBILE, { countrySettings: ON }), now: friMorning, lastInboundAt: null });
ok(qd.kind === 'refuse' && qd.error === 'needs_state', 'a needs-state Inbox send is refused, never queued');
const qd2 = queueDecision({ channel: 'whatsapp', kind: 'template', window: rw, now: friMorning, lastInboundAt: null });
ok(qd2.kind === 'queue' && qd2.tz === 'Australia/Perth' && qd2.sendAt === '2026-10-23T01:00:00.000Z', 'outside the hours: queued for 09:00 in the lead\'s zone');
ok(queuedLabel('2026-10-25T22:00:00.000Z', 'Australia/Sydney') === 'Queued, sends Mon 09:00 their time', 'queued label names the day for Australia');
ok(queuedLabel('2026-10-23T06:00:00.000Z', 'Europe/London') === 'Queued, sends at 07:00 their time', 'UK queued label unchanged');
const drain = read('supabase/functions/_shared/inbox-scheduled-drain.ts');
ok(/leadTz: row\.tz \?\? null/.test(drain), 'the drain reads a queued row in the zone it was queued in');
const sched = read('supabase/functions/_shared/inbox-schedule.ts');
ok(/replyWindowForDest\(service, row\.channel, row\.phone, \{ leadId: row\.leadId \}\)/.test(sched), 'the Inbox gate reads the lead\'s zone from the lead');
ok(/leadTz: auLeadTz\(lead\)/.test(read('src/components/InboxSendWindow.tsx')) && /leadTz: activeLeadTz/.test(read('src/pages/Inbox.tsx')),
  'the Inbox header and the Outreach popup pass the lead\'s zone');

console.log('F. Budgets, auto-off, no retry, prospect-only');
const pwq = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/\.gte\("created_at", dayStart\)\.not\("phone", "like", "61%"\)/.test(pwq), 'the team count leaves Australian sends out');
ok(/if \(teamCapReached && m !== "AU"\) return false;/.test(pwq) && /if \(teamCapReached && !auMaySend\) return json\(\{ ok: true, skipped: "cap_reached"/.test(pwq),
  'the team cap stops every market but Australia');
ok(/for \(const m of ABROAD_MARKETS\)/.test(pwq), 'Australia\'s own daily cap is read like Malaysia\'s');
ok(/return m === "MY" \|\| m === "SG" \|\| m === "AU";/.test(pwq), 'a failed Australian send is never retried automatically (drip)');
ok(/in \('MY', 'SG', 'AU'\) then\s+new\.status := 'whatsapp_failed'/.test(mig) && /if v_market in \('MY', 'SG', 'AU'\) then perform public\.country_whatsapp_auto_pause/.test(mig),
  'SQL: no auto-retry + the automatic switch-off cover Australia');
ok(/when 'AU' then 'Australia'/.test(mig) && /_market not in \('MY', 'SG', 'AU'\)/.test(mig), 'the switch-off names Australia');
ok(/rowTz\(r\)/.test(pwq) && /\$\{AU_ZONE_COLUMNS\}/.test(pwq), 'the drip reads each lead\'s zone (and selects its address / town)');
ok(/prospectOnlyTemplateRefusal\(\{ name: templateName, vars: TEMPLATES\[templateName\]\.vars as readonly string\[\] \}, toNumber, UK_WORDED_TEMPLATES\)/.test(pwq),
  'the drip asks prospect-only too');
ok(prospectOnlyTemplateRefusal({ name: 'onboarding_link', vars: ['name', 'onboarding_url'] }, AU_MOBILE, UK_WORDED_TEMPLATES) !== null
  && prospectOnlyTemplateRefusal({ name: 'initial_contact', vars: ['name'] }, AU_MOBILE, UK_WORDED_TEMPLATES) === null,
  'a sign-up link never goes to +61; the opener does');
ok(DEFAULT_COUNTRY_SETTINGS.AU.whatsapp_daily_cap === 100, 'the default cap is 100 (an editable setting)');

console.log('G. Cold verdict and the queue panel');
ok(coldWhatsAppVerdict('+61 412 345 678', 'Australia', marketsOn(ON, 'whatsapp')).eligible, 'AU on: an Australian mobile is eligible');
const off = coldWhatsAppVerdict('+61 412 345 678', 'Australia', marketsOn(DEFAULT_COUNTRY_SETTINGS, 'whatsapp'));
ok(!off.eligible && off.reason === 'country_off', 'AU off: country_off (never No mobile)');
ok(/address/.test(QUEUE_ROW_COLUMNS) && !/coverage_town/.test(QUEUE_ROW_COLUMNS), 'the queue reads the address / town (sales_leads has no coverage_town)');
const row = { id: 'a', business_name: 'X', status: 'queued', is_archived: false, queued_at: '2026-10-22', whatsapp_template: 'initial_contact',
  phone: '+61 412 345 678', country: 'Australia', contact_followup_queued_at: null, hook_followup_queued_at: null };
ok(rowNeedsState(row) && deriveQueue([row], marketsOn(ON, 'whatsapp')).needsState === 1, 'no state: the row is Needs state');
ok(!rowNeedsState({ ...row, address: '1 A St, Hobart TAS 7000, Australia' }), 'with a state: not held');
ok(!rowNeedsState({ ...row, phone: '07700 900123', country: 'UK' }), 'a UK lead is never Needs state');

console.log(failures ? `\nFAILED: ${failures}` : '\nAll passed.');
if (failures) process.exit(1);
