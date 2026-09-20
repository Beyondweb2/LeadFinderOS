/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DISCOVERY AUDITS — 40 questions × ONE run, manual only.

   WHAT THIS PINS. Discovery buys COVERAGE with the runs a baseline spends on CONFIDENCE, so the
   two numbers that define it — 40 and 1 — are the two a regression would move first. And it is
   marked by its PURPOSE, never by its count: the generator's absolute ceiling is also 40, so a
   count-based marker would turn any caller asking for the maximum into a discovery audit.

   NO PROVIDER CALLS. Pure modules plus source assertions on create-ai-audit; the edge function
   cannot run here (no Deno) and calling it would cost real OpenAI and Apify money.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DISCOVERY_QUESTIONS, DISCOVERY_RUNS, FULL_MEASURE_QUESTIONS, BASELINE_QUESTIONS, BASELINE_RUNS,
  OUTREACH_HOOK_QUESTIONS, WIZARD_MIN_QUESTIONS, WIZARD_MAX_QUESTIONS, WIZARD_DEFAULT_QUESTIONS,
  GENERATOR_ABSOLUTE_MAX_QUESTIONS,
} from '../src/lib/auditQuestionCounts.ts';
import {
  DISCOVERY_AUDIT_PURPOSE, MEASUREMENT_AUDIT_PURPOSE, BASELINE_AUDIT_PURPOSE,
  auditKind, isInternalMeasurement, seoScanAllowed,
} from '../src/lib/auditKind.ts';
import { buildAuditPreviewRequest, buildAuditRunRequest } from '../src/lib/auditQuestionContext.ts';
import { nationalIntentMix, nationalFallbackQuestions, hybridAllocation, type MarketContext } from '../src/lib/marketModel.ts';
import { HOOK_MAX_QUESTIONS, planHookQuestions } from '../src/lib/hookAudit.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  console.log(`${value ? 'PASS' : 'FAIL'} ${message}`);
  if (!value) failures++;
}
const read = (p: string) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
/* Comments stripped so a declaration quoted in prose can never satisfy or defeat a check — the
   FOUNDER_PRICE_GBP lesson. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fn = strip(read('supabase/functions/create-ai-audit/index.ts'));
const ui = strip(read('src/pages/AiAudit.tsx'));

const FINDABLE = {
  business_name: 'Findable',
  business_category: 'AI visibility service',
  primary_location: '',
  country: 'UK',
  website: 'https://findable.live/',
  has_website: true,
  market_model: 'national' as const,
  target_audience: 'UK local businesses',
  services: ['AI visibility audits', 'AI SEO', 'GEO', 'ChatGPT visibility', 'local-business AI visibility'],
  service_areas: [],
  specialisms: [],
  specialist_sectors: [],
};
const FINDABLE_CTX: MarketContext = {
  businessType: 'AI visibility service', region: 'uk', audience: 'UK local businesses',
  topics: FINDABLE.services, sectors: [],
};
const KIRKBRIDE = {
  business_name: 'Kirkbride Electrical', business_category: 'electrician', primary_location: 'Doncaster',
  country: 'UK', website: 'https://kirkbride-electrical.co.uk', has_website: true,
  market_model: 'local' as const, services: ['rewires', 'EV chargers', 'fuse board upgrades'],
  service_areas: ['Rotherham'], specialisms: [], specialist_sectors: [],
};
const HYBRID = {
  business_name: 'Northfield Accountants', business_category: 'accountant', primary_location: 'Leeds',
  country: 'UK', website: 'https://northfield.example', has_website: true,
  market_model: 'hybrid' as const, target_audience: 'ecommerce businesses',
  services: ['self assessment', 'payroll', 'vat returns'], service_areas: [],
  specialisms: [], specialist_sectors: ['ecommerce'],
};
const TOWNS = ['doncaster', 'leeds', 'rotherham', 'chiang mai', 'london', 'manchester'];
const namesATown = (q: string) => TOWNS.some((t) => q.toLowerCase().includes(t));

/* ── THE INVARIANT: 40 × 1 ────────────────────────────────────────────────────────────────────── */
console.log('\n-- the two numbers that define discovery --');
ok(DISCOVERY_QUESTIONS === 40, 'DISCOVERY_QUESTIONS is 40');
ok(DISCOVERY_RUNS === 1, 'DISCOVERY_RUNS is 1 — stated, not inferred from an absent value');
ok(DISCOVERY_QUESTIONS <= GENERATOR_ABSOLUTE_MAX_QUESTIONS,
   'and 40 sits at or under the generator’s named absolute ceiling, so nothing is silently truncated');
