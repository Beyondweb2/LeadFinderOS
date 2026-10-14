/* ═══════════════════════════════════════════════════════════
   QUEUE FOR TEXT — NEVER A BUSINESS ALREADY TRIED ON WHATSAPP; HONEST COUNTS; ONE LIMIT (2026-10-13, feat/sms-queue-rules).
   Pins: the server function's checks and their order (asserted on the migration text), the browser helper's honest count
   (driven against a fake server that answers like queue_sms_openers), the one per-press limit, the "No WhatsApp" / "No mobile"
   labels. Nothing is ever sent: there is no network here.
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { SMS_QUEUE_DAILY_CAP, SMS_QUEUE_MAX_PER_ACTION, SMS_QUEUE_CHECK_CHUNK, SMS_QUEUE_SKIP_WORDS } from '../src/lib/smsMessages.ts';
import { checkSmsQueue, runSmsQueue, planFromChecks, skipSummary, SMS_QUEUE_LIMIT_WORDS, type SmsQueueRpc } from '../src/lib/smsQueueBatch.ts';
import { OUTREACH_STATUS_OPTIONS } from '../src/types/outreach.ts';
import { WHATSAPP_CAPABILITY_LABEL } from '../src/lib/whatsAppCapability.ts';
import { COLD_NOT_ELIGIBLE_LABEL } from '../src/lib/coldWhatsAppEligibility.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

const MIG = 'supabase/migrations/20261023090000_sms_queue_whatsapp_rules.sql';
const m = code(read(MIG));
const fn = m.slice(m.indexOf('create or replace function public.queue_sms_openers'), m.indexOf('revoke all on function'));
const at = (needle: string) => fn.indexOf(needle);

console.log('1. the server skips anyone already tried on WhatsApp, and says which');
{
  ok(/v_lead\.status = 'queued'/.test(fn) && /contact_followup_queued_at is not null/.test(fn) && /hook_followup_queued_at is not null/.test(fn), 'in any WhatsApp queue lane (opener, no-reply follow-up, hook follow-up) → in_whatsapp_queue, sent or not');
  ok(/o\.id <> v_id and o\.status = 'queued'/.test(fn), '…or waiting in the WhatsApp queue on ANOTHER lead row with the same phone');
  ok(/v_lead\.whatsapp_sent_at is not null/.test(fn) && /w\.direction = 'outbound'/.test(fn) && /then v_reason := 'whatsapp_messaged'/.test(fn), 'a real WhatsApp send (stamp or outbound message on the phone) → whatsapp_messaged');
  ok(/'no_whatsapp', 'whatsapp_failed', 'no_whatsapp_needs_sms'\)\)/.test(fn), '…but a send stamp on a FAILED attempt (No WhatsApp / failed) is not a message');
  ok(/then v_reason := 'in_whatsapp_conversation'/.test(fn), 'any non-failed WhatsApp message on the phone (they wrote to us) → in_whatsapp_conversation');
  ok(/w\.status not in \('failed', 'failed_temporary', 'simulated'\)/.test(fn), 'a failed / simulated WhatsApp message is not a conversation');
  const order = ["'already_queued'", "'in_whatsapp_queue'", "'whatsapp_messaged'", "'in_whatsapp_conversation'", "'whatsapp_failed'", "'not_new'", "'no_phone'", "'not_a_uk_mobile'", "'opted_out'", "'already_texted'", 'opener_contact_block(v_id)'].map((k) => at(k.startsWith("'") ? `v_reason := ${k}` : k));
  ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'the WhatsApp reasons are checked BEFORE the generic "not new", so the popup names them');
  ok(/'not_contacted', 'no_whatsapp', 'no_whatsapp_needs_sms'\) then v_reason := 'not_new'/.test(fn), 'a mobile WhatsApp turned down as "not on WhatsApp" (no_whatsapp) may still be texted');
  ok(/v_lead\.status = 'whatsapp_failed' then v_reason := 'whatsapp_failed'/.test(fn), 'a WhatsApp send that failed for another reason counts as tried → skipped');
  ok(/v_pk ~ '\^7\[0-9\]\{9\}\$'/.test(fn) && /contact_suppressions/.test(fn) && /sms_messages m where m\.direction = 'outbound'/.test(fn) && /opener_contact_block\(v_id\)/.test(fn), 'the UK mobile, opt-out, already-texted and spoken-to checks are all kept');
  ok(/can_work_lead\(v_id\)/.test(fn) && /lead_is_client/.test(fn) && /is_archived is true/.test(fn), 'ownership, client and archived checks kept');
  ok(/v_template not in \('initial_contact', 'initial_opener_v2'\)/.test(fn), 'only the two approved openers');
  const reasons = [...fn.matchAll(/v_reason := '([a-z_]+)'/g)].map((x) => x[1]).concat(['contacted_by_phone', 'contacted_logged', 'over_cap']);
  for (const k of new Set(reasons)) ok(k in SMS_QUEUE_SKIP_WORDS, `reason ${k} has plain words`);
}

console.log('2. the check-only call writes nothing; the real call keeps one limit');
{
  ok(/_dry_run boolean default false/.test(fn), 'a _dry_run argument, off by default');
  const dryWrites = fn.split(/if v_dry then/).slice(1).map((b) => b.slice(0, b.indexOf('else')));
  ok(dryWrites.length >= 2 && dryWrites.every((b) => !/update |insert /i.test(b)), 'the dry-run branches never update or insert');
  ok(/if not v_dry and v_reason in \('no_phone', 'not_a_uk_mobile'\)/.test(fn), 'the No SMS mark is written only on a real press');
  ok(/if not v_dry then\s+v_g := public\.guard_action/.test(fn), 'the usage guard runs on the real press (a check costs nothing)');
  ok(/where id = v_id;\s+else\s+select[\s\S]*?for update;/.test(fn) || /from public\.outreach_leads where id = v_id for update;/.test(fn), 'the real press locks each row it changes');
  ok(new RegExp(`case when v_dry then 1000 else ${SMS_QUEUE_MAX_PER_ACTION} end`).test(fn), `a real press takes at most ${SMS_QUEUE_MAX_PER_ACTION} (= SMS_QUEUE_MAX_PER_ACTION); a check may look at up to 1000`);
  ok(SMS_QUEUE_MAX_PER_ACTION === SMS_QUEUE_DAILY_CAP, 'the per-press limit IS the daily sending cap — one number, the strictest');
  ok(SMS_QUEUE_CHECK_CHUNK <= 1000, 'the browser checks in chunks the server accepts');
  ok(/drop function if exists public\.queue_sms_openers\(uuid\[\], text\);/.test(m) && /grant execute on function public\.queue_sms_openers\(uuid\[\], text, boolean\) to authenticated/.test(m) && /revoke all on function public\.queue_sms_openers\(uuid\[\], text, boolean\) from public, anon/.test(m), 'the old two-argument function is replaced (no overload), signed-in callers only');
  ok(/'ids', v_ids/.test(fn) && /'would_queue', v_queued/.test(fn), 'the check answers with the ids that would be queued');
}

/* A fake queue_sms_openers: each lead has the reason the real function would give (or none). It honours _dry_run and the
   per-press limit exactly as the SQL does, and records what a real press queued. */
