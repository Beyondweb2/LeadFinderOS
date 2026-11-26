/* The queue barely sending (Paul, 2026-11-24, 14:01: 19 of 200 sent, the same 9 leads at the top, Valentin's 5 never
   picked up, "waiting for its AI audit"). Pure checks plus source pins; nothing here can message anyone.
   1. An opener never waits for an audit (tick + the screen's wording).
   2. Held leads never block: they are not chosen, the rest still go.
   3. Valentin's turn: "likeliest first" ranks inside a sender, never across senders.
   4. New queue items in Findable campaigns default to initial_contact_short. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fairQueueOrder, senderKeyOf, senderQueueLine, type SenderLead } from '../supabase/functions/_shared/queue-fairness.ts';
import { likelihoodRank, likelihoodSendable, whatsAppLikelihood } from '../src/lib/whatsappLikelihood.ts';
import { defaultQueueOpener, queueOpenerToSend } from '../src/lib/openerVariant.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const fn = read('supabase/functions/process-whatsapp-queue/index.ts');

type L = SenderLead & { id: string; phone: string; website: string | null };
const PAUL = 'paul-0000', VAL = 'valentin-1111';
const rankOf = (l: L) => likelihoodRank(whatsAppLikelihood(l.phone.replace(/\D/g, ''), l.website));

console.log('3. every sender gets a turn');
{
  /* The live shape: Paul 20 leads with a website (low risk), Valentin 5 with no website on 074x (high risk, number GREEN). */
  const paul: L[] = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, queued_by_user_id: PAUL, campaign_id: 'c1', queued_at: '2026-11-24T13:59:39Z', phone: '+447700900' + String(100 + i), website: 'https://x.co.uk' }));
  const val: L[] = Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, queued_by_user_id: VAL, campaign_id: 'c2', queued_at: '2026-11-23T09:33:46Z', phone: '+447480900' + String(100 + i), website: null }));
  const last = new Map<string, string>([[PAUL, '2026-11-24T14:04:00Z']]);
  const order = fairQueueOrder([...paul, ...val], last, rankOf);
  ok(senderKeyOf(order[0]) === VAL, 'Valentin has not sent today, so his lead goes first (it went last of 25 under the old global sort)');
  ok(order.slice(0, 10).filter((l) => senderKeyOf(l) === VAL).length === 5, 'his 5 alternate with Paul inside the first 10');
  /* Inside one sender, the likeliest still go first. */
  const mixed: L[] = [
    { id: 'a', queued_by_user_id: PAUL, campaign_id: 'c1', queued_at: '2026-11-24T08:00:00Z', phone: '+447480900001', website: null },
    { id: 'b', queued_by_user_id: PAUL, campaign_id: 'c1', queued_at: '2026-11-24T09:00:00Z', phone: '+447700900002', website: 'https://y.co.uk' },
  ];
  ok(fairQueueOrder(mixed, new Map(), rankOf)[0].id === 'b', 'inside a sender: the lead with a website and an 077 number first');
  ok(fairQueueOrder(mixed, new Map())[0].id === 'a', 'without rankOf the order is unchanged (oldest first)');
  ok(fn.includes('fairQueueOrder(scanned, lastQueueSendBySender, (r) => likelihoodRank(likelihoodOf(r)))') && !/\.sort\(\(a, b\) => a\.k - b\.k \|\| a\.i - b\.i\)\.map\(\(x\) => x\.r\)/.test(fn), 'the tick ranks inside each sender, the global sort is gone');
}