ok(/const DISCOVERY_MIN_QUESTION_COUNT = DISCOVERY_QUESTIONS;/.test(fn)
   && /const DISCOVERY_MAX_QUESTION_COUNT = DISCOVERY_QUESTIONS;/.test(fn)
   && /const DISCOVERY_DEFAULT_QUESTION_COUNT = DISCOVERY_QUESTIONS;/.test(fn),
   'the server’s min, max and default all derive from the one shared constant');

/* ⛔ THE RUN COUNT. baselineTargetRuns is what creates extra runs; discovery must not appear in it,
   which is what leaves it at 0 — a single ordinary ai_audit_run. Asserted as an ABSENCE from that
   one expression rather than as "runs === 1" somewhere, because the absence IS the mechanism. */
const runsExpr = (fn.match(/const baselineTargetRuns = [\s\S]*?;\n/) ?? [''])[0];
ok(runsExpr.length > 0, 'found the run-count expression in source');
ok(!/isDiscovery/.test(runsExpr),
   'discovery is absent from the run-count expression, so it stays at 0 — exactly ONE ai_audit_run');
ok(/\(isMeasurement \|\| isRemeasure\) \? MEASUREMENT_RUNS/.test(runsExpr),
   'and the measurement/replay 3-run rule beside it is untouched');

/* ── THE MARKER IS THE PURPOSE, NEVER THE COUNT ───────────────────────────────────────────────── */
console.log('\n-- discovery is explicit --');
ok(DISCOVERY_AUDIT_PURPOSE === 'discovery', 'the purpose value is "discovery"');
ok(/const isDiscovery: boolean = body\.purpose === DISCOVERY_AUDIT_PURPOSE;/.test(fn),
   'the server reads it from body.purpose and from nothing else');
ok(!/question_count === 40|questionCount === 40|questionCount === DISCOVERY/.test(fn),
   'no branch anywhere infers discovery from a question count');
ok(/isDiscovery \? DISCOVERY_AUDIT_PURPOSE/.test(fn), 'and it is what gets written to audit_purpose');
ok(auditKind({ audit_purpose: 'discovery', baseline_target_runs: 0 }) === 'ordinary',
   'a discovery row grades "ordinary" — never a baseline, never a reason to hold one');
ok(!isInternalMeasurement({ audit_purpose: 'discovery' }),
   'and it is NOT an internal measurement, so its report is not refused with 403');
ok(!seoScanAllowed('discovery'), 'it buys no website SEO scan — the allowlist is baseline only');

/* ── A. DISCOVERY NATIONAL ────────────────────────────────────────────────────────────────────── */
console.log('\n-- A. discovery, national (the Findable case): 40 x 1, no town, diverse intents --');
const natPrev = buildAuditPreviewRequest(FINDABLE, { questionCount: DISCOVERY_QUESTIONS, purpose: 'discovery' });
ok(natPrev.preview === true, 'the review step asks with preview:true — no DB writes, no queue rows');
ok(natPrev.purpose === 'discovery', 'the preview carries the discovery purpose');
ok(natPrev.question_count === 40, 'and asks for 40');
ok(natPrev.location_text === '' && natPrev.business_scope === 'national', 'no town, national scope');
ok(natPrev.target_audience === 'UK local businesses', 'the audience travels');
const mix = nationalIntentMix(40);
ok(mix.reduce((a, r) => a + r.count, 0) === 40 && mix.length === 7,
   `40 questions spread across all seven intents (${mix.map((r) => r.intent + ':' + r.count).join(' ')})`);
