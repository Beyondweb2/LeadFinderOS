/* ============================================================
   COUNTRY AUTO-OFF COUNTS ONLY UNEXPLAINED FAILURES (2026-10-22, fix/auto-off-counts, docs/country-auto-off.md).

   Pins: a failure that is not on WhatsApp (131026 / lead flagged No WhatsApp) or not settled yet is left out of the
   window entirely; systemic codes still switch a country off at once; the SQL rule and its TS mirror say the same;
   NULLs never drop a row; the check runs again when the lead is marked; the failed-sends list shows the stored reason;
   the held whatsapp-status is untouched; Australia's switch and hours are not written.

   Run: npx tsx scripts/auto-off-counts.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { COUNTRY_AUTO_OFF_DEFAULTS, countryAutoPauseVerdict, countryAutoOffRuleWords, type CountrySendOutcome } from '../src/lib/countryAutoPause.ts';
import { sendFailureReason } from '../src/lib/sendFailureReason.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const at = (m: number) => new Date(Date.UTC(2026, 9, 22, 8, 30 + m)).toISOString();
const send = (m: number, o: Partial<CountrySendOutcome> = {}): CountrySendOutcome => ({ at: at(m), failed: false, code: null, ...o });

console.log('\n── 1. the rule (TS mirror) ──');
ok(COUNTRY_AUTO_OFF_DEFAULTS.minFails === 5 && COUNTRY_AUTO_OFF_DEFAULTS.window === 10 && COUNTRY_AUTO_OFF_DEFAULTS.failPct === 50, 'defaults unchanged: 5 failures, 50 %, last 10');
// 22 Oct 08:31-08:50, Australia: 12 sends, 5 failed, 3 of them not on WhatsApp.
const run2 = [0, 2, 4, 6, 8, 9, 11, 13, 14, 16, 18, 19].map((m, i) => send(m, {
  failed: [3, 6, 7, 8, 11].includes(i), notOnWhatsApp: [3, 7, 8].includes(i),
}));
const v2 = countryAutoPauseVerdict(run2);
ok(!v2.switchOff && v2.failed === 2 && v2.sends === 9 && v2.notCounted === 3, `08:50 replay: ${v2.failed} of ${v2.sends} counted, ${v2.notCounted} not counted — stays on`);
ok(countryAutoPauseVerdict(run2.map((s) => ({ ...s, notOnWhatsApp: false }))).switchOff, 'the same sends under the old count WOULD switch it off (5 of 10)');
const unexplained = Array.from({ length: 10 }, (_, i) => send(i, { failed: i % 2 === 0 }));
ok(countryAutoPauseVerdict(unexplained).switchOff, '5 of 10 unexplained failures still switch it off');
ok(!countryAutoPauseVerdict(unexplained.map((s, i) => (i === 0 ? { ...s, unsettled: true } : s))).switchOff, 'a failure the webhook has not settled yet is not counted (4 of 9)');
ok(countryAutoPauseVerdict([send(0), send(1, { failed: true, code: 132015 })]).switchOff, 'a template paused (132015) still switches it off at once');
ok(countryAutoPauseVerdict([send(0), send(1, { failed: true, code: 131048 })]).switchOff, 'a quality / spam-rate error (131048) still switches it off at once');
ok(!countryAutoPauseVerdict(Array.from({ length: 10 }, (_, i) => send(i, { failed: true, code: 131026, notOnWhatsApp: true }))).switchOff, 'ten numbers not on WhatsApp never switch it off');
ok(/not on WhatsApp are not counted/.test(countryAutoOffRuleWords()), 'the settings line says numbers not on WhatsApp are not counted');

console.log('\n── 2. the SQL rule ──');
const mig = read('supabase/migrations/20261124090000_auto_off_unexplained_only.sql');
const code = mig.replace(/^\s*--.*$/gm, '');
ok(/create or replace function public\.country_whatsapp_auto_pause\(_market text\)/.test(code), 'country_whatsapp_auto_pause re-created');
ok(/coalesce\(p\.failed and \(p\.code = 131026 or l\.status = 'no_whatsapp' or l\.whatsapp_delivery_status = 'no_whatsapp'\), false\) as not_on_wa/.test(code), 'not on WhatsApp = 131026 or the lead flagged No WhatsApp, NULL-safe');
ok(/coalesce\(p\.failed and p\.code is null and p\.wamid is not null and l\.whatsapp_message_id = p\.wamid[\s\S]{0,300}, false\) as unsettled/.test(code), 'unsettled = the lead\'s current message, not marked yet, NULL-safe');
ok(/counted as \(\s*select \* from judged where not not_on_wa and not unsettled\s*\)/.test(code), 'both are left out of the window entirely');
ok(/v_systemic integer\[\] := array\[0, 3, 10, 190, 200, 368, 130497, 131031, 131042, 131045, 131048, 131057, 131063, 131064,\s*132001, 132007, 132015, 132016, 133010\]/.test(code), 'the systemic codes are unchanged');
ok(/coalesce\(s\.whatsapp_auto_off_min_fails, 5\)/.test(code) && /coalesce\(s\.whatsapp_auto_off_window, 10\)/.test(code) && /coalesce\(s\.whatsapp_auto_off_fail_pct, 50\)/.test(code), 'the three editable settings, same defaults');
ok(/revoke execute on function public\.country_whatsapp_auto_pause\(text\) from public, anon, authenticated/.test(code), 'still not callable by anon / authenticated');
ok(/create trigger trg_outreach_leads_country_check\s+after update of whatsapp_delivery_status, status on public\.outreach_leads/.test(code)
  && /execute function public\.whatsapp_failure_country_check\(\)/.test(code), 'the check runs again when the lead is marked failed');
ok(!/whatsapp_on\s*=\s*true|send_end_min|send_start_min|set_outreach_country|whatsapp_my_sg_no_auto_retry|whatsapp_outreach_state/.test(code.replace(/set whatsapp_on = false/g, '')), 'no switch-on, no hours, no other rule touched');

console.log('\n── 3. the failed-sends list shows the stored reason ──');
ok(sendFailureReason({ code: null, deliveryStatus: 'failed', leadStatus: 'no_whatsapp', leadDelivery: 'no_whatsapp' }).countsTowardAutoOff === false, 'No WhatsApp: not counted');
ok(/Number not on WhatsApp/.test(sendFailureReason({ code: null, deliveryStatus: 'failed', leadStatus: 'no_whatsapp', leadDelivery: 'no_whatsapp' }).words ?? ''), 'No WhatsApp: says so');
ok(/marked WhatsApp failed[\s\S]*not saved/.test(sendFailureReason({ code: null, deliveryStatus: 'failed', leadStatus: 'whatsapp_failed', leadDelivery: 'failed' }).words ?? ''), 'WhatsApp failed: says the code was not saved');
ok(/retried/.test(sendFailureReason({ code: null, deliveryStatus: 'failed', leadStatus: 'queued', leadDelivery: 'failed_temporary' }).words ?? ''), 'temporary: says it will be retried');
ok(sendFailureReason({ code: 132015, deliveryStatus: 'failed', leadStatus: null, leadDelivery: null }).words === null, 'a stored Meta code is shown by SendErrorNote, nothing added');
const comp = read('src/components/RecentSendFailures.tsx');
ok(/sendFailureReason\(/.test(comp) && /queue-failure-reason/.test(comp) && /AU: 'Australia'/.test(comp), 'the list uses it and names Australia');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/leadStatus: leadFlag\.get\(r\.lead_id as string\)\?\.status \?\? null/.test(q) && /if \(flErr\) return json\(\{ ok: false, error: "read_failed" \}, 500\)/.test(q), 'recent_failures returns the lead flag; a failed read is an error');

console.log('\n── 4. the held webhook is untouched ──');
ok(!/whatsapp-status/.test(code), 'the migration does not touch whatsapp-status');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
