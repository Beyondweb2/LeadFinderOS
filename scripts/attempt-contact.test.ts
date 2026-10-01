/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ATTEMPT ≠ CONTACT ≠ WHATSAPP, EVERYWHERE (2026-10-01, docs/outreach-workspace.md §E). The claim rule, the
   SQL twin of openerReallySent, and the places the consistency sweep found still mixing them up.
   Live, rolled back: supabase/tests/claim-rule.sql (16 checks).
   Run: node scripts/run-tests.mjs attempt-contact
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { openerReallySent, STAMP_NOT_CONTACT_STATUSES, FAILED_SEND_STATUSES } from '../src/lib/leadState.ts';
import { inferTrade } from '../src/lib/tradeInference.ts';
import { refusalText } from '../src/lib/salesCrm.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const S = '2026-09-20T10:00:00Z';

console.log('── one rule for a send stamp, both sides ──');
ok(!openerReallySent({ status: 'not_contacted', whatsapp_sent_at: S }) && !openerReallySent({ status: 'queued', whatsapp_sent_at: S }), 'a lead put back to New / Queued after a failed send is not contacted');
ok(openerReallySent({ status: 'queued', whatsapp_sent_at: S, whatsapp_ever_delivered: true }), '…unless Meta once delivered to it');
ok([...FAILED_SEND_STATUSES].every((s) => STAMP_NOT_CONTACT_STATUSES.has(s)), 'every failed-send status is in the stamp rule');
const twin = read('supabase/migrations/20261001230100_opener_stamp_requeued.sql');
const sqlList = (twin.match(/not in \(([^)]*)\)/)?.[1] ?? '').split(',').map((x) => x.trim().replace(/'/g, ''));
ok(JSON.stringify([...sqlList].sort()) === JSON.stringify([...STAMP_NOT_CONTACT_STATUSES].sort()), `the SQL twin lists exactly the same statuses (${sqlList.join(', ')})`);

console.log('\n── claimable is sales eligibility, never a channel fact ──');
const mig = read('supabase/migrations/20261001230000_claim_rule_failed_sends.sql');
const block = mig.slice(mig.indexOf('function public.lead_claim_block('), mig.indexOf('revoke all on function public.lead_claim_block'));
ok(!/no_whatsapp|line_type|bounced/.test(block), 'the claim rule never mentions a channel (No WhatsApp, line type, a bounced email)');
for (const code of ['already_owned', 'archived', 'client', 'opted_out', 'not_interested', 'wrong_number', 'suppressed', 'already_contacted']) ok(block.includes(`'${code}'`), `blocks: ${code}`);
ok((mig.match(/public\.lead_claim_block\(/g) ?? []).length >= 4, 'claim_lead, sales_pool and Find Leads\' identity state all read the ONE rule');
ok(/public\.lead_opener_really_sent\(l\.status, l\.whatsapp_sent_at, l\.whatsapp_ever_delivered\)/.test(mig), 'lead_first_contact_at reads the stamp through the rule');
ok(/new\.status in \('delivered', 'read'\) or \(new\.status = 'sent' and v_person\)/.test(mig), 'an automatic send assigns the lead only once delivered (a person\'s send at once)');
ok(refusalText('not_interested').includes('cannot be claimed') && refusalText('suppressed').includes('cannot be claimed'), 'new refusals in words');

console.log('\n── the sweep\'s fixes ──');
ok(/reached: \(lead\.lastLogged\?\.reached \?\? false\) \|\| REACHED_OUTCOMES\.has\(outcome\)/.test(read('src/lib/leadOutcome.ts')), 'History never records a downgrade from a later no-answer');
ok(/c\.kind === 'whatsapp' \|\| REACHED_OUTCOMES\.has\(String\(c\.outcome \?\? ''\)\)\)\);\n\s+if \(first && inP\(first\.at, p\)\)/.test(read('src/lib/adminMetrics.ts')), 'the rep cohort counts the first REACHED contact, like the funnel');
const NOTSENT = '.or("status.is.null,status.not.in.(failed,failed_temporary,simulated)")';
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(q.split(NOTSENT).length - 1 === 2 && !/\.neq\("status", "failed"\)\n\s+\/\*/.test(q), 'the queue\'s contact_check and cold guard ignore sends that never left');
ok(read('supabase/functions/send-whatsapp-message/index.ts').includes(NOTSENT), 'the Inbox cold guard too');
ok(/template_name", "initial_contact"\)\.in\("status", \["sent", "delivered", "read"\]\)/.test(read('supabase/functions/_shared/contact-followup-eligibility.ts'))
  && /template_name", "audit_reply"\)\.in\("status", \["sent", "delivered", "read"\]\)/.test(read('supabase/functions/_shared/hook-followup-eligibility.ts')), 'a follow-up needs a REAL opener / report before it');
ok(/openerReallySent\(lead\) \?|if \(openerReallySent\(lead\)\)/.test(read('src/components/WhatsAppLeadControls.tsx')), 'the WhatsApp panel never says "Sent" for a refused send');
for (const f of ['src/pages/Focus.tsx', 'src/hooks/useInbox.ts']) ok(read(f).includes('isRealSend('), `${f}: a real send is isRealSend, not "not failed"`);
ok(!/'mobile' = WhatsApp-capable proxy/.test(read('src/types/outreach.ts')) && !/is the proxy for "WhatsApp-capable"/.test(read('src/lib/lineType.ts')), 'no comment still calls a mobile WhatsApp-capable');

console.log('\n── trades: the business\'s own website services count ──');
ok(inferTrade({ businessName: 'Dogs of Southsea', websiteServices: ['Dog Grooming', 'Nail Clip'] }).confidence === 'high', 'its own site\'s service list is a stored trade (high)');
ok(inferTrade({ businessName: 'SOUL PLUMBING UK LTD' }).confidence === 'medium', 'a name alone is still only for review');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
