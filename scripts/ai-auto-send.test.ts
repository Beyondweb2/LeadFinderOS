/* AI SENDS ITS OWN REPLY — LEVEL 2 (2026-10-21, Paul). The rule (src/lib/aiAutoSend.ts), the drain's handling of an automatic
   row (supabase/functions/_shared/inbox-scheduled-drain.ts, with fakes), and the wiring read as source.
   ⛔ THE HARD GATE (§2): with EVERY reply type switched on and every other condition favourable, no stop / angry / complaint /
   not-interested / client / price / guarantee / proof thread ever auto-sends — driven through the real pickMove and
   aiReplyDecision, so a change to either that opened one of these doors fails here. Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import {
  AUTO_SEND_CHOICES, NEVER_AUTO_KEYS, AUTO_SEND_MIN_DELAY_MS, AUTO_SEND_MAX_DELAY_MS, PERSON_ACTIVE_MS, AUTO_SEND_DEFAULT_DAILY_CAP,
  autoSendable, autoSendVerdict, autoSendDelayMs, autoSendAt, autoSendKey, cleanAutoSendKeys, cleanDailyCap, draftFactsFromPlan,
  draftFactsFromRow, theirMessagesSinceUs, threadHardReason, type AutoSendFacts,
} from '../src/lib/aiAutoSend.ts';
import { pickMove, type MoveEvidence, type MoveThreadMsg, type MoveInput } from '../src/lib/replyMove.ts';
import { aiReplyDecision, autoSendWaiting } from '../src/lib/aiReplyDraft.ts';
import { PLAYBOOK, NEEDS_YOU_INTENTS } from '../src/lib/replyPlaybook.ts';
import { summariseAutoSent } from '../src/lib/draftOutcomes.ts';
import { drainTick, type DrainDeps, type DueRow } from '../supabase/functions/_shared/inbox-scheduled-drain.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const UK = '447700900123';
const NOW = Date.parse('2026-10-22T10:00:00Z');
const ev: MoveEvidence = {
  businessName: 'ZZ Fixture Plumbing 90', trade: 'plumbers', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 6 },
  competitors: ['Rival A Plumbing', 'Rival B Plumbing'], hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true,
  site: { state: 'issues', issues: ['Some pages have no main heading'] },
};
const opener: MoveThreadMsg = { from: 'us', text: '[initial_contact]', templateName: 'initial_contact' };
const them = (text: string): MoveThreadMsg => ({ from: 'them', text });
const us = (text: string): MoveThreadMsg => ({ from: 'us', text, templateName: null });
const ALL_ON = AUTO_SEND_CHOICES.map((c) => c.key);
const PROSPECT = { amount_paid: null, status: 'replied', is_archived: false };

/** The whole chain the worker runs, with everything favourable except what the thread / lead says. */
function verdictFor(thread: MoveThreadMsg[], o: Partial<AutoSendFacts> & { lead?: AutoSendFacts['lead'] } = {}) {
  const input: MoveInput = { thread, suppressed: false, aiSentSinceWin: 0, evidence: ev, nowMs: NOW };
  const plan = pickMove(input);
  const lead = o.lead === undefined ? PROSPECT : o.lead;
  const decision = aiReplyDecision({ inboundAt: new Date(NOW - 60_000).toISOString(), lead, hadOutreach: true, plan, nowMs: NOW });
  const latest = [...thread].reverse().find((m) => m.from === 'them')?.text ?? '';
  const facts: AutoSendFacts = {
    masterOn: true, intentsOn: ALL_ON, dailyCap: 30, usedToday: 0, theirMessages: theirMessagesSinceUs(thread),
    draft: draftFactsFromPlan(plan, { kind: decision.kind === 'draft' ? 'draft' : decision.kind, text: plan.fixedText ?? 'A clean draft.', problems: [], usedFallback: false, evidenceComplete: true }),
    latestInbound: latest, threadHard: threadHardReason(input), digits: UK, lead, suppressed: false, personActiveAt: null, senderIsAdmin: true, nowMs: NOW,
    ...o,
  };
  return { plan, decision, verdict: autoSendVerdict(facts), facts };
}