type Fake = { reasons: Record<string, string | null>; queued: string[]; calls: Array<{ n: number; dry: boolean }> };
function fakeServer(reasons: Record<string, string | null>): { rpc: SmsQueueRpc; s: Fake } {
  const s: Fake = { reasons, queued: [], calls: [] };
  const rpc: SmsQueueRpc = async ({ _lead_ids, _dry_run }) => {
    const dry = _dry_run === true;
    s.calls.push({ n: _lead_ids.length, dry });
    if (_lead_ids.length > (dry ? 1000 : SMS_QUEUE_MAX_PER_ACTION)) return { data: { ok: false, error: 'too_many' }, error: null };
    const skipped: Record<string, number> = {}; const ids: string[] = []; let queued = 0;
    for (const id of _lead_ids) {
      const r = id in s.reasons ? s.reasons[id] : 'not_found';
      if (r) { skipped[r] = (skipped[r] ?? 0) + 1; continue; }
      if (dry) ids.push(id); else { s.queued.push(id); s.reasons[id] = 'already_queued'; }
      queued++;
    }
    return { data: dry ? { ok: true, dry_run: true, would_queue: queued, ids, skipped } : { ok: true, queued, skipped }, error: null };
  };
  return { rpc, s };
}

console.log('3. the popup count is the server\'s answer, with every reason');
await (async () => {
  const leads: Record<string, string | null> = {
    wa_queued: 'in_whatsapp_queue', wa_messaged: 'whatsapp_messaged', wa_convo: 'in_whatsapp_conversation', wa_failed: 'whatsapp_failed',
    no_wa_mobile: null, landline: 'not_a_uk_mobile', no_number: 'no_phone', opted: 'opted_out', texted: 'already_texted', spoke: 'contacted_by_phone',
  };
  const { rpc, s } = fakeServer({ ...leads });
  const ids = Object.keys(leads);
  const plan = await checkSmsQueue(rpc, ids, 'initial_contact');
  ok(s.calls.every((c) => c.dry) && s.queued.length === 0, 'checking queues nothing');
  ok(plan.selected === 10 && plan.queueIds.length === 1 && plan.queueIds[0] === 'no_wa_mobile', 'queued on WhatsApp, messaged on WhatsApp, in a WhatsApp conversation: skipped; a mobile with no WhatsApp: will be queued');
  const by = Object.fromEntries(plan.skipped.map((l) => [l.key, l.n]));
  ok(by.in_whatsapp_queue === 1 && by.whatsapp_messaged === 1 && by.in_whatsapp_conversation === 1 && by.whatsapp_failed === 1, '…each WhatsApp reason counted (a failed WhatsApp send too)');
  ok(by.not_a_uk_mobile === 1 && by.no_phone === 1, 'a landline and a lead with no number are skipped as No mobile');
  ok(by.opted_out === 1 && by.already_texted === 1 && by.contacted_by_phone === 1, 'opted out, already texted, already spoken to: skipped');
  ok(plan.skippedTotal === 9 && plan.skippedTotal + plan.queueIds.length === plan.selected, 'queued + skipped = selected — nothing unaccounted for');
  ok(/no mobile/.test(SMS_QUEUE_SKIP_WORDS.no_phone) && /no mobile/.test(SMS_QUEUE_SKIP_WORDS.not_a_uk_mobile), 'the No mobile reasons say "no mobile"');
  ok(/WhatsApp queue/.test(SMS_QUEUE_SKIP_WORDS.in_whatsapp_queue) && /messaged on WhatsApp/.test(SMS_QUEUE_SKIP_WORDS.whatsapp_messaged), 'the WhatsApp reasons say so in plain words');
  ok(/1 already in the WhatsApp queue/.test(skipSummary(plan.skipped)), 'the summary line names the count and the reason');

  const r = await runSmsQueue(rpc, plan, 'initial_contact');
  ok(r.queued === 1 && s.queued.length === 1 && s.queued[0] === 'no_wa_mobile', 'the real press sends ONLY the ids the check passed');
  ok(r.skippedTotal === 9, 'the result still names the 9 skipped');
})();

