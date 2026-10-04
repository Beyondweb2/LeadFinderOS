/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A WHATSAPP AFTER A CALL REACHES ITS LEAD (2026-10-04, pre-sales certification M-005 / E-07;
   docs/pre-sales-certification/fixes-01-security-inbound.md).

   Call-first: the rep phones, the prospect WhatsApps the business number. No outbound row exists, so
   the reply must be matched on the lead's stored phone — and the old `ilike '%<last 9>%'` never matched
   a spaced phone (5,474 of 5,476). This drives:
     · the pure chooser (src/lib/inboundMatch.ts) on every arrival: none, one, one archived, several,
       several archived, duplicates of one row, junk rows;
     · the key: every way a rep types a UK mobile meets Meta's sender on one phone_key;
     · the REAL handler (_shared/whatsapp-inbound.ts handleInboundMessages) against a fake database:
       a never-messaged lead is linked (lead_id → the rep's lead, so the database's unread and
       notification rules reach its holder); an ambiguous number is linked to NOTHING and Paul is
       told once; a duplicate Meta id is ignored; a failed lookup still stores the message, unlinked;
       a reply to a number we messaged keeps the outbound rule.
   The database half (phone_key on both sides, the holder's unread + notification, the other rep
   seeing nothing, role removal) was run live in a rolled-back block on 2026-10-04 — results in
   the fixes document.
   Run: npx tsx scripts/inbound-phone-match.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';
import { chooseInboundLead, phoneKeyLikeDb, type InboundLeadCandidate } from '../src/lib/inboundMatch.ts';

// The handler reads Deno.env only for the automation kill-switch and media; off here.
(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } };
const { handleInboundMessages } = await import('../supabase/functions/_shared/whatsapp-inbound.ts');

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const BOOK = 'book-owner';
const REP_A = 'rep-a';
const REP_B = 'rep-b';
const cand = (id: string, holder: string | null, archived = false): InboundLeadCandidate =>
  ({ id, user_id: BOOK, assigned_to_user_id: holder, is_archived: archived });

console.log('── the chooser: never a guess ──');
{
  ok(chooseInboundLead([]).kind === 'none' && chooseInboundLead(null).kind === 'none' && chooseInboundLead(undefined).kind === 'none', 'no candidate → none');
  const one = chooseInboundLead([cand('L1', REP_A)]);
  ok(one.kind === 'matched' && one.leadId === 'L1' && one.holderUserId === REP_A && one.userId === BOOK, 'one lead → that lead (holder = the rep, owner = the book)');
  const unassigned = chooseInboundLead([cand('L1', null)]);
  ok(unassigned.kind === 'matched' && unassigned.holderUserId === null, 'one unassigned lead → still linked (the database then assigns/notifies the book owner)');
  const activePlusArchived = chooseInboundLead([cand('OLD', REP_B, true), cand('L1', REP_A)]);
  ok(activePlusArchived.kind === 'matched' && activePlusArchived.leadId === 'L1', 'one active + one archived → the ACTIVE lead');
  const onlyArchived = chooseInboundLead([cand('OLD', REP_A, true)]);
  ok(onlyArchived.kind === 'matched' && onlyArchived.leadId === 'OLD', 'the only lead with that number is archived → that lead (downstream guards read is_archived)');
  const two = chooseInboundLead([cand('L1', REP_A), cand('L2', REP_B)]);
  ok(two.kind === 'ambiguous' && two.candidates === 2, 'two active leads, two reps → AMBIGUOUS, no lead chosen');
  const twoSameRep = chooseInboundLead([cand('L1', REP_A), cand('L2', REP_A)]);
  ok(twoSameRep.kind === 'ambiguous', 'two active leads held by the SAME rep → still ambiguous (which lead is a real question)');
  const twoArchived = chooseInboundLead([cand('O1', REP_A, true), cand('O2', REP_B, true)]);
  ok(twoArchived.kind === 'ambiguous', 'only archived, more than one → ambiguous');
  const dupRow = chooseInboundLead([cand('L1', REP_A), cand('L1', REP_A)]);
  ok(dupRow.kind === 'matched' && dupRow.leadId === 'L1', 'the same row twice is one lead, not an ambiguity');
  const junk = chooseInboundLead([{ id: '', user_id: null, assigned_to_user_id: null, is_archived: null }, cand('L1', REP_A)]);
  ok(junk.kind === 'matched' && junk.leadId === 'L1', 'a row with no id is ignored, never chosen');
  const nullArchived = chooseInboundLead([{ id: 'L1', user_id: BOOK, assigned_to_user_id: REP_A, is_archived: null }, cand('L2', REP_B)]);
  ok(nullArchived.kind === 'ambiguous', 'is_archived NULL counts as active (absent is not "archived") → two active → ambiguous');
}