/* ── 1. what may ever be switched on ── */
console.log('1. the choices');
{
  ok(AUTO_SEND_CHOICES.length > 0 && AUTO_SEND_CHOICES.every((c) => autoSendable(c.key)), 'every listed choice passes autoSendable');
  ok(AUTO_SEND_CHOICES.some((c) => c.key === 'first_reply_pitch'), '"first reply pitch" is a choice (Paul switches it on himself)');
  const risky = AUTO_SEND_CHOICES.filter((c) => { const e = (PLAYBOOK as Record<string, { factual?: boolean; allowPrice?: boolean; confidence?: boolean; timingOk?: boolean; linkOk?: boolean }>)[c.key]; return e && (e.factual || e.allowPrice || e.confidence || e.timingOk || e.linkOk); });
  ok(risky.length === 0, `no choice carries a price / guarantee / fact / timing promise / link line (${risky.map((r) => r.key).join(', ') || 'none'})`);
  ok(AUTO_SEND_CHOICES.every((c) => !NEVER_AUTO_KEYS.has(c.key) && !(NEEDS_YOU_INTENTS as readonly string[]).includes(c.key)), 'no choice is a never-type or a Needs you intent');
  for (const k of ['how_much', 'catch', 'definitely', 'too_expensive', 'pay_on_results', 'examples', 'proof_request', 'voice_yes', 'call_now', 'stop', 'auto_reply', 'is_bot']) {
    ok(!autoSendable(k), `"${k}" can never be sent automatically`);
  }
  ok(JSON.stringify(cleanAutoSendKeys(['how_much', 'first_reply_pitch', 'nonsense', 'first_reply_pitch', 7])) === '["first_reply_pitch"]', 'unknown / price keys are dropped, duplicates removed');
  ok(cleanDailyCap(30) === 30 && cleanDailyCap('0') === 0 && cleanDailyCap(-1) === null && cleanDailyCap(201) === null && cleanDailyCap(2.5) === null, 'the daily cap is a whole number 0–200');
  ok(AUTO_SEND_DEFAULT_DAILY_CAP === 30, 'the default daily cap is 30');
}

