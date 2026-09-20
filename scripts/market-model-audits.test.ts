/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MARKET-MODEL AUDITS — local / national / hybrid.

   WHAT THIS PINS. The manual audit used to ask a DELIVERY question ("how do clients work with
   you?") and treat the answer as geography. A national business was pushed down the local path and
   had a town injected into every question; the national path it should have taken generated ONE
   sentence pattern, so a 20- or 40-question national set was paraphrases of one query.

   NO PROVIDER CALLS. Everything below runs on the pure modules (marketModel.ts,
   auditQuestionContext.ts, seedGuard.ts) plus source assertions on create-ai-audit — the edge
   function cannot be executed here (no Deno) and calling it would cost real OpenAI/Apify money.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MARKET_MODEL_OPTIONS, MARKET_MODEL_QUESTION, NATIONAL_INTENTS,
  audienceUsefulFor, townRequiredFor, nationalIntentMix, nationalIntentDirective,
  hybridAllocation, hybridIntentDirective, nationalFallbackQuestions, marketVocabulary,
  type MarketContext,
} from '../src/lib/marketModel.ts';
import { buildAuditPreviewRequest, buildAuditRunRequest } from '../src/lib/auditQuestionContext.ts';
import { offTradeReason, dropOffTrade } from '../src/lib/seedGuard.ts';
import {
  OUTREACH_HOOK_QUESTIONS, BASELINE_QUESTIONS, BASELINE_RUNS, FULL_MEASURE_QUESTIONS,
  GENERATOR_ABSOLUTE_MAX_QUESTIONS,
} from '../src/lib/auditQuestionCounts.ts';
import { HOOK_MAX_QUESTIONS, planHookQuestions } from '../src/lib/hookAudit.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  console.log(`${value ? 'PASS' : 'FAIL'} ${message}`);
  if (!value) failures++;
}
const read = (p: string) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');
const fn = read('supabase/functions/create-ai-audit/index.ts');
const ui = read('src/pages/AiAudit.tsx');

/* ── FIXTURES ─────────────────────────────────────────────────────────────────────────────────── */

/** THE ACCEPTANCE CASE: Findable auditing itself. National, UK, no town, ever. */
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
  businessType: 'AI visibility service',
  region: 'uk',
  audience: 'UK local businesses',
  topics: FINDABLE.services,
  sectors: [],
};

/** THE LOCAL CASE: an existing trade that must not regress. */
const KIRKBRIDE = {
  business_name: 'Kirkbride Electrical',
  business_category: 'electrician',
  primary_location: 'Doncaster',
  country: 'UK',
  website: 'https://kirkbride-electrical.co.uk',
  has_website: true,
  market_model: 'local' as const,
  target_audience: 'homeowners',
  services: ['rewires', 'EV chargers', 'fuse board upgrades'],
  service_areas: ['Rotherham', 'Barnsley'],
  specialisms: [],
  specialist_sectors: [],
};

/** THE HYBRID CASE. */
const HYBRID = {
  business_name: 'Northfield Accountants',
  business_category: 'accountant',
  primary_location: 'Leeds',
  country: 'UK',
  website: 'https://northfield.example',
  has_website: true,
  market_model: 'hybrid' as const,
  target_audience: 'ecommerce businesses',
  services: ['self assessment', 'payroll', 'vat returns'],
  service_areas: [],
  specialisms: [],
  specialist_sectors: ['ecommerce'],
};

const TOWNS = ['doncaster', 'leeds', 'rotherham', 'barnsley', 'chiang mai', 'london', 'manchester'];
const namesATown = (q: string) => TOWNS.some((t) => q.toLowerCase().includes(t));

/* ── THE MODEL ITSELF ─────────────────────────────────────────────────────────────────────────── */
console.log('\n-- the three market models, and which fields each one needs --');
ok(MARKET_MODEL_QUESTION === 'Where do you serve customers?', 'the question asks about the MARKET, not about delivery');
ok(MARKET_MODEL_OPTIONS.map((o) => o.value).join(',') === 'local,national,hybrid', 'three models, in order');
ok(!/premises|work remotely \/ across|mix of both/i.test(MARKET_MODEL_OPTIONS.map((o) => `${o.label} ${o.blurb}`).join(' ')),
   'none of the old delivery wording survives');
ok(townRequiredFor('local') && townRequiredFor('hybrid') && !townRequiredFor('national'),
   'a town is required for local and hybrid and NOT for national');
ok(audienceUsefulFor('national') && audienceUsefulFor('hybrid') && !audienceUsefulFor('local'),
   'the audience field appears for national and hybrid only');

