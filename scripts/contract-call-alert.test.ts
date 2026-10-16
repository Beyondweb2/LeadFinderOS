/* ============================================================
   CONTRACT CALL ALERT (Paul, 2026-10-16) — docs/contract-call-alert.md

   Pins: "not sure" / "tied in" on ANY route → ONE email to Paul only (the operator alert sender), with the business,
   contact, a tap-to-call phone and the email FROM THE LEAD RECORD, what they ticked, the contract end date and a link to
   the lead; once per lead per answer (the ledger + claim, under a per-lead lock); a changed answer sends again; free to
   leave closes the dashboard line; the lead shows on "Needs your attention".

   Run: npx tsx scripts/contract-call-alert.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  contractAlertAnswer, contractAlertAnswerFromQuickClose, contractAlertAnswerFromRow, contractAlertEmail, contractAlertOpen,
  isAlertAnswer, newestContractAlerts, telHref, type ContractAlertRow,
} from '../src/lib/contractAlert';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

console.log('\n── 1. WHICH ANSWER (the ONE rule) ──');
ok(contractAlertAnswer(true, 'not_sure') === 'not_sure' && contractAlertAnswer(true, 'in_contract') === 'in_contract', 'agency + not sure / tied in');
ok(contractAlertAnswer(true, 'free') === 'free' && contractAlertAnswer(false, 'in_contract') === 'free', 'free to leave, or no agency = free (closes, never sends)');
ok(contractAlertAnswer(true, null) === null && contractAlertAnswer(null, 'not_sure') === null, 'unanswered = nothing recorded');
ok(contractAlertAnswerFromRow({ website_manager: 'web_company', agency_contract: 'not_sure' }) === 'not_sure' && contractAlertAnswerFromRow({ website_manager: 'direct_access', agency_contract: 'in_contract' }) === 'free' && contractAlertAnswerFromRow({ website_manager: null, agency_contract: 'not_sure' }) === null, 'the client page / manual row');
ok(contractAlertAnswerFromQuickClose({ manager: 'agency', agency_contract: 'in_contract' }) === 'in_contract' && contractAlertAnswerFromQuickClose({ manager: 'freelancer', agency_contract: 'not_sure' }) === 'not_sure' && contractAlertAnswerFromQuickClose({ manager: 'owner' }) === 'free' && contractAlertAnswerFromQuickClose({ manager: 'not_sure' }) === null, 'Quick Close / the Call screen');
ok(isAlertAnswer('not_sure') && isAlertAnswer('in_contract') && !isAlertAnswer('free') && !isAlertAnswer(null), 'only not sure and tied in send');

console.log('\n── 2. THE EMAIL ──');
{
  const base = { leadId: '11111111-2222-4333-8444-555555555555', business: 'ZZ QA Plumbing', contactName: 'Pat', phone: '07700 900123', email: 'pat@example.test', source: 'findable_onboarding' as const };
  const ns = contractAlertEmail({ ...base, answer: 'not_sure' });
  const ti = contractAlertEmail({ ...base, answer: 'in_contract', contractEnds: '2027-03-17', provider: 'Acme Web' });
  ok(ns.subject === 'CALL: ZZ QA Plumbing not sure about agency contract', 'not sure: "CALL: [business] not sure about agency contract"');
  ok(ti.subject === 'NO-GO: ZZ QA Plumbing tied into agency contract', 'tied in: "NO-GO: [business] tied into agency contract"');
  const t = ti.lines.join('\n');
  ok(/Business: ZZ QA Plumbing/.test(t) && /Contact: Pat/.test(t) && /Phone: 07700 900123/.test(t) && /Email: pat@example\.test/.test(t), 'business, contact, phone, email');
  ok(/Agency or provider: yes \(Acme Web\)/.test(t) && /Contract: tied in/.test(t) && /Contract ends: 17 March 2027/.test(t), 'what they ticked, with the end date');
  ok(/Contract ends: not given/.test(contractAlertEmail({ ...base, answer: 'in_contract' }).lines.join('\n')), 'tied in with no date says so');
  ok(/Open the lead: https:\/\/app\.leadfinderos\.com\/inbox\?lead=11111111-2222-4333-8444-555555555555/.test(t), 'a link to the lead in the CRM');
  ok(/<a href="tel:07700900123">07700 900123<\/a> \(tap to call\)/.test(ti.html), 'the phone is a tap-to-call link');
  ok(telHref('+44 7700 900123') === 'tel:+447700900123' && telHref('n/a') === null, 'tel links: digits and a leading +; nothing dialable → no link');
  ok(!/<script|javascript:/i.test(contractAlertEmail({ ...base, business: '<script>x</script>', answer: 'not_sure' }).html), 'everything in the HTML is escaped');
}

console.log('\n── 3. ONCE PER ANSWER (the ledger) ──');
{
  const sql = read('supabase/migrations/20261105090000_contract_call_alerts.sql');
  ok(/pg_advisory_xact_lock\(hashtext\('contract_alert:' \|\| _lead_id::text\)\)/.test(sql), 'one claim at a time per lead');
  ok(/if v_last is not distinct from _answer then return null; end if;/.test(sql), 'the same answer again (a refresh, a second save) claims nothing');
  ok(/if _answer = 'free' and v_last is null then return null; end if;/.test(sql), 'free with nothing to close records nothing');
  ok(/enable row level security/.test(sql) && /revoke all on public\.contract_call_alerts from anon, authenticated/.test(sql) && /grant execute on function public\.contract_alert_claim\(uuid, text, date, text, text\) to service_role/.test(sql), 'service role only');
  ok(!/drop |delete from|truncate/i.test(sql.replace(/--.*$/gm, '')), 'additive only');
  const step = read('supabase/functions/_shared/contract-alert.ts');
  ok(/service\.rpc\("contract_alert_claim"/.test(step) && /if \(!claimed\) return "repeat";/.test(step) && /if \(!isAlertAnswer\(i\.answer\)\) return "recorded";/.test(step), 'the step emails only after a successful claim of a not-sure / tied-in answer');
  ok(/from\("outreach_leads"\)\s*\.select\("id, business_name, contact_name, phone, email"\)/.test(step) && /phone: lead\?\.phone \?\? null, email: lead\?\.email \?\? null/.test(step), 'phone and email come from the LEAD record');
  ok(/sendOperatorAlert\(mail\.subject, mail\.lines, \{ html: mail\.html \}\)/.test(step) && !/\bto:/.test(step), 'sent through the operator alert sender — Paul only, no other recipient');
  const alert = read('supabase/functions/_shared/operator-alert.ts');
  ok(/export const OPERATOR_ALERT_TO = "paul@findable\.live";/.test(alert) && /to: \[OPERATOR_ALERT_TO\]/.test(alert), '…whose only recipient is Paul');
}

console.log('\n── 4. EVERY ROUTE ──');
{
  const fo = read('supabase/functions/findable-onboarding/index.ts');
  ok((fo.match(/await alertContractAnswer\(service,/g) ?? []).length === 3, 'findable-onboarding: the lead sign-up (and its copied link), a cold sign-up, the sales-held correction');
  ok(/source: "findable_onboarding", contractEnds: \(answers as Record<string, unknown>\)\.agency_contract_ends/.test(fo), '…with the contract end date they gave');
  ok(/answer: contractAlertAnswerFromQuickClose\(effectiveAnswers\(stored as QuickCloseRecord\)\), source: "sales_confirm"/.test(fo), '…and the client\'s own correction of a salesperson\'s answers');
  const qc = read('supabase/functions/quick-close/index.ts');
  ok(/if \(changed\.includes\("manager"\) \|\| changed\.includes\("agency_contract"\)\) \{\s*await alertContractAnswer\(service, \{ leadId, answer: contractAlertAnswerFromQuickClose\(answers\), source: "quick_close" \}\);/.test(qc), 'Quick Close / the Call screen, when the answer changes');
  ok(/source: "manual_onboarding"/.test(read('supabase/functions/paid-client-hub/index.ts')), 'Paul\'s manual onboarding');
  ok(/answer: values\.freeToLeave \? "free" : "in_contract", provider: values\.currentProvider \|\| null, source: "agreement"/.test(read('supabase/functions/client-agreement/index.ts')), 'the agreement page (tied in; free to leave closes it)');
}

console.log('\n── 5. NEEDS YOU (the dashboard) ──');
{
  const r = (id: string, lead: string, answer: string, at: string): ContractAlertRow => ({ id, lead_id: lead, answer, contract_ends: null, provider: null, source: 'quick_close', created_at: at });
  const newest = newestContractAlerts([r('a', 'L1', 'not_sure', '2026-10-16T10:00:00Z'), r('b', 'L1', 'free', '2026-10-16T11:00:00Z'), r('c', 'L2', 'in_contract', '2026-10-16T09:00:00Z')]);
  ok(newest.get('L1')?.answer === 'free' && newest.get('L2')?.answer === 'in_contract', 'the newest answer per lead wins');
  ok(!contractAlertOpen({ newest: newest.get('L1')!, actedAfter: false, isClient: false }), 'free to leave closes the line');
  ok(contractAlertOpen({ newest: newest.get('L2')!, actedAfter: false, isClient: false }), 'tied in stays on the list…');
  ok(!contractAlertOpen({ newest: newest.get('L2')!, actedAfter: true, isClient: false }) && !contractAlertOpen({ newest: newest.get('L2')!, actedAfter: false, isClient: true }), '…until someone acts on the lead, or it becomes a client');
  const am = read('src/lib/adminMetrics.ts');
  ok(/\[\.\.\.ta\.items, \.\.\.contractAttention\(input, facts, nameOf, actBy\)\]/.test(am) && /kind: notSure \? 'contract_not_sure' : 'contract_tied_in'/.test(am), 'the admin list carries them (not sure = today, tied in = review)');
  ok(/service\.from\("contract_call_alerts"\)\.select\("id, lead_id, answer, contract_ends, provider, source, created_at"\)/.test(read('supabase/functions/_shared/admin-overview-load.ts')), 'admin-overview reads the ledger');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
