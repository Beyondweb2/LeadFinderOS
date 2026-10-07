/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   THE TWO WAYS TO CLOSE (2026-10-07, fix/quick-close-two-options). Pins:
     · CLOSE ON THE PHONE asks the short list (authority, who looks after the site, [contract], domain, what they offer,
       where they want to be found, THEN the plan) — never the reuse-of-design question, never a login;
     · SEND FULL SETUP is the client's own link, sent on the approved findable_signup_link template — never a Stripe URL;
     · the Build default / Optimise-only-on-a-confirmed-contract recommendation is unchanged;
     · one sign-up either way (route is derived; the phone link stamps it);
     · the client's confirmation shows services, areas and the plan, read-only.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { closeFlow, closeRouteOf, missingQuestions, offerFit, phoneCloseNotesComplete, quickCloseState, type QuickCloseRecord } from '../src/lib/quickClose.ts';
import { confirmItemsFor, confirmSummaryFor } from '../src/lib/clientConfirm.ts';
import { isSetupLinkUrl, isSignupLinkUrl, isSignupTemplateLinkUrl, setupLinkUrl } from '../src/lib/whatsappLinkTemplates.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

console.log('\n── PHONE CLOSE: the questions ──');
ok(closeFlow({}).join() === 'decision_maker,manager,domain,route', 'owner-run site: authority, who looks after the site, the domain, then the plan LAST');
ok(closeFlow({ manager: 'agency' }).join() === 'decision_maker,manager,agency_contract,domain,route', 'an agency / developer adds exactly one question: are they still tied into a contract');
ok(!closeFlow({ manager: 'owner' }).includes('rights') && !closeFlow({ manager: 'agency', route: 'optimise' }).includes('rights'), 'the reuse-of-design question is not asked any more');
ok(closeFlow({ route: 'optimise' }).join() === 'decision_maker,manager,domain,route,access', 'Optimise still adds only whether Findable can get in');
ok(!/dns|registrar|password|login|hosting|logo|photo|opening hours/i.test(closeFlow({ manager: 'agency', route: 'optimise' }).join()), 'no DNS / registrar / hosting / CMS login, photo, logo or hours on the call');
ok(!phoneCloseNotesComplete(undefined) && !phoneCloseNotesComplete({ jobs: 'Lock changes' }) && !phoneCloseNotesComplete({ areas: 'Canterbury' }) && !phoneCloseNotesComplete({ jobs: ' ', areas: ' ' }), 'services AND areas are both needed — one, blank or nothing is not complete');
ok(phoneCloseNotesComplete({ jobs: 'Emergency lockouts, lock changes', areas: 'Canterbury, Whitstable' }), 'what they offer + where they want to be found → complete');
ok(missingQuestions({ decision_maker: 'yes', manager: 'owner', domain: 'yes', route: 'build' }).length === 0, 'Build with the short answers is ready on the answers alone (the notes are checked when the link is made)');

console.log('\n── BUILD DEFAULT / OPTIMISE ONLY ON A CONFIRMED CONTRACT (unchanged) ──');
ok(offerFit({}, true).recommended === 'build' && offerFit({ manager: 'owner' }, true).recommended === 'build', 'a site they run → Build');
ok(offerFit({ manager: 'agency', agency_contract: 'free' }, true).recommended === 'build', 'an agency they can leave → Build');
ok(offerFit({ manager: 'agency', agency_contract: 'not_sure' }, true).recommended === 'build' && !!offerFit({ manager: 'agency', agency_contract: 'not_sure' }, true).warning, 'agency + not sure → still Build, with the warning');
ok(offerFit({ manager: 'owner', domain: 'not_sure' }, true).recommended === 'build', 'an unclear domain never moves the recommendation');
ok(offerFit({}, false).recommended === 'build' && !offerFit({}, false).offered.optimise, 'no website → Build');
ok(offerFit({ manager: 'agency', agency_contract: 'in_contract' }, true).recommended === 'optimise' && offerFit({ manager: 'freelancer', agency_contract: 'in_contract' }, true).recommended === 'optimise', 'Optimise is recommended ONLY for an agency / developer they are confirmed still tied into');

console.log('\n── ONE SIGN-UP, TWO ROUTES ──');
ok(closeRouteOf(null) === 'full_setup' && closeRouteOf({ answers: {} }) === 'full_setup', 'a row with no salesperson answers is the client doing it themselves');
ok(closeRouteOf({ answers: { manager: 'owner' } }) === 'phone', 'a row with a salesperson\'s answers is the phone close');

console.log('\n── THE LINKS: never a Stripe URL ──');
const LEAD = '11111111-2222-3333-4444-555555555555';
ok(setupLinkUrl(LEAD) === `https://findable.live/onboarding/?lead=${LEAD}` && isSetupLinkUrl(setupLinkUrl(LEAD)), 'the Full Setup link is the client\'s own findable.live page for that lead');
ok(isSignupTemplateLinkUrl(setupLinkUrl(LEAD)) && isSignupTemplateLinkUrl('https://findable.live/agree/' + 'a'.repeat(64)), 'the approved findable_signup_link template may carry either secure findable.live link');
ok(!isSignupTemplateLinkUrl('https://checkout.stripe.com/c/pay/cs_live_abc') && !isSignupTemplateLinkUrl('https://evil.example/onboarding/?lead=' + LEAD) && !isSignupTemplateLinkUrl('https://findable.live/onboarding/?lead=not-a-uuid') && !isSignupTemplateLinkUrl('https://findable.live/onboarding/?lead=' + LEAD + '&x=1') && !isSignupTemplateLinkUrl(''), 'a Stripe URL, another host, a malformed id, extra parameters or nothing are all refused');
ok(!isSignupLinkUrl(setupLinkUrl(LEAD)), 'the agreement-link check still accepts ONLY the agreement link');

