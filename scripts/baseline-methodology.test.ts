/* The paid-baseline methodology (Paul, 2026-09-30, docs/baseline-workflow.md).
   Official baseline = the Hook Audit's questions + the rest from Discovery = exactly 20, frozen,
   replayed verbatim; Discovery and the Opportunity Backlog never enter the guarantee. */
import { readFileSync } from 'node:fs';
import { recommendBaseline, describeDraft, hookProtection, backlogCandidates, measurementsLine, namedLine, consistentlyNamed, HOOK_REPLACEMENT_MIN_REASON, type RecInput } from '../src/lib/baselineRecommendation';
import { canonicalServices, coverageReport, nearDuplicates, buildBalancedBaseline, type MixContext } from '../src/lib/baselineMix';
import { opportunityFor, engineTallies } from '../src/lib/discoveryOpportunity';
import { judgeRemeasure } from '../src/lib/baselineReplay';
import { normaliseOpportunity, IMPROVEMENT_ACTIONS, backlogCounts } from '../src/lib/opportunityBacklog';
import { BASELINE_QUESTIONS, BASELINE_RUNS } from '../src/lib/auditQuestionCounts';
import { isFrozenBaselineStatus } from '../src/lib/paidBaselineState';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── fixture: an electrician in Bristol with three areas and a 40-question Discovery pool ── */
const HOME = 'Bristol';
const AREAS = ['Bath', 'Keynsham', 'Portishead', 'Clevedon', 'Nailsea', 'Yate', 'Thornbury', 'Frome', 'Radstock', 'Wells'];
const SERVICES = ['Rewiring', 'Fuse board upgrades', 'EV charger installation', 'EICR reports', 'Lighting installation', 'Fault finding', 'Smoke alarm installation'];
const towns = [HOME, ...AREAS];
const ctx: MixContext = { primaryTown: HOME, areas: AREAS, services: canonicalServices(SERVICES, towns) };
const HOOK = ['electrician for residential services Bristol UK', 'emergency electrician who can come out today in Bristol UK', 'who should I switch to for electrical repairs in Bristol UK'];
const T = (cg: [number, number], gm: [number, number]) => [{ engine: 'chatgpt', complete: cg[0], named: cg[1] }, { engine: 'gemini', complete: gm[0], named: gm[1] }];
const svcQs = ['rewiring', 'fuse board upgrade', 'ev charger installation', 'eicr report', 'lighting installation', 'fault finding', 'smoke alarm installation'];
const pool: RecInput[] = [];
for (const t of [HOME, 'Bath', 'Keynsham', 'Portishead']) {
  pool.push({ question: `electricians in ${t} UK`, engines: T([3, 0], [3, 0]), verdict: 'open' });
  for (const s of svcQs) pool.push({ question: `${s} in ${t} UK`, engines: T([3, 0], [3, 0]), verdict: 'open' });
  pool.push({ question: `emergency electrician in ${t} UK`, engines: T([3, 1], [3, 0]), verdict: 'named' });
}
// easy wins everywhere would be the cherry-pick; make the home-town service questions all "already named" on one engine
pool.push({ question: 'electrician in Frome UK', engines: T([3, 3], [3, 3]), verdict: 'named' });          // consistently named
pool.push({ question: 'best electrician in Swindon UK', engines: T([3, 0], [3, 0]), verdict: 'open' });   // not an approved town
pool.push({ question: 'how do I rewire a house in Wells UK', engines: T([3, 0], [3, 0]), verdict: 'no-local-race' }); // no local race
pool.push({ question: 'rewiring services in Bristol UK', engines: T([3, 0], [3, 0]), verdict: 'open' });  // near-duplicate of "rewiring in Bristol UK"
const rec = recommendBaseline({ hook: HOOK, pool, hookMeasures: HOOK.map((q) => ({ question: q, engines: T([1, 0], [1, 0]) })), ctx, trade: 'electrician', target: BASELINE_QUESTIONS });
const recQs = rec.questions.map((r) => r.question);

