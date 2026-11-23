/* ============================================================
   QUEUE SENDS SHOW THEIR REAL WORDS IN THE INBOX (2026-11-23, fix/initial-with-link-queue-code).

   ⛔ THE FAILURE THIS SUITE EXISTS FOR: the queue writes whatsapp_sends first; its DB trigger copies the row into
   whatsapp_messages as "[<template>]" with the same Meta id; the queue's own insert then hit the unique index and the retry
   treated the trigger's copy as "landed". The Inbox showed "https://leadfinderos.com/go/<tracking code>" for every automatic
   initial_with_link although Meta had the real code. Fake DB with the trigger + the unique index; nothing sends.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { logOutboundMessage, realWordsOf, triggerPlaceholderBody } from '../supabase/functions/_shared/outbound-log.ts';
import { initialWithLinkBody, TRACKING_CODE_SHOWN } from '../src/lib/initialWithLink.ts';
import { claimTemplatePayload } from '../supabase/functions/_shared/whatsapp-send.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

type Row = Record<string, unknown> & { id: string };
function fakeDb(opts: { failUpdate?: boolean } = {}) {
  const rows: Row[] = [];
  let n = 0;
  const sendsInsert = (s: Record<string, unknown>) => {   // the trigger, as live (mirror_whatsapp_send_to_inbox)
    rows.push({ id: `r${++n}`, direction: 'outbound', lead_id: s.lead_id, body: triggerPlaceholderBody(s.template), message_type: 'template',
      template_name: s.template, wa_message_id: s.message_id ?? null, status: s.delivery_status ?? 'sent', test_mode: s.test_mode ?? true,
      created_at: new Date().toISOString() });
  };
  const service = {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      const q = {
        select() { return q; },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return q; },
        is(k: string, v: unknown) { filters.push((r) => (r[k] ?? null) === v); return q; },
        gte(k: string, v: string) { filters.push((r) => String(r[k]) >= v); return q; },
        order() { return q; },
        limit(k: number) { return Promise.resolve({ data: rows.filter((r) => filters.every((p) => p(r))).slice(0, k), error: null }); },
        update(p: Record<string, unknown>) { patch = p; return q; },
        then(res: (v: unknown) => unknown) {   // an awaited update(...).eq(...)
          if (opts.failUpdate) return Promise.resolve({ error: { message: 'boom' } }).then(res);
          for (const r of rows.filter((r) => filters.every((p) => p(r)))) Object.assign(r, patch);
          return Promise.resolve({ error: null }).then(res);
        },
        insert(row: Record<string, unknown>) {
          if (table === 'whatsapp_sends') { sendsInsert(row); return Promise.resolve({ error: null }); }
          if (row.wa_message_id && rows.some((r) => r.wa_message_id === row.wa_message_id)) {
            return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint "wa_messages_wa_id_uq"' } });
          }
          rows.push({ id: `r${++n}`, created_at: new Date().toISOString(), ...row });
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return { rows, service };
}

const CODE = 'ab12cd34';
const realBody = initialWithLinkBody(CODE);
const snapshot = { templateName: 'initial_with_link', body: realBody };
const row = (waId: string | null) => ({ direction: 'outbound', user_id: 'u1', lead_id: 'L1', phone: '447700900000', body: realBody,
  message_type: 'template', template_name: 'initial_with_link', wa_message_id: waId, status: 'sent', test_mode: false, template_snapshot: snapshot });

/* ── 1. a real send: the trigger's copy gets the real link, one row only ── */
{
  const db = fakeDb();
  await db.service.from('whatsapp_sends').insert({ lead_id: 'L1', template: 'initial_with_link', message_id: 'wamid.X1', delivery_status: 'sent', test_mode: false });
  ok(db.rows.length === 1 && db.rows[0].body === '[initial_with_link]', 'setup: the trigger made the placeholder copy');
  db.rows[0].status = 'delivered';   // the status webhook got there first
  const err = await logOutboundMessage(db.service, row('wamid.X1'));
  ok(err === '', 'no error');
  ok(db.rows.length === 1, 'still ONE row for the message (no duplicate)');
  ok(db.rows[0].body === realBody && String(db.rows[0].body).includes(`/go/${CODE}`), 'the Inbox row carries the real link');
  ok(!String(db.rows[0].body).includes(TRACKING_CODE_SHOWN), 'never the <tracking code> placeholder');
  ok(db.rows[0].template_snapshot === snapshot, 'the template snapshot is stored');
  ok(db.rows[0].status === 'delivered', 'the webhook\'s newer status is kept');
}
/* ── 2. a simulated send (no Meta id): the trigger's placeholder for this lead is replaced; another lead's is untouched ── */
{
  const db = fakeDb();
  await db.service.from('whatsapp_sends').insert({ lead_id: 'L2', template: 'initial_with_link', message_id: null, delivery_status: 'simulated', test_mode: true });
  await db.service.from('whatsapp_sends').insert({ lead_id: 'L1', template: 'initial_with_link', message_id: null, delivery_status: 'simulated', test_mode: true });
  const err = await logOutboundMessage(db.service, { ...row(null), status: 'simulated', test_mode: true });
  ok(err === '' && db.rows.length === 2, 'simulated: no extra row');
  ok(db.rows.find((r) => r.lead_id === 'L1')?.body === realBody, 'simulated: this lead\'s copy has the real link');
  ok(db.rows.find((r) => r.lead_id === 'L2')?.body === '[initial_with_link]', 'simulated: another lead\'s row is never touched');
}
/* ── 3. no trigger copy at all: a plain insert ── */
{
  const db = fakeDb();
  ok(await logOutboundMessage(db.service, row('wamid.X2')) === '' && db.rows.length === 1 && db.rows[0].body === realBody, 'no copy: inserted');
}
/* ── 4. a failing update returns its error (the caller records it), never throws ── */
{
  const db = fakeDb({ failUpdate: true });
  await db.service.from('whatsapp_sends').insert({ lead_id: 'L1', template: 'initial_with_link', message_id: 'wamid.X3', test_mode: false });
  ok((await logOutboundMessage(db.service, row('wamid.X3'))) === 'boom' && db.rows.length === 1, 'update failure → error returned, no duplicate');
}
/* ── 5. realWordsOf never carries status or the Meta id ── */
{
  const w = realWordsOf(row('wamid.X4'));
  ok(!('status' in w) && !('wa_message_id' in w) && w.body === realBody, 'realWordsOf: words only');
}
/* ── 6. Meta's {{1}} is the code (the same code the Inbox shows) ── */
{
  const p = JSON.stringify(claimTemplatePayload('initial_with_link', 'en', 'Biz', '', { goCode: CODE }));
  ok(p.includes(`"text":"${CODE}"`), 'Meta parameter {{1}} = the real code');
  let threw = false;
  try { claimTemplatePayload('initial_with_link', 'en', 'Biz', '', {}); } catch { threw = true; }
  ok(threw, 'no code → refuses to build the payload (never a broken link)');
}
/* ── 7. every queue lane writes through the helper (source sweep) ── */
{
  const src = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok((src.match(/logOutboundMessage\(service,/g) ?? []).length === 3, 'queue: main, hook_followup and contact_followup lanes use logOutboundMessage');
  ok(!/landed\.length > 0\) \{ logErr = ""; break; \}/.test(src), 'queue: the old "already landed → stop" loop is gone');
}

console.log(f ? `\n${f} FAILED` : '\nall passed');
if (f) process.exit(1);