console.log('4. over the limit: queue the allowed number, never "Nothing queued"');
await (async () => {
  const reasons: Record<string, string | null> = {};
  const ids: string[] = [];
  for (let i = 0; i < 288; i++) { const id = `L${String(i).padStart(3, '0')}`; ids.push(id); reasons[id] = i % 9 === 0 ? 'whatsapp_messaged' : null; }
  const passing = ids.filter((id) => reasons[id] === null).length; // 256
  const { rpc, s } = fakeServer(reasons);
  const plan = await checkSmsQueue(rpc, ids, 'initial_contact');
  ok(plan.queueIds.length === SMS_QUEUE_MAX_PER_ACTION, `288 selected → ${SMS_QUEUE_MAX_PER_ACTION} will be queued (not 288, not 0)`);
  ok(plan.queueIds.every((id, i) => i === 0 || id > plan.queueIds[i - 1]) && plan.queueIds[0] === 'L001', '…the FIRST ones that pass, in selection order');
  const over = plan.skipped.find((l) => l.key === 'over_cap')?.n;
  ok(over === passing - SMS_QUEUE_MAX_PER_ACTION, `the rest that passed are named "over the limit" (${over})`);
  ok(plan.skipped.find((l) => l.key === 'whatsapp_messaged')?.n === 32, '…and the WhatsApp ones are still named as WhatsApp');
  const r = await runSmsQueue(rpc, plan, 'initial_contact');
  ok(r.queued === SMS_QUEUE_MAX_PER_ACTION && s.calls.filter((c) => !c.dry).every((c) => c.n <= SMS_QUEUE_MAX_PER_ACTION), 'the real press is never above the limit, so the server never refuses it as too many');
  ok(new RegExp(String(SMS_QUEUE_MAX_PER_ACTION)).test(SMS_QUEUE_LIMIT_WORDS) && /a day/.test(SMS_QUEUE_LIMIT_WORDS), 'the limit is explained in plain words');

  // Select all on a big book: checked in chunks, still one honest answer.
  const big: Record<string, string | null> = {}; const bigIds: string[] = [];
  for (let i = 0; i < 1200; i++) { const id = `B${String(i).padStart(4, '0')}`; bigIds.push(id); big[id] = i < 1150 ? 'in_whatsapp_queue' : null; }
  const b = fakeServer(big);
  const bp = await checkSmsQueue(b.rpc, bigIds, 'initial_contact');
  ok(b.s.calls.length === Math.ceil(1200 / SMS_QUEUE_CHECK_CHUNK) && b.s.calls.every((c) => c.dry && c.n <= SMS_QUEUE_CHECK_CHUNK), 'a select-all of 1,200 is checked in chunks');
  ok(bp.queueIds.length === 50 && bp.skipped.find((l) => l.key === 'in_whatsapp_queue')?.n === 1150, '…and only the 50 not on WhatsApp will be queued');
})();

