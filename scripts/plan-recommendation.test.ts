/* ============================================================
   PLAN RECOMMENDATION (Paul, 2026-10-07): FINDABLE BUILD IS THE DEFAULT.
   🔴 v5 (Paul, 2026-10-16, Client Service Agreement v5): FINDABLE BUILD IS THE ONLY PLAN FOR SALE. Optimise is
   withdrawn: it is never recommended or offered. An agency / third party runs the site AND the client is still tied into
   that contract (clause 1.6) → the sale is DECLINED: nothing is offered, and Paul's release cannot lift it. "Not sure"
   keeps Build and waits for Paul's review. Having, owning, keeping or being able to edit a website is never a reason
   for anything else. The terms of the plans are untouched here.
   Run: npx tsx scripts/plan-recommendation.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import {
  offerFit, agencyContractBlocksBuild, quickCloseGate, quickCloseState, mayGenerateLink, missingQuestions, planQuickCloseSave, QUICK_CLOSE_QUESTIONS,
  BUILD_DEFAULT_REASON, AGENCY_CONTRACT_UNCONFIRMED_REASON, TIED_IN_DECLINE_REASON, type QuickCloseAnswers,
} from '../src/lib/quickClose.ts';
import { preselectedPlan } from '../src/lib/callScript.ts';
import { routesFor } from '../src/lib/callClose.ts';
import { afterTermSummaryWords, FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_OPTIMISE_TOTAL_PAYMENTS, FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP } from '../src/lib/findableOffer.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const rec = (a: QuickCloseAnswers, site = true) => offerFit(a, site).recommended;

console.log('── BUILD IS THE ONE PLAN ──');
ok(rec({ manager: 'owner' }) === 'build', 'existing website, self-managed by the owner → Build');
ok(rec({ manager: 'employee' }) === 'build', 'an employee manages it → Build');
ok(rec({}) === 'build', 'nothing answered yet (a website exists) → Build, never Optimise');
ok(rec({ manager: 'not_sure' }) === 'build', 'who runs it is not known → Build');
ok(rec({ access: 'yes', manager: 'owner' }) === 'build', 'we CAN get into their current site → still Build');
ok(rec({ access: 'yes' }) === 'build' && rec({ access: 'no' }) === 'build', 'website access, either answer, does not move the offer');
ok(rec({ domain: 'yes', manager: 'owner' }) === 'build', 'they want to keep their domain → Build');
ok(rec({ approach: 'improve', manager: 'owner' }) === 'build', 'even a legacy "improve" approach does not bring Optimise back');
ok(rec({ manager: 'no_website' }, false) === 'build' && !offerFit({ manager: 'no_website' }, false).offered.optimise, 'no website → Build');
{
  const f = offerFit({ manager: 'owner' }, true);
  ok(f.offered.build && !f.offered.optimise && !f.declined, 'v5: Build is offered; Optimise never is');
  ok(f.reason === BUILD_DEFAULT_REASON && !/optimise/i.test(f.reason ?? ''), 'the rep copy names Build only');
  ok(!/keep their own website/i.test(f.reason ?? ''), 'the old "They keep their own website — Optimise" wording is gone');
}

console.log('\n── AGENCY AND CONTRACT ──');
{
  const tied = offerFit({ manager: 'agency', agency_contract: 'in_contract' }, true);
  ok(tied.declined && tied.recommended === null && !tied.offered.optimise && !tied.offered.build && tied.reason === TIED_IN_DECLINE_REASON, 'agency + still tied in → DECLINED (clause 1.6): nothing offered, a plain reason');
  ok(offerFit({ manager: 'third_party', agency_contract: 'in_contract' }, true).declined, 'another third party still tied in → declined');
  const free = offerFit({ manager: 'agency', agency_contract: 'free' }, true);
  ok(free.recommended === 'build' && free.offered.build && !free.offered.optimise && !free.declined, 'agency but the contract ended / free to leave → Build');
  ok(rec({ manager: 'owner', agency_contract: 'in_contract' }) === 'build' && !offerFit({ manager: 'owner', agency_contract: 'in_contract' }, true).declined, 'a stale contract answer on a self-managed site is not a decline (it needs an agency)');
  for (const c of ['not_sure', undefined] as const) {
    const u = offerFit({ manager: 'agency', agency_contract: c }, true);
    ok(u.recommended === 'build' && u.offered.build && !u.offered.optimise && !u.declined, `agency + contract ${c ?? 'unanswered'} → Build, NOT a decline`);
    ok(u.reason === AGENCY_CONTRACT_UNCONFIRMED_REASON && /still tied into a contract with them before you close/.test(u.reason ?? ''), `…and the rep is told to confirm the contract before closing (${c ?? 'unanswered'})`);
  }
}

console.log('\n── THE EXACT CONDITION, ENUMERATED ──');
{
  const managers = [undefined, 'owner', 'employee', 'agency', 'third_party', 'not_sure', 'no_website'] as const;
  const contracts = [undefined, 'in_contract', 'free', 'not_sure'] as const;
  const bad: string[] = [];
  for (const manager of managers) for (const agency_contract of contracts) for (const access of [undefined, 'yes', 'no'] as const) for (const domain of [undefined, 'yes', 'no'] as const) {
    const a = { manager, agency_contract, access, domain } as QuickCloseAnswers;
    const f = offerFit(a, true);
    const expectDecline = (manager === 'agency' || manager === 'third_party') && agency_contract === 'in_contract';
    if (f.declined !== expectDecline || f.offered.optimise || f.recommended === 'optimise' || (!expectDecline && f.recommended !== 'build')) bad.push(JSON.stringify(a));
  }
  ok(bad.length === 0, `declined in exactly one situation, Build in every other, Optimise never — across ${managers.length * contracts.length * 9} answer combinations${bad.length ? ' — WRONG: ' + bad.slice(0, 2).join(' ') : ''}`);
  ok(offerFit({ manager: 'agency', agency_contract: 'in_contract' }, false).declined, 'no website on file does not get round a decline');
}

console.log('\n── THE BADGE FOLLOWS THE ANSWER IMMEDIATELY ──');
{
  let a: QuickCloseAnswers = { manager: 'agency' };
  const seq: Array<[string, QuickCloseAnswers['agency_contract'] | undefined, string | null]> = [['unanswered', undefined, 'build'], ['in contract', 'in_contract', null], ['free to leave', 'free', 'build'], ['not sure', 'not_sure', 'build'], ['in contract again', 'in_contract', null]];
  for (const [label, c, want] of seq) { a = { ...a, agency_contract: c }; ok(rec(a) === want, `contract ${label} → ${want ?? 'declined (nothing)'}`); }
  const dlg = read('src/components/QuickCloseDialog.tsx');
  ok(/v\.offer\?\.recommended === o\.value/.test(dlg) && /\.sort\(\(x, y\) =>/.test(dlg) && /Recommended/.test(dlg) && /testId="qc-declined"/.test(dlg), 'the Quick Close plan cards read the offer from the live view, and a decline is shown');
  const fn = read('supabase/functions/quick-close/index.ts');
  ok(/offer: offerFit\(answers, hasWebsite\)/.test(fn), 'the server recomputes the offer from the stored answers on every view (every save returns it)');
  const cc = read('src/components/ColdCallPlaybook.tsx');
  ok(/const fit = ans\.v \? offerFit\(ans\.answers,/.test(cc) && /const preferred = fit\?\.recommended \?\? s\.plans\.preselected/.test(cc) && /if \(fit\?\.declined\)/.test(cc), 'the Call screen recomputes from the call answers on every render, and shows a decline');
  ok(!/role === 'admin'/.test(cc), 'the Call screen gives nobody (not even the admin) another plan to pick');
}

console.log('\n── CARDS AND ORDER ──');
{
  const q = QUICK_CLOSE_QUESTIONS.find((x) => x.key === 'route')!;
  const offered = q.options.filter((o) => !o.legacy);
  ok(offered.length === 1 && offered[0].value === 'build' && /^Findable Build/.test(offered[0].label), 'the plan question offers Findable Build only');
  ok(q.options.some((o) => o.value === 'optimise' && o.legacy), '…and Optimise stays a legacy value, so an old close still reads');
  ok(preselectedPlan('own_site') === 'build' && preselectedPlan('none') === 'build' && preselectedPlan(null) === 'build', 'the call script opens on Build for every site source');
  ok(routesFor('own_site').routes.join() === 'build' && routesFor('none').routes.join() === 'build' && routesFor('directory_profile').routes.join() === 'build', 'every lead is offered Build only');
}

console.log('\n── NOTHING CAN SELL THE WITHDRAWN PLAN; THE SAFEGUARDS HOLD ──');
{
  const base = { decision_maker: 'yes' as const, domain: 'yes' as const, rights: 'yes' as const };
  const NOW = '2026-10-16T10:00:00Z';
  for (const inc of [{ route: 'optimise' }, { approach: 'improve' }]) {
    const p = planQuickCloseSave({ answers: { ...base, manager: 'owner' } } as never, inc, { routeChangeConfirmed: true, actorId: 'rep', nowIso: NOW });
    ok(!p.ok && p.error === 'route_withdrawn', `choosing Optimise (${JSON.stringify(inc)}) is refused, even confirmed`);
  }
  const optimiseOnOwnSite = { ...base, route: 'optimise' as const, manager: 'owner' as const, access: 'yes' as const };
  ok(quickCloseState('answers_saved', { answers: optimiseOnOwnSite }) === 'in_progress' && !mayGenerateLink('answers_saved', { answers: optimiseOnOwnSite }), 'a close stored on Optimise before v5 is not ready and makes no link');
  const buildTied = { ...base, route: 'build' as const, payment_plan: 'six' as const, manager: 'agency' as const, agency_contract: 'in_contract' as const };
  ok(agencyContractBlocksBuild(buildTied) && quickCloseGate(buildTied).declined && quickCloseState('answers_saved', { answers: buildTied }) === 'declined' && !mayGenerateLink('answers_saved', { answers: buildTied }), 'Build while still tied in: DECLINED, no link');
  ok(quickCloseState('answers_saved', { answers: buildTied, review_approved_at: NOW }) === 'declined', '…and Paul cannot release it');
  const buildNotSure = { ...buildTied, agency_contract: 'not_sure' as const };
  ok(quickCloseState('answers_saved', { answers: buildNotSure }) === 'needs_review' && quickCloseState('answers_saved', { answers: buildNotSure, review_approved_at: NOW }) === 'ready', 'Build with the contract "not sure": waits for Paul (he releases it once they confirm they are free)');
  const buildUnasked = { ...base, route: 'build' as const, manager: 'agency' as const };
  ok(missingQuestions(buildUnasked).includes('agency_contract') && !mayGenerateLink('answers_saved', { answers: buildUnasked }), 'Build on an agency-run site must answer the contract question before any link can be made');
  const buildFree = { ...buildTied, agency_contract: 'free' as const };
  ok(quickCloseState('answers_saved', { answers: buildFree }) === 'ready', 'Build with the contract confirmed ended: ready, no review');
}

console.log('\n── COMMERCIAL TERMS ARE UNTOUCHED HERE ──');
{
  ok(FINDABLE_OPTIMISE_TOTAL_PAYMENTS === 6 && FINDABLE_BUILD_TOTAL_PAYMENTS === 12 && FINDABLE_MONTHLY_GBP === 99 && FINDABLE_CONTINUING_GBP === 29.99, 'Build 12 x £99, optional £29.99 (Optimise 6 kept as history only)');
  ok(/optional/.test(afterTermSummaryWords('build')), 'Build\'s end-of-term wording names the optional £29.99');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