/* ── 2. THE HARD GATE ── */
console.log('2. the hard gate: these threads never auto-send, even with every switch on');
{
  const cases: Array<[string, MoveThreadMsg[], Partial<AutoSendFacts> & { lead?: AutoSendFacts['lead'] }]> = [
    ['stop', [opener, them('Stop messaging me')], {}],
    ['unsubscribe', [opener, them('Please remove my number')], {}],
    ['angry', [opener, them('F off you scammer')], {}],
    ['complaint', [opener, them('This is harassment, I am reporting you')], {}],
    ['not interested', [opener, them('No thanks, not interested')], {}],
    ['price', [opener, them('Yes it is'), us('I asked AI ...'), them('How much does it cost?')], {}],
    ['price (£)', [opener, them('Yes it is'), us('I asked AI ...'), them('Is it £99?')], {}],
    ['guarantee', [opener, them('Yes it is'), us('I asked AI ...'), them('Is there a guarantee?')], {}],
    ['pay on results', [opener, them('Yes it is'), us('I asked AI ...'), them('I only pay after results')], {}],
    ['proof', [opener, them('Yes it is'), us('I asked AI ...'), them('Can you show me examples of your work?')], {}],
    ['a stop earlier in the thread', [opener, them('Stop messaging me'), us('Sorry, will do.'), them('Yes ok')], {}],
    ['angry earlier in the thread', [opener, them('F off'), us('Sorry.'), them('Yes it is')], {}],
    ['client (paid)', [opener, them('Yes it is')], { lead: { amount_paid: 99, status: 'paid', is_archived: false } }],
    ['client (status)', [opener, them('Yes it is')], { lead: { amount_paid: null, status: 'in_delivery', is_archived: false } }],
    ['client (refunded)', [opener, them('Yes it is')], { lead: { amount_paid: null, status: 'refunded', is_archived: false } }],
    ['suppressed number', [opener, them('Yes it is')], { suppressed: true }],
  ];
  for (const [name, thread, o] of cases) {
    const r = verdictFor(thread, o);
    ok(r.verdict.send === false, `${name} → never auto-sent (${r.verdict.send ? 'SENT' : r.verdict.reason}; move ${r.plan.intent ?? r.plan.move})`);
  }
  /* Defence in depth: even a draft of an allowed type is refused when their words or the thread say so. */
  const clean = verdictFor([opener, them('Yes it is')]).facts;
  for (const words of ['How much is it?', 'what does it cost', 'Is there a money back guarantee', 'Can you prove it?', 'Show me some reviews', 'I only pay after results']) {
    const v = autoSendVerdict({ ...clean, latestInbound: words });
    ok(!v.send && v.reason === 'price_or_proof', `"${words}" → price_or_proof, whatever the type`);
  }
  for (const [name, thread] of [['stop', [opener, them('Stop messaging me'), us('Sorry.'), them('Yes it is')]], ['angry', [opener, them('F off'), us('Sorry.'), them('Yes it is')]],
    ['complaint', [opener, them('This is harassment, I am reporting you'), us('Sorry.'), them('Yes it is')]], ['no', [opener, them('No thanks, not interested'), us('ok'), them('Yes it is')]]] as Array<[string, MoveThreadMsg[]]>) {
    const hard = threadHardReason({ thread, suppressed: false, aiSentSinceWin: 0, evidence: ev, nowMs: NOW });
    ok(hard !== null && autoSendVerdict({ ...clean, threadHard: hard }).send === false, `a ${name} anywhere in the thread marks the whole conversation (${hard})`);
  }
  /* The gate means something only if the favourable case does send. */
  const yes = verdictFor([opener, them('Yes it is')]);
  ok(yes.verdict.send === true && autoSendKey(yes.plan) === 'first_reply_pitch', `control: "Yes it is" with first reply pitch on → sends (${yes.verdict.send ? 'send' : yes.verdict.reason})`);
}

