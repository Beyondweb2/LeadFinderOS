/* ============================================================
   FIX/04 — BUSINESS TRUTH, CUSTOMER QUESTIONS AND THE FINAL-20 CHECKS (2026-10-04).
   docs/pre-sales-certification/fixes-04-ai-measurement.md.

   Session C's truth set: a Canterbury locksmith (MCLocksmiths' 15 client-confirmed services) who does
   NOT do car keys. Discovery wrote "car keys and auto locksmith in Canterbury UK", nothing flagged it,
   approval seeded it into the backlog, and the recommended 20 had no plain "locksmith in Canterbury"
   question, 4 × non-destructive entry and keyword strings throughout. This pins the fixes:
     · serviceScope — unsupported / not-offered services are caught; the client's list wins whole;
     · customerQuestion — keyword strings become customer questions; idempotent; no town invented;
     · baselineQuality — branded / not offered / unconfirmed / no town / no core block; repetition,
       coverage, keyword wording and duplicates warn; a typed reason overrides a block;
     · the recommendation — both core questions, ≤ 2 per service, nothing out of scope, no car keys in
       the backlog; the merged context no longer concatenates sources.

   Run: npx tsx scripts/ai-measurement-truth.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { buildServiceScope, questionScope, resolveServiceTruth, splitServiceList, inScope } from '../src/lib/serviceScope';
import { coreQuestions, isCustomerQuestion, toCustomerQuestion } from '../src/lib/customerQuestion';
import { assessBaselineQuality, overrideKey, unresolvedBlocks, MAX_QUESTIONS_PER_SERVICE } from '../src/lib/baselineQuality';
import { backlogCandidates, describeDraft, recommendBaseline } from '../src/lib/baselineRecommendation';
import { nearDuplicates } from '../src/lib/baselineMix';
import { mixContext } from '../supabase/functions/_shared/baseline-discovery';
import { mergeClientContext } from '../src/lib/clientContext';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

/* Session C's truth set (MCLocksmiths' client-confirmed onboarding services_list). */
const SERVICES = ['Emergency lockouts', 'Non-destructive entry', 'Lock changes and upgrades', 'Mortice lock replacement', 'Snapped key extraction', 'High-security anti-snap cylinder upgrades', 'Keyed-alike systems', 'Burglary repair and make safe', 'Security surveys', 'uPVC door and window lock repairs', 'Garage door locks', 'Key cutting', 'Safe opening', 'Key safe installation', 'Commercial locksmith services'];
const NOT_OFFERED = ['Car keys / auto locksmith', 'bollards', 'glass replacement', 'roller doors', 'door replacement', 'fascias'];
const HOME = 'Canterbury';
const AREAS = ['Whitstable', 'Herne Bay', 'Faversham'];
const TOWNS = [HOME, ...AREAS];
const scopeNoNeg = buildServiceScope({ services: SERVICES, notOffered: [], trade: 'Locksmith', towns: TOWNS });
const scope = buildServiceScope({ services: SERVICES, notOffered: NOT_OFFERED, trade: 'Locksmith', towns: TOWNS });