console.log('\n── the key: every way a UK mobile is typed meets Meta\'s sender ──');
{
  const meta = phoneKeyLikeDb('447700900123');
  const typed = ['07700 900123', '+44 7700 900123', '07700900123', '+447700900123', '0044 7700 900123', '(07700) 900-123', '447700900123', '7700 900123'];
  for (const t of typed) ok(phoneKeyLikeDb(t) === meta, `"${t}" → ${meta}`);
  ok(phoneKeyLikeDb('07700 900124') !== meta, 'a different number has a different key');
  ok(phoneKeyLikeDb('12345') === null && phoneKeyLikeDb('') === null && phoneKeyLikeDb(null) === null, 'too short / empty / null → no key (never matches everything)');
  ok(phoneKeyLikeDb('353861234567') === '353861234567', 'a non-UK number keeps its country code');
  const db = read('supabase/migrations/20261006010100_inbound_lead_candidates.sql');
  ok(/public\.phone_key\(l\.phone\) = public\.phone_key\(_phone\)/.test(db), 'the SQL compares phone_key on BOTH sides (index idx_outreach_leads_phone_key)');
  ok(/public\.phone_key\(_phone\) is not null/.test(db), 'a sender with no key matches nothing');
  ok(/revoke all on function public\.inbound_lead_candidates\(text\) from anon;/.test(db) && /from authenticated;/.test(db) && /from public;/.test(db) && /grant execute on function public\.inbound_lead_candidates\(text\) to service_role;/.test(db),
    'the candidate lookup is service-role only (a browser can never list leads by phone)');
}

/* ── a fake service client: just enough PostgREST for handleInboundMessages ── */
type Rec = { table: string; op: string; filters: Array<[string, unknown[]]>; payload?: unknown };
function fakeService(opts: {
  prior?: { user_id: string | null; lead_id: string | null } | null;
  candidates?: InboundLeadCandidate[];
  candidateError?: boolean;
  duplicateWamids?: Set<string>;
}) {
  const log: Rec[] = [];
  const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
  const inserted: Array<Record<string, unknown>> = [];
  const resolve = (r: Rec, single: boolean) => {
    const has = (col: string, v?: unknown) => r.filters.some(([m, a]) => m === 'eq' && a[0] === col && (v === undefined || a[1] === v));
    if (r.table === 'whatsapp_messages' && r.op === 'insert') {
      const row = r.payload as Record<string, unknown>;
      if (opts.duplicateWamids?.has(String(row.wa_message_id))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      inserted.push(row);
      return { data: { id: `msg-${inserted.length}` }, error: null };
    }
    if (r.table === 'whatsapp_messages' && r.op === 'select' && has('direction', 'outbound') && has('phone')) return { data: opts.prior ?? null, error: null };
    if (r.table === 'team_members') return { data: { user_id: BOOK }, error: null };
    if (r.table === 'outreach_leads' && r.op === 'select') return { data: { is_archived: false }, error: null };
    return { data: single ? null : [], error: null };
  };
  const builder = (table: string) => {
    const r: Rec = { table, op: 'select', filters: [] };
    log.push(r);
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'not', 'in', 'gte', 'order', 'limit', 'ilike', 'is']) {
      b[m] = (...a: unknown[]) => { if (m !== 'select' || r.op === 'select') r.filters.push([m, a]); return b; };
    }
    b.insert = (p: unknown) => { r.op = 'insert'; r.payload = p; return b; };
    b.update = (p: unknown) => { r.op = 'update'; r.payload = p; return b; };
    b.maybeSingle = async () => resolve(r, true);
    b.single = async () => resolve(r, true);
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resolve(r, false)).then(res, rej);
    return b;
  };
  const service = {
    from: builder,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      if (name === 'inbound_lead_candidates') return opts.candidateError ? { data: null, error: { message: 'boom' } } : { data: opts.candidates ?? [], error: null };
      return { data: null, error: null };
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
  return { service, log, rpcs, inserted };
}
const inbound = (from: string, id: string, body = 'Hi, send me the link') =>
  ({ contacts: [{ wa_id: from }], messages: [{ from, id, timestamp: '1759560000', type: 'text', text: { body } }] });

console.log('\n── the real handler: a never-messaged lead (the call-first case) ──');
{
  const db = fakeService({ prior: null, candidates: [cand('LEAD-A', REP_A)] });
  const n = await handleInboundMessages(db.service, inbound('447700900611', 'wamid.1'));
  ok(n === 1 && db.inserted.length === 1, 'the reply is stored once');
  const row = db.inserted[0] ?? {};
  ok(row.lead_id === 'LEAD-A', 'linked to the lead (lead_id) — this is what makes the holder\'s unread + notification fire in the database');
  ok(row.user_id === BOOK, 'the conversation stays on the book owner (user_id), exactly like every other inbound');
  ok(row.direction === 'inbound' && row.phone === '447700900611' && row.status === 'received', 'an ordinary inbound row');
  const cRpc = db.rpcs.find((x) => x.name === 'inbound_lead_candidates');
  ok(!!cRpc && cRpc.args._phone === '447700900611', 'matched through inbound_lead_candidates (phone_key), not a substring');
  ok(!db.log.some((r) => r.filters.some(([m]) => m === 'ilike')), 'no ilike anywhere in the match');
  const upd = db.log.find((r) => r.table === 'outreach_leads' && r.op === 'update');
  ok(!!upd && (upd.payload as { status?: string }).status === 'replied' && upd.filters.some(([m, a]) => m === 'eq' && a[0] === 'id' && a[1] === 'LEAD-A'),
    'the normal matched-reply logic runs: the lead moves to replied (strong statuses protected)');
  ok(!db.rpcs.some((x) => x.name === 'notify_person'), 'a clean match sends no "needs matching" alert (the trigger notifies the holder)');
}

