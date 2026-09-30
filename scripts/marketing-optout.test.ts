/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MARKETING OPT-OUTS (2026-09-30 integrity pass) — a clear "stop" blocks marketing for everyone,
   paying clients included, on every sending path; service messages still go.
   Run: npx tsx scripts/marketing-optout.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { triageByRules, decisionFromAi } from '../src/lib/replyTriage.ts';
import { OPT_OUT_REASON, SERVICE_TEMPLATES, isServiceTemplate, optOutBlocksTemplate } from '../src/lib/marketingConsent.ts';
import { CONTINUATION_TEMPLATES } from '../src/lib/coldOutreach.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { recordOptOut, checkOptedOut } from '../supabase/functions/_shared/suppression.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const client = { isClient: true, messageType: 'text' };
const prospect = { isClient: false, messageType: 'text' };

console.log('── reply sorting ──');
{
  const c = triageByRules('Please stop sending me these messages', client);
  ok(c.category === 'opt_out' && c.suppress && c.bucket === 'urgent_admin', 'a clear opt-out from a PAYING CLIENT suppresses marketing and still goes to Paul as urgent');
  const p = triageByRules('Please stop sending me these messages', prospect);
  ok(p.category === 'opt_out' && p.suppress && p.bucket === 'no_action', 'the same opt-out from a prospect suppresses, and needs nobody');
  const q = triageByRules('When will my new site be live?', client);
  ok(q.category !== 'opt_out' && !q.suppress && q.bucket === 'admin_action', 'a client service question is not an opt-out and suppresses nothing');
  const amb = triageByRules('not sure this is for us at the moment', prospect);
  ok(!amb.suppress, 'an ambiguous reply never suppresses on the rules');
  const ai = decisionFromAi({ category: 'opt_out', confidence: 0.99, reason: 'seems to want no contact' } as never, client);
  ok(ai.bucket === 'review' && !ai.suppress, 'an AI "they asked to stop" goes to review and never suppresses by itself — for a client too');
  ok(!triageByRules('wrong number', client).suppress && !triageByRules('wrong number', prospect).suppress, 'Wrong number stays its own protection, never this path');
}

console.log('\n── which sends an opt-out blocks ──');
{
  ok(OPT_OUT_REASON === 'opted_out', 'the opt-out reason is opted_out');
  const supp = read('supabase/functions/_shared/suppression.ts');
  ok((supp.match(/"opted_out"/g) ?? []).length >= 2 && !/^import /m.test(supp), 'suppression.ts writes/reads the same literal and keeps no imports (every sender reaches it)');
  ok(optOutBlocksTemplate('audit_followup_call', true), 'a follow-up pitch template is refused to a number that opted out');
  ok(optOutBlocksTemplate('re_engage_49', true) && optOutBlocksTemplate('explain_offer_v2', true), 're-engagement and the pitch are marketing');
  ok(optOutBlocksTemplate('some_new_template', true), 'an unknown template is marketing (fails safe)');
  ok(!optOutBlocksTemplate('payment_recieved', true) && !optOutBlocksTemplate('questionnaire_followup', true), 'service templates (payment confirmation, the setup questionnaire chase) still go');
  ok(!optOutBlocksTemplate(null, true) && !optOutBlocksTemplate('', true), 'a free-text reply to their own message is not a template send — not refused');
  ok(!optOutBlocksTemplate('audit_followup_call', false), 'no opt-out → nothing refused');
  ok(optOutBlocksTemplate('audit_followup_call', null) && !optOutBlocksTemplate('payment_recieved', null), 'a failed opt-out lookup refuses marketing (fails closed) but not service');
  ok([...SERVICE_TEMPLATES].every((t) => CONTINUATION_TEMPLATES.has(t)), 'every service template is a registered continuation, not a stray name');
  ok(!WHATSAPP_TEMPLATES.some((t) => isServiceTemplate(t.value) && /initial|opener|hook|video/i.test(t.value)), 'no opener is ever a service template');
}