console.log('5. nothing passes, or the check fails: nothing is pressed');
await (async () => {
  const { rpc, s } = fakeServer({ a: 'whatsapp_messaged', b: 'in_whatsapp_queue' });
  const plan = await checkSmsQueue(rpc, ['a', 'b'], 'initial_contact');
  const r = await runSmsQueue(rpc, plan, 'initial_contact');
  ok(plan.queueIds.length === 0 && r.queued === 0 && s.calls.every((c) => c.dry), 'all on WhatsApp → 0 to queue, and no real call is made');
  const failing: SmsQueueRpc = async () => ({ data: null, error: { message: 'boom' } });
  let threw = false; try { await checkSmsQueue(failing, ['a'], 'initial_contact'); } catch { threw = true; }
  ok(threw, 'a failed check throws — the popup shows the error and the button stays off');
  const paused: SmsQueueRpc = async (a) => ({ data: a._dry_run ? { ok: true, ids: ['a'], skipped: {} } : { ok: false, error: 'usage_paused', detail: 'Usage temporarily paused - contact Paul' }, error: null });
  let msg = ''; try { await runSmsQueue(paused, planFromChecks(['a'], [{ ids: ['a'], skipped: {} }]), 'initial_contact'); } catch (e) { msg = (e as Error).message; }
  ok(/paused/.test(msg), 'a refusal on the real press is shown in its own words');
})();