console.log('\n── the real handler: an ambiguous number ──');
{
  const db = fakeService({ prior: null, candidates: [cand('LEAD-A', REP_A), cand('LEAD-B', REP_B)] });
  const n = await handleInboundMessages(db.service, inbound('447700900612', 'wamid.2'));
  const row = db.inserted[0] ?? {};
  ok(n === 1 && row.lead_id === null, 'stored, but linked to NO lead — neither rep gets it by guess');
  ok(!db.log.some((r) => r.table === 'outreach_leads' && r.op === 'update'), 'no lead status is changed');
  const note = db.rpcs.find((x) => x.name === 'notify_person');
  ok(!!note && note.args._user === BOOK && note.args._kind === 'whatsapp_reply' && note.args._lead === null, 'Paul (the book owner) is told once');
  ok(!!note && String(note.args._dedupe) === 'reply-ambiguous:msg-1', '…de-duplicated per message');
  ok(!!note && String(note.args._link).startsWith('/inbox?c=') && decodeURIComponent(String(note.args._link)).endsWith('unassigned::447700900612'), '…linking to the Unassigned conversation');
  ok(!!note && /2 leads/.test(String(note.args._body)), '…saying how many leads share the number');
}

console.log('\n── the real handler: duplicates, failures, and the outbound rule ──');
{
  const dup = fakeService({ prior: null, candidates: [cand('LEAD-A', REP_A)], duplicateWamids: new Set(['wamid.dup']) });
  const n = await handleInboundMessages(dup.service, inbound('447700900611', 'wamid.dup'));
  ok(n === 0 && dup.inserted.length === 0, 'a duplicate Meta message id is ignored (unique index → 23505 → skipped)');
  ok(!dup.log.some((r) => r.table === 'outreach_leads' && r.op === 'update') && !dup.rpcs.some((x) => x.name === 'notify_person'), '…and changes nothing else');

  const failed = fakeService({ prior: null, candidateError: true });
  const n2 = await handleInboundMessages(failed.service, inbound('447700900611', 'wamid.3'));
  ok(n2 === 1 && failed.inserted[0]?.lead_id === null, 'a failed lookup still STORES the message, unlinked (never dropped, never guessed)');

  const none = fakeService({ prior: null, candidates: [] });
  await handleInboundMessages(none.service, inbound('447911000000', 'wamid.4'));
  ok(none.inserted[0]?.lead_id === null && none.inserted[0]?.user_id === null && !none.rpcs.some((x) => x.name === 'notify_person'), 'an unknown sender → Unassigned, no alert');

  const messaged = fakeService({ prior: { user_id: BOOK, lead_id: 'LEAD-MSG' }, candidates: [cand('LEAD-A', REP_A), cand('LEAD-B', REP_B)] });
  await handleInboundMessages(messaged.service, inbound('447700900611', 'wamid.5'));
  ok(messaged.inserted[0]?.lead_id === 'LEAD-MSG' && !messaged.rpcs.some((x) => x.name === 'inbound_lead_candidates'),
    'a reply to a number we messaged keeps the outbound rule (the most recent outbound decides)');

  const bareOutbound = fakeService({ prior: { user_id: BOOK, lead_id: null }, candidates: [cand('LEAD-A', REP_A)] });
  await handleInboundMessages(bareOutbound.service, inbound('447700900611', 'wamid.6'));
  ok(bareOutbound.inserted[0]?.lead_id === 'LEAD-A', 'an outbound with NO lead no longer stops the search — the lead is found by phone');
}

console.log('\n── source: one rule, no regressions ──');
{
  const src = read('supabase/functions/_shared/whatsapp-inbound.ts');
  ok(!/\.ilike\(/.test(src), 'whatsapp-inbound.ts has no ilike phone match left');
  ok(/chooseInboundLead\(/.test(src) && /from "\.\.\/\.\.\/\.\.\/src\/lib\/inboundMatch\.ts"/.test(src), 'it uses the one chooser (relative .ts import, edge-safe)');
  ok(!/owners\.size/.test(src), 'the old "ambiguous by user_id" check (never fired: one book owner) is gone');
  const migs = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((n) => n.endsWith('.sql')).sort();
  ok(migs.includes('20261006010100_inbound_lead_candidates.sql'), 'the candidate function ships as a migration (WS-1 prefix 2026100601)');
}

console.log(`\n${f === 0 ? 'ALL PASS' : `${f} FAILED`}`);
if (f) process.exit(1);