console.log('\n── THE CLIENT CONFIRMATION ──');
{
  const qc: QuickCloseRecord = { answers: { decision_maker: 'yes', manager: 'agency', agency_contract: 'free', domain: 'yes', route: 'build' }, call: { jobs: 'Emergency lockouts, lock changes', areas: 'Canterbury, Whitstable' } };
  const keys = confirmItemsFor(qc).map((i) => i.key).join();
  ok(keys === 'manager,agency_contract,domain', 'three facts to confirm (the reuse question is gone)');
  const lines = confirmSummaryFor(qc, { plan_tier: 'new_site', website_addon: true }, {});
  ok(lines.map((l) => l.key).join() === 'services,areas,plan' && lines[0].text === 'Emergency lockouts, lock changes' && lines[1].text === 'Canterbury, Whitstable' && lines[2].text === 'Findable Build', 'services, areas and the plan, in that order');
  ok(confirmSummaryFor({ answers: {} }, null, { services_included: ['Boilers'], service_areas: ['Leeds'] }).map((l) => l.text).join('|') === 'Boilers|Leeds', 'with no call notes, the lead\'s own lists are shown');
  ok(!JSON.stringify(lines).match(/£|route|seller|sold_by/i), 'the summary carries no price, route id or seller');
  ok(quickCloseState('answers_saved', qc) === 'ready', 'and the sign-up is releasable on the answers');
}

console.log('\n── THE SCREENS AND THE SERVER ──');
{
  const cp = read('src/components/ClosePanel.tsx');
  ok(/How do you want to close them\?/.test(cp) && /Close on the phone/.test(cp) && /Ask the questions now, then send agreement &amp; payment/.test(cp) && /Send full setup/.test(cp) && /Let the customer fill it in themselves/.test(cp), 'the chooser says exactly that, in plain words');
  ok(/<QuickClosePanel leadId=\{leadId\}/.test(cp) && /mode: 'share_setup'/.test(cp) && /<OnboardingLinkCard lead=/.test(cp), 'phone → the one Quick Close panel; setup → share_setup + the existing link card');
  const dlg = read('src/components/QuickCloseDialog.tsx');
  ok(/Create agreement &amp; payment link|Create agreement & payment link/.test(dlg) && /Send agreement &amp; payment link/.test(dlg) && /Copy link/.test(dlg), 'the phone close offers Create / Send agreement & payment link / Copy link');
  ok(/ServicesAreasStep/.test(dlg) && /mode: 'save_call', call: \{ jobs, areas \}/.test(dlg) && /current === 'route'/.test(dlg), 'what they offer + where comes just before the plan and saves the same call notes the Call screen does');
  const qc = read('supabase/functions/quick-close/index.ts');
  ok(/mode === "share_setup"/.test(qc) && /link_variant: "setup"/.test(qc) && /template_name: SIGNUP_LINK_TEMPLATE_NAME/.test(qc), 'Full Setup is sent through the canonical sender on the approved findable_signup_link template');
  ok(/step\.kind === "claim" && !phoneCloseNotesComplete\(qc\?\.call\)/.test(qc) && /call_notes_missing/.test(qc), 'a NEW phone link is refused without services and areas; a link that already stands is reused untouched');
  ok(/close_route: "phone"/.test(qc) && /close_route: closeRouteOf\(cur\)/.test(qc), 'the route is stamped on the phone link and reported on load');
  ok(/already_sent/.test(qc.slice(qc.indexOf('mode === "share_setup"'))) && /body\.resend !== true/.test(qc.slice(qc.indexOf('mode === "share_setup"'))), 'a repeat Full Setup send needs a deliberate Resend');
  const sw = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/body\.link_variant === "setup" \? "setup" : "agreement"/.test(sw) && /resolveSignupLinkVars\(service, resolvedLeadId, signupLinkVariant\)/.test(sw), 'the sender resolves the link itself from the variant — never a link from the browser');
  const lv = read('supabase/functions/_shared/link-template-vars.ts');
  ok(/variant === "setup"/.test(lv) && /setupLinkUrl\(leadId\)/.test(lv) && /isSignupLinkUrl\(url\)/.test(lv), 'agreement variant unchanged (a usable agree/ link only); setup variant is made from the lead id');
  const on = read('supabase/functions/findable-onboarding/index.ts');
  ok((on.match(/"agency_contract"/g) ?? []).length >= 2 && /agency_contract: a\.agency_contract === "in_contract"/.test(on), 'the client\'s own contract answer is in all three lists of the submit (answers / NEWER_COLS / optional)');
  ok(/confirmSummaryFor\(qc, heldRow, lead\)/.test(on), 'the prefill returns the read-only summary beside the facts to confirm');
  const mig = read('supabase/migrations/20261016000000_onboarding_agency_contract.sql');
  ok(/add column if not exists agency_contract text/.test(mig) && /in_contract.*free.*not_sure/.test(mig), 'the migration is additive and constrained');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