/* ── A. LOCAL ─────────────────────────────────────────────────────────────────────────────────── */
console.log('\n-- A. LOCAL: town required, local context preserved, nothing regressed --');
const localReq = buildAuditPreviewRequest(KIRKBRIDE, { questionCount: 5 });
ok(localReq.business_scope === 'local', 'the request carries business_scope local');
ok(localReq.location_text === 'Doncaster', 'the town travels');
ok(localReq.country === 'UK', 'the country travels');
ok(String(localReq.specialisms).includes('rewires') && String(localReq.specialisms).includes('EV chargers'),
   'the services/topics ground the generation');
ok(Array.isArray(localReq.service_areas) && (localReq.service_areas as string[]).length === 2,
   'the extra service areas travel as a list, not as extra towns to clone a query for');
ok(localReq.target_audience === undefined,
   'a local trade sends NO audience — the buyer is whoever is in the town');
ok(/scope !== "national" && scope !== "hybrid" && hasUsableTown\(locationText\)/.test(fn),
   'the town guard still binds LOCAL (and a null scope) — a local set cannot drift national');
ok(/const tradeVocabulary = market && \(forceNational \|\| forceHybrid\) \? marketVocabulary\(market\) : \[\];/.test(fn),
   'and the trade guard is NOT loosened for local: the vocabulary door is national/hybrid only');
ok(offTradeReason('fault diagnosis services in doncaster uk', 'electrician') !== null,
   'the local trade guard still rejects an off-trade question (the White Sparks fault)');

/* ── B. NATIONAL ──────────────────────────────────────────────────────────────────────────────── */
console.log('\n-- B. NATIONAL: no town, audience supported, diversified intents --');
const natReq = buildAuditPreviewRequest(FINDABLE, { questionCount: 20 });
ok(natReq.location_text === '', 'no town is sent');
ok(natReq.business_scope === 'national', 'the scope travels');
ok(natReq.target_audience === 'UK local businesses', 'the target audience travels');
ok(String(natReq.specialisms).includes('ChatGPT visibility'), 'the topics travel');
ok(NATIONAL_INTENTS.length === 7, 'seven intents are defined');
const mix20 = nationalIntentMix(20);
ok(mix20.reduce((a, r) => a + r.count, 0) === 20, 'a 20-question mix sums to exactly 20');
ok(mix20.length >= 5, `a 20-question mix spans ${mix20.length} intents, not one`);
const dir20 = nationalIntentDirective(20, FINDABLE_CTX);
ok(dir20.includes('NEVER name a town'), 'the national block forbids naming a town');
ok(dir20.includes('UK local businesses'), 'the national block names the target customer');
ok(!/\[specific service\] for \[audience\] \[country\]/.test(dir20),
   'the single "[service] for [audience] [country]" pattern is gone — it is what made 20 paraphrases');
ok(/PROBLEM \/ NEED/.test(dir20) && /CATEGORY DISCOVERY/.test(dir20) && /COMPARISON/.test(dir20),
   'problem, category and comparison intents are all asked for');

/* ── C. HYBRID ────────────────────────────────────────────────────────────────────────────────── */
console.log('\n-- C. HYBRID: both worlds, and not the same query twice --');
const hybReq = buildAuditPreviewRequest(HYBRID, { questionCount: 12 });
ok(hybReq.location_text === 'Leeds' && hybReq.business_scope === 'hybrid', 'a hybrid keeps its town AND its scope');
ok(hybReq.target_audience === 'ecommerce businesses', 'a hybrid sends an audience too');
ok(Array.isArray(hybReq.specialist_sectors) && (hybReq.specialist_sectors as string[])[0] === 'ecommerce',
   'sectors travel separately so they can be held to a minority');
const split = hybridAllocation(12);
ok(split.local === 6 && split.national === 6, '12 splits 6 local / 6 wider');
ok(hybridAllocation(3).local === 2 && hybridAllocation(3).national === 1, '3 splits 2 local / 1 wider');
const hybDir = hybridIntentDirective(12, { businessType: 'accountant', region: 'uk', audience: 'ecommerce businesses', topics: HYBRID.services, sectors: ['ecommerce'] }, 'Leeds UK');
ok(hybDir.includes('Leeds UK'), 'the local half pins the place');
ok(hybDir.includes('MUST NOT BE THE SAME QUESTION WITH AND WITHOUT THE TOWN'),
   'and the prompt forbids the town-swap pair explicitly');
