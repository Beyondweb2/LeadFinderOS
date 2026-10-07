/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES → SIGN-UP → AGREEMENT → PAYMENT — THE FINAL PASS (2026-10-07).
   Record: docs/pre-sales-certification/sales-to-payment-final-pass.md
   Run: FINDABLE_SITE_DIR=<findable-site checkout> npx tsx scripts/sales-to-payment-final-pass.test.ts

   Pins, in one place: Quick Close's questions and the Build-first recommendation (scenarios A–E of the brief,
   driven through the real save / gate code), the sign-up link lifecycle (a sales-created sign-up is RESUMED on
   its own URL — reopen, resume, resend, no duplicate, seller and plan kept), the client's "here's what we have
   so far" confirmation (it can correct four facts and never the plan, price or seller), and that the
   agreement / payment gates and the v4 terms are untouched.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { findableSiteDir } from './findable-site-dir.mjs';
import {
  CONFIRM_CONTRACT_WARNING, DOMAIN_NOT_WEBSITE_LINE, REUSE_NO_LINE, REUSE_YES_LINE, agencyContractBlocksBuild, closeFlow, effectiveAnswers, mayGenerateLink, missingQuestions,
  offerFit, planQuickCloseSave, quickCloseGate, quickCloseState, routeChoiceAnswers, type QcRecord, type QuickCloseAnswers,
} from '../src/lib/quickClose.ts';
import { planClientConfirmation, resumeDecision, salesSignupFor, type SignupRow } from '../src/lib/salesSignup.ts';
import { confirmItemApplies, confirmItemsFor } from '../src/lib/clientConfirm.ts';
import { CLIENT_AGREEMENT_VERSION } from '../src/lib/clientAgreement.ts';
import { checkoutAgreementGate } from '../src/lib/signupGate.ts';
import { FINDABLE_SETUP_PRICE_GBP, planTierForRoute, serviceRouteFromRow, totalPaymentsFor } from '../src/lib/findableOffer.ts';
import { afterTermRepLine } from '../src/lib/planTerms.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const SITE = findableSiteDir(ROOT);
const siteRead = (rel: string) => { const p = path.join(SITE, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null; };
const NOW = Date.parse('2026-10-07T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

/** One rep, one tap at a time, through the REAL save planner (exactly what fn quick-close runs). */
function closeSession() {
  let qc: QcRecord = { answers: {} };
  let cols: Record<string, unknown> = {};
  return {
    get qc() { return qc; },
    get cols() { return cols; },
    answer(a: Record<string, string>) {
      const plan = planQuickCloseSave(qc, a, { routeChangeConfirmed: true, actorId: 'rep-1', nowIso: iso(NOW) });
      if (!plan.ok) throw new Error(`refused: ${plan.error}`);
      qc = plan.next; cols = { ...cols, ...plan.cols };
      return plan;
    },
    state() { return quickCloseState('answers_saved', qc, NOW); },
    /** The link was made (v3: the agreement link), stored the way adoptLink stores it. */
    linkMade() { qc = { ...qc, link_url: 'https://findable.live/agree/' + 'a'.repeat(64), link_kind: 'signup', link_generated_at: iso(NOW - 3_600_000), link_expires_at: iso(NOW + 29 * 24 * 3_600_000) }; },
  };
}
const row = (id: string, qc: QcRecord, cols: Record<string, unknown>, extra: Partial<SignupRow> = {}): SignupRow => ({ id, status: 'answers_saved', created_at: '2026-10-07T09:00:00Z', plan_tier: cols.plan_tier, website_addon: cols.website_addon, quick_close: qc, ...extra });

console.log('── A. BUILD · SELF-MANAGED ──');
{
  const s = closeSession();
  s.answer({ decision_maker: 'yes' }); s.answer({ manager: 'owner' }); s.answer({ domain: 'yes' }); s.answer({ rights: 'yes' });
  const fit = offerFit(s.qc.answers as QuickCloseAnswers, true);
  ok(fit.recommended === 'build' && fit.offered.build && fit.offered.optimise && fit.warning === null, 'Build is recommended; both plans open; no warning');
  ok(fit.notes.includes(REUSE_YES_LINE) && fit.notes.includes(DOMAIN_NOT_WEBSITE_LINE), '…with the reuse line ("very close to the look they already like") and the domain-is-not-the-website line');
  s.answer({ route: 'build' });
  ok(s.state() === 'ready' && s.cols.plan_tier === 'new_site' && s.cols.website_addon === true && serviceRouteFromRow(s.cols) === 'build' && totalPaymentsFor('build') === 12, 'ready; sold as Build (12 payments) from the row');
  s.linkMade();
  ok(s.state() === 'link_generated', 'the sign-up link is made');
  const rows = [row('OB1', s.qc, s.cols)];
  ok(salesSignupFor(rows, NOW)?.ready === true && resumeDecision(rows, NOW).kind === 'resume', 'the customer opening it: the SAME sign-up resumes (ready, Build)');
}

console.log('\n── B. BUILD · AGENCY BUT FREE TO LEAVE ──');
{
  const s = closeSession();
  s.answer({ decision_maker: 'yes', manager: 'agency' });
  ok(missingQuestions(s.qc.answers as QuickCloseAnswers)[0] === 'agency_contract', 'an agency → the contract question comes next');
  s.answer({ agency_contract: 'free' }); s.answer({ domain: 'agency' }); s.answer({ rights: 'no' });
  const fit = offerFit(s.qc.answers as QuickCloseAnswers, true);
  ok(fit.recommended === 'build' && fit.offered.build && fit.warning === null, 'contract = No → Build recommended, no warning');
  ok(fit.notes.includes(REUSE_NO_LINE) && !/identical|clone|exact copy/i.test(fit.notes.join(' ')), 'no reuse right → an original site, never a promised copy');
  s.answer({ route: 'build' });
  const g = quickCloseGate(s.qc.answers as QuickCloseAnswers);
  ok(s.state() === 'ready' && g.review.length === 0 && g.flags.includes('domain_handoff'), 'ready; the agency-held domain is a note for Paul, never a stop (keeping the domain ≠ keeping the website)');
}

console.log('\n── C. OPTIMISE · CONTRACT BLOCKER ──');
{
  const s = closeSession();
  s.answer({ decision_maker: 'yes', manager: 'agency', agency_contract: 'in_contract', domain: 'yes', rights: 'yes' });
  const fit = offerFit(s.qc.answers as QuickCloseAnswers, true);
  ok(fit.recommended === 'optimise' && !fit.offered.build && fit.offered.optimise && agencyContractBlocksBuild(s.qc.answers as QuickCloseAnswers), 'agency + still in contract → Optimise recommended; Build not offered to a salesperson');
  s.answer({ route: 'optimise' });
  ok(s.state() === 'in_progress' && missingQuestions(s.qc.answers as QuickCloseAnswers).join() === 'access', 'Optimise adds only "can Findable get in?"');
  s.answer({ access: 'yes' });
  ok(s.state() === 'ready' && s.cols.plan_tier === 'keep' && s.cols.website_addon === false && totalPaymentsFor('optimise') === 6 && /plan ends/.test(afterTermRepLine('optimise')) && !/29\.99/.test(afterTermRepLine('optimise')), 'ready; Optimise: 6 payments, then it ends — no £29.99');
  ok(/optional/i.test(afterTermRepLine('build')) || /If they want us to keep hosting/.test(afterTermRepLine('build')), 'Build: the £29.99 is only if they want hosting / maintenance after the term');
}

console.log('\n── D. UNKNOWN CONTRACT ──');
{
  const s = closeSession();
  s.answer({ decision_maker: 'yes', manager: 'agency', agency_contract: 'not_sure', domain: 'yes', rights: 'yes' });
  const fit = offerFit(s.qc.answers as QuickCloseAnswers, true);
  ok(fit.recommended === 'build' && fit.offered.build && fit.warning === CONFIRM_CONTRACT_WARNING, 'contract "Not sure": Build stays the default, with the warning "Confirm their agency contract before finalising Build."');
  s.answer({ route: 'build' });
  ok(s.state() === 'needs_review' && !mayGenerateLink('answers_saved', s.qc, NOW), 'the Build still stops for Paul\'s release until the contract is confirmed free (the existing payment stop is unchanged)');
  ok(quickCloseState('answers_saved', { ...s.qc, review_approved_at: iso(NOW) }, NOW) === 'ready', '…and he can release it');
  ok(fit.recommended !== 'optimise', 'never silently recommends Optimise');
}

console.log('\n── E. NO WEBSITE ──');
{
  const s = closeSession();
  s.answer({ decision_maker: 'yes', manager: 'no_website' });
  ok(closeFlow(s.qc.answers as QuickCloseAnswers).join() === 'decision_maker,manager,domain,route', 'the reuse question is never asked; no contract question either');
  s.answer({ domain: 'no_domain' });
  const fit = offerFit(s.qc.answers as QuickCloseAnswers, false);
  ok(fit.recommended === 'build' && !fit.offered.optimise && fit.notes.length === 0, 'Build only, and no ownership notes');
  s.answer({ route: 'build' });
  ok(s.state() === 'ready' && missingQuestions(s.qc.answers as QuickCloseAnswers).length === 0, 'ready — nothing irrelevant asked');
}

console.log('\n── F. REOPEN · RESUME · RESEND · NO DUPLICATE · SELLER AND PLAN KEPT ──');
{
  const s = closeSession();
  s.answer({ decision_maker: 'yes', manager: 'owner', domain: 'yes', rights: 'yes', route: 'build' }); s.linkMade();
  const held = row('OB-SALES', s.qc, s.cols);
  const first = resumeDecision([held], NOW);
  const again = resumeDecision([held], NOW + 3 * 24 * 3_600_000);
  ok(first.kind === 'resume' && again.kind === 'resume' && first.onboardingId === 'OB-SALES' && again.onboardingId === 'OB-SALES', 'opened, closed, reopened days later (or the same link resent): the SAME sign-up both times');
  ok(first.kind === 'resume' && first.route === 'build', '…on the plan the salesperson chose');
  /* A client who answered some questions on the self-service page leaves a NEWER row; the salesperson's still wins
     only while it is the newest unpaid — so the server must never create one (it resumes instead). */
  ok(resumeDecision([], NOW).kind === 'self_service' && resumeDecision([{ ...held, quick_close: null }], NOW).kind === 'self_service', 'a lead with no Quick Close sign-up runs the ordinary self-service flow');
  const unfinished = row('OB-X', { answers: { decision_maker: 'yes' } }, {});
  ok(resumeDecision([unfinished], NOW).kind === 'pending', 'a sign-up Quick Close has not finished is "pending" — said plainly, never an error');
  ok(resumeDecision([{ ...held, status: 'paid' }], NOW).kind === 'self_service', 'a paid sign-up never holds the lead');
  const ob = read('supabase/functions/findable-onboarding/index.ts');
  const submit = ob.slice(ob.indexOf('// LEAD MODE'), ob.indexOf('// LEAD MODE') + 9000);
  ok(!/error: "signup_in_progress"/.test(ob), 'THE REGRESSION: the server no longer answers a valid sales sign-up with signup_in_progress ("already set up with the plan you agreed")');
  ok(/decision\.kind === "resume"[\s\S]{0,900}resumed: true/.test(submit) && !/saveAnswers/.test(submit.slice(submit.indexOf('decision.kind === "resume"'), submit.indexOf('decision.kind === "resume"') + 900)), 'a submit on a ready sales sign-up RESUMES it and creates nothing');
  ok(/onboarding_id: decision\.onboardingId, resumed: true, route: decision\.route/.test(ob) && !/plan_tier|website_addon/.test(ob.slice(ob.indexOf('decision.kind === "resume"'), ob.indexOf('decision.kind === "resume"') + 900)), 'the resume reads no plan from the request and writes no plan');
  const fillAt = ob.indexOf('Light-touch: anything they typed fills an EMPTY');
  ok(fillAt > 0 && /\.is\(col, null\)/.test(ob.slice(fillAt, fillAt + 600)), 'what they typed fills EMPTY contact fields only — never replaces what Sales recorded');
  /* Seller attribution: the sign-up row is Quick Close's, so sale_creations (the creator of that row) is untouched. */
  ok(!/sale_creations/.test(ob.slice(ob.indexOf('action === "sales_confirm"'), ob.indexOf('action === "q2_prefill"'))) && !/sold_by|assigned_to|user_id: (cLead|confirm)/.test(ob.slice(ob.indexOf('action === "sales_confirm"'), ob.indexOf('action === "q2_prefill"')).replace(/user_id: owner\.user_id/g, '')), 'the confirmation never touches who sold it (sale_creations / sold_by / assigned_to)');
}

console.log('\n── CLIENT CONFIRMATION: "here\'s what we have so far" ──');
{
  const s = closeSession();
  s.answer({ decision_maker: 'yes', manager: 'agency', agency_contract: 'free', domain: 'yes', rights: 'yes', route: 'build' }); s.linkMade();
  const items = confirmItemsFor(s.qc);
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  ok(items.map((i) => i.key).join() === 'manager,agency_contract,domain,rights', 'four facts, in order');
  ok(by.manager.answer === 'An agency' && by.agency_contract.answer === 'No' && by.domain.answer === 'We do' && by.rights.answer === 'Yes', 'prefilled from what Sales recorded, in the client\'s words');
  const vals = (o: Record<string, string>) => o as never;
  ok(confirmItemApplies(by.agency_contract, vals({ manager: 'agency' })) && !confirmItemApplies(by.agency_contract, vals({ manager: 'owner' })) && !confirmItemApplies(by.rights, vals({ manager: 'no_website' })) && confirmItemApplies(by.rights, vals({ manager: 'owner' })), 'the contract applies only to an agency / freelancer; the reuse question never to "no website"');
  ok(/what we have so far|Here/.test('Here&rsquo;s what we have so far') && !JSON.stringify(items).includes('route') && !JSON.stringify(items).includes('£'), 'the card carries no plan, route or price');

  // Looks right: nothing changed.
  const same = planClientConfirmation(s.qc as never, { manager: 'agency', agency_contract: 'free', domain: 'yes', rights: 'yes' }, iso(NOW));
  ok(same.ok && same.changed.length === 0 && Object.keys(same.columns).length === 0 && !same.holds, '"Looks right": recorded, nothing changed, nothing written to the sign-up columns, nothing held');
  ok(same.ok && same.next.link_url === s.qc.link_url && state(same.next) === 'link_generated', '…and the salesperson\'s link is untouched and still usable');
  const unsureC = planClientConfirmation(s.qc as never, { manager: 'agency', agency_contract: 'not_sure', domain: 'yes', rights: 'yes' }, iso(NOW));
  ok(unsureC.ok && unsureC.holds && state(unsureC.next) === 'needs_review', 'the client saying "not sure" about the contract on a Build holds it for Paul too (same rule as the salesperson\'s)');

  // A harmless correction.
  const fix = planClientConfirmation(s.qc as never, { manager: 'agency', agency_contract: 'free', domain: 'not_sure', rights: 'yes' }, iso(NOW));
  ok(fix.ok && fix.changed.join() === 'domain' && !fix.holds && fix.columns.domain_owned === 'not_sure', '"Change" the domain to Not sure: recorded, the matching columns follow, not a stop');

  // The one that matters: a correction that makes Build unsafe.
  const tied = planClientConfirmation(s.qc as never, { manager: 'agency', agency_contract: 'in_contract', domain: 'yes', rights: 'yes' }, iso(NOW));
  ok(tied.ok && tied.changed.join() === 'agency_contract' && tied.holds, 'saying they ARE still tied into the contract HOLDS the Build sign-up for Paul');
  ok(tied.ok && state(tied.next) === 'needs_review' && !mayGenerateLink('answers_saved', tied.next, NOW), '…even though the link already exists (the link does not override the client\'s own answer)');
  ok(tied.ok && effectiveAnswers(tied.next).route === 'build', '…and the plan is STILL Build (a correction never changes the plan)');
  const approved = { ...s.qc, review_approved_at: iso(NOW) } as QcRecord;
  const tied2 = planClientConfirmation(approved as never, { manager: 'agency', agency_contract: 'in_contract' }, iso(NOW));
  ok(tied2.ok && tied2.next.review_approved_at === null, 'a real change withdraws an earlier release, so Paul sees the new situation');

  // Tampering: the request carries the plan, the price, the seller.
  const tamper = planClientConfirmation(s.qc as never, { manager: 'owner', route: 'optimise', approach: 'improve', plan_tier: 'keep', website_addon: false, amount: 1, sold_by_user_id: 'x', decision_maker: 'no', authority: 'yes' }, iso(NOW));
  ok(tamper.ok && Object.keys(tamper.next.client_confirmed!.answers).join() === 'manager', 'plan, approach, price, seller, authority and the decision maker in the request are ignored — only the four facts are read');
  ok(tamper.ok && !('plan_tier' in tamper.columns) && !('website_addon' in tamper.columns) && effectiveAnswers(tamper.next).route === 'build' && (tamper.next.answers as QuickCloseAnswers).route === 'build' && (tamper.next.answers as QuickCloseAnswers).decision_maker === 'yes', 'the stored plan, decision maker and columns are exactly what Sales recorded');
  ok(!planClientConfirmation(s.qc as never, { route: 'optimise', evil: 'x' }, iso(NOW)).ok, 'a request with none of the four facts changes nothing');
  ok(planClientConfirmation(s.qc as never, { manager: 'martian' }, iso(NOW)).ok === false, 'an unknown value is not an answer');
}

console.log('\n── PAYMENT SAFETY · AGREEMENT · v4 (unchanged) ──');
{
  ok(CLIENT_AGREEMENT_VERSION === 'v4' && FINDABLE_SETUP_PRICE_GBP === 99 && totalPaymentsFor('build') === 12 && totalPaymentsFor('optimise') === 6, 'new sign-ups sign v4; £99 × 12 (Build) / × 6 (Optimise)');
  const sha = 'a'.repeat(64);
  const good = { id: 'A1', lead_id: 'L1', onboarding_id: 'OB1', agreement_version: CLIENT_AGREEMENT_VERSION, service_route: 'build', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: sha };
  const g = (o: Record<string, unknown> = {}, acc: unknown = good) => checkoutAgreementGate({ acceptance: acc as never, leadId: 'L1', onboardingId: 'OB1', route: 'build', currentVersion: CLIENT_AGREEMENT_VERSION, recomputedSha: sha, ...o } as never);
  ok(g().ok && !g({}, null).ok && !g({ route: 'optimise' }).ok && !g({ onboardingId: 'OB2' }).ok, 'payment opens only on a v4 signature for THIS sign-up and THIS plan');
  const co = read('supabase/functions/findable-checkout/index.ts');
  ok(!/body\.(price|amount|plan|plan_tier|route|service_route)\b/.test(co) && /const route = serviceRouteFromRow\(ob/.test(co), 'checkout reads the plan from the stored row, never from the request');
  ok(/checkout_refused_client_correction_held/.test(co) && /client_confirmed/.test(co.slice(co.indexOf('checkout_refused_client_correction_held') - 600, co.indexOf('checkout_refused_client_correction_held'))), 'checkout refuses a sign-up the client\'s own correction put on hold');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  ok(/ignoreDuplicates: true/.test(wh), 'a duplicate webhook is ignored (the payment ties to its signature once)');
  ok(/planTierForRoute\(.*\)/.test(read('src/lib/quickClose.ts')) && planTierForRoute('build') === 'new_site' && planTierForRoute('optimise') === 'keep', 'the plan is written to the row by Quick Close (planTierForRoute), the one source');
}

console.log('\n── THE SERVER: sales_confirm ──');
{
  const ob = read('supabase/functions/findable-onboarding/index.ts');
  const at = ob.indexOf('if (action === "sales_confirm")');
  const block = ob.slice(at, ob.indexOf('if (action === "q2_prefill")'));
  ok(at > 0 && /decision\.kind !== "resume" \|\| decision\.onboardingId !== confirmOnboardingId\) return json\(\{ ok: false, error: "not_held" \}, 409\)/.test(block), 'only the lead\'s OWN held, ready sign-up can be confirmed — another row / lead / a made-up id is refused (not_held)');
  ok(/PAID_OR_BEYOND\.has\(cLead\.status/.test(block) && /already_client/.test(block), 'a paid client cannot use it');
  ok(/planClientConfirmation\(cur, body\.answers/.test(block) && !/body\.(plan|route|plan_tier|price|amount|website_addon)/.test(block), 'the only input read is the four-fact answers');
  ok(/quick_close->>rev/.test(block) && /continue; \/\/ a salesperson wrote first/.test(block), 'rev-conditional: a salesperson saving at the same moment is never overwritten');
  ok(!/(plan_tier|website_addon)\s*:/.test(block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'the block never writes plan_tier / website_addon (it only READS them to find the sign-up)');
  ok(/\[functions\.findable-onboarding\]\nverify_jwt = false/.test(read('supabase/config.toml')), 'findable-onboarding stays a public (capability-URL) endpoint, as before');
}

console.log('\n── THE PAGE (findable.live) ──');
{
  const flow = siteRead('src/components/OnboardingFlow.tsx');
  if (!flow) ok(false, `findable-site not found at ${SITE} — set FINDABLE_SITE_DIR (this is not a pass)`);
  else {
    const code = flow.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    ok(/Here&rsquo;s what we have so far/.test(code) && /"Looks right"/.test(code) && />\s*Change\s*</.test(code) && /Save and continue/.test(code), 'the intro shows "Here\'s what we have so far" with Looks right / Change');
    ok(/action: "sales_confirm"/.test(code) && /lead_id: leadId, onboarding_id: salesSignup\.onboardingId, answers/.test(code), 'it posts only the lead, THE held sign-up id and the answers');
    ok(/clearDraft\(\);\s*setPhase\(\(prev\) => \(prev === "questions" \|\| prev === "submitting" \? "intro" : prev\)\)/.test(code), 'THE ROOT CAUSE FIXED: a sales-held sign-up drops a stale draft and leaves the questions');
    ok(/r\.resumed === true/.test(code) && /setPhase\("plan"\)/.test(code.slice(code.indexOf('r.resumed === true'), code.indexOf('r.resumed === true') + 1400)), 'a submit the server resumed carries on to that sign-up\'s plan');
    ok(!/Your sign-up is already set up with the plan you agreed with us/.test(code) && /Your Findable contact is finishing your set-up/.test(code), 'the misleading sentence is gone; a not-ready sign-up says it is being finished');
    ok(/held_for_review/.test(code), 'a sale a correction put on hold is explained at checkout');
    const intro = code.slice(code.indexOf('phase === "intro" && ('), code.indexOf('phase === "questions"', code.indexOf('phase === "intro" && (')));
    ok(!/£|SETUP_PRICE|PriceText/.test(intro), 'the first screen still names no price');
    ok(/parseConfirmItems/.test(code) && /showIf/.test(code), 'the page only DRAWS the items — the server decides which apply (showIf)');
  }
}

console.log('\n── QUICK CLOSE SCREEN ──');
{
  const dlg = read('src/components/QuickCloseDialog.tsx');
  ok(/qc-offer-warning/.test(dlg) && /qc-offer-notes/.test(dlg) && /\.filter\(\(o\) => !o\.legacy \|\| answers\[current!\] === o\.value\)/.test(dlg), 'the plan step shows the recommendation, the contract warning and the notes; legacy answers are not offered');
  ok(/Question \$\{Math\.min\(answeredCount \+ 1, shownQs\.length\)\} of \$\{shownQs\.length\}|Question \{Math\.min\(answeredCount \+ 1, shownQs\.length\)\} of \{shownQs\.length\}/.test(dlg) && /data-testid="qc-progress"/.test(dlg), 'progress is shown (N of M, a bar)');
  const lib = read('src/lib/quickClose.ts');
  const banned = ['registrar', 'dns login', 'cms login', 'hosting password', 'google business login', 'expiry', 'logo', 'photos', 'plugin'];
  const asked = JSON.stringify(closeFlow({ manager: 'agency' }).map((k) => lib.match(new RegExp(`key: '${k}', text: '([^']*)'`))?.[1] ?? '')).toLowerCase();
  ok(banned.every((b) => !asked.includes(b)), 'the close asks for no registrar, logins, contract dates, logos, photos or plugin details (those are post-payment)');
  ok(!/india|IN\b.*enable/i.test(read('src/lib/quickClose.ts')) && !/australia.*cold/i.test(read('src/lib/quickClose.ts')), 'no market switches touched');
}

function state(qc: QcRecord) { return quickCloseState('answers_saved', qc, NOW); }
void routeChoiceAnswers;
console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURES`);
if (f) process.exit(1);