console.log('\n── 1. SERVICE SCOPE: business truth outranks generated ideas ──');
ok(questionScope('car keys and auto locksmith in Canterbury UK', scopeNoNeg).verdict === 'unsupported', 'car keys is UNSUPPORTED even with no negative list ("car" and "auto" trace to no confirmed service)');
ok(questionScope('Who offers auto locksmith services in Canterbury?', scopeNoNeg).verdict === 'unsupported', "MCL's real frozen 'auto locksmith' question is unsupported");
ok(questionScope('car key replacement in Canterbury', scope).verdict === 'not_offered', 'an explicit negative is respected: car keys → not_offered');
ok(questionScope('glass replacement in canterbury', scope).verdict === 'not_offered', 'glass replacement → not_offered');
ok(questionScope('key cutting in Canterbury', scope).verdict === 'service', '"walk-in key cutting" not offered does NOT refuse plain key cutting (every word of a negative must be present)');
for (const [q, svc] of [
  ['mortice lock replacement in whitstable uk', 'Mortice lock replacement'],
  ["Who can help if I'm locked out of my house in Canterbury?", 'Emergency lockouts'],
  ['Who can help after a break-in in Canterbury?', 'Burglary repair and make safe'],
  ['key duplication in canterbury uk', 'Key cutting'],
  ['snapped key removal in canterbury', 'Snapped key extraction'],
  ['Who can open a safe in Canterbury?', 'Safe opening'],
] as const) {
  const s = questionScope(q, scope);
  ok(s.verdict === 'service' && s.service === svc, `"${q}" → service ${svc} (got ${s.verdict}${s.service ? `: ${s.service}` : ''})`);
}
ok(questionScope('Can you recommend a good locksmith in Canterbury, UK?', scope).verdict === 'core', 'a plain recommendation question is CORE');
ok(questionScope('24 hour locksmith in canterbury uk', scope).verdict === 'core', '"24 hour locksmith" is core (urgency is not a service)');
ok(questionScope('24 hour locksmith in canterbury uk', scope).urgent, '"24 hour" now reads as urgent (C-22)');
ok(!inScope(questionScope('car keys and auto locksmith in Canterbury UK', scopeNoNeg)), 'inScope refuses an unsupported question');

console.log('\n── 2. WHICH LIST IS THE TRUTH: the highest-ranked list wins whole ──');
const t1 = resolveServiceTruth({ onboardingList: ['Lockouts', 'Key cutting'], lead: ['Car keys', 'Lockouts'], notOffered: 'car keys, bollards' });
ok(t1.source === 'onboarding' && t1.clientConfirmed && t1.services.join('|') === 'Lockouts|Key cutting', 'the client onboarding list wins whole — the lead list is NOT merged in');
ok(t1.unconfirmed.length === 1 && t1.unconfirmed[0].values.join('|') === 'Car keys', 'what only Sales recorded is returned as unconfirmed, never measured');
ok(t1.notOffered.join('|') === 'car keys|bollards', 'the negatives are parsed from free text');
const t2 = resolveServiceTruth({ lead: 'Lockouts, Key cutting' });
ok(t2.source === 'lead' && !t2.clientConfirmed, 'services only Sales recorded are usable but NOT client-confirmed');
ok(splitServiceList('a; b\n• c, a').join('|') === 'a|b|c', 'splitServiceList splits on , ; newline and bullets, de-duplicated');
const merged = mergeClientContext({
  onboarding: { confirmed_location: 'Canterbury', services_list: ['Lockouts'], areas_list: ['Whitstable'] },
  lead: { services_included: 'Car keys', service_areas: 'Weston', category: 'Locksmith' },
  discovery: { specialism: 'Auto locksmith, Car keys', location_text: 'Canterbury' },
});
ok(merged.services.join('|') === 'Lockouts', 'mergeClientContext: Discovery specialism and the lead list are NOT concatenated into the services (C-08)');
ok(merged.service_areas.join('|') === 'Whitstable', 'a town only Sales typed (Weston) does not come back once the client answered');
ok(merged.unconfirmed_services.includes('Car keys') && merged.unconfirmed_areas.includes('Weston'), 'the lower lists are shown as unconfirmed for Paul');
ok(merged.services_client_confirmed === true, 'services_client_confirmed is true for the client\'s own list');

