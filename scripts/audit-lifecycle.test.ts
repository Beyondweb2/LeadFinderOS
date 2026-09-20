/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE THREE AUDIT ACTIONS — Run again · Start new audit · Delete audit.

   WHAT THIS PINS. The screen used to offer "Re-audit" and "Re-run": one minted a copy, the other
   added a run to the SAME audit, and neither label said which. Both decided what they were dealing
   with by reading columns in the browser, which is the trap that truncated Findable's 40-question
   discovery audit to 5. Every rule now comes from the STORED purpose, through one module.

   NO PROVIDER CALLS AND NO DATABASE WRITES. Pure modules plus source assertions.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  auditRepeatable, auditDeletable, repeatRunCount, prefillFromAudit, REPEATABLE_PURPOSES,
} from '../src/lib/auditLifecycle.ts';
import {
  BASELINE_AUDIT_PURPOSE, REMEASURE_AUDIT_PURPOSE, MEASUREMENT_AUDIT_PURPOSE,
  FREE_CHECK_AUDIT_PURPOSE, ORDINARY_AUDIT_PURPOSE, DISCOVERY_AUDIT_PURPOSE,
} from '../src/lib/auditKind.ts';
import { DISCOVERY_QUESTIONS } from '../src/lib/auditQuestionCounts.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  console.log(`${value ? 'PASS' : 'FAIL'} ${message}`);
  if (!value) failures++;
}
const read = (p: string) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ui = strip(read('src/pages/AiAudit.tsx'));
const lib = strip(read('src/lib/reAudit.ts'));

const DISCOVERY_40x3 = { audit_purpose: DISCOVERY_AUDIT_PURPOSE, baseline_target_runs: 3, is_measurement: false };
const DISCOVERY_40x1 = { audit_purpose: DISCOVERY_AUDIT_PURPOSE, baseline_target_runs: 1, is_measurement: false };
const QUICK = { audit_purpose: ORDINARY_AUDIT_PURPOSE, baseline_target_runs: null, is_measurement: false };
const FULL_MEASURE = { audit_purpose: MEASUREMENT_AUDIT_PURPOSE, baseline_target_runs: 3, is_measurement: true };
const PAID_BASELINE = { audit_purpose: BASELINE_AUDIT_PURPOSE, baseline_target_runs: 3, baseline_contract: { frozen: true } };
const REPLAY = { audit_purpose: REMEASURE_AUDIT_PURPOSE, baseline_target_runs: 3, is_measurement: true };
const FREE_CHECK = { audit_purpose: FREE_CHECK_AUDIT_PURPOSE, baseline_target_runs: 3 };
const LEGACY_SINGLE = { audit_purpose: null, baseline_target_runs: 1 };
const LEGACY_MULTI = { audit_purpose: null, baseline_target_runs: 3 };

/* ── RUN AGAIN ────────────────────────────────────────────────────────────────────────────────── */
console.log('\n-- RUN AGAIN: a NEW audit with the SAME configuration --');
ok([...REPEATABLE_PURPOSES].sort().join(',') === 'audit,discovery',
   'exactly two purposes may be repeated by hand — a positive list');

console.log('\n   A. discovery 40 x 3');
ok(auditRepeatable(DISCOVERY_40x3).ok, 'a discovery audit is repeatable');
ok(repeatRunCount(DISCOVERY_40x3) === 3, 'and it repeats at THREE runs, read from the stored column');

console.log('\n   B. discovery 40 x 1');
ok(auditRepeatable(DISCOVERY_40x1).ok && repeatRunCount(DISCOVERY_40x1) === 1, 'one run stays one run');
ok(repeatRunCount({ audit_purpose: DISCOVERY_AUDIT_PURPOSE, baseline_target_runs: null }) === 1,
   'and an absent run count means one, never zero runs');

console.log('\n   C/D. full measurement and quick audits');
ok(auditRepeatable(QUICK).ok && repeatRunCount(QUICK) === 1, 'a quick wizard audit is repeatable, at one run');
const fm = auditRepeatable(FULL_MEASURE);
ok(!fm.ok && /frozen baseline/.test(fm.reason ?? ''),
   'a FULL MEASUREMENT is not repeated by hand — it claims the lead full-measure pointer and starts from a frozen baseline');

console.log('\n   E/F. hook, free check, baseline, replay');
ok(auditRepeatable({ audit_purpose: ORDINARY_AUDIT_PURPOSE, baseline_target_runs: null }).ok,
   'an outreach hook audit is an ordinary row, so a repeat is an ordinary NEW audit — it never becomes adaptive by being copied');
