/* ============================================================
   COUNTRY AUTO-OFF ONLY ON A REAL PATTERN, AND A COUNTRY THAT IS OFF HOLDS ITS QUEUE (2026-10-22, fix/country-auto-off,
   docs/country-auto-off.md).

   Pins: the new rule (TS mirror ↔ SQL) — 22 Oct's one-failed-number switch-offs no longer happen, a real pattern or a
   systemic Meta code still does; its three settings; the switch-off stamp; the drip HOLDS an off country's leads (never
   releases them) while the UK is unchanged; the queue screen says the country is off, why and when.

   Run: npx tsx scripts/country-auto-off.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  COUNTRY_AUTO_OFF_DEFAULTS, COUNTRY_SYSTEMIC_CODES, countryAutoOffRule, countryAutoOffRuleWords, countryAutoPauseVerdict,
  type CountrySendOutcome,
} from '../src/lib/countryAutoPause.ts';
import { countrySettingsFrom, heldCountryOff, mobileMarketOf } from '../src/lib/outreachMarkets.ts';
import { countryOffChip, countryOffNote, deriveQueue, offTimeWords, rowCountryOff, type QueueRow } from '../src/lib/whatsappQueueView.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const MIG = read('supabase/migrations/20261122090000_country_auto_off_pattern.sql');
const DRIP = read('supabase/functions/process-whatsapp-queue/index.ts');
const at = (n: number) => new Date(Date.UTC(2026, 9, 22, 3, n)).toISOString();
const sends = (pattern: string, code: number | null = null): CountrySendOutcome[] =>
  [...pattern].map((c, i) => ({ at: at(i), failed: c === 'x', code: c === 'x' ? code : null }));

console.log('\n── 1. the rule ──');
{
  // 22 Oct, Australia, in send order: ok, FAIL (Start Me Up) — then after the switch back on: ok ok ok ok FAIL (Nifty).
  ok(!countryAutoPauseVerdict(sends('.x')).switchOff, '22 Oct: 1 failed of its first 2 → stays on');
  ok(!countryAutoPauseVerdict(sends('....x')).switchOff, '22 Oct: 1 failed of its first 5 → stays on');
  ok(!countryAutoPauseVerdict(sends('x')).switchOff, '14 Oct: one send, failed, no code → stays on (that lead alone is flagged)');
  ok(!countryAutoPauseVerdict(sends('xxxx')).switchOff, '4 of 4 failed → still under the minimum of 5');
  ok(countryAutoPauseVerdict(sends('xxxxx')).switchOff, '5 of 5 failed → off');
  ok(countryAutoPauseVerdict(sends('.....xxxxx')).switchOff, '5 of the last 10 failed (half) → off');
  ok(!countryAutoPauseVerdict(sends('x......xxxx')).switchOff, 'an old failure outside the last 10 no longer counts (4 of 10 → on)');
  ok(!countryAutoPauseVerdict(sends('x.x.x.x.x.x.....'.slice(0, 16))).switchOff, '6 failures spread over 16 sends, 3 in the last 10 → on');
  ok(countryAutoPauseVerdict(sends('xx.xx.x....', 131026)).switchOff === false, 'five 131026 failures but under half of the last 10 → on');
  ok(countryAutoPauseVerdict(sends('xx.xx.x.x.', 131026)).switchOff, '…six of the last 10, not on WhatsApp → off (a bad list is a pattern)');
  ok(countryAutoPauseVerdict(sends('.........x', 132015)).switchOff && countryAutoPauseVerdict(sends('x', 132015)).systemicCode === 132015,
    'one failure with a systemic code (template paused) → off at once');
  for (const c of [0, 190, 368, 130497, 131031, 131048, 132001, 132016]) {
    ok(countryAutoPauseVerdict(sends('x', c)).switchOff, `systemic: Meta ${c} → off`);
  }
  for (const c of [131026, 131049, 131050, 130429, 131000, 132018]) {
    ok(!countryAutoPauseVerdict(sends('x', c)).switchOff, `about one number / one message: Meta ${c} once → stays on`);
  }
  const strict = { whatsapp_auto_off_min_fails: 2, whatsapp_auto_off_window: 5, whatsapp_auto_off_fail_pct: 40 };
  ok(countryAutoPauseVerdict(sends('...xx'), strict).switchOff && !countryAutoPauseVerdict(sends('...xx')).switchOff, 'the settings change the rule');
  ok(COUNTRY_AUTO_OFF_DEFAULTS.minFails === 5 && COUNTRY_AUTO_OFF_DEFAULTS.window === 10 && COUNTRY_AUTO_OFF_DEFAULTS.failPct === 50, 'the defaults: 5 / 10 / 50%');
  ok(countryAutoOffRule({ whatsapp_auto_off_min_fails: null }).minFails === 5, 'NULL = the default');
  ok(/at least 5 sends fail and they are at least 50% of its last 10/.test(countryAutoOffRuleWords()), 'the rule in words carries the numbers');
}

console.log('\n── 2. the SQL says the same ──');
{
  ok(MIG.includes('coalesce(s.whatsapp_auto_off_min_fails, 5)') && MIG.includes('coalesce(s.whatsapp_auto_off_window, 10)')
    && MIG.includes('coalesce(s.whatsapp_auto_off_fail_pct, 50)'), 'the same defaults');
  ok(MIG.includes('select * from per order by at desc limit v_window'), 'counted over the last N sends');
  ok(MIG.includes('if v_sys_code is null and not (v_failed >= v_min_fails and v_failed * 100 >= v_pct * v_total) then'), 'the same condition');
  const arr = /v_systemic integer\[\] := array\[([^\]]+)\]/.exec(MIG)?.[1] ?? '';
  const sqlCodes = arr.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
  ok(sqlCodes.length === COUNTRY_SYSTEMIC_CODES.length && sqlCodes.every((c, i) => c === COUNTRY_SYSTEMIC_CODES[i]), 'the same systemic codes, in order');
  ok(!COUNTRY_SYSTEMIC_CODES.includes(131026), '131026 (not on WhatsApp) is never systemic');
  ok(!/set whatsapp_on = true/.test(MIG) && MIG.includes("_market not in ('MY', 'SG', 'AU')"), 'it only ever switches OFF, and only Malaysia / Singapore / Australia');
  ok(!/v_trial_fail|v_all <= 5/.test(MIG), 'the trial rule (any failure in the first 5) is gone');
  ok(/elsif k in \('whatsapp_auto_off_min_fails', 'whatsapp_auto_off_window', 'whatsapp_auto_off_fail_pct'\)/.test(MIG)
    && MIG.includes('n < 1 or n > 100') && MIG.includes("auto_off_fails_above_window"), 'the three settings: admin RPC, 1–100, failures ≤ window');
  ok(/if public\.my_role\(\) is distinct from 'admin' then raise exception 'admin_only'/.test(MIG), 'settings stay admin-only');
  ok(MIG.includes('new.whatsapp_off_at := now();') && MIG.includes('new.whatsapp_off_at := null;'), 'every switch-off is stamped; switching on clears it');
  ok(/then null else auth\.uid\(\) end/.test(MIG), 'the automatic switch-off is never credited to a person');
  ok(MIG.includes('new.whatsapp_auto_pause_reason := null;') && MIG.includes('new.whatsapp_on_since := now();'), 'switching on still restarts the count');
  ok(!/whatsapp_failure_country_check|whatsapp_my_sg_no_auto_retry/.test(MIG.replace(/^--.*$/gm, '')), 'the failure trigger and no-auto-retry are not redefined');
}

console.log('\n── 3. an OFF country holds its queue ──');
{
  const off = countrySettingsFrom([{ country: 'AU', whatsapp_on: false }, { country: 'MY', whatsapp_on: true }, { country: 'UK', whatsapp_on: false }]);
  ok(heldCountryOff(off, 'AU') && !heldCountryOff(off, 'MY'), 'Australia off → held; Malaysia on → not held');
  ok(!heldCountryOff(off, 'UK'), 'the UK is never held by this (it has the queue pause; unchanged)');
  ok(!heldCountryOff(off, null), 'no market → not held (the drip refuses it as before)');
  ok(heldCountryOff(countrySettingsFrom([]), 'SG'), 'unreadable settings → abroad is off → held (never sent)');
  ok(/const leadSendable = \(r: QRow\) => \{\s+if \(heldCountryOff\(countrySettings, rowMarket\(r\)\)\) return false;/.test(DRIP), 'the pick leaves held leads out (nothing written)');
  const held = DRIP.slice(DRIP.indexOf('if (heldCountryOff(countrySettings, coldMarket)) {'), DRIP.indexOf('if (isColdOutreachTemplate(templateName) && coldMarket && !channelOn('));
  ok(held.length > 0 && !held.includes('.update(') && held.includes('country_off_held'), 'the last exit holds too: no write');
  ok(DRIP.indexOf('if (heldCountryOff(countrySettings, coldMarket)) {') < DRIP.indexOf('if (isColdOutreachTemplate(templateName) && coldMarket && !channelOn('),
    'it runs before the old release (which now only the UK can reach)');
  ok(/HELD_PHONE_PREFIX[^=]*= \{ MY: "\+60", SG: "\+65", AU: "\+61" \}/.test(DRIP) && DRIP.includes('queuedFiltered.not("phone", "like",'), 'held countries are left out of the read by prefix (no starving the UK)');
  ok(mobileMarketOf('61403409954') === 'AU' && mobileMarketOf('60123456789') === 'MY' && mobileMarketOf('6591234567') === 'SG', 'the prefixes are those markets');
}

console.log('\n── 4. the queue screen ──');
{
  const s = countrySettingsFrom([{ country: 'AU', whatsapp_on: false, whatsapp_on_since: '2026-10-22T03:40:52Z', whatsapp_off_at: '2026-10-22T03:51:17Z',
    whatsapp_auto_paused_at: '2026-10-22T03:51:17Z',
    whatsapp_auto_pause_reason: 'WhatsApp to Australia switched itself off: 6 of its last 10 sends failed (Meta gave no error code). Check the failed sends before switching it back on.' }]);
  const now = new Date('2026-10-22T05:00:00Z');
  const n = countryOffNote('AU', s.AU, 70, now, 'Asia/Bangkok');
  ok(n?.title === 'Australia is off. 70 leads are waiting and will send when it is switched back on.', 'the headline: off, how many wait');
  ok(n?.why === 'Switched off automatically after failed sends, at 10:51.', 'why and when (the viewer’s own time — 10:51 in Bangkok)');
  ok(n?.detail?.startsWith('6 of its last 10 sends failed'), 'the stored reason, without repeating the headline');
  const manual = countrySettingsFrom([{ country: 'SG', whatsapp_on: false, whatsapp_on_since: '2026-10-17T04:08:45Z', whatsapp_off_at: '2026-10-21T02:00:00Z' }]);
  ok(countryOffNote('SG', manual.SG, 1, now, 'Asia/Bangkok')?.why === 'Switched off by hand at 09:00 on 21 Oct.', 'by hand, another day');
  ok(countryOffNote('MY', countrySettingsFrom([{ country: 'MY', whatsapp_on: true }]).MY, 3, now) === null, 'on → no note');
  ok(countryOffNote('UK', s.UK, 3, now) === null, 'the UK → no note');
  ok(offTimeWords('nonsense') === '', 'an unreadable time → no time, never "Invalid Date"');
  const au: QueueRow = { id: 'a', business_name: 'Nifty', status: 'queued', is_archived: false, queued_at: at(1), whatsapp_template: 'initial_contact_short',
    phone: '+61 413 000 000', country: 'Australia', contact_followup_queued_at: null, hook_followup_queued_at: null };
  ok(rowCountryOff(au, s) === 'AU' && countryOffChip('AU').label === 'Waiting: Australia is off', 'the row chip: Waiting: Australia is off');
  ok(deriveQueue([au], new Set(['UK'])).unsendable === 0, 'an off country’s mobile is waiting, never “no number WhatsApp can reach”');
  const panel = read('src/components/WhatsAppQueuePanel.tsx');
  ok(panel.includes('testId="queue-country-off"') && panel.includes('queue-tab-off-') && panel.includes('offMarket={rowCountryOff(l, countrySettings)}'),
    'the panel draws the note, the tab marker and the row chip');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