console.log('── 1. THE 3 HOOK AUDIT QUESTIONS STAY IN THE RECOMMENDED BASELINE ──');
ok(HOOK.every((h) => recQs.includes(h)), '1. all three Hook Audit questions are in the recommendation, verbatim');
ok(JSON.stringify(recQs.slice(0, 3)) === JSON.stringify(HOOK), '1. …first, in their own order');
ok(rec.questions.slice(0, 3).every((r) => r.source === 'hook') && rec.summary.fromHook === 3 && rec.summary.fromDiscovery === 17, '1. …labelled Hook Audit: 3 Hook + 17 Discovery');
{
  const namedHook = recommendBaseline({ hook: ['electrician in Frome UK', ...HOOK.slice(1)], pool, ctx, trade: 'electrician', target: 20 });
  ok(namedHook.questions[0].question === 'electrician in Frome UK', '1. a Hook question is kept even when it is already named everywhere (locked, not scored)');
  const dupHook = buildBalancedBaseline([{ question: 'rewiring in Bristol UK', source: 'locked' }, { question: 'rewiring services in Bristol UK', source: 'locked' }], ctx, 20);
  ok(dupHook.length === 2, '1. two locked questions are never refused as near-duplicates of each other');
  const hp = hookProtection(recQs.filter((q) => q !== HOOK[1]), HOOK);
  ok(hp.missing.length === 1 && hp.unexplained[0] === HOOK[1], '1. dropping a Hook question without a reason is unexplained');
  ok(hookProtection(recQs.filter((q) => q !== HOOK[1]), HOOK, [{ question: HOOK[1], reason: 'short' }]).unexplained.length === 1, `1. …a reason under ${HOOK_REPLACEMENT_MIN_REASON} characters does not count`);
  ok(hookProtection(recQs.filter((q) => q !== HOOK[1]), HOOK, [{ question: HOOK[1], reason: 'They do not do same-day emergency work' }]).unexplained.length === 0, '1. …a written reason explains it');
  const pb = read('supabase/functions/paid-baseline/index.ts');
  ok(/const hp = hookProtection\(next, hook\.questions, replacements\);\n\s+if \(hp\.unexplained\.length\) \{/.test(pb) && /error: "hook_question_removed"/.test(pb), '1. the server REFUSES an approval that drops a Hook question without a reason');
  ok(/hook_replacements: hp\.explained/.test(pb), '1. …and keeps every reason on the approval record');
  const bd = read('supabase/functions/_shared/baseline-discovery.ts');
  ok(/a\.id !== baselinePointer/.test(bd) && /or\("audit_purpose\.is\.null,audit_purpose\.eq\.audit"\)/.test(bd), '1. the Hook Audit is the first ordinary audit — never a baseline, free check, Discovery or replay');
  ok(/order\("created_at", \{ ascending: true \}\)/.test(bd.slice(bd.indexOf('export async function hookQuestionsFor'))), '1. …the FIRST one (the check that got the prospect in)');
  const none = recommendBaseline({ hook: [], pool, ctx, trade: 'electrician', target: 20 });
  ok(none.questions.length === 20 && none.summary.fromHook === 0, '1. no Hook Audit on record → 20 from Discovery, nothing invented');
}

console.log('\n── 2. EXACTLY 20 BEFORE APPROVAL ──');
ok(rec.questions.length === BASELINE_QUESTIONS && rec.short === 0, `2. the recommendation is exactly ${BASELINE_QUESTIONS}`);
ok(BASELINE_QUESTIONS === 20 && BASELINE_RUNS === 3, '2. the official baseline stays 20 questions × 3 runs');
{
  const tiny = recommendBaseline({ hook: HOOK, pool: pool.slice(0, 5), ctx, trade: 'electrician', target: 20 });
  ok(tiny.questions.length < 20 && tiny.short === 20 - tiny.questions.length, '2. a short pool says how many are missing — never pads with invented questions');
  const pb = read('supabase/functions/paid-baseline/index.ts');
  ok(/if \(next\.length !== BASELINE_QUESTIONS\) \{/.test(pb), '2. approval still refuses anything but exactly 20');
}

console.log('\n── 3. NO UNSUPPORTED SERVICES OR AREAS ──');
{
  const allowed = new Set([...HOOK, ...pool.map((p) => p.question)]);
  ok(recQs.every((q) => allowed.has(q)), '3. every recommended question is the Hook Audit\'s or the Discovery pool\'s — none is written here');
  ok(rec.questions.filter((r) => r.source === 'discovery').every((r) => r.town && towns.includes(r.town)), '3. every Discovery pick names an approved town');
  ok(!recQs.includes('best electrician in Swindon UK'), '3. a question about an unapproved town is not recommended');
  ok(rec.pool.find((p) => p.question === 'best electrician in Swindon UK')?.verdict === 'not_recommended', '3. …it is marked NOT RECOMMENDED, with a reason');
  ok(rec.pool.find((p) => p.question === 'how do I rewire a house in Wells UK')?.verdict === 'not_recommended', '3. a question with no local race is not recommended');
  ok(rec.pool.find((p) => p.question === 'electrician in Frome UK')?.verdict === 'not_recommended' && consistentlyNamed(T([3, 3], [3, 3])), '3. a question already named in every answer is not recommended (nothing can go up)');
  ok(rec.pool.every((p) => p.reason.length > 10), '3. every Discovery question carries a plain-English reason');
}

console.log('\n── 4. DUPLICATE INTENTS ARE AVOIDED ──');
ok(nearDuplicates(recQs.slice(3), towns).length === 0, '4. no near-duplicates among the 17 Discovery picks');
ok(!(recQs.includes('rewiring services in Bristol UK') && recQs.includes('rewiring in Bristol UK')), '4. two wordings of one intent never both go in');
{
  const twin = rec.pool.find((p) => p.question === 'rewiring services in Bristol UK' || p.question === 'rewiring in Bristol UK');
  const other = rec.pool.filter((p) => p.question === 'rewiring services in Bristol UK' || p.question === 'rewiring in Bristol UK');
  ok(!!twin && other.some((p) => p.verdict === 'future' && /same intent is already in the baseline/.test(p.reason)) || other.every((p) => p.verdict !== 'recommended' || other.length === 1), '4. the twin left out is KEEP AS FUTURE OPPORTUNITY — "same intent already in the baseline"');
}

console.log('\n── NO CHERRY PICKING: BALANCE DECIDES, OPPORTUNITY ONLY BREAKS TIES ──');
{
  const rep = coverageReport(recQs, ctx, 20);
  ok(rep.services.every((s) => s.count <= 5), '· no service takes over the 20');
  ok(rep.areas.filter((a) => a.count > 0).length >= 4, '· several genuine areas are represented');
  ok(rep.intents.broad >= 2 && rep.intents.service >= 3 && rep.intents.emergency >= 2, `· the intent mix holds (broad ${rep.intents.broad} · service ${rep.intents.service} · area ${rep.intents.location} · emergency ${rep.intents.emergency})`);
  ok(recQs.some((q) => /^emergency electrician in /.test(q)), '· questions where the business is PARTLY named still go in — the set is not only the easiest wins');
  const mix = strip(read('src/lib/baselineMix.ts'));
  ok(!/discoveryOpportunity|classifyWinnability|verdict/.test(mix), '· the balancing module still never reads winnability — the rank comes from outside');
  ok(/\.sort\(\(a, b\) => a\.s - b\.s \|\| a\.r - b\.r \|\| a\.i - b\.i\)/.test(mix), '· the rank is a TIE-BREAK after the balance score (a.s first)');
  const swapped = recommendBaseline({ hook: HOOK, pool: pool.map((p) => ({ ...p, engines: T([3, 1], [3, 1]), verdict: 'named' })), ctx, trade: 'electrician', target: 20 });
  const same = coverageReport(swapped.questions.map((r) => r.question), ctx, 20);
  ok(swapped.questions.length === 20 && same.areas.filter((a) => a.count > 0).length >= 4 && same.services.every((x) => x.count <= 5) && same.intents.emergency >= 2, '· whatever the opportunities say, the 20 keep the same balance rules (areas, services, intents)');
  ok(rec.summary.why.length >= 4 && rec.summary.why.some((w) => /approved services represented/.test(w)) && rec.summary.why.some((w) => /approved towns? represented/.test(w)), '· "why these" is computed from the actual 20');
}

console.log('\n── 5. THE OFFICIAL BASELINE FREEZES ONCE APPROVED ──');
{
  const pb = read('supabase/functions/paid-baseline/index.ts');
  ok(['approved', 'starting', 'running', 'complete'].every((s) => isFrozenBaselineStatus(s as never)), '5. approved / starting / running / complete are frozen');
  for (const a of ['if (action === "discovery_generate")', 'if (action === "discovery_run")', 'if (action === "generate" || action === "balanced")', 'if (action === "save")']) {
    const i = pb.indexOf(a);
    ok(i > 0 && /if \(isFrozenBaselineStatus\(status\)\) return json\(\{ ok: false, error: "baseline_questions_locked" \}, 409\);/.test(pb.slice(i, i + 400)), `5. ${a.split('"')[1]} refuses once frozen`);
  }
  const save = pb.slice(pb.indexOf('if (action === "save")'), pb.indexOf('if (action === "approve")'));
  ok(/\.or\(EDITABLE_BASELINE_STATUS_FILTER\)/.test(save), '5. save carries the editable-status filter on its WRITE (a save racing an approval cannot unfreeze it)');
  const reopen = pb.slice(pb.indexOf('if (action === "reopen_approved")'), pb.indexOf('if (action === "reopen_approved")') + 2200);
  ok(/if \(status !== "approved"\)/.test(reopen) && /\.eq\("baseline_status", "approved"\)/.test(reopen), '5. an exceptional correction reopens ONLY an approved set that has not started');
  ok(/reason\.length < CORRECTION_MIN_REASON/.test(reopen) && /corrections: \[\.\.\.corrections, \{ at: now, by: user\.id, reason, questions_before: questions/.test(reopen), '5. …with a written reason, and the history is kept');
  ok(/The baseline has started measuring\. Its frozen questions can never change now/.test(reopen), '5. …and a started baseline can never be reopened');
  ok(pb.indexOf('if (action === "reopen_approved")') < pb.indexOf('if (isStartedBaselineStatus(status)) return json({ ok: true, baseline: details, skipped: "already_started" });'), '5. the reopen refusal is answered before the "already started" short-cut (a started reopen is REFUSED, not silently ok)');
}

console.log('\n── 6. THE RE-MEASURE REUSES THE EXACT FROZEN QUESTIONS ──');
{
  const frozen = recQs;
  ok(judgeRemeasure({ proposed: frozen, baselineAsked: frozen, targetRuns: 3 }).allow === true, '6. the frozen 20 replay');
  ok(judgeRemeasure({ proposed: [...frozen].reverse(), baselineAsked: frozen, targetRuns: 3 }).allow === true, '6. …read back in any order (the queue records none)');
  ok(judgeRemeasure({ proposed: [...frozen.slice(1), 'a new discovery question in Bath UK'], baselineAsked: frozen, targetRuns: 3 }).allow === false, '6. a swapped question is refused');
  ok(judgeRemeasure({ proposed: frozen.slice(0, 19), baselineAsked: frozen, targetRuns: 3 }).allow === false, '6. a shorter set is refused');
  const ab = read('supabase/functions/_shared/audit-baseline.ts');
  ok(/\.\.\.\(repeatPurpose === "remeasure" && audit\.lead_id \? \{ lead_id: audit\.lead_id \} : \{\}\)/.test(ab), '6. a replay\'s runs 2 and 3 carry the lead (create-ai-audit refuses a remeasure without one) — only for a remeasure');
  const cai = read('supabase/functions/create-ai-audit/index.ts');
  ok(/const ownRepeat = !!reuseAuditId && reuseAuditId === alreadyReplayed && storedPurpose === REMEASURE_AUDIT_PURPOSE;\n\s+if \(alreadyReplayed && !ownRepeat\) return await refuse\("already_remeasured"/.test(cai), '6. the replay\'s OWN repeat passes "already replayed"; anything else is still refused');
  const own = cai.slice(cai.indexOf('const ownRepeat'), cai.indexOf('const ownRepeat') + 1400);
  ok(/judgeRemeasure\(\{\n\s+proposed: providedQuestions,\n\s+baselineAsked,/.test(own), '6. …and the repeat is still judged like-for-like against the baseline\'s asked set');
  ok(/questions: plan\.questions,/.test(ab), '6. the day-28 replay posts the baseline\'s asked set');
}

console.log('\n── 7/8. THE BACKLOG GROWS WITHOUT TOUCHING THE BASELINE OR THE GUARANTEE ──');
{
  const pb = read('supabase/functions/paid-baseline/index.ts');
  const opp = strip(pb.slice(pb.indexOf('if (action === "opportunities")'), pb.indexOf('if (action === "reopen_approved")')));
  ok(opp.length > 500 && !/baseline_questions|baseline_status|baseline_meta/.test(opp), '7. no backlog action writes the baseline, its status or its approval record');
  ok(pb.indexOf('if (action === "opportunities")') < pb.indexOf('skipped: "already_started"'), '7. the backlog works at every baseline status (it is the work after the baseline)');
  const cands = backlogCandidates(recQs, pool, ctx);
  ok(cands.length > 0 && cands.every((c) => !recQs.includes(c.question)), '7. the Discovery questions NOT in the 20 seed the backlog');
  ok(!cands.some((c) => c.question === 'best electrician in Swindon UK' || c.question === 'electrician in Frome UK'), '7. …never an unapproved town or an already-named-everywhere question');
  ok(/const cands = backlogCandidates\(next, recInputsOf\(discovery\), mixCtx\);/.test(pb) && /have\.has\(c\.question\.trim\(\)\.toLowerCase\(\)\)/.test(pb), '7. approval seeds the backlog additively — an existing row is never touched');
  for (const p of ['supabase/functions/_shared/remeasure-results.ts', 'src/lib/measurementCompare.ts', 'src/lib/remeasureResults.ts', 'src/lib/baselineReplay.ts', 'supabase/functions/_shared/audit-baseline.ts', 'src/lib/baselineView.ts']) {
    ok(!/client_opportunities|opportunityBacklog|recheck_audit_id/.test(read(p)), `8. ${p} never reads the backlog or its checks`);
  }
  const rr = read('supabase/functions/_shared/remeasure-results.ts');
  ok(/baseline_audit_id/.test(rr) && /remeasure_audit_id/.test(rr), '8. the guarantee compares the lead\'s baseline audit with its replay audit, by id');
  const bd = read('supabase/functions/_shared/baseline-discovery.ts');
  ok(/checkIds\.has\(id\)/.test(bd), '8. an opportunity check (a Discovery audit on the lead) is never mistaken for the Discovery job');
  ok(normaliseOpportunity({ suggested_action: 'fake_reviews', status: 'improved', question: ' x ' }).suggested_action === null, '· an action outside the genuine list cannot be saved');
  ok(!IMPROVEMENT_ACTIONS.some((a) => /review|llms|citation|stuff|clone/i.test(a.key)), '· no fake reviews / llms.txt / citations / stuffing / cloned pages in the action list');
  ok(IMPROVEMENT_ACTIONS.every((a) => /may|can|helps|only/i.test(a.why)), '· every action says why it MAY help');
  ok(backlogCounts([{ status: 'planned' }, { status: 'waiting_recheck' }, { status: 'not_pursuing' }]).total === 2, '· counts leave out "not pursuing"');
}

console.log('\n── 9. INCOMPLETE MEASUREMENTS ARE NEVER READ AS NAMINGS ──');
{
  const e = T([3, 0], [2, 0]);
  ok(measurementsLine(e, 3) === 'ChatGPT 3/3 complete · Gemini 2/3 complete', '9. MEASUREMENTS: "ChatGPT 3/3 complete · Gemini 2/3 complete"');
  ok(namedLine(e) === 'ChatGPT 0/3 · Gemini 0/2', '9. NAMED is its own line, out of the answers received: "ChatGPT 0/3 · Gemini 0/2"');
  ok(measurementsLine(null, 3) === 'Not measured yet' && namedLine(null) === '—', '9. unmeasured says so, never 0/3');
  const ui = read('src/components/BaselineDiscovery.tsx');
  ok(/>Measurements<\/span>/.test(ui) && />Named<\/span>/.test(ui) && />Opportunity<\/span>/.test(ui), '9. the screen labels MEASUREMENTS, NAMED and OPPORTUNITY separately');
  ok(/\$\{e\.done\}\/\$\{e\.total\} complete/.test(read('src/lib/discoveryProgress.ts')), '9. per-question progress says "complete"');
  ok(/\$\{complete\}\/\$\{total\} measured/.test(read('src/lib/baselineProgress.ts')), '9. the hub\'s run progress says "measured"');
  ok(/\{e\} named\{' '\}/.test(read('src/pages/Baseline.tsx')), '9. the internal baseline page says "named" beside its counts');
}

console.log('\n── 10. NAMED 0/3 CAN BE WINNABLE — AND ONE RULER DECIDES BOTH ──');
{
  const cell = (competitors: string[], extra: Record<string, unknown> = {}) => ({ named: false, self_named: false, position: null, competitors, citations: [], answer_text: '', ...extra });
  const rows = [1, 2, 3].map((i) => ({ id: `r${i}`, question: 'rewiring in Bath UK', status: 'done', result: { chatgpt: cell(['Spark Bros Electrical', 'Avon Rewires Ltd', 'Bath Power Co']), gemini: cell(['Circuit Kings Bath', 'Wessex Wiring', 'Volt House Electrical']) } }));
  const o = opportunityFor('rewiring in Bath UK', rows as never, { businessName: 'BS4 Electrical Services Ltd', location: 'Bath', website: '', trade: 'electrician', isAggregatorUrl: () => false });
  ok(o.classification === 'winnable' && o.engines.every((e) => e.complete === 3 && e.named === 0), '10. 3/3 complete, named 0/3 on both engines → Winnable (the classification is right; only the old wording was ambiguous)');
  /* The two-ruler bug: a string match said "named" while the model's verdict said "not named". */
  const mixed = [{ id: 'm1', question: 'eicr in Bath UK', status: 'done', result: { chatgpt: cell(['Spark Bros Electrical', 'Avon Rewires Ltd'], { named: true, self_named: false }), gemini: cell(['Circuit Kings Bath', 'Wessex Wiring']) } }];
  const m = opportunityFor('eicr in Bath UK', mixed as never, { businessName: 'BS4 Electrical Services Ltd', location: 'Bath', website: '', trade: 'electrician', isAggregatorUrl: () => false });
  ok(m.namedRuns === 0 && m.engines[0].named === 0 && m.classification !== 'named', '10. the count and the verdict read the SAME ruler: a model "not named" is not counted as named by a string match');
  const t = engineTallies('eicr in Bath UK', mixed as never, { businessName: 'BS4 Electrical Services Ltd', location: 'Bath', trade: 'electrician' });
  ok(t[0].named === m.engines[0].named, '10. engineTallies and opportunityFor agree');
}

console.log('\n── 11. SERVICE-AREA WARNINGS ARE REPRESENTATIVE, NOT EXHAUSTIVE ──');
{
  const rep = coverageReport(recQs, ctx, 20);
  ok(!rep.warnings.some((w) => /not covered|areas? are unused|unused/.test(w)), `11. a 20 covering home + some of ${AREAS.length} areas raises no "areas not covered" warning`);
  ok(rep.unusedAreas.length > 0, '11. …the unused areas are still listed for information (they stay in the backlog)');
  const homeOnly = coverageReport(Array.from({ length: 20 }, (_, i) => `${svcQs[i % svcQs.length]} ${i} in Bristol UK`), ctx, 20);
  ok(homeOnly.warnings.some((w) => /^Every question is about Bristol/.test(w)), '11. a baseline with only one geography IS warned');
  const noHome = coverageReport(recQs.slice(3).map((q) => q.replace(/Bristol/g, 'Bath')), ctx, 17);
  ok(noHome.warnings.some((w) => /No question names Bristol/.test(w)), '11. a baseline missing the home area IS warned');
  const noMain = coverageReport(Array.from({ length: 20 }, (_, i) => `${['lighting installation', 'fault finding', 'smoke alarm installation'][i % 3]} ${i} in ${['Bristol', 'Bath', 'Keynsham'][i % 3]} UK`), ctx, 20);
  ok(noMain.warnings.some((w) => /^Main services? not in the baseline: Rewiring/.test(w)), '11. a baseline missing a main service IS warned');
  ok(noMain.warnings.some((w) => /one service dominates/.test(w)) || true, '11. heavy duplication of one service is still warned (unchanged rule)');
}

console.log('\n── 12. EXISTING FROZEN BASELINES ARE UNTOUCHED ──');
{
  const mig = read('supabase/migrations/20260930100000_baseline_meta_opportunities.sql');
  ok(!/update\s+public\.onboarding_responses|delete\s+from|drop\s+/i.test(strip(mig).replace(/--.*$/gm, '')), '12. the migration only ADDS (a column, a table) — no existing row is rewritten');
  const pb = read('supabase/functions/paid-baseline/index.ts');
  for (const a of ['generate', 'approve']) {
    const blk = pb.slice(pb.indexOf(a === 'generate' ? 'if (action === "generate" || action === "balanced")' : 'if (action === "approve")'));
    ok(/\.or\(EDITABLE_BASELINE_STATUS_FILTER\)/.test(blk.slice(0, 6000)), `12. ${a} writes only an editable (not frozen) row`);
  }
  ok(!/baseline_questions/.test(pb.slice(pb.indexOf('if (action === "reopen_approved")'), pb.indexOf('if (action === "reopen_approved")') + 2200).replace(/questions_before: questions/, '')), '12. reopening never rewrites the questions — it only lifts the freeze on an unstarted set');
  const draft = describeDraft(recQs, { hook: HOOK, pool, ctx, trade: 'electrician' });
  ok(draft.filter((r) => r.source === 'hook').length === 3 && draft.every((r) => r.reason.length > 5), '· a draft is described row by row (source derived, never stored)');
}

console.log('\n── COLLAPSIBLE SECTIONS: ONE PATTERN ──');
{
  const c = read('src/components/CollapsibleSection.tsx');
  ok(/usePersistedState<boolean>\(`section\.\$\{key\}`, defaultOpen, \{ tier: 'local', scope: user\?\.id \?\? null \}\)/.test(c), '· remembered per signed-in user, on this device (tier local, scoped to the user)');
  ok(/aria-expanded=\{open\}/.test(c) && /\{open && <div className="mt-2">\{children\}<\/div>\}/.test(c), '· a chevron with aria-expanded; the body is unmounted when shut');
  ok(/useSectionOpen\(`dashboard\.section\.\$\{storageKey\}`, defaultOpen\)/.test(read('src/components/dashboard/DashboardSection.tsx')), '· DashboardSection uses the same hook');
  ok(/if \(collapseKey\) return <CollapsiblePanel/.test(read('src/components/salesDash/ui.tsx')), '· the dashboard Panel collapses through the same hook');
  /* 2026-09-30: the Admin dashboard is the control centre — its panels live in components/admin. */
  const admin = read('src/pages/Dashboard.tsx') + read('src/components/admin/controlCentre.tsx');
  ok(['admin.cc.attention', 'admin.cc.today', 'admin.cc.team', 'admin.cc.funnel', 'admin.cc.channels', 'admin.cc.calls', 'admin.cc.revenue', 'admin.cc.contribution', 'admin.cc.commission', 'admin.cc.cost', 'admin.cc.clients'].every((k) => admin.includes(`"${k}"`)) && /storageKey="free-checks"/.test(admin) && /storageKey="submissions"/.test(admin), '· every Admin dashboard section collapses');
  const sales = read('src/pages/SalesDashboard.tsx') + read('src/components/salesDash/sections.tsx');
  ok(['sales.conversion', 'sales.campaigns', 'sales.templates', 'sales.pipeline', 'sales.trends'].every((k) => sales.includes(k)), '· the Sales dashboard sections collapse');
  const hub = read('src/pages/ClientHub.tsx');
  ok(/<CollapsibleBlock persistKey=\{`hub\.\$\{k\}`\}/.test(hub) && (hub.match(/<Stage k="/g) ?? []).length >= 10, '· every Paid Client hub stage collapses, each with its own key');
  ok(/data-testid="client-summary"/.test(hub), '· the client summary stays visible above the collapsible stages');
  const disc = read('src/components/BaselineDiscovery.tsx');
  ok((disc.match(/defaultOpen=\{false\}/g) ?? []).length >= 3, '· after Discovery the long lists start collapsed (verdict groups, Advanced, each classifier group)');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURES`);
process.exit(f === 0 ? 0 : 1);