/* ── 3. each other refusal on its own ── */
console.log('3. every other condition');
{
  const base = [opener, them('Yes it is')];
  const r = (o: Partial<AutoSendFacts>) => verdictFor(base, o).verdict;
  const reason = (o: Partial<AutoSendFacts>) => { const v = r(o); return v.send ? 'send' : v.reason; };
  ok(reason({ masterOn: false }) === 'master_off', 'master switch off → no');
  ok(reason({ intentsOn: [] }) === 'intent_off', 'nothing switched on (the shipped state) → no');
  ok(reason({ intentsOn: ['pitch_next'] }) === 'intent_off', 'another type on, not this one → no');
  const d = verdictFor(base).facts.draft;
  ok(reason({ draft: { ...d, problems: ['too long'] } }) === 'checker_warned', 'a checker warning → no');
  ok(reason({ draft: { ...d, usedFallback: true } }) === 'fallback', 'the rule-built fallback (model unavailable) → no');
  ok(reason({ draft: { ...d, label: 'Auto-reply' } }) === 'auto_reply_label', 'an Auto-reply labelled draft → no');
  ok(reason({ draft: { ...d, needsYou: true } }) === 'needs_you', 'Needs you → no');
  ok(reason({ draft: { ...d, kind: 'needs_you' } }) === 'not_a_draft', 'a Needs you row → no');
  ok(reason({ draft: { ...d, text: '  ' } }) === 'no_text', 'no text → no');
  ok(reason({ digits: '60123456789' }) === 'non_uk', 'a Malaysian mobile → no');
  ok(reason({ digits: '441214960000' }) === 'non_uk', 'a UK landline → no');
  ok(reason({ personActiveAt: NOW - 5 * 60_000 }) === 'person_active', 'someone typed 5 minutes ago → no');
  ok(reason({ personActiveAt: NOW - PERSON_ACTIVE_MS - 1000 }) === 'send', 'someone typed 10+ minutes ago → may send');
  ok(reason({ personActiveAt: 'garbage' }) === 'person_active', 'an unreadable activity time → no');
  ok(reason({ usedToday: 30 }) === 'daily_cap' && reason({ usedToday: 29 }) === 'send', 'the daily cap: 30 used → no, 29 → yes');
  ok(reason({ dailyCap: 0 }) === 'daily_cap', 'a cap of 0 stops all automatic sends');
  ok(reason({ senderIsAdmin: false }) === 'no_sender', 'no admin to send as → no');
  ok(reason({ lead: { amount_paid: null, status: 'replied', is_archived: true } }) !== 'send', 'an archived lead → no');
  ok(reason({ lead: null }) !== 'send', 'no lead → no');
  ok(autoSendVerdict({ ...verdictFor(base).facts, lead: { amount_paid: null, status: 'replied', is_archived: true } }).send === false, 'an archived lead → no, even on a clean draft');
  const twice = verdictFor([opener, them('Yes it is'), us('pitch')]);
  ok(twice.verdict.send === false, `never twice without a prospect message (${twice.verdict.send ? 'SENT' : twice.verdict.reason})`);
  const loop = (() => { const input: MoveInput = { thread: base, suppressed: false, aiSentSinceWin: 3, evidence: ev, nowMs: NOW }; const p = pickMove(input); return autoSendVerdict({ ...verdictFor(base).facts, draft: draftFactsFromPlan(p, { kind: 'draft', text: 'x', problems: [], usedFallback: false, evidenceComplete: true }) }); })();
  ok(loop.send === false, `three AI messages with no win → no (${loop.send ? 'SENT' : loop.reason})`);
}

/* ── 4. the stored row read at send time ── */
console.log('4. the draft read back at send time');
{
  const unsafe = draftFactsFromRow({ kind: 'draft', draft_text: 'hi', why: null });
  ok(unsafe.stop === true && unsafe.usedFallback === true && unsafe.problems.length > 0, 'a row with no "why" reads as stop + fallback + warned (never sends)');
  const good = draftFactsFromRow({ kind: 'draft', draft_text: 'hi', why: { move: 'first_reply_pitch', intent: null, stop: false, needsYou: null, label: 'Only confirmed', confidence: null, problems: [], usedFallback: false, noDraft: false } });
  ok(good.key === 'first_reply_pitch' && !good.stop && !good.needsYou && good.problems.length === 0 && !good.usedFallback, 'a clean stored draft reads back as clean');
  ok(autoSendWaiting({ status: 'pending', why: { autoSend: { send: true, at: '2026-10-22T10:05:00Z' } } as never }) === '2026-10-22T10:05:00Z', 'the panel shows when it will go');
  ok(autoSendWaiting({ status: 'pending', why: { autoSend: { send: true, at: 'x', stopped: 'ai_person_typing' } } as never }) === null, '…and nothing once it was stopped');
}