console.log('6. every path that queues texts uses the one helper');
{
  const dlg = code(read('src/components/QueueSmsDialog.tsx'));
  ok(/checkSmsQueue\(rpc, leadIds, template\)/.test(dlg) && /runSmsQueue\(rpc, plan, template\)/.test(dlg), 'the Outreach popup checks first and queues the checked ids');
  ok(/Queue \{willQueue\} of \{plan\.selected\} for text/.test(dlg) && /Queue \{willQueue\} text/.test(dlg) && /data-testid="queue-sms-skipped"/.test(dlg), 'its title and button say how many will REALLY be queued, and it lists why the rest are skipped');
  ok(/disabled=\{busy \|\| !plan \|\| willQueue === 0\}/.test(dlg), 'the button is off while checking and when nothing would be queued');
  ok(!/Queue \{leadIds\.length\}/.test(dlg) && !/Up to 200/.test(dlg), 'it never shows the raw selection size as the queue count');
  const inbox = code(read('src/pages/Inbox.tsx'));
  ok(/checkSmsQueue\(rpc,/.test(inbox) && /runSmsQueue\(rpc, plan, bulkTemplate\)/.test(inbox), 'the Inbox bulk text uses the same helper');
  const callers = ['src/components/QueueSmsDialog.tsx', 'src/pages/Inbox.tsx', 'src/components/OutreachTable.tsx', 'src/components/LeadCrmPanel.tsx']
    .filter((p) => /queue_sms_openers/.test(code(read(p))));
  ok(callers.every((p) => /smsQueueBatch/.test(read(p))), `every caller of queue_sms_openers goes through smsQueueBatch (${callers.join(', ')})`);
  const out = read('src/components/OutreachTable.tsx');
  ok(/<QueueSmsDialog open=\{queueSmsOpen\}[^>]*leadIds=\{Array\.from\(selectedIds\)\}/.test(out), 'Select all and a single ticked lead both reach the same popup');
}

console.log('7. "No WhatsApp" and "No mobile" read differently');
{
  const label = (v: string) => OUTREACH_STATUS_OPTIONS.find((o) => o.value === v)?.label;
  ok(label('no_whatsapp') === 'No WhatsApp' && label('no_whatsapp_needs_sms') === 'No mobile', 'a mobile with no WhatsApp reads "No WhatsApp"; a landline / no number reads "No mobile"');
  for (const p of ['src/components/PipelineStatusBadge.tsx', 'src/components/OutreachStatusBadge.tsx']) {
    const s = read(p);
    ok(/no_whatsapp_needs_sms: \{[\s\S]*?label: 'No mobile'/.test(s) && /no_whatsapp: \{\s+label: 'No WhatsApp'/.test(s), `${p.split('/').pop()}: the pills say the same`);
  }
  ok(WHATSAPP_CAPABILITY_LABEL.not_mobile === 'No mobile' && WHATSAPP_CAPABILITY_LABEL.not_on_whatsapp === 'No WhatsApp', 'the WhatsApp capability chip agrees');
  // 2026-10-14: country_off is a real Malaysia / Singapore mobile whose country is switched off — it is NOT flagged.
  ok(Object.entries(COLD_NOT_ELIGIBLE_LABEL).every(([k, w]) => k === 'country_off' ? /not flagged/.test(w) : /No mobile/.test(w) && !/No WhatsApp/.test(w)), 'the WhatsApp queue\'s "not a mobile" reasons say "flagged No mobile" (a switched-off country says "not flagged")');
  ok(/flagged No mobile/.test(read('src/components/WhatsAppQueuePanel.tsx')), 'the WhatsApp queue panel too');
}

if (f) { console.log(`\n${f} failed`); process.exit(1); }
console.log('\nall passed');