console.log('2. held leads never block the rest');
{
  ok(likelihoodSendable(whatsAppLikelihood('447480900001', null), false) === false && likelihoodSendable(whatsAppLikelihood('447700900001', null), false), 'number not GREEN: a newer mobile with no website is held, an 077 with no website goes');
  ok(fn.indexOf('inWindow.filter((r) => likelihoodSendable(likelihoodOf(r), numberGreen))') < fn.indexOf('const candidates = (fairQueueOrder('), 'held leads are taken out BEFORE the look-ahead, so they cannot fill it');
  const held = senderQueueLine({ queued: 5, paused: false, windowOpen: true, windowStart: '07:00', capReached: false, coldStop: null, nextSendAt: null, stuckReason: null, stuckSinceIso: null, heldHighRisk: 5 });
  ok(held.state === 'paused' && /^Held: newer mobile number and no website/.test(held.line), 'all held: the line says why, not "the queue has not picked these up"');
  const some = senderQueueLine({ queued: 12, paused: false, windowOpen: true, windowStart: '07:00', capReached: false, coldStop: null, nextSendAt: '2026-11-24T14:20:00Z', stuckReason: null, stuckSinceIso: null, heldHighRisk: 2 });
  ok(some.state === 'queued' && /Queued: 12, next send ~14:20 \(2 held: newer mobile/.test(some.line), 'some held: the count is on the line');
  ok(/const sendableNow = inWindowNow\.filter\(\(r\) => likelihoodSendable\(myLikely\(r\), numberGreen\)\)/.test(fn) && fn.includes('heldHighRisk: heldBy.get(k) ?? 0'), 'the screen uses the same hold as the tick');
  ok(/\.select\(`id, phone, country, website, whatsapp_template, campaign_id, queued_at/.test(fn), 'the screen reads website + template (the hold and the audit test need them)');
}

console.log('1. an opener never waits for an audit');
{
  ok(fn.includes('if (isInitialOpener(c.whatsapp_template as string | null) || !templateNeedsAudit(vars)) { lead = c; break; }'), 'tick: an opener is chosen whatever its audit state');
  ok(/const ids = mineNow\.filter\(\(l\) => !isInitialOpener\(l\.whatsapp_template\) && templateNeedsAudit\(/.test(fn), 'screen: only a lead whose template needs an audit counts as waiting for one');
}

console.log('4. the default opener');
{
  ok(defaultQueueOpener([null]) === 'initial_contact_short', 'no campaign: the short opener');
  ok(defaultQueueOpener([{ report_style: 'findable', default_template: 'initial_contact' }]) === 'initial_contact_short', 'Findable campaign stamped initial_contact by the old launch: the short opener');
  ok(defaultQueueOpener([{ report_style: 'findable', default_template: 'initial_opener_v2' }]) === 'initial_opener_v2', 'a campaign that chose another opener keeps it');
  ok(defaultQueueOpener([{ report_style: null, default_template: 'competitor_hook' }]) === 'initial_contact_short', 'a non-opener on the campaign is not an opener choice');
  ok(defaultQueueOpener([{ report_style: 'findable', default_template: 'initial_opener_v2' }, null]) === 'initial_contact_short', 'mixed campaigns: the short opener');
  ok(defaultQueueOpener([{ report_style: 'leadfinderos', default_template: null }]) === '', 'LeadFinderOS-style campaign: nothing pre-picked');
  ok(queueOpenerToSend('initial_contact_short', true) === 'initial_contact_short' && queueOpenerToSend('initial_contact_short', false) === 'initial_contact', 'sent as short while GREEN, as the original otherwise');
  const mig = read('supabase/migrations/20261124140000_campaign_launch_short_opener.sql');
  ok(/v_template := case when v_chosen in \('initial_opener_v2', 'initial_contact_short'\) then v_chosen else 'initial_contact_short' end;/.test(mig), 'campaign_launch: the same rule');
  ok(/coalesce\(v_style, 'findable'\) <> 'leadfinderos'/.test(mig) && /not in \('initial_contact', 'initial_opener_v2'\)/.test(mig), 'campaign_launch: LeadFinderOS-style unchanged');
  ok(/defaultQueueOpener\(/.test(read('src/components/OutreachTable.tsx')) && /defaultQueueOpener\(\[row\]\)/.test(read('src/components/WhatsAppLeadControls.tsx')), 'bulk queue dialog + a rep\'s lead picker use it');
}

console.log('kept exactly as they were');
{
  ok(fn.includes('queuePauseVerdict('), 'the self-pause is still asked (queuePauseRules.ts since 2026-11-26)');
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
