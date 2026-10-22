/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHY THEY SAID NO (2026-10-01) — the one reason list, the one write, the one prompt, the dashboard.
   The SQL itself (permissions, History rows, the clear on leaving Not interested) was proved live in a
   rolled-back transaction (docs/lost-reason.md §5); this suite fences the code that depends on it.
   Run: npx tsx scripts/lost-reason.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LOST_REASONS, LOST_REASON_NOTE_MAX, LOST_REASON_UNRECORDED, lostReasonLabel, lostReasonProblem } from '../src/lib/lostReason.ts';
import { activityDetail, ACTIVITY_LABEL } from '../src/lib/salesCrm.ts';
import { foldAdminOverview, type AdminInput, type AdminLead, type AdminActivity } from '../src/lib/adminMetrics.ts';
import { buildExclusions } from '../src/lib/metricExclusions.ts';
import { resolvePeriod, addDays } from '../src/lib/reportingPeriod.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* ── 1. One list, in TypeScript and SQL ───────────────────────────────────────────────────────── */
console.log('── the reason list ──');
const sql = read('supabase/migrations/20261002200000_lost_reason.sql');
const values = LOST_REASONS.map((r) => r.value);
const lists = [...sql.matchAll(/lost_reason in \(([^)]+)\)|_reason not in \(([^)]+)\)/g)].map((m) => [...(m[1] ?? m[2]).matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
ok(lists.length === 2, 'the SQL names the list twice (the CHECK and lead_set_lost_reason)');
for (const l of lists) ok(JSON.stringify(l) === JSON.stringify(values), `   …and each is exactly the TypeScript list (${l.length} reasons)`);
ok(values.length === 9 && values[values.length - 1] === 'other' && new Set(values).size === values.length, 'nine reasons, Other last, no duplicates');
ok((sql.match(/<= 300|> 300/g) ?? []).length === 2 && LOST_REASON_NOTE_MAX === 300, 'the note limit is the same 300 in the CHECK, the function and lostReason.ts');
ok(/_reason = 'other' and v_note is null/.test(sql) && /lost_reason is distinct from 'other' or char_length\(btrim/.test(sql), 'Other needs a note in the function AND in the table CHECK');
ok(/perform public\._require_work\(_lead_id\);/.test(sql), 'the write checks role + ownership first (the same rule as every lead write)');
ok(/v_status is distinct from 'not_interested'/.test(sql), 'a reason is only saved on a lead that is Not interested');
ok(/'lost_reason_set', jsonb_build_object\(\s*'reason', _reason, 'note', v_note, 'from_reason', v_from, 'from_note', v_from_note\)/.test(sql), 'every save writes History with the old and new values');
ok(/'transfer_requested', 'lost_reason_set'/.test(sql), 'the History kind is added to lead_activity_kind_check (with every existing kind kept)');
ok(/l\.lost_reason, l\.lost_reason_note\nfrom public\.outreach_leads l/.test(sql), 'the salesperson\'s view carries the reason (appended at the end)');
ok(!/update public\.outreach_leads set lost_reason/i.test(sql.replace(/update public\.outreach_leads\n\s+set lost_reason = _reason/, '')), 'no backfill: nothing writes a reason except the function');
const tsx = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? tsx(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
const srcFiles = tsx(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')).filter((p) => !p.includes('integrations'));
const literalLabels = srcFiles.filter((p) => /lostReason\.ts$/.test(p) === false && /['"]Doesn't see the value['"]|['"]Already has someone['"]/.test(readFileSync(p, 'utf8')));
ok(literalLabels.length === 0, `no second copy of the reason words in src (${literalLabels.join(', ') || 'none'})`);

/* ── 2. The pick rules ───────────────────────────────────────────────────────────────────────── */
console.log('── the pick rules ──');
ok(lostReasonProblem('too_expensive', null) === null, 'Too expensive with no note saves (a note is optional)');
ok(lostReasonProblem('too_expensive', 'Said £99 is more than they want to spend') === null, '…and with one');
ok(lostReasonProblem('other', '   ') !== null, 'Other with a blank note is refused');
ok(lostReasonProblem('other', 'Retiring next year') === null, 'Other with a note saves');
ok(lostReasonProblem('cheaper_elsewhere', null) !== null && lostReasonProblem(null, null) !== null, 'an unknown or missing reason is refused');
ok(lostReasonProblem('no_value', 'a'.repeat(LOST_REASON_NOTE_MAX + 1)) !== null, 'a note over the limit is refused');
ok(lostReasonLabel(null) === LOST_REASON_UNRECORDED && LOST_REASON_UNRECORDED === 'Reason not recorded', 'no reason reads "Reason not recorded"');
ok(lostReasonLabel('mystery') === 'mystery', 'an unknown stored value shows itself, never a wrong label');

/* ── 3. History ───────────────────────────────────────────────────────────────────────────────── */
console.log('── History ──');
const name = () => 'Sumi';
ok(ACTIVITY_LABEL.lost_reason_set === 'Why they said no', 'History titles the row "Why they said no"');
ok(activityDetail({ kind: 'lost_reason_set', data: { reason: 'too_expensive', note: 'Said £99/month is more than they want to spend', from_reason: null } }, name) === 'Reason: Too expensive\nNote: Said £99/month is more than they want to spend', 'a first reason: the reason and the note');
ok(activityDetail({ kind: 'lost_reason_set', data: { reason: 'has_provider', note: null, from_reason: 'too_expensive' } }, name) === 'Reason: Already has someone (was Too expensive)', 'a correction keeps what it was');

/* ── 4. The dashboard ─────────────────────────────────────────────────────────────────────────── */
console.log('── the dashboard ──');
const PAUL = 'p0000000-0000-0000-0000-000000000001';
const REP = 'r0000000-0000-0000-0000-000000000002';
const TEST = 't0000000-0000-0000-0000-000000000003';
const NOW = Date.parse('2026-09-30T14:00:00Z');
const at = (daysAgo: number) => new Date(Date.parse(`${addDays('2026-09-30', -daysAgo)}T10:00:00Z`)).toISOString();
let seq = 0;
const lead = (o: Partial<AdminLead> = {}): AdminLead => ({
  id: `L${++seq}`, business_name: `Biz ${seq}`, created_at: at(60), added_by_user_id: PAUL, assigned_to_user_id: REP, sold_by_user_id: null, sold_at: null,
  status: 'not_interested', amount_paid: null, is_potential_work: null, call_booked_at: null, whatsapp_sent_at: null, next_action: null, next_action_date: null,
  is_archived: false, phone: null, email: null, search_keyword: 'plumber', category: null, payment_date: null, refunded_at: null,
  service_terminated_at: null, subscription_status: null, contract_total_payments: null, baseline_audit_id: null, remeasure_due_date: null, remeasure_audit_id: null, ...o,
});
const no = (l: AdminLead, daysAgo: number, who: string = REP): AdminActivity => ({ lead_id: l.id, actor_user_id: who, kind: 'stage_changed', data: { from: 'replied', to: 'not_interested' }, created_at: at(daysAgo) });
const base = (leads: AdminLead[], activity: AdminActivity[], period = '30d'): AdminInput => {
  const p = (k: string) => resolvePeriod(k, NOW);
  return {
    period: p(period), today: p('today'), yesterday: p('yesterday'), week: p('week'), month: p('mtd'), nowMs: NOW, bookOwnerId: PAUL,
    people: [{ userId: PAUL, name: 'Paul', role: 'admin', excluded: false }, { userId: REP, name: 'Sumi', role: 'sales', excluded: false }, { userId: TEST, name: 'test1', role: 'sales', excluded: true }],
    exclusions: buildExclusions([{ kind: 'user', value: TEST, reason: 'test' }]),
    leads, messages: [], activity, suppressions: [], ledger: [], onboarding: [],
    commissionLines: [], commissionTotals: null, commissionDueBySeller: new Map(), payoutsBySeller: new Map(),
    cost: { period: [], today: [], yesterday: [], week: [], month: [] },
  };
};
const rec = (reason: string, note: string | null = null) => ({ lost_reason: reason, lost_reason_note: note, lost_reason_recorded_at: at(2), lost_reason_recorded_by: REP });
const A = lead(rec('too_expensive', 'Said £99/month is too much'));
const B = lead(rec('too_expensive'));
const C = lead(rec('other', 'Retiring next year'));
const D = lead();                                         // said no in the period, no reason → unrecorded, never guessed
const E = lead();                                         // Not interested with no "no" in History at all (old row)
const F = lead(rec('too_expensive'));                     // the "no" was a test account's → excluded
const G = lead({ status: 'opted_out', ...rec('too_expensive') }); // an opt-out is not a sales no
const H = lead(rec('no_value'));                          // said no before the period
const I = lead({ status: 'replied' });                    // revived: not a no now
const leads = [A, B, C, D, E, F, G, H, I];
const acts = [no(A, 3), no(B, 5), no(C, 1), no(D, 4), no(F, 2, TEST), no(G, 2), no(H, 45), no(I, 6)];
const lr = foldAdminOverview(base(leads, acts)).lostReasons;
ok(lr.saidNo === 4 && lr.recorded === 3 && lr.unrecorded === 1, `30 days: 4 said no, 3 with a reason, 1 not recorded (got ${lr.saidNo}/${lr.recorded}/${lr.unrecorded})`);
ok(lr.rows[0]?.key === 'too_expensive' && lr.rows[0].count === 2 && lr.rows[0].pct === 67, 'Too expensive 2 · 67% of the leads with a reason');
ok(lr.rows[1]?.key === 'other' && lr.rows[1].count === 1 && lr.rows[1].pct === 33 && lr.rows[1].leads[0]?.note === 'Retiring next year', 'Other 1 · 33%, listed with its note');
ok(lr.rows.length === 2, 'only reasons that happened are listed');
ok(lr.unrecordedLeads.map((l) => l.id).join() === D.id, '"Reason not recorded" lists the lead that said no without one');
ok(!lr.rows.some((r) => r.leads.some((l) => [F.id, G.id, H.id, I.id].includes(l.id))), 'a test account\'s no, an opt-out, a no before the period and a revived lead are not counted');
ok(lr.rows[0].leads[0].who === 'Sumi' && lr.rows[0].leads[0].id === A.id, 'each lead says who recorded it, newest first');
const J = lead(rec('too_expensive'));
const lr2 = foldAdminOverview(base([...leads, J], [...acts, no(J, 0)])).lostReasons;
ok(lr2.rows[0].count === 3 && lr2.rows[0].pct === 75 && lr2.recorded === 4, 'one more Too expensive: the count goes up and the share is recomputed (3 of 4 = 75%)');
const all = foldAdminOverview(base(leads, acts, 'all')).lostReasons;
ok(all.saidNo === 6 && all.unrecorded === 2, `all time: every lead Not interested now except the test one (got ${all.saidNo}, ${all.unrecorded} not recorded)`);
const none = foldAdminOverview(base([I], [no(I, 1)])).lostReasons;
ok(none.saidNo === 0 && none.rows.length === 0, 'nobody said no: an empty block, not an error');

/* ── 5. Where the prompt opens — the one trigger, every single-lead path ─────────────────────── */
console.log('── where it is asked ──');
const pill = read('src/components/PipelineStatusSelect.tsx');
ok(/if \(res === false \|\| res === null\) return;\s*if \(v === 'not_interested' && value !== 'not_interested' && askReasonFor\) askLostReason\(askReasonFor\);/.test(pill), 'the status pill asks after its caller\'s write, unless the caller says it was refused');
for (const [file, n] of [['src/components/OutreachTable.tsx', 1], ['src/components/LeadDetailDialog.tsx', 1], ['src/pages/Inbox.tsx', 2]] as const) {
  const s = read(file);
  const pills = (s.match(/<PipelineStatusSelect\b[\s\S]*?\/>/g) ?? []);
  ok(pills.length === n && pills.every((p) => /askReasonFor=/.test(p)), `${file}: every editable status pill (${n}) asks why`);
}
const inbox = read('src/pages/Inbox.tsx');
ok(/const handleSetStatus = async \(c: WaConversation, status: PipelineStatus\): Promise<boolean>/.test(inbox) && /description: r\.error, variant: 'destructive' \}\); return false; \}/.test(inbox), 'the Inbox says when its write was refused (no prompt then)');
const panel = read('src/components/LeadCrmPanel.tsx');
ok(/if \(outcome === 'not_interested' && res\.after\.state === 'not_interested' && !res\.failed\.length\) \{\s*askLostReason\(/.test(panel), 'the Work panel\'s Not interested outcome asks (popup and Focus Mode share it)');
const flowFile = read('src/components/LeadCallFlow.tsx');
ok(/if \(!lead \|\| lead\.status !== 'not_interested'\) return null;/.test(flowFile) && /data-testid="lost-reason"/.test(flowFile) && /LOST_REASON_UNRECORDED/.test(flowFile) && /\{lead\.lost_reason \? 'Change' : 'Add'\}/.test(flowFile), 'a Not interested lead shows its reason (or Reason not recorded) beside the status, with Change / Add');
ok(/whatsapp_sent_at, lost_reason, lost_reason_note/.test(panel), 'the Work panel reads the reason');
const askers = srcFiles.filter((p) => /askLostReason\(/.test(readFileSync(p, 'utf8')) && !/lostReasonAsk\.ts$/.test(p)).map((p) => p.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/')).sort();
ok(JSON.stringify(askers) === JSON.stringify(['src/components/LeadCallFlow.tsx', 'src/components/LeadCrmPanel.tsx', 'src/components/PipelineStatusSelect.tsx']), `only the pill, the logged outcome and the reason line's Change ask (bulk changes do not): ${askers.join(', ')}`);
const writers = srcFiles.filter((p) => /['"]lead_set_lost_reason['"]/.test(readFileSync(p, 'utf8'))).map((p) => p.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/'));
ok(JSON.stringify(writers) === JSON.stringify(['src/lib/lostReasonAsk.ts']), `one write: saveLostReason (${writers.join(', ')})`);
const shell = read('src/components/AppLayout.tsx');
ok((shell.match(/<LostReasonPrompt \/>/g) ?? []).length === 1, 'the prompt is mounted once, in the shell (it outlives an archived Outreach row)');
const prompt = read('src/components/LostReasonPrompt.tsx');
ok(/LOST_REASONS\.map/.test(prompt) && /Why did they say no\?/.test(prompt) && /'Skip'/.test(prompt), 'the prompt offers the one list, asks the question, and can be skipped');
const load = read('supabase/functions/_shared/admin-overview-load.ts');
ok(/lost_reason, lost_reason_note, lost_reason_recorded_at, lost_reason_recorded_by";/.test(load), 'the dashboard\'s load reads the four columns');
const dash = read('src/pages/Dashboard.tsx');
/* 2026-10-02 (the control-centre restructure): "Why prospects say no" now LEADS Sales intelligence. */
// The one-line "your own outreach is left out" note (My activity: hidden, 2026-10-02) may sit above it.
ok(/<Section title="Sales intelligence"[^>]*>\s*(\{o\.activityScope\?\.hidden && <p [^\n]*data-testid="intel-scope"[^\n]*<\/p>\}\s*)?<LostReasonsPanel o=\{o\} \/>/.test(dash), 'the Admin dashboard shows "Why prospects say no" in Sales intelligence, on the dashboard\'s period');

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall passed');
process.exit(fails ? 1 : 0);