ok(/forceHybrid\s*\?/.test(fn), 'the edge function FORCES a hybrid block instead of letting the model classify');
ok(/scope === "hybrid" && hasUsableTown\(locationText\)/.test(fn),
   'hybrid still pins the country marker on the questions that DO name the town');

/* ── D. A 40-QUESTION NATIONAL SET ────────────────────────────────────────────────────────────── */
console.log('\n-- D. 40 questions, national: the count is honoured and the intents are varied --');
const mix40 = nationalIntentMix(40);
ok(mix40.reduce((a, r) => a + r.count, 0) === 40, 'a 40-question mix sums to exactly 40 — no silent clamp to 3');
ok(mix40.length === 7, 'all seven intents are used at 40');
ok(mix40.every((r) => r.count <= 12), `no intent takes more than a third of the set (max ${Math.max(...mix40.map((r) => r.count))})`);
ok(GENERATOR_ABSOLUTE_MAX_QUESTIONS === 40, 'and 40 is within the generator’s named absolute ceiling');
const dir40 = nationalIntentDirective(40, FINDABLE_CTX);
ok((dir40.match(/^- \d+ x /gm) ?? []).length === 7, 'the prompt asks for a counted spread across all seven');

/* ── E. THE FINDABLE FIXTURE ──────────────────────────────────────────────────────────────────── */
console.log('\n-- E. Findable self-audit: 40 national UK questions, no town, ever --');
const findable40 = nationalFallbackQuestions('AI visibility service', FINDABLE_CTX, 40);
ok(findable40.length === 40, `40 questions produced (${findable40.length})`);
ok(new Set(findable40).size === 40, 'all 40 are distinct');
ok(findable40.every((q) => !namesATown(q)), 'NOT ONE names a town — no Chiang Mai, no fallback town injection');
ok(findable40.every((q) => !/near me/i.test(q)), 'and none says "near me"');
ok(findable40.some((q) => q.startsWith('who offers')), 'provider intent is present');
ok(findable40.some((q) => q.startsWith('who can help with')), 'problem intent is present');
ok(findable40.some((q) => q.includes('what companies provide')), 'category intent is present');
ok(findable40.some((q) => q.includes('uk local businesses')), 'the real audience is used, not a generic one');
ok(findable40.filter((q) => /^best |^top /.test(q)).length === 0, 'no broad head-terms');
const sampled = findable40.slice(0, 6);
console.log(`   sample: ${sampled.map((q) => `"${q}"`).join(' | ')}`);
/* The trade guard must not throw the problem-shaped questions away. */
const vocab = marketVocabulary(FINDABLE_CTX);
const problemQ = 'who can help if chatgpt recommends my competitors instead of my business';
ok(offTradeReason(problemQ, 'AI visibility service') !== null,
   'without the vocabulary door that question IS rejected (the fault being fixed)');
ok(offTradeReason(problemQ, 'AI visibility service', vocab) === null,
   'with the national vocabulary door it survives');
const kept = dropOffTrade([problemQ, ...findable40.slice(0, 5)], [], 6, 'AI visibility service', vocab);
ok(kept.questions.includes(problemQ) && kept.rejected.length === 0, 'and the whole national set survives the guard');

/* ── F. AN EXISTING LOCAL TRADE ───────────────────────────────────────────────────────────────── */
console.log('\n-- F. an existing local trade still generates sensible trade/location questions --');
ok(offTradeReason('emergency electrician in doncaster uk', 'electrician') === null, 'a local trade question passes');
ok(offTradeReason('rewire cost in doncaster uk', 'electrician') === null, 'and a service-led one passes');
ok(/const LOCAL_RULES = /.test(fn) && /Local framing is good/.test(fn), 'the LOCAL prompt rules are untouched');
ok(/SCOPE — FORCED LOCAL/.test(fn), 'and local is still hard-forced, never classified');

/* ── G. HOOK REGRESSION ───────────────────────────────────────────────────────────────────────── */
console.log('\n-- G. the outreach hook is untouched: adaptive 1 to 3, one run, explicitly classified --');
ok(HOOK_MAX_QUESTIONS === OUTREACH_HOOK_QUESTIONS && OUTREACH_HOOK_QUESTIONS === 3,
   'the hook ceiling is still 3');