console.log('\n── 3. CUSTOMER QUESTIONS, NOT KEYWORD STRINGS (C-02) ──');
const cq = { trade: 'Locksmiths', towns: TOWNS };
const pairs: Array<[string, string]> = [
  ['mortice lock replacement in whitstable uk', 'Who offers mortice lock replacement in Whitstable, UK?'],
  ['24 hour locksmith in canterbury uk', 'Can you recommend a 24 hour locksmith in Canterbury, UK?'],
  ['best emergency locksmith in canterbury uk', 'Who is the best emergency locksmith in Canterbury, UK?'],
  ['non-destructive entry locksmith in faversham uk', 'Which locksmith in Faversham, UK can do non-destructive entry?'],
  ['burglary repair services in Herne Bay UK', 'Who offers burglary repair services in Herne Bay, UK?'],
];
for (const [kw, want] of pairs) ok(toCustomerQuestion(kw, cq) === want, `"${kw}" → "${want}" (got "${toCustomerQuestion(kw, cq)}")`);
ok(toCustomerQuestion('fuse board upgrades Electricians in Nailsea UK', { trade: 'Electricians', towns: ['Bristol', 'Nailsea'] }) === 'Which electrician in Nailsea, UK can do fuse board upgrades?', "BS4's template artefact becomes a real question");
const natural = "Who can help if I'm locked out of my house in canterbury?";
ok(toCustomerQuestion(natural, cq) === "Who can help if I'm locked out of my house in Canterbury, UK?", 'an already-natural question keeps its words — only the town is re-cased and given its country');
let idem = true;
for (const [kw] of pairs) { const a = toCustomerQuestion(kw, cq); if (toCustomerQuestion(a, cq) !== a) idem = false; }
ok(idem, 'toCustomerQuestion is idempotent');
ok(toCustomerQuestion('locksmith near the station', cq) === 'Locksmith near the station?', 'a question naming no approved town gets NO town invented');
ok(!/Dover|Ramsgate/.test(toCustomerQuestion('emergency locksmith in canterbury uk', cq)), 'no unapproved town appears');
ok(isCustomerQuestion('Who offers key cutting in Canterbury, UK?') && !isCustomerQuestion('key cutting canterbury uk'), 'isCustomerQuestion tells the two styles apart');
const core = coreQuestions('Locksmiths', HOME);
ok(core[0] === 'Can you recommend a good locksmith in Canterbury, UK?' && core[1] === 'Which locksmiths in Canterbury, UK have the best reviews?', 'the two mandatory core questions');
ok(nearDuplicates(core, TOWNS).length === 0, 'the two core questions are NOT near-duplicates of each other (both can be approved)');

console.log('\n── 4. THE FINAL-20 CHECKS (C-03 / C-05) ──');
const q = (questions: string[], over: Partial<Parameters<typeof assessBaselineQuality>[0]> = {}) => assessBaselineQuality({
  questions, scope, primaryTown: HOME, areas: AREAS, businessName: 'MCLocksmiths Centre', trade: 'Locksmith', hookQuestions: [], servicesClientConfirmed: true, ...over,
});
const good = [...core, 'Who offers mortice lock replacement in Canterbury, UK?'];
ok(q(good).blocking.length === 0, 'a clean set has no blocking checks');
const branded = q([...good, 'Is MC Locksmiths a good locksmith in Canterbury?']);
ok(branded.blocking.some((b) => b.code === 'branded'), 'a BRANDED question blocks (joined/split spelling caught)');
ok(q([...good, 'car key replacement in Canterbury UK']).blocking.some((b) => b.code === 'not_offered'), 'a NOT-OFFERED service blocks');
ok(q([...good, 'Who can install bollards in Canterbury?']).blocking.some((b) => b.code === 'not_offered'), 'bollards blocks');
ok(q([...good, 'Who offers alarm installation in Canterbury, UK?']).blocking.some((b) => b.code === 'unsupported_service'), 'an UNCONFIRMED service blocks');
ok(q([...good, 'Can you recommend a good locksmith in Dover, UK?']).blocking.some((b) => b.code === 'no_approved_town'), 'an INVENTED location (no approved town) blocks');
ok(q(['Who offers mortice lock replacement in Canterbury, UK?']).blocking.some((b) => b.code === 'missing_core'), 'no core home-town question blocks (missing core business query)');
const grid = q([...core, ...['Canterbury', 'Whitstable', 'Herne Bay', 'Faversham'].map((t) => `Which locksmith in ${t}, UK can do non-destructive entry?`)]);
ok(grid.warnings.some((w) => w.code === 'service_repetition'), `one service in more than ${MAX_QUESTIONS_PER_SERVICE} questions WARNS (the services × towns grid)`);
ok(grid.warnings.some((w) => w.code === 'low_service_coverage'), 'low service coverage WARNS');
ok(q([...good, 'mortice lock replacement in whitstable uk']).warnings.some((w) => w.code === 'keyword_phrasing'), 'keyword-style phrasing WARNS');
ok(q([...good, 'plumber in Canterbury UK who actually turns up'], { hookQuestions: ['plumber in Canterbury UK who actually turns up'] }).warnings.every((w) => w.code !== 'keyword_phrasing' || !w.message.includes('turns up')), 'a Hook Audit question (kept verbatim) is not called keyword-style');
ok(q([...good, 'Can you recommend a locksmith in Canterbury, UK?']).warnings.some((w) => w.code === 'near_duplicate'), 'a near-duplicate WARNS (the approval still refuses it separately)');
ok(q(good, { servicesClientConfirmed: false }).warnings.some((w) => w.code === 'services_unconfirmed'), 'services only Sales recorded WARN');
const blocks = branded.blocking;
ok(unresolvedBlocks(blocks, []).length === blocks.length, 'a blocking check with no reason stays unresolved');
ok(unresolvedBlocks(blocks, blocks.map((b) => ({ code: b.code, question: b.question, reason: 'short' }))).length === blocks.length, 'a reason under the minimum does not resolve it');
ok(unresolvedBlocks(blocks, blocks.map((b) => ({ code: b.code, question: b.question?.toUpperCase() ?? null, reason: 'Client asked to be measured on brand searches too' }))).length === 0, 'a written reason resolves it (matched case-insensitively on the question)');
ok(overrideKey('branded', 'A b') === overrideKey('branded', ' a  B '), 'overrideKey normalises the question');