ok(!/hook_audit/.test(lib), 'and runAgainFromSource never sends hook_audit, so no copy can enter the adaptive path');
const fc = auditRepeatable(FREE_CHECK);
ok(!fc.ok && /email them again/.test(fc.reason ?? ''), 'a free check is refused — a copy could email the visitor again');
const pb = auditRepeatable(PAID_BASELINE);
ok(!pb.ok && /day-28 replay/.test(pb.reason ?? ''), 'a paid baseline is refused — its repeat is the queue-fired replay');
const rp = auditRepeatable(REPLAY);
ok(!rp.ok && /one per baseline/.test(rp.reason ?? ''), 'a day-28 replay is refused — there is one, ever');

console.log('\n   legacy rows');
ok(auditRepeatable(LEGACY_SINGLE).ok, 'a single-run row from before the purpose column is repeatable');
ok(!auditRepeatable(LEGACY_MULTI).ok,
   'a multi-run legacy row is refused — a baseline and a free check are identical on those columns');

console.log('\n   what the copy carries');
ok(/audit_purpose, baseline_target_runs/.test(lib),
   'the copy carries the stored purpose AND the run count — without them a 40x3 discovery repeated as 5x1');
ok(!/is_measurement/.test(lib) && !/baseline_completed_at/.test(lib),
   'and does NOT carry the finalised-state markers: a repeat has measured nothing yet');
ok(/body: \{ audit_id: \(created as \{ id: string \}\)\.id, questions: clean \}/.test(lib),
   'the request names the new audit and its questions; the server reads the purpose from the row');
ok(/const clean = opts\.questions\.map\(\(q\) => \(q \?\? ''\)\.trim\(\)\)\.filter\(Boolean\);/.test(lib),
   'only blanks are dropped — no sort, no dedupe, so the order survives exactly');
ok(!/generateQuestions|preview: true/.test(lib), 'and nothing is regenerated');

/* ── START NEW AUDIT ──────────────────────────────────────────────────────────────────────────── */
console.log('\n-- START NEW AUDIT: the same business, everything else open --');
const NAT = { business_name: 'Findable', business_type: 'AI visibility service', location_text: null, country: 'UK', has_website: true, website: 'https://findable.live/', business_scope: 'national', specialism: 'AI visibility audits, AI SEO, GEO' };
const nat = prefillFromAudit(NAT);
ok(nat.businessScope === 'national' && nat.locationText === '', 'A. a national audit prefills National with a blank town');
ok(nat.specialisms.includes('AI SEO') && nat.businessName === 'Findable', 'and keeps the services/topics and the name');

const LOC = { business_name: 'Kirkbride Electrical', business_type: 'electrician', location_text: 'Doncaster', country: 'UK', has_website: true, website: 'https://k.example', business_scope: 'local', specialism: 'rewires, EV chargers' };
const loc = prefillFromAudit(LOC);
ok(loc.businessScope === 'local' && loc.locationText === 'Doncaster', 'B. a local trade keeps Local and its town');
ok(loc.businessType === 'electrician' && loc.specialisms.includes('rewires'), 'and its category and services');

const hyb = prefillFromAudit({ business_scope: 'hybrid', location_text: 'Leeds', business_type: 'accountant' });
ok(hyb.businessScope === 'hybrid' && hyb.locationText === 'Leeds', 'C. hybrid context is retained');

ok(prefillFromAudit({ has_website: false }).hasWebsite === false, 'a stored "no website" stays false, not null');
ok(prefillFromAudit({}).hasWebsite === null, 'and an unknown one stays null — absence is not "no"');
ok(prefillFromAudit({ business_scope: 'nonsense' }).businessScope === null, 'an unrecognised scope reads as unset');
ok(prefillFromAudit(null).businessName === '', 'and a missing row does not throw');

console.log('\n   D. the operator may change everything');
ok(/setAuditMode\('quick'\); setQuestionCount\(defaultCountForMode\('quick'\)\); setDiscoveryRuns\(DISCOVERY_RUNS\);/.test(ui),
   'mode, count and discovery runs are RESET to defaults, so the previous audit cannot decide the new one');
ok(/setQuestions\(\[\]\); setPreviewMoney\(\[\]\); setUnitCost\(0\);/.test(ui),
   'and the question list is cleared — the wizard generates fresh at the review step');