/* ── 5. timing ── */
console.log('5. the wait');
{
  ok(autoSendDelayMs(() => 0) === AUTO_SEND_MIN_DELAY_MS && autoSendDelayMs(() => 1) === AUTO_SEND_MAX_DELAY_MS, 'the wait is 3 to 8 minutes');
  ok(AUTO_SEND_MIN_DELAY_MS === 3 * 60_000 && AUTO_SEND_MAX_DELAY_MS === 8 * 60_000, '3 and 8 minutes exactly');
  const inb = NOW - 60_000;
  ok(autoSendAt({ nowMs: NOW, inboundAtMs: inb, windowOpenNow: true, nextOpenMs: 0, delayMs: 4 * 60_000 }) === NOW + 4 * 60_000, 'inside the hours: now + the wait');
  const open = NOW + 9 * 3_600_000;
  ok(autoSendAt({ nowMs: NOW, inboundAtMs: inb, windowOpenNow: false, nextOpenMs: open, delayMs: 5 * 60_000 }) === open + 5 * 60_000, 'outside the hours: the opening + the wait');
  ok(autoSendAt({ nowMs: NOW, inboundAtMs: inb, windowOpenNow: false, nextOpenMs: NOW + 23.9 * 3_600_000, delayMs: 3 * 60_000 }) === null, 'would land after WhatsApp\'s 24 hours: stays a draft');
}

/* ── 6. the drain with an automatic row ── */
console.log('6. the drain');
async function drain(rows: DueRow[], o: { inbound?: string; recheck?: DrainDeps['autoRecheck'] | 'absent' } = {}) {
  const log: string[] = [];
  const deps: DrainDeps = {
    now: () => new Date('2026-10-22T10:00:00Z'), replyHours: null, countrySettings: null,
    closeStuckSending: async () => 0, dueRows: async () => rows,
    suppression: async () => 'none', lead: async () => ({ is_archived: false, status: 'replied' }),
    newestInbound: async () => ({ any: o.inbound ?? '2026-10-22T09:50:00Z', whatsapp: o.inbound ?? '2026-10-22T09:50:00Z' }),
    earlierPending: async () => false,
    reschedule: async (id, iso) => { log.push(`reschedule ${id} ${iso}`); },
    hold: async (id, reason) => { log.push(`hold ${id} ${reason}`); },
    cancel: async (id, reason) => { log.push(`cancel ${id} ${reason}`); },
    claim: async (id) => { log.push(`claim ${id}`); return true; },
    send: async (r) => { log.push(`send ${r.id}`); return { ok: true, messageId: 'm' }; },
    finish: async (id) => { log.push(`finish ${id}`); },
    sleep: async () => undefined,
    ...(o.recheck === 'absent' ? {} : { autoRecheck: o.recheck ?? (async () => null) }),
  };
  await drainTick(deps);
  return log.join('|');
}
const r = (id: string, ai: boolean): DueRow => ({ id, user_id: 'book', lead_id: 'lead', phone: UK, channel: 'whatsapp', kind: 'text',
  send_at: '2026-10-22T09:58:00Z', created_at: '2026-10-22T09:55:00Z', checked_at: '2026-10-22T09:55:00Z', ai_draft_id: ai ? 'draft' : null });
{
  ok(await drain([r('a', true)]) === 'claim a|send a|finish a', 'an allowed automatic reply is claimed and sent like any queued reply');
  ok(await drain([r('a', true)], { recheck: async () => 'ai_person_active' }) === 'cancel a ai_person_active', 'a failed re-check drops it (never claimed, never sent)');
  ok(await drain([r('a', true)], { recheck: async () => { throw new Error('db'); } }) === 'cancel a ai_recheck_failed', 'a re-check that throws drops it');
  ok(await drain([r('a', true)], { recheck: 'absent' }) === 'cancel a ai_recheck_unavailable', 'no re-check wired → dropped');
  ok(await drain([r('a', true)], { inbound: '2026-10-22T09:57:00Z' }) === 'cancel a ai_replied_since', 'a newer message from them drops it (the draft waits for approval), never a hold');
  ok(await drain([r('p', false)], { inbound: '2026-10-22T09:57:00Z' }) === 'hold p replied_since', 'a person\'s queued reply is still held as before');
  ok(await drain([r('p', false)], { recheck: async () => 'ai_x' }) === 'claim p|send p|finish p', 'a person\'s row never runs the AI re-check');
}

