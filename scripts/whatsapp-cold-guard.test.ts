/* THE COLD WHATSAPP GUARD (2026-11-02, docs/whatsapp-safety-guard.md; src/lib/whatsappColdGuard.ts). Every door a cold send can leave by
   asks one rule: each country's own cap, one gap, the cool-down, the probe, the tripwire. Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import {
  COOLDOWN_HOURS, DEFAULT_UK_COLD_CAP, PROBE_SIZE, UK_PROBE_REST_HOURS, coldAllowanceLeft, coldCapsTotal, coldGapMs, coldLimitsWords, coldMarketOfPhone, coldVerdict, countryColdCap, inCooldown, isCountedColdSend,
  probeStart, probeVerdict, teamColdCount, type ColdFacts, type ColdSendRow,
} from '../src/lib/whatsappColdGuard.ts';
import { countrySettingsFrom } from '../src/lib/outreachMarkets.ts';
import { healthVerdict, numberLimited, tierDropped, tripwireReason } from '../src/lib/whatsappNumberHealth.ts';
import { coldOpenerFor } from '../src/lib/openerVariant.ts';
import { drainTick, type DrainDeps, type DueRow } from '../supabase/functions/_shared/inbox-scheduled-drain.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (!c) { f++; console.log('  FAIL ' + m); } else console.log('  PASS ' + m); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// 12:00 London / 20:00 Malaysia, inside both windows.
const NOW = new Date('2026-11-03T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const row = (min: number, phone: string, status: string | null, o: Partial<ColdSendRow> = {}): ColdSendRow =>
  ({ created_at: ago(min), phone, template: 'initial_contact', user_id: null, delivery_status: status, ...o });
const settings = (my: Record<string, unknown> = {}) => countrySettingsFrom([
  { country: 'UK', whatsapp_on: true },
  { country: 'MY', whatsapp_on: true, whatsapp_daily_cap: 30, send_start_min: 420, send_end_min: 1230, timezone: 'Asia/Kuala_Lumpur', ...my },
] as never);
const facts = (sends: ColdSendRow[], o: Partial<ColdFacts> = {}): ColdFacts => ({ stopReason: null, settings: settings(), sends, ...o });
const MY = '60123456789'; const UK = '447700900123';
const delivered = (phone: string) => [row(300, phone, 'delivered'), row(298, phone, 'read'), row(296, phone, 'delivered')];

console.log('what is counted');
{
  ok(isCountedColdSend({ template: 'initial_contact', user_id: 'someone', delivery_status: 'sent', test_mode: false }), 'a person’s cold opener counts');
  ok(isCountedColdSend({ template: 'initial_contact', user_id: null, delivery_status: 'read', test_mode: false }), 'the queue’s cold opener counts');
  ok(!isCountedColdSend({ template: null, user_id: 'someone', delivery_status: 'read', test_mode: false }), 'an in-window reply (no template) is not counted');
  for (const t of ['audit_followup_call', 'findable_signup_link', 'findable_onboarding', 'welcome_pack_ready', 'payment_recieved']) {
    ok(!isCountedColdSend({ template: t, user_id: 'someone', delivery_status: 'read', test_mode: false }), `${t} is not counted (Quick Close, welcome pack, continuations)`);
  }
  ok(!isCountedColdSend({ template: 'initial_contact', user_id: null, delivery_status: 'sent', test_mode: true }), 'a test send is not counted');
  ok(!isCountedColdSend({ template: 'initial_contact', user_id: null, delivery_status: 'simulated', test_mode: false }), 'a simulated send is not counted');
  ok(isCountedColdSend({ template: 'contact_followup', user_id: null, delivery_status: 'sent', test_mode: false }), 'the queue’s own follow-up lane spends the allowance');
  ok(!isCountedColdSend({ template: 'contact_followup', user_id: 'someone', delivery_status: 'sent', test_mode: false }), 'a person’s follow-up button does not');
  ok(coldMarketOfPhone('+60123456789') === 'MY' && coldMarketOfPhone('447700900123') === 'UK' && coldMarketOfPhone('14155550100') === null, 'the market comes from the digits');
}

console.log('caps');
{
  ok(DEFAULT_UK_COLD_CAP === 150, 'the UK default is 150');
  ok(countryColdCap('UK', { country: 'UK' } as never) === 150, 'the UK with no stored cap is the default, never unlimited');
  ok(countryColdCap('UK', { country: 'UK', whatsapp_daily_cap: 200 } as never) === 200 && countryColdCap('UK', { country: 'UK', whatsapp_daily_cap: 0 } as never) === 0, 'the admin sets the UK cap; 0 is a real setting');
  ok(countryColdCap('MY', { country: 'MY' } as never) === 30, 'abroad with no stored cap is about 30, never unlimited');
  const my30 = Array.from({ length: 30 }, (_, i) => row(200 - i, MY, 'delivered'));
  const v = coldVerdict('MY', facts(my30), NOW);
  ok(!v.go && v.code === 'country_cap', 'Malaysia at 30 is held');
  const ukAfterMy = coldVerdict('UK', facts(my30), NOW);
  ok(ukAfterMy.go && ukAfterMy.used === 0 && ukAfterMy.cap === 150, '…and the UK still sends, its count and cap untouched by Malaysia');
  const manual = Array.from({ length: 30 }, (_, i) => row(200 - i, MY, 'delivered', { user_id: 'stephan' }));
  const vm = coldVerdict('MY', facts(manual), NOW);
  ok(!vm.go && vm.code === 'country_cap', 'a person’s sends count against the country cap too (they used to skip it)');
  const uk149 = Array.from({ length: 149 }, (_, i) => row(200 - i, UK, 'delivered'));
  const below = coldVerdict('UK', facts(uk149), NOW);
  ok(below.go && below.used === 149, 'the UK at 149 of 150 still sends');
  const uk150 = [...uk149, row(40, UK, 'delivered')];
  const atCap = coldVerdict('UK', facts(uk150), NOW);
  ok(!atCap.go && atCap.code === 'country_cap' && atCap.used === 150 && atCap.cap === 150, 'the UK at 150 is held by its own cap');
  const myAfterUk = coldVerdict('MY', facts(uk150), NOW);
  ok(myAfterUk.go && myAfterUk.used === 0 && myAfterUk.cap === 30, '…and Malaysia still sends: the UK using its cap takes nothing from Malaysia');
  const sgOwn = coldVerdict('SG', facts(uk150, { settings: settings({}) }), NOW);
  ok(sgOwn.used === 0, 'another country has its own count');
  ok(teamColdCount(facts(uk150).sends, NOW) === 150, 'the display count is the London day');
  ok(teamColdCount([row(60 * 24, UK, 'delivered')], NOW) === 0, 'yesterday is not counted');
  ok(coldAllowanceLeft([{ used: 10, cap: 150 }, { used: 40, cap: 30 }, undefined]) === 140, 'what is left: over a cap counts as 0, an unread country adds nothing');
  ok(coldLimitsWords({ UK: { on: true, used: 0, cap: 150 }, MY: { on: true, used: 0, cap: 30 }, SG: { on: false, used: 0, cap: 150 } }) === 'UK 0 of 150 today, Malaysia 0 of 30 today', 'the Limits line: each country that is on, its own count');
  ok(coldLimitsWords(null) === '' && coldLimitsWords({}) === '', 'nothing read says nothing, never a made-up count');
  ok(coldCapsTotal({ UK: { on: true, used: 0, cap: 150 }, MY: { on: true, used: 5, cap: 30 }, AU: { on: false, used: 0, cap: 150 } }) === 180, 'caps add up for the tier warning, countries that are off left out');
}

console.log('a rating changes no cap');
{
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  const g = read('supabase/functions/_shared/cold-whatsapp-gate.ts');
  for (const rating of ['GREEN', 'YELLOW', 'RED', 'UNKNOWN']) {
    const v = healthVerdict({ meta_quality_rating: rating, meta_health_ok_at: NOW.toISOString() }, NOW) as unknown as Record<string, unknown>;
    ok(!('halveCap' in v) && !('blockCapRise' in v), rating + ': the verdict has nothing that could change a cap');
  }
  ok(!/healthLimitedCap|capRiseRefused|halveCap|blockCapRise/.test(q + g), 'nothing on the sending path reads a rating to set a cap');
  ok(!/healthVerdict/.test(g), 'the cold gate does not read the rating at all');
  ok(!/teamCap|team_cap|daily_cap/.test(g), 'the cold gate has no team cap');
  ok(!/\bdaily_cap\b/.test(q.slice(q.indexOf('Deno.serve'))), 'the queue handler no longer reads or writes the old team cap');
}

console.log('the probe');
{
  ok(probeVerdict([], NOW).state === 'probing', 'nothing sent yet: probing');
  ok(probeVerdict([row(5, MY, 'delivered'), row(4, MY, 'sent')], NOW).state === 'probing', 'two sent: still probing');
  ok(probeVerdict([row(5, MY, 'sent'), row(4, MY, 'sent'), row(3, MY, 'sent')], NOW).state === 'waiting', 'three sent, no reports: waits');
  ok(probeVerdict([row(5, MY, 'delivered'), row(4, MY, 'read'), row(3, MY, 'sent')], NOW).state === 'passed', 'two delivered: the normal cap');
  ok(probeVerdict([row(5, MY, 'failed'), row(4, MY, 'failed')], NOW).state === 'failed', 'two failed: over');
  ok(probeVerdict([row(5, MY, 'failed'), row(4, MY, 'failed', { leadNoWhatsApp: true }), row(3, MY, 'no_whatsapp')], NOW).state === 'probing', 'numbers not on WhatsApp say nothing about us');
  ok(probeVerdict([row(5, MY, 'failed'), row(4, MY, 'failed', { leadUnsettled: true })], NOW).state === 'probing', 'a failure the webhook has not settled is not counted yet');
  ok(probeVerdict([row(5, MY, 'failed', { error_code: 131026 }), row(4, MY, 'failed', { error_code: 131026 })], NOW).state === 'probing', 'Meta 131026 is left out');
  ok(probeVerdict([row(90, MY, 'sent'), row(89, MY, 'sent'), row(88, MY, 'sent')], NOW).state === 'failed', 'nothing delivered after the wait is never a pass');
  ok(probeVerdict([row(90, MY, 'delivered'), row(89, MY, 'sent'), row(88, MY, 'sent')], NOW).state === 'passed', 'one delivered and no second failure carries on after the wait (a phone can be off for days)');
  ok(PROBE_SIZE === 3, 'the probe is 3');
  const w = coldVerdict('MY', facts([row(5, MY, 'sent'), row(4, MY, 'sent'), row(3, MY, 'sent')]), NOW);
  ok(!w.go && w.code === 'probe_wait' && !!w.retryAt, 'the rest wait for the reports');
  const pf = coldVerdict('MY', facts([row(5, MY, 'failed'), row(4, MY, 'failed')]), NOW);
  ok(!pf.go && pf.code === 'probe_failed' && pf.retryAt?.getTime() === NOW.getTime() + COOLDOWN_HOURS * 3_600_000, 'a failed probe abroad rests 24 hours');
  const pu = coldVerdict('UK', facts([row(5, UK, 'failed'), row(4, UK, 'failed')]), NOW);
  ok(!pu.go && pu.code === 'probe_failed' && pu.retryAt?.getTime() === NOW.getTime() + UK_PROBE_REST_HOURS * 3_600_000, 'a failed probe in the UK rests an hour');
  ok(coldVerdict('MY', facts(delivered(MY)), new Date(NOW.getTime())).go, 'a delivered probe opens the normal cap');
  const yesterday = [row(60 * 20, MY, 'failed'), row(60 * 20 - 1, MY, 'failed')];
  ok(coldVerdict('MY', facts(yesterday), NOW).go, 'yesterday’s failures are not today’s probe: a new window is a new probe');
}

console.log('the cool-down');
{
  const until = new Date(NOW.getTime() + 3_600_000).toISOString();
  const s = settings({ whatsapp_cooldown_until: until, whatsapp_cooldown_reason: '5 of its last 10 sends failed.' });
  const v = coldVerdict('MY', facts([], { settings: s }), NOW);
  ok(!v.go && v.code === 'cooldown' && v.retryAt?.toISOString() === until, 'a resting country is held until the rest ends');
  ok(!v.go && /5 of its last 10/.test(v.reason), '…with the stored reason');
  ok(coldVerdict('UK', facts([], { settings: s }), NOW).go, '…and the UK is not touched by it');
  ok(s.MY.whatsapp_on === true, 'a cool-down does not touch the switch');
  const ended = new Date(NOW.getTime() - 30 * 60_000).toISOString();
  const after = settings({ whatsapp_cooldown_until: ended });
  ok(!inCooldown(after.MY as never, NOW), 'it ends by itself');
  ok(probeStart('MY', after, NOW).toISOString() === ended, 'the probe starts when it ended');
  const old = [row(60, MY, 'failed'), row(59, MY, 'failed'), row(58, MY, 'failed')];
  ok(coldVerdict('MY', facts(old, { settings: after }), NOW).go, 'the failures that started it do not end the new probe');
  const on = settings({ whatsapp_on_since: ago(60) });
  ok(coldVerdict('MY', facts([row(120, MY, 'failed'), row(119, MY, 'failed'), row(118, MY, 'failed')], { settings: on }), NOW).go,
    'switching a country on starts a new probe: failures from before it say nothing (2 Nov: it rested Malaysia on deploy)');
  const afterOn = coldVerdict('MY', facts([row(30, MY, 'failed'), row(29, MY, 'failed')], { settings: on }), NOW);
  ok(!afterOn.go && afterOn.code === 'probe_failed', '…and failures after it still count');
  const three = [row(20, MY, 'sent'), row(19, MY, 'sent'), row(18, MY, 'sent')];
  const held = coldVerdict('MY', facts(three, { settings: after }), NOW);
  ok(!held.go && held.code === 'probe_wait', 'restart: 3 sends, then the reports decide');
}

console.log('the tripwire');
{
  ok(tierDropped('TIER_2K', 'TIER_1K') && tierDropped('TIER_UNLIMITED', 'TIER_100K') && !tierDropped('TIER_1K', 'TIER_2K') && !tierDropped('TIER_2K', 'TIER_2K'), 'a drop is a drop, a rise is not');
  ok(!tierDropped(null, 'TIER_1K') && !tierDropped('TIER_2K', null) && !tierDropped('TIER_2K', 'WORD'), 'an absent or unknown tier is never a drop');
  ok(numberLimited('FLAGGED', null) && numberLimited('restricted', null) && numberLimited('CONNECTED', 'BLOCKED'), 'flagged, restricted or blocked is a limit');
  ok(!numberLimited('CONNECTED', 'AVAILABLE') && !numberLimited(null, null) && !numberLimited('CONNECTED', 'LIMITED'), 'connected or absent is not');
  ok(!!tripwireReason({ prevTier: 'TIER_2K', tier: 'TIER_1K' }), 'a tier drop trips it');
  ok(!!tripwireReason({ prevStatus: 'CONNECTED', status: 'FLAGGED' }), 'becoming flagged trips it');
  ok(!tripwireReason({ prevStatus: 'FLAGGED', status: 'FLAGGED' }), 'staying flagged does not trip it again: a person’s clear is not fought');
  ok(!tripwireReason({ prevTier: 'TIER_2K', tier: 'TIER_2K', prevStatus: 'CONNECTED', status: 'CONNECTED' }), 'RED is not an input at all, and nothing changed');
  const v = coldVerdict('UK', facts([], { stopReason: 'Meta lowered the tier.' }), NOW);
  ok(!v.go && v.code === 'cold_stopped' && v.retryAt === null, 'a stop covers the UK, and only a person clears it');
  const m = coldVerdict('MY', facts([], { stopReason: 'Meta lowered the tier.' }), NOW);
  ok(!m.go && m.code === 'cold_stopped', '…and every other country');
  const red = healthVerdict({ meta_quality_rating: 'RED', meta_health_ok_at: NOW.toISOString() }, NOW);
  ok(!/paused|halved/.test(red.limitText ?? '') && /warning/.test(red.limitText ?? ''), 'RED warns and does not stop');
}

console.log('the opener');
{
  ok(coldOpenerFor('initial_contact_short') === 'initial_contact', 'the short opener goes as the original');
  ok(coldOpenerFor('initial_contact') === 'initial_contact' && coldOpenerFor('audit_followup_call') === 'audit_followup_call', 'nothing else is changed');
  ok(read('supabase/functions/process-whatsapp-queue/index.ts').includes('let templateName = coldOpenerFor(requestedTemplate)'), 'the queue asks it');
  ok(/coldOpenerFor\(body\.template_name\)/.test(read('supabase/functions/send-whatsapp-message/index.ts')), 'the manual sender asks it');
}

console.log('the gap');
{
  ok(coldGapMs(0) === 60_000 && coldGapMs(1) === 120_000, '1 to 2 minutes');
  const g = read('supabase/functions/_shared/cold-whatsapp-gate.ts');
  ok(/\.or\(`cold_gap_until\.is\.null,cold_gap_until\.lte\.\$\{nowIso\}`\)/.test(g), 'the slot is one conditional write');
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/if \(sendLive && !qaDrill && !\(await claimColdSlot\(service\)\)\)/.test(q), 'the queue takes the slot right before a live send');
  const s = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/isColdOutreachTemplate\(usedTemplate\) && qa\.kind === "live"/.test(s) && /await claimColdSlot\(service\)/.test(s), 'a person’s live cold send takes the same slot');
  ok(/!sched && !dryRun && usedTemplate && messageType === "template"/.test(s), 'free text, dry runs and the drain’s own row do not ask here');
}

console.log('the burst of 2 Nov: messages queued overnight, due together');
await (async () => {
  const row5 = (i: number, template = 'initial_contact'): DueRow => ({
    id: 'r' + i, user_id: 'u', lead_id: 'l' + i, phone: '6012345678' + i, channel: 'whatsapp', kind: 'template', template_name: template,
    send_at: '2026-11-03T04:00:00Z', created_at: '2026-11-02T14:00:00Z', checked_at: '2026-11-02T14:00:00Z',
  });
  const run = async (rows: DueRow[], coldTurn?: DrainDeps['coldTurn']) => {
    const sent: string[] = []; const moved: string[] = [];
    let slots = 1;
    const deps: DrainDeps = {
      now: () => new Date('2026-11-03T04:00:30Z'), replyHours: null,
      countrySettings: settings(),
      closeStuckSending: async () => 0, dueRows: async () => rows,
      suppression: async () => 'none', lead: async () => ({ is_archived: false, status: 'queued' }),
      newestInbound: async () => ({ any: null, whatsapp: null }), earlierPending: async () => false,
      reschedule: async (id) => { moved.push(id); }, hold: async () => undefined, cancel: async () => undefined,
      ...(coldTurn === undefined ? {} : { coldTurn: coldTurn ?? (async () => (slots-- > 0 ? { go: true as const } : { go: false as const, retryAtIso: '2026-11-03T04:02:00Z' })) }),
      claim: async () => true, send: async (r) => { sent.push(r.id); return { ok: true, messageId: 'm' }; },
      finish: async () => undefined, sleep: async () => undefined,
    };
    await drainTick(deps);
    return { sent, moved };
  };
  const five = [row5(1), row5(2), row5(3), row5(4), row5(5)];
  // null = the slot fake above.
  const a = await run(five, null as never);
  ok(a.sent.length === 1 && a.moved.length === 4, 'five cold rows due at once: ONE goes, four move to the next slot');
  const b = await run(five);
  ok(b.sent.length === 0 && b.moved.length === 5, 'no guard wired: none goes (a cold send never passes unasked)');
  const c = await run([row5(1, 'audit_followup_call'), row5(2, 'audit_followup_call')]);
  ok(c.sent.length === 2, 'a continuation is not held by the guard');
})();

console.log('the SQL');
{
  const m = read('supabase/migrations/20261201090000_whatsapp_safety_guard.sql');
  const fn = m.slice(m.indexOf('function public.country_whatsapp_auto_pause'), m.indexOf('function public.set_outreach_country'));
  ok(/perform public\.country_whatsapp_start_cooldown\(_market, v_reason, 24\)/.test(fn), 'the pattern starts a 24-hour cool-down');
  ok(!/whatsapp_on = false/.test(fn), '…and no longer switches the country off');
  ok(/greatest\(coalesce\(s\.whatsapp_on_since, s\.updated_at\), s\.whatsapp_cooldown_until\)/.test(fn), 'it counts only since the last cool-down ended');
  ok(/v_failed >= v_min_fails and v_failed \* 100 >= v_pct \* v_total/.test(fn), 'the pattern itself is unchanged');
  ok(/revoke execute on function public\.country_whatsapp_start_cooldown[^;]+from public, anon, authenticated/.test(m), 'a browser cannot start one');
  ok(/whatsapp_cooldown_clear/.test(m) && /'cooldown_cleared', 'person', auth\.uid\(\)/.test(m), 'the manual override is recorded with who');
  ok(/trg_country_switch_logged/.test(m) && /'person', v_who, 'WhatsApp'/.test(m) && /v_who is null then return new/.test(m), 'a person’s on/off is logged, a system write is not logged as a person');
  ok(!/update public\.outreach_country_settings\s+set whatsapp_on/.test(m), 'nothing in this migration changes a switch (Singapore stays as it is)');
}

console.log('the caps migration');
{
  const cm = read('supabase/migrations/20261202090000_uk_cap_separate_from_malaysia.sql');
  const body = cm.replace(/--.*$/gm, '');
  ok(/set whatsapp_daily_cap = 150[^;]*where country = 'UK'/.test(body), 'it sets the UK cap');
  ok((body.match(/update public.outreach_country_settings/g) ?? []).length === 1 && !/'MY'|'SG'|'AU'|whatsapp_ons*=/.test(body), 'it touches no other country and no switch');
  ok(/whatsapp_daily_cap is null/.test(body), 'it never overwrites a cap an admin has set');
  ok(/'cap_changed', 'person', v_who/.test(body), 'the change is on the pause log, under a person');
  ok(!/(drop table|delete from|truncate)/i.test(body), 'nothing destructive');
}

console.log('the held webhook');
{
  const swm = read('docs/whatsapp-safety-guard.md');
  ok(/whatsapp-status/.test(swm) && /codes/i.test(swm), 'the record says what the missing Meta codes block');
}

if (f) { console.log(`${f} FAILED`); process.exit(1); }
console.log('whatsapp-cold-guard: all passed');