ok(/setFormOpen\(true\);/.test(ui), 'the wizard opens');
const prefillFn = (ui.match(/const startNewAuditFromThis = \(\) => \{[\s\S]*?\n  \};/) ?? [''])[0];
ok(prefillFn.length > 0, 'found the Start new audit handler');
ok(!/supabase\.functions\.invoke|\.insert\(/.test(prefillFn),
   'it spends NOTHING — no function call, no insert; review-before-spend is unchanged');

/* ── DELETE ───────────────────────────────────────────────────────────────────────────────────── */
console.log('\n-- DELETE AUDIT: only audit-owned data, and never the guarantee --');
ok(auditDeletable(QUICK).ok, 'A. a completed ordinary audit can be deleted');
ok(auditDeletable(DISCOVERY_40x1).ok && auditDeletable(DISCOVERY_40x3).ok, 'B. a discovery audit can be deleted');
ok(auditDeletable(FULL_MEASURE).ok, 'a full measure can be deleted — its pointer is re-claimable by running another');
const dpb = auditDeletable(PAID_BASELINE);
ok(!dpb.ok && /refund is judged/.test(dpb.reason ?? ''), 'E. a PAID BASELINE is protected');
const drp = auditDeletable(REPLAY);
ok(!drp.ok && /one per baseline/.test(drp.reason ?? ''), 'and so is the day-28 replay');
ok(!auditDeletable(LEGACY_MULTI).ok, 'an ambiguous legacy multi-run row is protected too — it fails closed');
ok(auditDeletable(LEGACY_SINGLE).ok, 'a single-run legacy row is deletable');

console.log('\n   D. work in flight is stopped first');
const delFn = (ui.match(/const deleteAudit = async \(\) => \{[\s\S]*?\n  \};/) ?? [''])[0];
ok(delFn.length > 0, 'found the delete handler');
ok(/auditDeletable\(openAuditRow\)/.test(delFn), 'it re-asks the rule before acting, not just on render');
ok(/if \(!TERMINAL\.has\(r\.status\)\) await cancelRun\(r\.id\)/.test(delFn),
   'every unsettled run is cancelled FIRST, through the existing Stop path — no second cancellation system');
ok(delFn.indexOf('cancelRun') < delFn.indexOf(".delete()"), 'and the cancel happens before the delete');
ok(/from\('ai_audits'\)\.delete\(\)\.eq\('id', auditId\)/.test(delFn),
   'F. only the ai_audits row is deleted — runs and queue rows go by ON DELETE CASCADE, so no orphans');
ok(!/outreach_leads|whatsapp|client_pages/.test(delFn),
   'and nothing else is touched: the lead, its messages and its pages are SET NULL by the schema, not deleted');

/* ── THE AMBIGUITY IS GONE ────────────────────────────────────────────────────────────────────── */
console.log('\n-- one meaning per action --');
ok(/label="?Run again"?|>Run again</.test(ui) || /<span className="flex-1">Run again<\/span>/.test(ui), 'the menu offers Run again');
ok(/<span className="flex-1">Start new audit<\/span>/.test(ui), 'and Start new audit');
ok(/<span className="flex-1">Delete audit<\/span>/.test(ui), 'and Delete audit');
ok(!/>Re-audit</.test(ui) && !/flex-1">Re-audit</.test(ui), 'the old "Re-audit" label is gone');
ok(!/flex-1">Re-run</.test(ui), 'the old "Re-run" action is gone');
ok(!/confirmReRun|startReRun|reRunQuestions|reRunEditing/.test(ui),
   'and its handlers and persisted state are deleted, not left dangling');
ok(/Re-run SEO scan/.test(ui), 'the SEO scan keeps its own separate, genuinely different action');
ok(/New audit — blank/.test(ui), 'the blank-wizard entry is renamed so it cannot be read as "Start new audit"');

console.log('\n   run again is a confirmation, not an editor');
const dialog = (ui.match(/\{reAuditOpen && \([\s\S]*?\n              \)\}/) ?? [''])[0];
ok(dialog.length > 0, 'found the Run again dialog');
ok(!/<Input/.test(dialog) && !/Add question/.test(dialog) && !/Paste a list/.test(dialog),
   'it cannot edit, add or paste questions — "run it again" and "measure something else" are different buttons now');
ok(/runAgainRuns/.test(dialog) && /estimated cost/.test(dialog),
   'and it states the run count and the cost before anything is created');
ok(DISCOVERY_QUESTIONS === 40, 'a 40-question discovery set is what this repeats');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
if (failures > 0) process.exit(1);