console.log('\n── 5. THE RECOMMENDED 20 ──');
const keywordPool = [
  'burglary repair services in faversham uk', 'burglary repair services in Herne Bay UK', 'burglary repair service in canterbury uk', '24 hour locksmith in canterbury uk',
  'keyed-alike systems locksmith in canterbury uk', 'non-destructive entry locksmith in canterbury uk', 'lock changes and upgrades in canterbury uk', 'mortice lock replacement in canterbury uk',
  'non-destructive entry locksmith in whitstable uk', 'lock changes and upgrades in Herne Bay UK', 'mortice lock replacement in faversham uk', 'non-destructive entry locksmith in Herne Bay UK',
  'lock changes and upgrades in whitstable uk', 'mortice lock replacement in whitstable uk', 'non-destructive entry locksmith in faversham uk', 'emergency lockout services in canterbury uk',
  'best emergency locksmith in canterbury uk', 'emergency lockout service in faversham uk', 'fast emergency lockout assistance in canterbury uk', 'emergency lockout service in whitstable uk',
  'car keys and auto locksmith in Canterbury UK', 'upvc door lock repair in canterbury uk', 'safe opening in canterbury uk', 'key safe installation in canterbury uk',
  'commercial locksmith in canterbury uk', 'snapped key extraction in canterbury uk', 'garage door locks in canterbury uk', 'security survey in canterbury uk',
];
const ctx = mixContext({ primaryTown: HOME, areas: AREAS, services: SERVICES });
const shaped = keywordPool.map((x) => toCustomerQuestion(x, cq)).filter((x) => inScope(questionScope(x, scopeNoNeg)));
ok(!shaped.some((x) => /car key|auto locksmith/i.test(x)), 'the pool filter keeps car keys OUT (no negative list needed)');
const rec = recommendBaseline({ hook: [], pool: shaped.map((x) => ({ question: x })), ctx, trade: 'Locksmith', target: 20, scope: scopeNoNeg, core });
const recQs = rec.questions.map((r) => r.question);
ok(recQs.includes(core[0]) && recQs.includes(core[1]), 'the recommended 20 contains BOTH mandatory core questions');
ok(rec.questions.filter((r) => r.source === 'core').length === 2, 'the core rows are labelled "Core question"');
const recQuality = assessBaselineQuality({ questions: recQs, scope: scopeNoNeg, primaryTown: HOME, areas: AREAS, businessName: 'ZZ QA-C1 Baseline', trade: 'Locksmith', servicesClientConfirmed: true });
const perSvc = new Map<string, number>();
for (const s of recQuality.scopes) if (s.scope.service) perSvc.set(s.scope.service, (perSvc.get(s.scope.service) ?? 0) + 1);
ok(Math.max(0, ...perSvc.values()) <= MAX_QUESTIONS_PER_SERVICE, `no service appears more than ${MAX_QUESTIONS_PER_SERVICE} times (max ${Math.max(0, ...perSvc.values())})`);
ok(perSvc.size >= Math.ceil(SERVICES.length / 2), `at least half the services are covered (${perSvc.size} of ${SERVICES.length})`);
ok(recQuality.blocking.length === 0, `the recommended 20 passes every blocking check (${recQuality.blocking.map((b) => b.code).join(', ') || 'none'})`);
ok(recQs.every((x) => isCustomerQuestion(x)), 'every recommended question reads as a customer question');
ok(!rec.questions.some((r) => /core locksmith/i.test(r.reason) && r.source !== 'core' && questionScope(r.question, scopeNoNeg).verdict !== 'core'), 'a service question is never explained as "core" (C-03)');
const withCar = recommendBaseline({ hook: [], pool: keywordPool.map((x) => ({ question: x })), ctx, trade: 'Locksmith', target: 20, scope, core });
ok(withCar.pool.find((p) => /car keys/i.test(p.question))?.verdict === 'not_recommended', 'given a raw pool, car keys is NOT RECOMMENDED with the reason');
const backlog = backlogCandidates(withCar.questions.map((r) => r.question), keywordPool.map((x) => ({ question: x })), ctx, scope);
ok(!backlog.some((b) => /car keys/i.test(b.question)), 'car keys is NEVER seeded into the backlog (C-04)');
ok(describeDraft(core, { hook: [], pool: [], ctx, trade: 'Locksmith', scope, core }).every((r) => r.source === 'core'), 'describeDraft names the core questions as such');