console.log('\n── every sending path ──');
{
  const swm = read('supabase/functions/send-whatsapp-message/index.ts');
  const guard = swm.indexOf('optOutBlocksTemplate(templateName, await checkOptedOut(');
  ok(guard > 0 && guard < swm.indexOf('if (dryRun) {') && guard < swm.lastIndexOf('let payload: Record<string, unknown>;'), 'the Inbox sender refuses a marketing template to an opted-out number before the payload and before dry-run (Preview reports it)');
  ok(/error: "opted_out", reason: OPT_OUT_REFUSAL_REASON/.test(swm), '…with a readable reason');
  /* At or after the opt-out release's marker (a later deploy bumps it again — 2026-10-01a, the hook pick). */
  ok((swm.match(/const BUILD_ID = "([^"]+)"/)?.[1] ?? '') >= '2026-09-30b', 'its build marker is bumped so the deploy can be proven');
  for (const [file, pattern] of [
    ['supabase/functions/process-whatsapp-queue/index.ts', /checkSuppressed\(service, \{ phone: row\.phone/],
    ['supabase/functions/_shared/first-reply-audit.ts', /checkSuppressed\(input\.service/],
    ['supabase/functions/_shared/auto-reply-rules.ts', /checkSuppressed|isSuppressed/],
    ['supabase/functions/bulk-jobs/index.ts', /checkSuppressed\(service/],
    ['supabase/functions/_shared/free-check-result.ts', /checkSuppressed\(service/],
  ] as const) ok(pattern.test(read(file)), `${file.split('/').slice(-2).join('/')} refuses any suppressed number (an opt-out included)`);
}

console.log('\n── recording an opt-out (recordOptOut) ──');
{
  type Row = { id: string; phone_e164: string | null; email: string | null; lead_id: string | null; reason: string | null; source: string | null; wrong_number_at: string | null };
  const fake = (rows: Row[]) => {
    const svc = {
      rows,
      from() {
        const f: [string, unknown][] = [];
        let op: 'select' | 'update' = 'select'; let patch: Partial<Row> = {};
        const match = () => rows.filter((r) => f.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
        const b = {
          select() { return b; }, eq(k: string, v: unknown) { f.push([k, v]); return op === 'update' ? Promise.resolve((match().forEach((r) => Object.assign(r, patch)), { error: null })) : b; },
          limit() { return b; }, not() { return b; },
          maybeSingle() { return Promise.resolve({ data: match()[0] ?? null, error: null }); },
          update(p: Partial<Row>) { op = 'update'; patch = p; return b; },
          upsert(p: Partial<Row>) { rows.push({ id: `n${rows.length}`, email: null, wrong_number_at: null, phone_e164: null, lead_id: null, reason: null, source: null, ...p }); return Promise.resolve({ error: null }); },
        };
        return b;
      },
    };
    return svc;
  };
  const archived = fake([{ id: 'a', phone_e164: '+447700900001', email: 'x@y.uk', lead_id: 'L1', reason: 'archived', source: 'backfill', wrong_number_at: null }]);
  ok(await recordOptOut(archived, { phone: '447700900001', leadId: 'L1' }, 'whatsapp_optout_inbound') === 'recorded' && archived.rows[0].reason === 'opted_out' && archived.rows[0].email === 'x@y.uk' && archived.rows.length === 1,
    'a number already suppressed for a weaker reason is UPGRADED to opted_out in place (email kept, no duplicate row)');
  ok(await recordOptOut(archived, { phone: '447700900001', leadId: 'L1' }, 'whatsapp_optout_inbound') === 'already', 'recording it again is a no-op');
  const wrong = fake([{ id: 'w', phone_e164: '+447700900002', email: null, lead_id: null, reason: 'wrong_number', source: 'lead_outcome', wrong_number_at: '2026-09-29' }]);
  await recordOptOut(wrong, { phone: '+447700900002' }, 'whatsapp_optout_inbound');
  ok(wrong.rows[0].reason === 'opted_out' && wrong.rows[0].wrong_number_at === '2026-09-29', 'on a Wrong number row the opt-out is recorded and the Wrong number mark is kept');
  const none = fake([]);
  ok(await recordOptOut(none, { phone: '447700900003', leadId: 'L3' }, 'whatsapp_optout_inbound') === 'recorded' && none.rows[0]?.reason === 'opted_out' && none.rows[0]?.phone_e164 === '+447700900003', 'a number never suppressed gets a new opted_out row');
  ok(await checkOptedOut(none, { phone: '447700900003' }) === true && await checkOptedOut(fake([]), { phone: '447700900009' }) === false, 'checkOptedOut sees it');
  const sql = read('supabase/migrations/20261001110000_conversation_triage.sql');
  ok(/opted_out/.test(sql), 'History has the opted_out kind');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