const nat40 = nationalFallbackQuestions('AI visibility service', FINDABLE_CTX, 40);
ok(nat40.length === 40 && new Set(nat40).size === 40, '40 distinct questions');
ok(nat40.every((q) => !namesATown(q)), 'NOT ONE names a town');
ok(nat40.every((q) => !/near me/i.test(q)), 'and none says "near me"');
ok(nat40.filter((q) => /^best |^top /.test(q)).length === 0, 'no broad head-terms');

/* ── B. DISCOVERY LOCAL ───────────────────────────────────────────────────────────────────────── */
console.log('\n-- B. discovery, local: 40 x 1, town kept, local framing --');
const locRun = buildAuditRunRequest(KIRKBRIDE, {
  questionCount: DISCOVERY_QUESTIONS, purpose: 'discovery',
  questions: Array.from({ length: 40 }, (_, i) => `electrician question ${i + 1} in doncaster uk`),
});
ok(locRun.purpose === 'discovery' && locRun.question_count === 40, 'the run request is discovery at 40');
ok((locRun.questions as string[]).length === 40, 'and carries all 40 reviewed questions');
ok(locRun.location_text === 'Doncaster' && locRun.business_scope === 'local', 'the town and scope travel');
ok(locRun.target_audience === undefined, 'a local discovery sends no audience — the buyer is the town');
ok(/scope !== "national" && scope !== "hybrid" && hasUsableTown\(locationText\)/.test(fn),
   'the town guard still binds a local discovery, so its 40 cannot drift national');

/* ── C. DISCOVERY HYBRID ──────────────────────────────────────────────────────────────────────── */
console.log('\n-- C. discovery, hybrid: 40 x 1, split across both markets --');
const hybPrev = buildAuditPreviewRequest(HYBRID, { questionCount: DISCOVERY_QUESTIONS, purpose: 'discovery' });
ok(hybPrev.business_scope === 'hybrid' && hybPrev.location_text === 'Leeds', 'scope and town travel');
const split = hybridAllocation(40);
ok(split.local === 20 && split.national === 20, '40 splits 20 local / 20 wider');
ok(split.local + split.national === 40, 'and the halves still sum to the requested count');

/* ── D. HOOK REGRESSION ───────────────────────────────────────────────────────────────────────── */
console.log('\n-- D. the outreach hook is untouched: adaptive 1 to 3, one run --');
ok(HOOK_MAX_QUESTIONS === OUTREACH_HOOK_QUESTIONS && OUTREACH_HOOK_QUESTIONS === 3, 'still 3');
ok(planHookQuestions(['a in Doncaster', 'b in Doncaster', 'c in Doncaster', 'd in Doncaster'], { town: 'Doncaster' }).length === 3,
   'the hook plan is still capped at 3');
ok(/const isHookAudit: boolean = hookAuditRequested && auditPurpose === ORDINARY_AUDIT_PURPOSE/.test(fn),
   'a hook is still ORDINARY purpose only — a discovery audit can never be routed into hook logic');
ok(/hook_audit/.test(fn), 'and it is still explicitly marked');

/* ── E. FULL MEASUREMENT REGRESSION ───────────────────────────────────────────────────────────── */
console.log('\n-- E. the full measurement is untouched: 20 x 3 --');
ok(FULL_MEASURE_QUESTIONS === 20, 'still 20 questions');
ok(/const MEASUREMENT_RUNS = 3;/.test(fn), 'still 3 runs');
ok(/const MEASUREMENT_MIN_QUESTION_COUNT = FULL_MEASURE_QUESTIONS;/.test(fn), 'and its ceiling is unmoved');
ok(MEASUREMENT_AUDIT_PURPOSE === 'measurement' && DISCOVERY_AUDIT_PURPOSE !== MEASUREMENT_AUDIT_PURPOSE,
   'the two purposes are distinct values');
ok(isInternalMeasurement({ audit_purpose: 'measurement' }), 'a measurement is still graded internal');