console.log('\n── 6. THE WIRING ──');
const disc = read('supabase/functions/_shared/baseline-discovery.ts');
ok(/question_style: "customer"/.test(disc) && /not_offered: input\.notOffered/.test(disc), 'Discovery asks create-ai-audit for customer questions and hands over the negatives');
ok(/coreQuestions\(input\.businessCategory, input\.primaryTown/.test(disc) && /toCustomerQuestion\(raw/.test(disc) && /if \(!inScope\(s\)\) \{ rejected\.push/.test(disc), 'every pool question is reshaped, scoped, and out-of-scope ones are listed as rejected');
const cai = read('supabase/functions/create-ai-audit/index.ts');
ok(/isDiscovery && isInternal && body\.question_style === "customer"/.test(cai), 'customer style is internal-Discovery-only (the hook and every other caller are unchanged)');
ok(/style: QuestionStyle \| null = null/.test(cai) && /The business does NOT offer:/.test(cai), 'the generator prompt carries the NOT OFFERED list when asked');
const pb = read('supabase/functions/paid-baseline/index.ts');
ok(/error: "baseline_quality_blocked"/.test(pb) && /unresolvedBlocks\(qualityNow\.blocking, overrides\)/.test(pb), 'approval refuses unresolved blocking checks');
ok(/quality_overrides: acceptedOverrides/.test(pb), 'the accepted reasons are kept on baseline_meta');
ok(/backlogCandidates\(next, recInputsOf\(discovery\), mixCtx, scope\)/.test(pb), 'backlog seeding is scoped');
ok(/status: "not_pursuing"/.test(pb) && /now part of the official baseline/.test(pb), 'a backlog row now in the frozen set is moved out of "new" (C-19), never deleted');
ok(/error: "baseline_already_measured"/.test(pb), 'a lead with a baseline pointer cannot be re-drafted server-side (C-26)');
ok(/body\.services_list\) \? body\.services_list : row\.services_list/.test(pb), 'save_context writes only what was sent — never the merged list (C-08)');
ok(/reason\.length < CORRECTION_MIN_REASON/.test(pb), 'reopen still requires a written reason');

if (failures) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll passed.');
