/* ============================================================
   PLAN RECOMMENDATION (Paul, 2026-10-07): FINDABLE BUILD IS THE DEFAULT. Optimise is recommended only when an
   agency / third party runs the site AND the contract is confirmed still on. Having, owning, keeping or being able
   to edit a website is never the reason. The terms of both plans are untouched.
   Run: npx tsx scripts/plan-recommendation.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import {
  offerFit, agencyContractBlocksBuild, quickCloseGate, quickCloseState, mayGenerateLink, missingQuestions, QUICK_CLOSE_QUESTIONS,
  BUILD_DEFAULT_REASON, AGENCY_CONTRACT_UNCONFIRMED_REASON, type QuickCloseAnswers,
} from '../src/lib/quickClose.ts';
import { preselectedPlan } from '../src/lib/callScript.ts';
import { routesFor } from '../src/lib/callClose.ts';
import { afterTermSummaryWords, FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_OPTIMISE_TOTAL_PAYMENTS, FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP } from '../src/lib/findableOffer.ts';
import { continuingModeFor, COMMERCIAL_TERMS_V4 } from '../src/lib/clientTimeline.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const rec = (a: QuickCloseAnswers, site = true) => offerFit(a, site).recommended;

console.log('── BUILD IS THE DEFAULT ──');
ok(rec({ manager: 'owner' }) === 'build', 'existing website, self-managed by the owner → Build recommended');
ok(rec({ manager: 'employee' }) === 'build', 'an employee manages it → Build recommended');
ok(rec({}) === 'build', 'nothing answered yet (a website exists) → Build recommended, never Optimise');
ok(rec({ manager: 'not_sure' }) === 'build', 'who runs it is not known → Build recommended');
ok(rec({ access: 'yes', manager: 'owner' }) === 'build', 'we CAN get into their current site → still Build (access is not a reason for Optimise)');
ok(rec({ access: 'yes' }) === 'build' && rec({ access: 'no' }) === 'build', 'website access, either answer, does not move the recommendation');
ok(rec({ domain: 'yes', manager: 'owner' }) === 'build', 'they want to keep their domain → Build recommended');
ok(rec({ approach: 'improve', manager: 'owner' }) === 'build', 'even a legacy "improve" approach does not recommend Optimise');
ok(rec({ manager: 'no_website' }, false) === 'build' && !offerFit({ manager: 'no_website' }, false).offered.optimise, 'no website → Build, and Optimise is not possible');
{
  const f = offerFit({ manager: 'owner' }, true);
  ok(f.offered.build && f.offered.optimise, 'both plans stay available');
  ok(f.reason === BUILD_DEFAULT_REASON && /^Build is usually the best route\. Use Optimise if they need to keep their current website because they're still tied into an existing agency contract\.$/.test(f.reason ?? ''), 'the rep copy is the approved sentence');
  ok(!/keep their own website/i.test(f.reason ?? ''), 'the old "They keep their own website — Optimise" wording is gone');
}

console.log('\n── AGENCY AND CONTRACT ──');
{
  const tied = offerFit({ manager: 'agency', agency_contract: 'in_contract' }, true);
  ok(tied.recommended === 'optimise' && tied.offered.optimise && !tied.offered.build, 'agency + still in contract → Optimise recommended (Build not offered to a salesperson: the existing safeguard)');
  ok(offerFit({ manager: 'third_party', agency_contract: 'in_contract' }, true).recommended === 'optimise', 'another third party in contract → Optimise recommended');
  const free = offerFit({ manager: 'agency', agency_contract: 'free' }, true);
  ok(free.recommended === 'build' && free.offered.build && free.offered.optimise, 'agency but the contract ended / free to leave → Build recommended');
  ok(rec({ manager: 'owner', agency_contract: 'in_contract' }) === 'build', 'a stale contract answer on a self-managed site is not a blocker (it needs an agency)');
  for (const c of ['not_sure', undefined] as const) {
    const u = offerFit({ manager: 'agency', agency_contract: c }, true);
    ok(u.recommended === 'build' && u.offered.build && u.offered.optimise, `agency + contract ${c ?? 'unanswered'} → Build recommended, NOT Optimise`);
    ok(u.reason === AGENCY_CONTRACT_UNCONFIRMED_REASON && /confirm whether they're still in contract before you close/.test(u.reason ?? ''), `…and the rep is told to confirm the contract before closing (${c ?? 'unanswered'})`);
  }
  ok(!(['in_contract'] as const).some((c) => rec({ manager: 'owner', agency_contract: c }) === 'optimise'), 'Optimise needs BOTH an agency/third party AND a confirmed live contract');
}

console.log('\n── THE EXACT CONDITION, ENUMERATED ──');
{
  const managers = [undefined, 'owner', 'employee', 'agency', 'third_party', 'not_sure', 'no_website'] as const;
  const contracts = [undefined, 'in_contract', 'free', 'not_sure'] as const;
  const bad: string[] = [];
  for (const manager of managers) for (const agency_contract of contracts) for (const access of [undefined, 'yes', 'no'] as const) for (const domain of [undefined, 'yes', 'no'] as const) {
    const a = { manager, agency_contract, access, domain } as QuickCloseAnswers;
    const r = offerFit(a, true).recommended;
    const expectOptimise = (manager === 'agency' || manager === 'third_party') && agency_contract === 'in_contract';
    if ((r === 'optimise') !== expectOptimise) bad.push(JSON.stringify(a));
  }
  ok(bad.length === 0, `Optimise is recommended in exactly one situation, across ${managers.length * contracts.length * 9} answer combinations${bad.length ? ' — WRONG: ' + bad.slice(0, 2).join(' ') : ''}`);
  ok(rec({ manager: 'agency', agency_contract: 'in_contract' }, false) === 'build', 'no website on file: Optimise cannot be recommended whatever else is answered');
}

console.log('\n── THE BADGE FOLLOWS THE ANSWER IMMEDIATELY ──');
{
  let a: QuickCloseAnswers = { manager: 'agency' };
  const seq: Array<[string, QuickCloseAnswers['agency_contract'] | undefined, string | null]> = [['unanswered', undefined, 'build'], ['in contract', 'in_contract', 'optimise'], ['free to leave', 'free', 'build'], ['not sure', 'not_sure', 'build'], ['in contract again', 'in_contract', 'optimise']];
  for (const [label, c, want] of seq) { a = { ...a, agency_contract: c }; ok(rec(a) === want, `contract ${label} → ${want}`); }
  const dlg = read('src/components/QuickCloseDialog.tsx');
  ok(/v\.offer\?\.recommended === o\.value/.test(dlg) && /\.sort\(\(x, y\) =>/.test(dlg) && /Recommended/.test(dlg), 'the Quick Close plan cards read the recommendation from the live view and put the recommended card first');
  const fn = read('supabase/functions/quick-close/index.ts');
  ok(/offer: offerFit\(answers, hasWebsite\)/.test(fn), 'the server recomputes the recommendation from the stored answers on every view (every save returns it)');
  const cc = read('src/components/ColdCallPlaybook.tsx');
  ok(/const fit = ans\.v \? offerFit\(ans\.answers,/.test(cc) && /const preferred = fit\?\.recommended \?\? s\.plans\.preselected/.test(cc), 'the Call screen recomputes from the call answers on every render');
}

console.log('\n── CARDS AND ORDER ──');
{
  const q = QUICK_CLOSE_QUESTIONS.find((x) => x.key === 'route')!;
  ok(q.options[0].value === 'build' && q.options[0].label === 'Findable Build — a new website built and optimised for AI visibility' && q.options[1].label === 'Findable Optimise — improve their current website', 'default order and labels: Findable Build first, Findable Optimise second (final pass wording)');
  ok(preselectedPlan('own_site') === 'build' && preselectedPlan('none') === 'build' && preselectedPlan(null) === 'build', 'the call script opens on Build for every site source');
  ok(routesFor('own_site').routes.join() === 'build,optimise', 'an own-site lead lists Build first and still offers Optimise');
}

console.log('\n── A SALESPERSON CAN STILL CHOOSE THE OTHER PLAN, UNDER THE EXISTING SAFEGUARDS ──');
{
  const base = { decision_maker: 'yes' as const, domain: 'yes' as const, rights: 'yes' as const }; // final pass: the close asks the domain and the reuse right before the plan
  const optimiseOnOwnSite = { ...base, route: 'optimise' as const, manager: 'owner' as const, access: 'yes' as const };
  ok(quickCloseGate(optimiseOnOwnSite).complete && quickCloseState('answers_saved', { answers: optimiseOnOwnSite }) === 'ready', 'choosing Optimise although Build is recommended is allowed (self-managed site) and reaches ready');
  const buildTied = { ...base, route: 'build' as const, manager: 'agency' as const, agency_contract: 'in_contract' as const };
  ok(agencyContractBlocksBuild(buildTied) && quickCloseState('answers_saved', { answers: buildTied }) === 'needs_review' && !mayGenerateLink('answers_saved', { answers: buildTied }), 'Build while the agency contract is still on: stops for Paul, no link (unchanged)');
  const buildNotSure = { ...buildTied, agency_contract: 'not_sure' as const };
  ok(quickCloseState('answers_saved', { answers: buildNotSure }) === 'needs_review', 'Build with the contract "not sure": stops for Paul (unchanged)');
  const buildUnasked = { ...base, route: 'build' as const, manager: 'agency' as const };
  ok(missingQuestions(buildUnasked).includes('agency_contract') && !mayGenerateLink('answers_saved', { answers: buildUnasked }), 'Build on an agency-run site must answer the contract question before any link can be made (the "confirm before closing" step)');
  const buildFree = { ...buildTied, agency_contract: 'free' as const };
  ok(quickCloseState('answers_saved', { answers: buildFree }) === 'ready', 'Build with the contract confirmed ended: ready, no review');
}

console.log('\n── COMMERCIAL TERMS ARE UNTOUCHED ──');
{
  ok(FINDABLE_OPTIMISE_TOTAL_PAYMENTS === 6 && FINDABLE_BUILD_TOTAL_PAYMENTS === 12 && FINDABLE_MONTHLY_GBP === 99 && FINDABLE_CONTINUING_GBP === 29.99, 'Optimise 6 x £99, Build 12 x £99, optional £29.99');
  ok(continuingModeFor(COMMERCIAL_TERMS_V4, 'optimise') === 'none' && continuingModeFor(COMMERCIAL_TERMS_V4, 'build') === 'optional', 'v4: Optimise has no continuation, Build\'s £29.99 is optional');
  ok(/ends after payment 6 and the final service period/.test(afterTermSummaryWords('optimise')) && /optional/.test(afterTermSummaryWords('build')), 'the v4 end-of-term wording is unchanged');
  const diff = read('src/lib/findableOffer.ts') + read('src/lib/clientAgreement.ts');
  ok(diff.length > 0, 'terms modules unchanged by this fix (they are not edited here; scripts/client-agreement-v4.test.ts pins them)');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