/* ── 7. the wiring (source) ── */
console.log('7. the wiring');
{
  const MIG = read('supabase/migrations/20261116090000_ai_auto_send.sql');
  const FN = read('supabase/functions/ai-reply-drafts/index.ts');
  const DRAIN = read('supabase/functions/inbox-scheduled-send/index.ts');
  const INBOX = read('src/pages/Inbox.tsx');
  ok(/ai_auto_send_intents text\[\] not null default '\{\}'/.test(MIG), 'SHIPS OFF: no reply type is switched on by default');
  ok(/ai_auto_send_daily_cap integer not null default 30/.test(MIG), 'the daily cap defaults to 30');
  ok(/if new\.ai_handles_replies is not true then\s+update public\.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'ai_switched_off'/.test(MIG), 'master off cancels every automatic reply still waiting');
  ok(/cancel_reason = 'ai_type_off'/.test(MIG) && /after update of ai_handles_replies, ai_auto_send_intents on public\.whatsapp_outreach_state/.test(MIG), 'a type switched off cancels its waiting replies');
  ok(/'auto_sent'\)\)/.test(MIG) && /new\.status = 'sent' and new\.auto_sent_at is not null then[\s\S]{0,200}'auto_sent'/.test(MIG), 'every automatic send is logged as "auto_sent" in the outcome log');
  ok(/set sent_by_ai = true/.test(MIG) && /data-testid="sent-by-ai"/.test(INBOX), 'the thread labels it "Sent by AI"');
  ok(/s\.ai_draft_id is null/.test(MIG) && /r\.ai_draft_id is not null then return jsonb_build_object\('ok', false, 'error', 'not_editable'\)/.test(MIG), 'a person cannot edit an automatic row (approve / discard / type instead)');
  ok(/cancel_reason = 'ai_person_typing'/.test(MIG) && /inbox_mark_typing/.test(INBOX) && /onTyping=\{markTyping\}/.test(INBOX), 'typing in the reply box marks the conversation and stops a waiting automatic reply');
  ok(/const verdict = autoSendVerdict\(/.test(FN) && /if \(!verdict\.send\) \{ await record/.test(FN), 'the worker queues only on the verdict');
  ok(/if \(!st\.masterOn \|\| st\.intents\.length === 0\) return;/.test(FN), 'nothing switched on: the worker does nothing extra');
  ok(!/send-whatsapp-message|graph\.facebook|sendViaGraph/.test(FN.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'the worker still never calls a sender');
  ok(/stopAutoSend\(service, d\.auto_send_id, "ai_person_approved"\)/.test(FN) && /"ai_person_discarded"/.test(FN) && /"ai_person_regenerated"/.test(FN) && /"ai_person_drafted"/.test(FN), 'approve / discard / regenerate / draft reply stop a waiting automatic reply first');
  ok(/\.is\("auto_send_id", null\)/.test(FN), 'the tick never settles a draft whose automatic reply is waiting');
  ok(/async autoRecheck\(row\)/.test(DRAIN) && /autoSendVerdict\(\{/.test(DRAIN) && /answeredAfter\(/.test(DRAIN) && /"ai_text_changed"/.test(DRAIN), 'the drain re-checks with the same rule, plus answered / changed text');
  ok(/usedToday: counts\.sentToday/.test(DRAIN) && /usedToday: counts\.queuedToday/.test(FN), 'the cap counts queued at draft time and sent at send time');
}

/* ── 8. the readout fold ── */
console.log('8. the readout');
{
  const s = summariseAutoSent([{ intent: 'pitch_next', today: 1, in_period: 4, waiting: 0 }, { intent: 'first_reply_pitch', today: 3, in_period: 9, waiting: 2 }]);
  ok(s.today === 4 && s.inPeriod === 13 && s.waiting === 2 && s.intents[0].intent === 'first_reply_pitch', 'auto-sent today and per type, busiest first');
  ok(summariseAutoSent(null).today === 0, 'nothing recorded → 0');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
if (f) process.exit(1);