/* ── F. PAID BASELINE REGRESSION ──────────────────────────────────────────────────────────────── */
console.log('\n-- F. the paid baseline is untouched: 20 x 3, frozen, replayed verbatim --');
ok(BASELINE_QUESTIONS === 20 && BASELINE_RUNS === 3, 'still 20 x 3');
ok(/const BASELINE_MAX_QUESTION_COUNT = 20;/.test(fn), 'the server ceiling is unchanged');
ok(auditKind({ audit_purpose: BASELINE_AUDIT_PURPOSE, baseline_contract: { frozen: true } }) === 'paid_baseline',
   'a baseline still grades paid_baseline');
ok(/if \(providedQuestions && providedQuestions\.length\)/.test(fn),
   'a verbatim repeat still short-circuits generation entirely');
ok(seoScanAllowed('baseline'), 'and the baseline is still the only purpose that may buy the SEO scan');

/* ── G. REVIEW BEFORE SPEND ───────────────────────────────────────────────────────────────────── */
console.log('\n-- G. generating 40 questions creates no provider work --');
/* The preview branch returns before ANY write. Read from source: the early return is the mechanism,
   and a test that models it loosely passes while the real branch regresses. */
const previewBlock = (fn.match(/if \(preview\) \{[\s\S]*?\n    \}\n/) ?? [''])[0];
ok(previewBlock.length > 0, 'found the preview branch in source');
ok(/return json\(\{/.test(previewBlock), 'it returns from inside the branch');
ok(!/\.insert\(/.test(previewBlock) && !/ai_audit_queue/.test(previewBlock),
   'and inserts nothing — no audit row, no run, no queue row, so no Apify work can start');
ok(/isDiscovery/.test(previewBlock), 'discovery generates inside that branch, like every other mode');
ok(/Confirm & run/.test(read('src/pages/AiAudit.tsx')), 'the operator still has to press Confirm & run');
ok(/buildAuditRunRequest\(auditContext, \{/.test(ui) && /questions: clean,/.test(ui),
   'and confirming sends the reviewed set verbatim — nothing is regenerated between review and run');

/* ── H. AN ORDINARY WIZARD AUDIT IS NOT DISCOVERY ─────────────────────────────────────────────── */
console.log('\n-- H. a 3 or 5 question manual audit cannot become discovery --');
for (const n of [WIZARD_MIN_QUESTIONS, WIZARD_DEFAULT_QUESTIONS, WIZARD_MAX_QUESTIONS]) {
  const r = buildAuditPreviewRequest(KIRKBRIDE, { questionCount: n });
  ok(r.purpose === undefined, `a ${n}-question quick audit sends NO purpose (ordinary)`);
}
ok(buildAuditPreviewRequest(KIRKBRIDE, { questionCount: 40 }).purpose === undefined,
   'and even a 40-question request with no purpose stays ordinary — the count is not the marker');
ok(/const auditPurpose: 'measurement' \| 'discovery' \| null =/.test(read('src/pages/AiAudit.tsx')),
   'the wizard derives the purpose from the MODE, in one place');
ok(/auditMode === 'discovery' \? 'discovery' : null/.test(read('src/pages/AiAudit.tsx')),
   'and quick mode sends none');

/* ── UI ───────────────────────────────────────────────────────────────────────────────────────── */
console.log('\n-- the wizard offers three modes and says what each one costs in runs --');
ok(/label="Discovery"/.test(ui), 'the Discovery option is rendered');
ok(/label="Quick check"/.test(ui) && /label="Full measurement"/.test(ui), 'beside Quick check and Full measurement');
ok(/\$\{DISCOVERY_COUNT\} questions × \$\{DISCOVERY_RUNS\}/.test(ui),
   'its hint states 40 x 1 from the constants, never as typed numbers');
ok(/broad opportunity scan/.test(ui), 'and describes it as a breadth scan');
ok(!/provider cells/i.test(ui), 'no "120 provider cells" style jargon on the card');
ok(/Breadth, not confidence/.test(ui), 'the explainer says plainly that one ask is not a measurement');
ok(/type AuditMode = 'quick' \| 'full' \| 'discovery';/.test(ui), 'three modes, one type');
ok(/discovery/.test(strip(read('src/components/audit/AuditPills.tsx'))),
   'and the audit list labels a discovery row truthfully');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
if (failures > 0) process.exit(1);
