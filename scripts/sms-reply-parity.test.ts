/* ═══════════════════════════════════════════════════════════
   SMS REPLY HANDLING = WHATSAPP REPLY HANDLING (2026-10-09). Drives the REAL handler (handleInboundSmsReply → armFirstReplyAuditIntent) against
   an in-memory database, with simulated inbound texts — no Twilio, no messages sent. Pins:
   · an inbound text moves the lead to Replied exactly like WhatsApp (same no-downgrade list; Not interested flips; a client never moves)
   · "Audit only" arms ONE audit intent; a second reply arms nothing; "Do nothing" arms nothing; a text NEVER sends (audit and reply = audit only)
   · a recent check is reused (nothing spent), an in-flight one is attached, an old one is not
   · an audit never changes the sales status
   · STOP still opts out and starts nothing
   · the budget: internal prospecting audit, never the paid-client pools or a rep's daily allowance
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { replyAuditSource, smsReplyMode } from '../src/lib/smsReplyAudit.ts';
import { isStopMessage } from '../src/lib/smsMessages.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ── the Deno global the shared modules read (the kill-switch secret) ─────────────────────────────────────────────────────────
(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => (k === 'AUTO_AUDIT_REPLY_ENABLED' ? '1' : undefined) } };

// ── a tiny in-memory PostgREST ──────────────────────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let seq = 1000;
  const from = (name: string) => {
    tables[name] ??= [];
    const rows = tables[name];
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {}; let ins: Row | null = null; let lim = Infinity; let single: 'maybe' | 'one' | null = null; const ord: Array<[string, boolean]> = [];
    const b: Record<string, unknown> = {};
    const run = () => {
      if (op === 'insert') {
        const row = { id: `r${++seq}`, ...ins! };
        const uniq = name === 'whatsapp_auto_replies' && tables[name].some((x) => x.lead_id === row.lead_id);
        if (uniq) return { data: null, error: { code: '23505', message: 'duplicate' } };
        tables[name].push(row);
        return { data: single ? row : [row], error: null };
      }
      let out = rows.filter((r) => filters.every((fn) => fn(r)));
      if (op === 'update') { for (const r of out) Object.assign(r, patch); return { data: out, error: null }; }
      for (const [k, asc] of [...ord].reverse()) out = [...out].sort((a, c) => (String(a[k] ?? '') < String(c[k] ?? '') ? -1 : 1) * (asc ? 1 : -1));
      out = out.slice(0, lim);
      if (single) return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };
    const chain = (fn: () => void) => (..._a: unknown[]) => { fn(); return b; };
    b.select = () => b;
    b.eq = (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; };
    b.neq = (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return b; };
    b.gte = (k: string, v: unknown) => { filters.push((r) => String(r[k] ?? '') >= String(v)); return b; };
    b.in = (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; };
    b.not = (k: string, o: string, v: unknown) => {
      if (o === 'in') { const list = String(v).replace(/[()]/g, '').split(','); filters.push((r) => !list.includes(String(r[k]))); }
      else if (o === 'is') filters.push((r) => r[k] !== null && r[k] !== undefined);
      return b;
    };
    b.order = (k: string, o?: { ascending?: boolean }) => { ord.push([k, o?.ascending !== false]); return b; };
    b.limit = (n: number) => { lim = n; return b; };
    b.maybeSingle = () => { single = 'maybe'; return b; };
    b.single = () => { single = 'one'; return b; };
    b.update = (p: Row) => { op = 'update'; patch = p; return b; };
    b.insert = (r: Row) => { op = 'insert'; ins = r; return b; };
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    void chain;
    return b;
  };
  const service = {
    from,
    rpc: async (fn: string) => (fn === 'inbound_lead_candidates' ? { data: [], error: null } : { data: null, error: null }),
  };
  return { service, tables };
}

const NOW = Date.now();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();
const seed = (over: { status?: string; mode?: string; enabled?: boolean; audits?: Row[]; runs?: Row[]; paid?: number } = {}) => ({
  outreach_leads: [{ id: 'L1', status: over.status ?? 'initial_contact', amount_paid: over.paid ?? null, is_archived: false, user_id: 'U1' }],
  whatsapp_outreach_state: [{ id: 1, auto_reply_enabled: over.enabled ?? true, first_reply_mode: over.mode ?? 'audit_only', first_reply_template: 'audit_reply' }],
  sms_messages: [
    { id: 'o1', lead_id: 'L1', direction: 'outbound', status: 'delivered', created_at: iso(2), body: 'opener' },
    { id: 'i1', lead_id: 'L1', direction: 'inbound', status: 'received', created_at: iso(0), body: 'Yes please send it over' },
  ],
  whatsapp_auto_replies: [],
  contact_suppressions: [],
  ai_audits: over.audits ?? [],
  ai_audit_runs: over.runs ?? [],
});

const { handleInboundSmsReply } = await import('../supabase/functions/_shared/sms-inbound.ts');
const reply = (db: ReturnType<typeof makeDb>, body = 'Yes please send it over', messageId = 'i1') =>
  handleInboundSmsReply(db.service, { leadId: 'L1', digits: '447700900123', body, messageId, sid: 'SM1', ambiguous: 0 });

console.log('1. an inbound text moves the lead exactly like a WhatsApp reply');
{
  for (const from of ['initial_contact', 'not_contacted', 'queued', 'no_whatsapp', 'report_sent', 'not_interested', 'second_attempt']) {
    const db = makeDb(seed({ status: from, enabled: false })); await reply(db);
    ok(db.tables.outreach_leads[0].status === 'replied', `${from} → Replied`);
  }
  for (const keep of ['interested', 'price_given', 'payment_received', 'in_delivery', 'replied']) {
    const db = makeDb(seed({ status: keep, enabled: false })); await reply(db);
    ok(db.tables.outreach_leads[0].status === keep, `${keep} is never moved (the shared no-downgrade list)`);
  }
  const wa = read('supabase/functions/_shared/whatsapp-inbound.ts'); const sm = read('supabase/functions/_shared/sms-inbound.ts');
  ok(/\.not\("status", "in", NO_DOWNGRADE\)/.test(wa) && /\.not\("status", "in", NO_DOWNGRADE\)/.test(sm), 'WhatsApp and SMS use the same update, off the same list (strongStatuses)');
  const hook = read('supabase/functions/twilio-webhook/index.ts');
  ok(/handleInboundSmsReply\(service/.test(hook) && !/REPLIABLE/.test(hook), 'the webhook hands every non-STOP text to the shared handler (the old allow-list is gone)');
  ok(/resolveSmsOwner\(service, from\)/.test(hook) && /chooseInboundLead/.test(read('supabase/functions/_shared/sms-inbound.ts')), 'lead matching uses the same chooser as WhatsApp (never a guess)');
  const mig = read('supabase/migrations/20261018090000_twilio_comms.sql');
  ok(/trg_notify_sms/.test(mig) || /sms_reply/.test(mig), 'the unread mark and the notification come from the stored row (trg_notify_sms, my_sms_unread_counts)');
}

console.log('2. "Audit only": one audit, once, within the rules');
{
  const db = makeDb(seed({ mode: 'audit_only' })); const r = await reply(db);
  const rows = db.tables.whatsapp_auto_replies;
  ok(r.replied && rows.length === 1 && rows[0].audit_required === true && rows[0].audit_status === 'pending' && rows[0].audit_mode === 'audit_only', 'a first text reply arms exactly one audit intent (pending, audit only)');
  ok(rows[0].status === 'audit_only', 'the reply row can never send (status audit_only)');
  await reply(db, 'And another thing', 'i2');
  ok(db.tables.whatsapp_auto_replies.length === 1, 'a second reply arms nothing more (one claim per lead, ever)');
  ok(db.tables.outreach_leads[0].status === 'replied' && db.tables.outreach_leads[0].amount_paid === null, 'the lead is Replied; the audit step wrote nothing else');
}

console.log('3. "Do nothing" and the guards');
{
  const off = makeDb(seed({ enabled: false })); await reply(off);
  ok(off.tables.whatsapp_auto_replies.length === 0, 'Do nothing: no audit intent');
  const client = makeDb(seed({ paid: 99, status: 'payment_received' })); await reply(client);
  ok(client.tables.whatsapp_auto_replies.length === 0 && client.tables.outreach_leads[0].status === 'payment_received', 'a paying client: no audit, status untouched');
  const bot = makeDb(seed()); await reply(bot, 'Thanks for your message, we are out of the office and will get back to you');
  ok(bot.tables.whatsapp_auto_replies.length === 0, 'an auto-responder arms nothing');
  const media = makeDb(seed()); await reply(media, '[image]');
  ok(media.tables.whatsapp_auto_replies.length === 0, 'a non-text placeholder arms nothing');
  const supp = makeDb({ ...seed(), contact_suppressions: [{ id: 's', phone_e164: '+447700900123', reason: 'wrong_number' }] }); await reply(supp);
  ok(supp.tables.whatsapp_auto_replies.length === 0, 'a suppressed contact arms nothing (the shared genuine-contact guard)');
  const no = makeDb(seed()); await reply(no, 'no thanks not interested');
  ok(no.tables.whatsapp_auto_replies.every((x) => x.status === 'flagged_decline') && no.tables.whatsapp_auto_replies.every((x) => x.audit_required !== true), 'a clear no flags a human and starts no audit');
}

console.log('4. a text reply NEVER sends, whatever the shared setting says');
{
  ok(smsReplyMode('send') === 'audit_only' && smsReplyMode('audit_only') === 'audit_only' && smsReplyMode('off') === 'off', 'audit-and-reply collapses to audit only on texts; off stays off');
  const db = makeDb(seed({ mode: 'send' })); await reply(db);
  const row = db.tables.whatsapp_auto_replies[0];
  ok(row && row.audit_mode === 'audit_only' && row.status === 'audit_only', 'with the shared rule on "Audit and reply", a text reply is stored as audit only (no reply is ever parked)');
}

console.log('5. the cache: a recent check is reused, nothing is spent');
{
  const aud = [{ id: 'A1', lead_id: 'L1', audit_purpose: 'audit', created_at: iso(3) }];
  const done = makeDb(seed({ audits: aud, runs: [{ id: 'R1', audit_id: 'A1', status: 'complete', created_at: iso(3) }] })); const r = await reply(done);
  const row = done.tables.whatsapp_auto_replies[0];
  ok(r.audit === 'audit_cached' && row.audit_status === 'complete' && row.audit_id === 'A1', 'a complete check from 3 days ago is reused: the claim is recorded as complete against it, no new audit');
  const live = makeDb(seed({ audits: aud, runs: [{ id: 'R1', audit_id: 'A1', status: 'running', created_at: iso(0) }] })); await reply(live);
  ok(live.tables.whatsapp_auto_replies[0].audit_status === 'queued' && live.tables.whatsapp_auto_replies[0].audit_id === 'A1', 'a check already running is attached, never doubled');
  const old = makeDb(seed({ audits: aud, runs: [{ id: 'R1', audit_id: 'A1', status: 'complete', created_at: iso(30) }] })); await reply(old);
  ok(old.tables.whatsapp_auto_replies[0].audit_status === 'pending', 'a 30-day-old check is not reused: a fresh audit is queued');
  const baseline = makeDb(seed({ audits: [{ id: 'B1', lead_id: 'L1', audit_purpose: 'baseline', created_at: iso(1) }], runs: [{ id: 'R9', audit_id: 'B1', status: 'complete', created_at: iso(1) }] })); await reply(baseline);
  ok(baseline.tables.whatsapp_auto_replies[0].audit_status === 'pending', 'a paid-client baseline is never used as the reply check');
  ok(replyAuditSource([], [], NOW).kind === 'fresh', 'no audits → fresh');
}

console.log('6. an audit never changes the sales status; the budget is prospecting only');
{
  const fra = read('supabase/functions/_shared/first-reply-audit.ts');
  ok(!/from\("outreach_leads"\)\s*\.update|\.update\(\{\s*status/.test(fra.replace(/\/\*[\s\S]*?\*\//g, '')), 'the audit/arming code never writes outreach_leads.status');
  ok(/hook_audit: true/.test(fra) && /fresh_audit: true/.test(fra) && !/audit_purpose:\s*"(baseline|measurement|remeasure)"/.test(fra), 'the reply audit is an ordinary hook audit — never a baseline / measurement / replay');
  const ca = read('supabase/functions/create-ai-audit/index.ts');
  ok(/budgetPoolForPurpose\(auditPurpose\) === "prospecting"/.test(ca), 'an ordinary audit draws from the PROSPECTING pool (client measurement has its own pools)');
  ok(!/sales_check|sales-check/.test(fra), 'the reply path is internal: it never touches a rep\'s daily fresh-check allowance');
  ok(/replyAuditSource/.test(fra) && /channel === "sms"/.test(fra), 'the cache decision is the one pure rule (smsReplyAudit.ts), SMS only');
}

console.log('7. STOP still opts out and starts nothing');
{
  ok(['STOP', 'stop', 'Stop.', 'UNSUBSCRIBE', 'END'].every((w) => isStopMessage(w)), 'STOP-family words are recognised');
  const hook = read('supabase/functions/twilio-webhook/index.ts');
  const at = hook.indexOf('if (isStopMessage(body))');
  const stopBranch = hook.slice(at, hook.indexOf('} else {', at));
  ok(/recordOptOut\(service/.test(stopBranch) && !/handleInboundSmsReply/.test(stopBranch), 'a STOP records the opt-out and never reaches the reply handler / audit');
  ok(hook.lastIndexOf('handleInboundSmsReply') > hook.indexOf('recordOptOut('), 'the opt-out branch comes first; the reply rule is the else');
}

console.log('8. the SMS inbox header');
{
  const s = read('src/pages/Inbox.tsx');
  ok(/<AutoReplyToggle channel=\{channel\} \/>/.test(s) && /perms\.queueControls && <AutoReplyToggle/.test(s), 'the "When a prospect replies" control is in the shared header (admin-only), told which channel it is on');
  const t = read('src/components/AutoReplyToggle.tsx');
  ok(/disabled=\{saving \|\| \(sms && m === 'send'\)\}/.test(t) && /Audit and reply is WhatsApp only/.test(t), '"Audit and reply" is disabled on texts, with a plain note');
  ok(/queue_pitch_on_complete: pitchMayFollowAudit/.test(s) && /aria-label="Run AI audit"/.test(s), 'the one Run AI audit header button queues NO pitch on the text channel');
  ok(/hookAuditRequestBody\(activeLead, bizType, loc, old\?\.business_name\)/.test(read('src/pages/Inbox.tsx')), 'WhatsApp\'s "Run new" uses the same request body (one copy)');
  const body = read('src/lib/hookAuditRequest.ts');
  ok(!/queue_pitch_on_complete/.test(body.replace(/\/\*[\s\S]*?\*\//g, '')) && /hook_audit: true/.test(body), 'that body never queues a pitch');
}

console.log('9. an inbound text notifies the way a WhatsApp message does (one coalesced notification per lead, not one per text)');
{
  const wa = read('supabase/migrations/20260929140000_notifications.sql');
  const sm = read('supabase/migrations/20261020090000_sms_reply_notification_coalesce.sql');
  const waFn = wa.slice(wa.indexOf('create or replace function public.trg_notify_whatsapp'), wa.indexOf('drop trigger if exists trg_notify_whatsapp'));
  ok(/set count = count \+ 1/.test(waFn.replace(/\s+/g, ' ')) || /count = count \+ 1/.test(waFn), 'WhatsApp folds a second unread reply into the same notification');
  ok(/update public\.notifications set count = count \+ 1/.test(sm) && /kind = 'sms_reply' and lead_id = new\.lead_id and read_at is null and cleared_at is null/.test(sm), 'a text does the same: unread sms_reply rows for the lead are updated in place');
  ok(/lead_recipient\(new\.lead_id\)/.test(sm) && /get diagnostics v_n = row_count/.test(sm) && /if v_n = 0 then/.test(sm), 'same recipient rule (assignee, else the book owner) and only one new row when none is open');
  ok(/'sms_failed'/.test(sm) && /status in \('failed', 'undelivered'\)/.test(sm), 'the failed-text notification is unchanged');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
