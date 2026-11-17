/* A bounced email is marked on the lead and never re-sent (2026-11-17, supabase/functions/_shared/email-bounce.ts).
   A fake Supabase client stands in for the database; nothing here can send anything. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  bounceAddresses, emailBounced, EMAIL_BOUNCED_KIND, isHardBounce, recordEmailBounce,
} from '../supabase/functions/_shared/email-bounce.ts';
import { ACTIVITY_LABEL } from '../src/lib/salesCrm.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

console.log('── hard or soft ──');
ok(isHardBounce({ type: 'Permanent', subType: 'General' }), 'Permanent -> hard');
ok(!isHardBounce({ type: 'Transient', subType: 'MailboxFull' }), 'Transient (mailbox full) -> soft, address NOT marked');
ok(isHardBounce(null) && isHardBounce({ type: 'Undetermined' }), 'unknown -> hard (re-sending to a dead address hurts every send)');
ok(bounceAddresses(['Info@OEFonline.co.uk']).join() === 'info@oefonline.co.uk', 'recipients are lower-cased');
ok(bounceAddresses('Bob <bob_x@a.co.uk>').join() === 'bob_x@a.co.uk' && bounceAddresses(['nonsense']).length === 0, 'display names stripped; junk dropped');

/* ── a tiny fake of the supabase-js query builder: enough for the calls the module makes ── */
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const get = (r: Row, col: string) => col.startsWith('data->>') ? (r.data as Row | undefined)?.[col.slice(7)] : r[col];
  const from = (t: string) => {
    let rows = [...(tables[t] ?? [])];
    let pendingUpdate: Row | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => get(r, c) === v); return q; },
      in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
      ilike: (c: string, v: string) => { const want = v.replace(/\\(.)/g, '$1').toLowerCase(); rows = rows.filter((r) => String(r[c] ?? '').toLowerCase() === want); return q; },
      limit: () => q,
      insert: (row: Row) => { (tables[t] ??= []).push(row); return Promise.resolve({ error: null }); },
      update: (patch: Row) => { pendingUpdate = patch; return q; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        if (pendingUpdate) for (const r of rows) Object.assign(r, pendingUpdate);
        return Promise.resolve({ data: rows, error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { from, tables };
}

const db = fakeDb({
  outreach_leads: [
    { id: 'L1', email: 'info@oefonline.co.uk', email_status: 'found' },
    { id: 'L2', email: 'INFO@oefonline.co.uk', email_status: 'found' },   // same address on another lead
    { id: 'L3', email: 'new@oefonline.co.uk', email_status: 'found' },    // a send was logged here, but the address has since changed
    { id: 'L4', email: 'someone@else.co.uk', email_status: 'found' },
  ],
  lead_activity: [{ lead_id: 'L3', kind: 'more_info_sent', data: { resend_id: 'msg-1', to: 'info@oefonline.co.uk' } }],
});

console.log('\n── the bounce is recorded ──');
const n = await recordEmailBounce(db, { messageId: 'msg-1', addresses: ['info@oefonline.co.uk'], detail: { type: 'Permanent' } });
const leads = db.tables.outreach_leads;
ok(n === 2, 'both leads carrying the address are marked');
ok(leads[0].email_status === 'bounced' && leads[1].email_status === 'bounced', "their email is marked 'bounced'");
ok(leads[2].email_status === 'found' && leads[3].email_status === 'found', 'a lead whose address changed, and an unrelated lead, are untouched');
const hist = db.tables.lead_activity.filter((a) => a.kind === EMAIL_BOUNCED_KIND);
ok(hist.length === 2 && String(hist[0].body).startsWith('Email bounced: info@oefonline.co.uk'), 'History says "Email bounced"');
ok(ACTIVITY_LABEL[EMAIL_BOUNCED_KIND] === 'Email bounced', 'the History label reads "Email bounced"');
ok(await recordEmailBounce(db, { messageId: 'msg-1', addresses: ['info@oefonline.co.uk'], detail: null }) === 0
  && db.tables.lead_activity.filter((a) => a.kind === EMAIL_BOUNCED_KIND).length === 2, 'a webhook retry writes nothing twice');

console.log('\n── no one re-sends ──');
ok(await emailBounced(db, 'L1', 'Info@OEFonline.co.uk'), 'the bounced address on that lead -> blocked');
ok(!(await emailBounced(db, 'L1', 'fixed@oefonline.co.uk')), 'once the email is changed on the lead -> allowed again');
ok(!(await emailBounced(db, 'L4', 'someone@else.co.uk')), 'an address that never bounced -> allowed');
const broken = { from: () => ({ select() { return this; }, eq() { return this; }, limit: () => Promise.resolve({ data: null, error: { message: 'down' } }) }) };
let threw = false; try { await emailBounced(broken, 'L1', 'x@y.co.uk'); } catch { threw = true; }
ok(threw, 'unreadable -> throws, so the caller refuses the send (fail closed)');

console.log('\n── wired into every lead email path ──');
const hook = read('supabase/functions/resend-webhook/index.ts');
ok(/status === "bounced" && isHardBounce\(detail\)/.test(hook) && hook.includes('recordEmailBounce(service'), 'resend-webhook records hard bounces');
const smi = read('supabase/functions/send-more-info/index.ts');
ok(smi.includes('emailBounced(service, leadId, emailTo)') && /if \(b\.email\.refusal\) return json\(\{ ok: false, error: b\.email\.bounced \? "email_bounced"/.test(smi), 'Send more info refuses a bounced address');
const qc = read('supabase/functions/quick-close/index.ts');
ok(qc.indexOf('emailBounced(service, leadId, to)') > 0 && qc.indexOf('emailBounced(service, leadId, to)') < qc.indexOf('const res = await fetch("https://api.resend.com/emails"'), 'Quick Close checks before its email send');
ok(read('src/components/SendMoreInfo.tsx').includes("'Email bounced'"), 'the rep sees "Email bounced" in Send more info');
const mig = read('supabase/migrations/20261223090000_email_bounced_activity.sql');
const prev = read('supabase/migrations/20261221090000_send_more_info.sql');
const kinds = (s: string) => [...s.slice(s.indexOf('lead_activity_kind_check check'), s.indexOf('not valid')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
ok(kinds(prev).every((k) => kinds(mig).includes(k)) && kinds(mig).includes('email_bounced'), 'the migration keeps every earlier History kind and adds email_bounced');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