const hookPlan = planHookQuestions([
  'how much does an electrician charge in Doncaster',
  'can you recommend a good electrician in Doncaster, UK',
  'who are the best electricians in Doncaster for a rewire',
  'emergency electrician Doncaster 24 hour',
], { town: 'Doncaster' });
ok(hookPlan.length === 3, 'the hook plan is still capped at 3');
ok(/hook_audit/.test(fn), 'hook audits are still explicitly marked hook_audit');
ok(/capHeads = false,/.test(fn), 'the head-term cap is still opt-in, so the hook is not capped');
ok(!/hook[^\n]*marketContext/i.test(fn), 'nothing routes the hook through the market-model context');
ok(/const marketContext: MarketContext \| null = businessScope/.test(fn),
   'the market context is null unless the caller sent a business_scope — every hook caller is unchanged');

/* ── H. PAID BASELINE REGRESSION ──────────────────────────────────────────────────────────────── */
console.log('\n-- H. the paid baseline is untouched: ~20 questions x 3 runs, frozen, replayed verbatim --');
ok(BASELINE_QUESTIONS === 20 && BASELINE_RUNS === 3, 'still 20 questions x 3 runs');
ok(FULL_MEASURE_QUESTIONS === 20, 'and the full measure is still 20');
ok(/const BASELINE_MAX_QUESTION_COUNT = 20;/.test(fn), 'the server ceiling is unchanged');
ok(/if \(providedQuestions && providedQuestions\.length\)/.test(fn),
   'a verbatim repeat still short-circuits generation entirely');
ok(/repeat_questions_unreadable/.test(fn), 'and a repeat that cannot read its own set still refuses');
ok(/isBaseline \|\| isMeasurement/.test(fn), 'baseline and measure still take the money-split generator');

/* ── I. REVIEW BEFORE SPEND ───────────────────────────────────────────────────────────────────── */
console.log('\n-- I. the review step still owns the spend decision --');
ok(/buildAuditRunRequest\(auditContext, \{/.test(ui),
   'confirm builds its body from the SAME context object as the preview — no second hand-written payload');
ok(/questions: clean,/.test(ui), 'and sends the reviewed questions verbatim');
const runReq = buildAuditRunRequest(FINDABLE, {
  questionCount: 20, questions: ['  who offers ai visibility services uk  ', '', 'ai seo uk'],
  moneyQuestions: ['ai seo uk', 'not in the set'],
});
ok((runReq.questions as string[]).length === 2, 'blank questions are dropped on the way out');
ok((runReq.money_questions as string[]).join() === 'ai seo uk',
   'a money flag for a question the operator deleted cannot arrive');
ok(runReq.business_scope === 'national' && runReq.target_audience === 'UK local businesses' && runReq.location_text === '',
   'the run request carries the same market context the preview was generated from');
ok(/Generated for <strong>/.test(ui), 'the review screen states the context the set was generated from');
ok(/preview: true/.test(read('src/lib/auditQuestionContext.ts')), 'the preview flag is still what stops DB writes');

/* ── UI WIRING ────────────────────────────────────────────────────────────────────────────────── */
console.log('\n-- the wizard asks the right question and shows the right fields --');
ok(/\{MARKET_MODEL_QUESTION\}/.test(ui), 'the wizard renders the shared question text');
ok(!/How do clients work with you\?/.test(ui), 'the old delivery question is gone from the screen');
ok(!/They come to my premises/.test(ui), 'and so are its options');
ok(/const needsTown = townRequiredFor\(businessScope\);/.test(ui), 'the town requirement is derived, not restated');
ok(/disabled=\{!needsTown\}/.test(ui), 'the town box is disabled for a national business');
ok(/Business category \/ what they do/.test(ui), 'the type field is relabelled');
ok(/Main services \/ topics/.test(ui) && /realistic searches customers might use/.test(ui),
   'the specialisms field is relabelled with its helper text');
ok(/Target customer \/ audience/.test(ui) && /\{showAudienceFields &&/.test(ui),
   'the audience field exists and is conditional');
ok(/Other service areas/.test(ui) && /\{needsTown &&/.test(ui), 'extra service areas show for local and hybrid only');

/* ── NO MIGRATION ─────────────────────────────────────────────────────────────────────────────── */
console.log('\n-- backward compatible: no new columns, no migration --');
ok(!/target_audience:/.test(fn.split('const auditRow')[1] ?? ''), 'target_audience is NOT written to a new column');
ok(/business_scope: businessScope,/.test(fn), 'the existing business_scope column is what persists the model');
ok(/specialisms: normalizeAuditList\(\[\.\.\.services, \.\.\.specialisms, \.\.\.sectors\]\)\.join/.test(read('src/lib/auditQuestionContext.ts')),
   'services, specialisms and sectors merge into the column the audit row already has');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
if (failures > 0) process.exit(1);
