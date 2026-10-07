/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES CLOSE → PAYMENT → HANDOFF → PAID CLIENT (2026-10-07,
   docs/pre-sales-certification/sales-close-handoff-australia.md).
   Pins: the agency-contract rule and the minimal Quick Close; the per-plan words; the WhatsApp link rule and
   the two Meta templates (findable_signup_link / findable_onboarding); the lightweight handoff; the dynamic
   onboarding form; facts read from a client's WhatsApp replies; the migration.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  agencyContractBlocksBuild, CONFIRM_CONTRACT_WARNING, DOMAIN_NOT_WEBSITE_LINE, REUSE_NO_LINE, REUSE_YES_LINE, callNotesLines, cleanAnswers, cleanCallNotes, closeFlow, mergeAnswers, missingQuestions, offerFit, quickCloseGate,
  quickCloseMessage, quickCloseState, routeChoiceAnswers, routeTermsLines, splitCallList, mayGenerateLink, QUICK_CLOSE_QUESTIONS,
} from '../src/lib/quickClose.ts';
import { afterTermClientWords, afterTermRepLine, bothPlansSpoken, continuingOptionAfter } from '../src/lib/planTerms.ts';
import { WHAT_WE_DO_LINE, buildCallScript } from '../src/lib/callScript.ts';
import { buildCallClose } from '../src/lib/callClose.ts';
import { decideLinkRoute, LINK_READY_FALLBACK, replyRouteOpen } from '../src/lib/paymentLinkRoute.ts';
import {
  ONBOARDING_TEMPLATE_NAME, SIGNUP_LINK_TEMPLATE_NAME, isOnboardingFormUrl, isSignupLinkUrl, linkTemplateGreeting, normaliseMetaStatus,
  onboardingTemplateBody, signupLinkTemplateBody, templateSendFailureText, templateSendState,
} from '../src/lib/whatsappLinkTemplates.ts';
import { WA_TEMPLATES, claimTemplatePayload, renderTemplateBody, templateBodyParams } from '../supabase/functions/_shared/whatsapp-send.ts';
import { CONTINUATION_TEMPLATES, isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';
import { HANDOFF_QUESTIONS, handoffKnownLines, handoffMissing, handoffPrefill, handoffSendRefusal, cleanHandoff } from '../src/lib/salesHandoff.ts';
import {
  ONBOARDING_QUESTIONS, ONBOARDING_TOKEN_RE, columnsForAnswers, onboardingFormUrl, onboardingQuestionsFor, planOnboardingWrite, validateOnboarding,
  type OnboardingKnown,
} from '../src/lib/clientOnboardingForm.ts';
import { onboardingDoneHtml, onboardingFormHtml, onboardingUnavailableHtml } from '../src/lib/clientOnboardingPageHtml.ts';
import { cleanFacts, whatsappCandidates, whatsappReviewNotes, worthReading } from '../src/lib/whatsappClientFacts.ts';
import { intakeCandidates, mergeClientProfile } from '../src/lib/clientIntake.ts';
import { createElement } from 'react';
import { SalesHandoffForm } from '../src/components/SalesHandoffForm.tsx';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const NOW = Date.parse('2026-10-07T12:00:00Z');
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const TOKEN = 'a'.repeat(64);
const SIGNUP = `https://findable.live/agree/${TOKEN}`;
const ONB = `https://findable.live/details/${'b'.repeat(64)}`;

console.log('── QUICK CLOSE: BUILD is the default; only a contract they are tied into moves it to Optimise ──');
{
  const SIT = { manager: 'owner', domain: 'yes', rights: 'yes' } as const;
  const self = offerFit({ manager: 'owner' }, true);
  ok(self.offered.build && self.offered.optimise && self.recommended === 'build' && self.warning === null, 'self-managed site → both plans offered, BUILD first');
  ok(/clean technical base/.test(self.reason ?? ''), '…with the rep line: Build is usually the best route because it gives us a clean technical base to work from');
  const free = offerFit({ manager: 'agency', agency_contract: 'free' }, true);
  ok(free.offered.build && free.offered.optimise && free.recommended === 'build' && free.warning === null, 'agency, contract ended / free to leave → Build recommended, no warning');
  const tiedIn = offerFit({ manager: 'agency', agency_contract: 'in_contract' }, true);
  ok(!tiedIn.offered.build && tiedIn.offered.optimise && tiedIn.recommended === 'optimise' && /Optimise/.test(tiedIn.reason ?? ''), 'agency + still in contract → Optimise only for a salesperson (the ONE blocker)');
  ok(!offerFit({ manager: 'freelancer', agency_contract: 'in_contract' }, true).offered.build, 'a freelancer still in contract → the same rule');
  for (const c of ['not_sure', undefined] as const) {
    const fit = offerFit({ manager: 'agency', agency_contract: c }, true);
    ok(fit.offered.build && fit.recommended === 'build' && fit.warning === CONFIRM_CONTRACT_WARNING, `agency + contract ${c ?? 'unanswered'} → BUILD stays the default, with the warning "Confirm their agency contract before finalising Build."`);
    ok(!/(rubbish|bad|poor|rip|overcharg)/i.test((fit.reason ?? '') + (fit.warning ?? '')), `…and nothing knocks the agency (${c ?? 'unanswered'})`);
  }
  ok(!offerFit({ manager: 'third_party', agency_contract: 'in_contract' }, true).offered.build, 'another third party in contract → the same rule');
  const noSite = offerFit({}, false);
  ok(noSite.offered.build && !noSite.offered.optimise && noSite.recommended === 'build' && noSite.notes.length === 0, 'no website → Build only, and no ownership notes (nothing irrelevant)');
  ok(agencyContractBlocksBuild({ manager: 'agency', agency_contract: 'in_contract' }) && !agencyContractBlocksBuild({ manager: 'agency' }) && !agencyContractBlocksBuild({ manager: 'agency', agency_contract: 'not_sure' }) && !agencyContractBlocksBuild({ manager: 'agency', agency_contract: 'free' }) && !agencyContractBlocksBuild({ manager: 'owner' }), 'the one predicate: blocked ONLY by a positive "still in contract"');
  /* REUSE RIGHTS and the DOMAIN: guidance, never a blocker. */
  const rYes = offerFit({ ...SIT }, true);
  ok(rYes.notes.includes(REUSE_YES_LINE) && !rYes.notes.includes(REUSE_NO_LINE), 'reuse rights yes → "we can keep the new site very close to the look they already like if they want"');
  for (const r of ['no', 'not_sure'] as const) {
    const fit = offerFit({ ...SIT, rights: r }, true);
    ok(fit.notes.includes(REUSE_NO_LINE) && !fit.notes.includes(REUSE_YES_LINE) && fit.offered.build && fit.recommended === 'build' && !/identical|clone|exact copy/i.test(fit.notes.join(' ')), `reuse rights "${r}" → an original site, never a promised copy, and still Build`);
  }
  ok(offerFit({ ...SIT, domain: 'agency' }, true).recommended === 'build' && offerFit({ ...SIT, domain: 'agency' }, true).notes.includes(DOMAIN_NOT_WEBSITE_LINE), 'a domain held elsewhere never moves them to Optimise; the rep is told the domain is not the website');
  /* The backstop: a Build saved anyway (by Paul) stops for his release — never a hard ban. */
  const tied = { route: 'build', approach: 'unsure', decision_maker: 'yes', manager: 'agency', agency_contract: 'in_contract', domain: 'yes', rights: 'yes' } as const;
  ok(quickCloseState('answers_saved', { answers: tied }) === 'needs_review' && !mayGenerateLink('answers_saved', { answers: tied }), 'Build while tied in → Paul review, no link');
  ok(quickCloseState('answers_saved', { answers: tied, review_approved_at: iso(NOW) }) === 'ready', '…Paul can release it');
  const unsure = { ...tied, agency_contract: 'not_sure' } as const;
  ok(quickCloseState('answers_saved', { answers: unsure }) === 'ready' && quickCloseGate(unsure).notes.includes(CONFIRM_CONTRACT_WARNING), 'Build with an unconfirmed contract → NOT a stop; the note travels to Paul');
}

console.log('\n── QUICK CLOSE: the shortest close, nothing asked twice ──');
{
  ok(QUICK_CLOSE_QUESTIONS[0].key === 'route', 'the plan question is first in the table, but LAST in the flow (closeFlow)');
  ok(closeFlow({}).slice(-1)[0] === 'route' && closeFlow({ manager: 'agency' }).slice(-1)[0] === 'route', 'the plan is the LAST question (Optimise then adds only access)');
  ok(missingQuestions({}).join() === 'decision_maker,manager,domain,rights,route', 'a fresh close asks authority, who runs the site, the domain, the reuse right, then the plan');
  const fromCall = cleanAnswers({ decision_maker: 'yes', manager: 'owner' });
  ok(missingQuestions(fromCall).join() === 'domain,rights,route', 'the call already answered authority and who runs the site → those are not asked again');
  const sit = { ...fromCall, domain: 'yes', rights: 'yes' } as const;
  ok(missingQuestions(sit).join() === 'route', 'with the situation answered, only the plan is left');
  ok(missingQuestions({ ...sit, ...routeChoiceAnswers(sit, 'optimise') }).join() === 'access', 'Optimise after that: only "can we get in"');
  ok(missingQuestions({ ...sit, ...routeChoiceAnswers(sit, 'build') }).length === 0, 'Build after that (self-run): nothing more — ready');
  ok(quickCloseState('answers_saved', { answers: { ...sit, ...routeChoiceAnswers(sit, 'build') } }) === 'ready', '…READY for the sign-up link');
  ok(missingQuestions(cleanAnswers({ decision_maker: 'yes', manager: 'agency', route: 'build', approach: 'unsure' })).join() === 'agency_contract,domain,rights', 'an agency-run site: the contract is asked (once), then the domain and the reuse right');
  ok(!closeFlow({ route: 'build', approach: 'unsure' }).some((k) => ['design_owner', 'build_consents', 'approach', 'authority'].includes(k)), 'never the design owner, the consents, the approach sub-type or the legacy authority question');
  const merged = mergeAnswers({ approach: 'new_template' }, { route: 'optimise' });
  ok(merged.route === 'optimise' && merged.approach === 'improve', 'choosing the plan brings the agreeing approach (a stored Build approach never flips it back)');
  ok(cleanCallNotes({ jobs: '  kitchen fitting,  extensions ', areas: '', agency_monthly_gbp: '£150', evil: 'x' }).jobs === 'kitchen fitting, extensions'
    && cleanCallNotes({ agency_monthly_gbp: '£150' }).agency_monthly_gbp === 150 && !('evil' in cleanCallNotes({ evil: 'x' })), 'call notes: known keys only, text tidied, spend a number');
  ok(splitCallList('Kitchen fitting and extensions, bathrooms').join('|') === 'Kitchen fitting|extensions|bathrooms', 'the jobs become the lead\'s services list');
  ok(callNotesLines({ manager: 'agency', agency_contract: 'in_contract' }, { jobs: 'boilers', agency_monthly_gbp: 120 }).map((l) => l.key).join() === 'manager,agency_contract,agency_monthly_gbp,jobs', 'what the call heard, as lines for the handoff / Paid Client');
  const fn = read('supabase/functions/quick-close/index.ts');
  ok(/if \(mode === "save_call"\)/.test(fn) && /writeQc\(service, rowId, revOf\(qcNow\), \{ \.\.\.\(qcNow \?\? \{\}\), call:/.test(fn), 'the call notes are saved on the close, rev-conditional');
  ok(/\(blank \|\| fromCall\) && next\.length/.test(fn), '…and fill the lead\'s services / areas only when blank (or still the call\'s own)');
  ok(/mode === "save" \|\| mode === "save_call" \|\| mode === "generate_link"/.test(fn), 'a not-ready salesperson cannot save call answers either');
}

console.log('\n── THE WORDS: per plan, no close line, plain "what we do" ──');
{
  ok(/6th payment is the last one/.test(afterTermRepLine('optimise')) && /plan ends/.test(afterTermRepLine('optimise')) && !/29\.99/.test(afterTermRepLine('optimise')), 'Optimise (rep): 6 payments, the 6th the last, then it ends — no £29.99');
  ok(/nothing more is charged/.test(afterTermClientWords('optimise')) && !/29\.99/.test(afterTermClientWords('optimise')), 'Optimise (client message): ends, nothing more charged');
  ok(/website is theirs/.test(afterTermRepLine('build')) && /If they want us to keep hosting and maintaining it/.test(afterTermRepLine('build')) && /£29\.99/.test(afterTermRepLine('build')), 'Build: theirs after 12; £29.99 only if they want hosting / maintenance');
  ok(continuingOptionAfter('build') && !continuingOptionAfter('optimise'), 'the £29.99 option exists after Build only');
  ok(routeTermsLines('optimise').some((l) => /plan ends/.test(l)) && !routeTermsLines('optimise').join(' ').includes('29.99'), 'the Quick Close card for Optimise names no £29.99');
  ok(!/29\.99/.test(quickCloseMessage('Sam', SIGNUP, 'optimise')) && /29\.99 a month for hosting and maintenance/.test(quickCloseMessage('Sam', SIGNUP, 'build')), 'the message to the client says the same, per plan');
  ok(/6 payments in total, today's included, and then it ends/.test(bothPlansSpoken()), '"How much is it?" names both plans and their endings');
  ok(!/public evidence/i.test(WHAT_WE_DO_LINE) && /AI visibility check/.test(WHAT_WE_DO_LINE) && /four weeks/.test(WHAT_WE_DO_LINE) && /every month/.test(WHAT_WE_DO_LINE)
    && !/guarantee|recommend|cite|citation|rank/i.test(WHAT_WE_DO_LINE), '"What we do": plain words — check, real questions, optimise the site, pages, same check at four weeks, monthly; no promised outcome');
  ok(WHAT_WE_DO_LINE.split(/\s+/).length < 90, '…short enough to say on a call');
  ok(!('closeLine' in buildCallClose('own_site')), 'no scripted close line');
  ok(!/public evidence/.test(read('src/lib/salesExplainer.ts').replace(/whether competitors have much stronger public evidence/, '')), 'the sales explainer no longer says "improve the public evidence"');
  void buildCallScript;
}

console.log('\n── PAYMENT LINK: Paul\'s rule and the template ──');
{
  const replied = { hasPhone: true, firstOutboundAt: iso(NOW - 48 * H), lastInboundAt: iso(NOW - 2 * H) };
  const pending = templateSendState({ name: SIGNUP_LINK_TEMPLATE_NAME, status: 'PENDING', category: 'MARKETING', language: 'en', checked_at: iso(NOW) }, 'signup');
  const approved = templateSendState({ name: SIGNUP_LINK_TEMPLATE_NAME, status: 'APPROVED', category: 'MARKETING', language: 'en', checked_at: iso(NOW) }, 'signup');
  const unknown = templateSendState(null, 'signup');
  ok(replyRouteOpen(replied, NOW) && decideLinkRoute(replied, { template: pending, nowMs: NOW }).route === 'whatsapp_reply', 'messaged + replied + window open → a normal message may carry the link');
  const noReply = { hasPhone: true, firstOutboundAt: iso(NOW - 48 * H), lastInboundAt: null };
  ok(decideLinkRoute(noReply, { template: pending, nowMs: NOW }).route === 'none' && decideLinkRoute(noReply, { template: pending, nowMs: NOW }).reason === 'no_reply', 'no reply yet → no normal message');
  const theyWroteFirst = { hasPhone: true, firstOutboundAt: null, lastInboundAt: iso(NOW - H) };
  ok(decideLinkRoute(theyWroteFirst, { template: pending, nowMs: NOW }).reason === 'not_messaged', 'we never messaged them → no normal message (Paul: "we have already messaged them AND they replied")');
  const stale = { hasPhone: true, firstOutboundAt: iso(NOW - 96 * H), lastInboundAt: iso(NOW - 30 * H) };
  ok(decideLinkRoute(stale, { template: pending, nowMs: NOW }).reason === 'window_closed', 'their reply is over 24 h old → no normal message');
  ok(decideLinkRoute(noReply, { template: approved, nowMs: NOW }).route === 'whatsapp_template' && decideLinkRoute(replied, { template: approved, nowMs: NOW }).route === 'whatsapp_template', 'APPROVED template → one click, whatever the conversation');
  ok(/awaiting approval/.test(decideLinkRoute(noReply, { template: pending, nowMs: NOW }).say), 'in review → says "awaiting approval" (never pretends)');
  ok(decideLinkRoute(noReply, { template: unknown, nowMs: NOW }).route === 'whatsapp_template' && decideLinkRoute(noReply, { template: unknown, nowMs: NOW }).reason === 'ok_unverified', 'status unreadable → the send is tried and Meta decides (approval works with no code change)');
  ok(decideLinkRoute({ ...replied, hasPhone: false }, { template: approved, nowMs: NOW }).route === 'none' && decideLinkRoute({ ...replied, blocked: true }, { template: approved, nowMs: NOW }).route === 'none', 'no phone / opted out → nothing by WhatsApp');
  ok(LINK_READY_FALLBACK === "Link ready — tell the customer where you're sending it.", 'the fallback line, as Paul wrote it');
  for (const s of ['REJECTED', 'PAUSED', 'DISABLED', 'NOT_FOUND', 'PENDING', 'IN_APPEAL'] as const) {
    const st = templateSendState({ name: 'x', status: s, category: null, language: null, checked_at: null }, 'onboarding');
    ok(!st.sendable && !st.tryable, `Meta status ${s} → not sendable, not tried`);
  }
  ok(normaliseMetaStatus('approved') === 'APPROVED' && normaliseMetaStatus('weird') === 'UNKNOWN', 'Meta\'s status words are normalised; an unknown word is UNKNOWN');
  ok(/hasn't approved/.test(templateSendFailureText(132001, 'signup')) && /paused or disabled/.test(templateSendFailureText(132015, 'onboarding')) && /marketing/.test(templateSendFailureText(131049, 'signup')), 'a Meta refusal is said in words (pending / paused / marketing limit)');
  const fn = read('supabase/functions/quick-close/index.ts');
  const share = fn.slice(fn.indexOf('if (mode === "share_link")'));
  ok(/error: "already_sent"/.test(share) && /body\.resend !== true/.test(share), 'one WhatsApp send of a link unless the rep presses Resend');
  ok(/template_name: SIGNUP_LINK_TEMPLATE_NAME/.test(share) && !/signup_url|link_url/.test(share.slice(share.indexOf('template_name: SIGNUP_LINK_TEMPLATE_NAME') - 200, share.indexOf('template_name: SIGNUP_LINK_TEMPLATE_NAME') + 200)), 'the template send carries the template NAME only — the link is resolved by the sender, never passed');
  ok(/if \(!res\.ok \|\| !out\.ok\) \{[\s\S]{0,300}"link_share_failed"[\s\S]{0,300}return json\(\{ ok: false/.test(share), 'a failed send is recorded as failed and never as sent');
  ok(/share\.status = out\.simulated \? "simulated"/.test(share), 'a test-mode send says so');
  const dlg = read('src/components/QuickCloseDialog.tsx');
  ok(/Send signup link on WhatsApp/.test(dlg) && /Sending…/.test(dlg) && /data-testid="qc-whatsapp-sent"/.test(dlg) && /Resend/.test(dlg) && /Copy sign-up link/.test(dlg), 'Quick Close: one click, Sending…, Sent · time + Resend, Copy sign-up link always there');
  ok(/WhatsApp signup template \$\{lr\.template\.label\.toLowerCase\(\)\}/.test(dlg), '…and "WhatsApp signup template awaiting approval" while in review');
}

console.log('\n── THE TWO META TEMPLATES ──');
{
  ok(SIGNUP_LINK_TEMPLATE_NAME === 'findable_signup_link' && ONBOARDING_TEMPLATE_NAME === 'findable_onboarding', 'the exact names Paul created');
  ok(JSON.stringify(WA_TEMPLATES.findable_signup_link.vars) === '["greeting_name","signup_url"]' && JSON.stringify(WA_TEMPLATES.findable_onboarding.vars) === '["greeting_name","onboarding_form_url"]', 'registered in the ONE sender registry: {{1}} greeting, {{2}} the link');
  const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/findable_signup_link: \{ lang: "en", vars: \["greeting_name", "signup_url"\] \}/.test(queue) && /findable_onboarding: \{ lang: "en", vars: \["greeting_name", "onboarding_form_url"\] \}/.test(queue), '…mirrored in the queue registry (never queued)');
  ok(CONTINUATION_TEMPLATES.has('findable_signup_link') && CONTINUATION_TEMPLATES.has('findable_onboarding') && !isColdOutreachTemplate('findable_signup_link'), 'continuations: a phone close / a paying client, never a cold approach');
  ok(signupLinkTemplateBody('Sam', SIGNUP) === `Hi Sam, thanks for speaking with us about Findable.\n\nYou can get started here: ${SIGNUP}\n\nIf you have any questions, just reply to this message.`, 'the signup body is Paul\'s registered wording, character for character');
  ok(onboardingTemplateBody('Sam', ONB) === `Hi Sam, thanks for getting started with Findable.\n\nWe just need a few details from you before we begin. You can complete them here:\n\n${ONB}\n\nThe form only asks for information we still need.`, 'the onboarding body is Paul\'s registered wording');
  const p = templateBodyParams(WA_TEMPLATES.findable_signup_link.vars, 'Biz Ltd', '', { greetingName: 'Sam', signupUrl: SIGNUP, templateName: 'findable_signup_link' });
  ok(JSON.stringify(p) === JSON.stringify([{ type: 'body', parameters: [{ type: 'text', text: 'Sam' }, { type: 'text', text: SIGNUP }] }]), 'the payload: {{1}} = the greeting, {{2}} = the unique sign-up link');
  let threw = '';
  try { templateBodyParams(WA_TEMPLATES.findable_signup_link.vars, 'B', '', { greetingName: 'Sam', signupUrl: 'https://checkout.stripe.com/c/pay/cs_live_x' }); } catch (e) { threw = (e as Error).message; }
  ok(/not_a_signup_link/.test(threw), 'a STRIPE URL is refused as {{2}} — the template can never carry raw checkout');
  threw = '';
  try { templateBodyParams(WA_TEMPLATES.findable_signup_link.vars, 'B', '', { greetingName: 'Sam', signupUrl: 'https://evil.example/agree/' + TOKEN }); } catch (e) { threw = (e as Error).message; }
  ok(/not_a_signup_link/.test(threw), '…and so is any other host');
  threw = '';
  try { templateBodyParams(WA_TEMPLATES.findable_onboarding.vars, 'B', '', { greetingName: 'Sam', onboardingFormUrl: SIGNUP }); } catch (e) { threw = (e as Error).message; }
  ok(/not_an_onboarding_link/.test(threw), 'the onboarding template refuses anything but the client\'s /details/ link (never the sign-up / payment link)');
  ok(isSignupLinkUrl(SIGNUP) && !isSignupLinkUrl(SIGNUP + 'x') && isOnboardingFormUrl(ONB) && !isOnboardingFormUrl('https://findable.live/details/x'), 'link shapes are exact');
  ok(linkTemplateGreeting('Sam Jones', 'Jones Plumbing') === 'Sam' && linkTemplateGreeting(null, 'Jones Plumbing') === 'Jones Plumbing' && linkTemplateGreeting('07700 900000', '') === 'there', '{{1}}: first name, else the business\'s short name, else "there"');
  const payload = claimTemplatePayload('findable_onboarding', 'en_GB', 'B', '', { greetingName: 'Sam', onboardingFormUrl: ONB }) as { template: { name: string; language: { code: string } } };
  ok(payload.template.name === 'findable_onboarding' && payload.template.language.code === 'en_GB', 'sent under its exact name, in the language Meta registered');
  ok(renderTemplateBody('findable_signup_link', 'Sam', SIGNUP).includes(SIGNUP), 'the Inbox transcript shows what was sent');
  const swm = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/const avail = await templateAvailability\(service, templateName\);/.test(swm) && /if \(!st\.sendable && !st\.tryable\) return json\(\{ ok: false, error: "template_not_approved"/.test(swm), 'the sender reads Meta\'s LIVE status and refuses a template Meta has not approved (no hard-coded "approved")');
  ok(/if \(avail\.language\) lang = avail\.language;/.test(swm), '…and sends in Meta\'s registered language');
  ok(/if \(!allowResend && await pitchEverSent\(service, resolvedLeadId, templateName\)\)/.test(swm.slice(swm.indexOf('if (linkKind) {'))), 'one per lead unless deliberately resent');
  ok(/resolveSignupLinkVars\(service, resolvedLeadId\)/.test(swm) && /resolveOnboardingFormVars\(service, resolvedLeadId\)/.test(swm), 'both variables resolved server-side from the lead\'s own records');
  ok(/isClientLead\(sl\)/.test(swm), 'a salesperson\'s send to a PAID client is refused — sales cannot send the onboarding template');
  ok(/requireAdmin\(req/.test(read('supabase/functions/paid-client-hub/index.ts')), 'Paid Clients (and its onboarding send) is admin only');
  const vars = read('supabase/functions/_shared/link-template-vars.ts');
  ok(/linkUsable\(/.test(vars) && /isSignupLinkUrl\(url\)/.test(vars) && /quickCloseClosedRefusal/.test(vars), 'the signup link must be that lead\'s USABLE sign-up link, for an unpaid, open lead');
  ok(/isPaidClient\(lead as never\) \|\| clientClosed\(lead as never\)/.test(vars) && /\.eq\("lead_id", leadId\)\s*\n?\s*\.is\("revoked_at", null\)\.is\("submitted_at", null\)/.test(vars), 'the onboarding link must be THIS paid client\'s own open link');
  const status = read('supabase/functions/_shared/template-status.ts');
  ok(/message_templates\?name=/.test(status) && /debug_token/.test(status) && /WHATSAPP_BUSINESS_ACCOUNT_ID/.test(status) && !/messages"/.test(status), 'status is read from Meta\'s template API (never sends anything)');
}

console.log('\n── HANDOFF: lightweight, filled from the call ──');
{
  ok(HANDOFF_QUESTIONS.every((q) => !q.required), 'nothing is required — an unknown answer never blocks Send to Paul');
  ok(handoffSendRefusal({ fields: {}, closed: false }) === null && handoffMissing({}).length === 0, 'an empty handoff can be sent');
  const pre = handoffPrefill({ quickClose: { route: 'optimise', manager: 'agency' }, call: { jobs: 'kitchen fitting and extensions', areas: 'Maidenhead' }, contactName: 'Sam' });
  ok(pre.fields.work_type === 'optimise' && pre.fields.site_situation === 'agency' && pre.fields.decision_maker_name === 'Sam', 'the plan, who runs the site and the contact are filled automatically');
  ok(/kitchen fitting and extensions/.test(pre.fields.client_wants ?? '') && /Maidenhead/.test(pre.fields.client_wants ?? ''), 'what they want comes from the call\'s jobs and areas — never asked again');
  ok(handoffKnownLines(pre.fields).map((l) => l.key).join() === 'work_type,site_situation,client_wants', 'shown as "Already known"');
  ok(HANDOFF_QUESTIONS.filter((q) => q.asked).map((q) => q.key).join() === 'decision_maker_name,decision_maker_role,promised,preferred_contact,notes_for_paul', 'asked: only what the rep uniquely learned');
  ok(cleanHandoff({ preferred_contact: 'pigeon' }).preferred_contact === undefined && cleanHandoff({ preferred_contact: 'phone' }).preferred_contact === 'phone', 'preferred contact is an allowlist');
  const html = renderToStaticMarkup(createElement(SalesHandoffForm, { fields: pre.fields, prefilled: pre.prefilled, onSave: async () => true, onSend: async () => true } as never));
  ok(/Already known/.test(html) && /data-testid="send-to-paul"/.test(html) && !/What does the client want\?/.test(html.replace(/Already known[\s\S]*?<\/dl>/, '')), 'the form: "Already known", then Send to Paul; the auto answers are not asked as questions');
}

console.log('\n── ONBOARDING: only what is missing, for their plan ──');
{
  const row = { contact_name: null, contact_email: null, confirmed_location: null, services_list: null, areas_list: null };
  const base: OnboardingKnown = { route: 'optimise', row, profile: {}, hasWebsite: true };
  const opt = onboardingQuestionsFor(base).map((q) => q.key);
  ok(opt.includes('website_platform') && opt.includes('website_manager') && !opt.some((k) => k.startsWith('domain_') || ['dns_permission', 'materials_confirmed', 'site_rights', 'photos_status', 'authority_confirmed'].includes(k)), 'Optimise: their site\'s questions — never a Build question');
  const bld = onboardingQuestionsFor({ ...base, route: 'build' }).map((q) => q.key);
  ok(bld.includes('domain_status') && bld.includes('dns_permission') && bld.includes('materials_confirmed') && !bld.includes('website_platform') && !bld.includes('website_manager'), 'Build: domain, permission, material — never an Optimise question');
  const known = onboardingQuestionsFor({ ...base, row: { ...row, contact_name: 'Sam', contact_email: 's@x.co', confirmed_location: 'Leeds', services_list: ['Boilers'], areas_list: ['Leeds'], confirmed_phone: '0113 496 0000', business_website: 'jones.co.uk', website_platform: 'wordpress', website_manager: 'direct_access', gbp_status: 'done', must_not_say: 'n/a', top_requests: 'boilers' } }).map((q) => q.key);
  ok(known.length === 0, 'everything known → nothing asked (and no form link is offered)');
  const conf = onboardingQuestionsFor({ ...base, profile: { services: { values: ['Boilers'], tier: 'confirmed', confirmed: true } } }).map((q) => q.key);
  ok(!conf.includes('services_list'), 'a value Paul CONFIRMED is never asked');
  const fromSales = onboardingQuestionsFor({ ...base, profile: { services: { values: ['Kitchens'], tier: 'sales', confirmed: false } } }).find((q) => q.key === 'services_list');
  ok(fromSales?.confirm === true && fromSales.prefill === 'Kitchens', 'a value only the salesperson / website gave is asked as a pre-filled confirmation');
  ok(!onboardingQuestionsFor({ ...base, callJobs: 'boilers' }).some((q) => q.key === 'top_requests'), 'the jobs from the call are not asked again');
  ok(onboardingQuestionsFor({ ...base, route: null }).length === 0, 'no plan recorded → no form (it could not ask the right questions)');
  const qs = onboardingQuestionsFor({ ...base, route: 'build' });
  const v = validateOnboarding(qs, { contact_name: 'Sam', contact_email: 'SAM@X.CO', confirmed_location: 'Leeds', services_list: 'Boilers\nBathrooms, Boilers', areas_list: 'Leeds', domain_status: 'new', domain_owned: 'yes', dns_permission: 'yes', materials_confirmed: 'no', is_admin: 'yes', amount_paid: '0' }, row);
  ok(v.ok && v.answers.contact_email === 'sam@x.co' && JSON.stringify(v.answers.services_list) === '["Boilers","Bathrooms"]', 'answers validated to shape (email, de-duplicated list)');
  ok(v.answers.domain_owned === undefined, 'a follow-up whose condition is false is DROPPED (domain owned only when keeping their domain)');
  ok(!('is_admin' in v.answers) && !('amount_paid' in v.answers), 'fields not on the link are ignored — no arbitrary field updates');
  ok(v.answers.dns_permission === true && v.answers.materials_confirmed === false, 'yes / no become true / false');
  const bad = validateOnboarding(qs, { contact_email: 'nope' }, row);
  ok(!bad.ok && bad.errors.contact_email && bad.errors.contact_name, 'required answers and bad shapes are refused, field by field');
  ok(JSON.stringify(columnsForAnswers({ gbp_status: 'none', top_requests: ['a', 'b'] })) === JSON.stringify({ gbp_exists: 'no', top_requests: 'a, b' }), 'answers → the same onboarding columns the questionnaire writes');
  const plan = planOnboardingWrite({ contact_email: 'old@x.co', services_list: [] }, { contact_email: 'new@x.co', services_list: ['A'] });
  ok(!('contact_email' in plan.patch) && plan.conflicts[0]?.column === 'contact_email' && JSON.stringify(plan.patch.services_list) === '["A"]', 'never overwrites: a filled column becomes a conflict for Paul; a blank one is filled');
  ok(planOnboardingWrite({ contact_email: 'Same@x.co' }, { contact_email: 'same@x.co' }).conflicts.length === 0, 'the same answer is not a conflict');
  ok(ONBOARDING_TOKEN_RE.test(TOKEN) && !ONBOARDING_TOKEN_RE.test('123') && /^https:\/\/findable\.live\/details\/[0-9a-f]{64}$/.test(onboardingFormUrl(TOKEN)), 'the link is findable.live/details/<64 hex> — no sequential id');
  const page = onboardingFormHtml({ businessName: 'Biz', questions: qs });
  const visible = page.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  ok(!/stripe|checkout|pay now|£|card number|payment details/i.test(visible.replace(/nothing to pay/ig, '')) && /nothing to pay/i.test(visible) && !/stripe|checkout/i.test(page), 'the form has NO payment step (and says so)');
  ok(qs.every((q) => page.includes(`name="${q.key}"`)) && !page.includes('name="website_platform"'), 'only the link\'s questions are on the page');
  ok(/Thanks — that's everything/.test(onboardingDoneHtml('Biz')) && /isn't available/.test(onboardingUnavailableHtml()), 'done and unavailable pages');
  ok(ONBOARDING_QUESTIONS.every((q) => q.routes.length > 0), 'every question names its plans');
  const sh = read('supabase/functions/_shared/client-onboarding.ts');
  ok(/\.update\(\{ submitted_at: now, answers: v\.answers \}\)\s*\n?\s*\.eq\("id", link\.id\)\.is\("submitted_at", null\)\.is\("revoked_at", null\)/.test(sh), 'a double submit writes once (conditional close)');
  ok(/if \(!link \|\| link\.revoked_at\) return \{ kind: "unavailable" \}/.test(sh) && /ctx\.refusal === "not_paid" \|\| ctx\.refusal === "closed"/.test(sh), 'a revoked link, or an ended / unpaid client, gets "unavailable"');
  ok(/queueIntake\(service, leadId, "rerun"\)/.test(sh) && /"onboarding_form_submitted"/.test(sh) && /_kind: "client_onboarding"/.test(sh), 'answers re-run the intake (Still needed updates), write History and tell Paul');
  ok(/stillAsked\(link as Row, ctx\)/.test(sh), 'reopening a link asks only what is STILL missing from its snapshot');
  const pub = read('supabase/functions/client-onboarding/index.ts');
  ok(/for \(const k of ONBOARDING_QUESTION_KEYS\)/.test(pub) && !/stripe|checkout/i.test(pub.replace(/\/\/.*$/gm, '')), 'the public function reads only catalogue keys and has no payment code');
  ok(/\[functions\.client-onboarding\]\nverify_jwt = false/.test(read('supabase/config.toml')), 'config.toml entry (public: the token is the key)');
}

console.log('\n── WHATSAPP REPLIES → THE CLIENT RECORD ──');
{
  const texts = ['Boiler installations and bathroom plumbing mainly', 'my email is sam@jonesplumbing.co.uk'];
  const facts = cleanFacts({ facts: [
    { field: 'services', values: ['Boiler installations', 'Bathroom plumbing'], quote: 'Boiler installations and bathroom plumbing', confidence: 0.9 },
    { field: 'email', value: 'sam@jonesplumbing.co.uk', quote: 'my email is sam@jonesplumbing.co.uk', confidence: 0.95 },
    { field: 'town', value: 'Leeds', quote: 'we are in Leeds', confidence: 0.9 },
    { field: 'phone', value: '07700 900123', quote: 'Boiler installations', confidence: 0.4 },
    { field: 'is_admin', value: 'yes', quote: 'Boiler', confidence: 1 },
  ] }, texts);
  ok(facts.map((x) => x.field).join() === 'services,email', 'a stated fact is kept; a quote the client never wrote, a low-confidence guess and an unknown field are dropped');
  ok(cleanFacts({ facts: [] }, texts).length === 0 && cleanFacts(null, texts).length === 0, 'an unclear reply yields nothing');
  ok(!worthReading('ok thanks') && !worthReading('👍') && worthReading('We mostly do boiler installs in Leeds'), 'only real words cost a model call');
  const rows = { lead: { business_name: 'Jones', services_included: ['Kitchens'] }, onboarding: null, agreement: null, handoff: null, quickClose: null, placeCache: null, companiesHouse: null, crawl: null, hookAudit: null,
    whatsappReads: [{ read_at: '2026-10-07T10:00:00Z', facts: [{ field: 'email', value: 'sam@jonesplumbing.co.uk', quote: 'x', confidence: 0.9 }, { field: 'services', values: ['Boilers'], quote: 'x', confidence: 0.9 }] }] };
  const prof = mergeClientProfile(intakeCandidates(rows as never));
  const email = prof.find((p) => p.key === 'email')!;
  ok(email.value === 'sam@jonesplumbing.co.uk' && email.sourceLabel === 'Client on WhatsApp' && email.tier === 'client', 'an EMPTY field is filled, labelled "Client on WhatsApp"');
  const services = prof.find((p) => p.key === 'services')!;
  ok(services.conflict && services.status === 'conflict', 'a WhatsApp answer that disagrees with what Sales recorded is flagged for review');
  const withConfirmed = mergeClientProfile(intakeCandidates(rows as never), { email: { confirmed: { value: 'office@jones.co.uk', by: 'paul', at: '2026-10-07' }, rejected: [] } });
  ok(withConfirmed.find((p) => p.key === 'email')!.value === 'office@jones.co.uk', 'Paul\'s CONFIRMED value is never overwritten');
  ok(whatsappReviewNotes(withConfirmed).some((n) => n.field === 'email' && n.whatsapp === 'sam@jonesplumbing.co.uk'), '…the difference is shown to him instead');
  const newer = whatsappCandidates([{ read_at: '2026-10-01', facts: [{ field: 'town', value: 'York', quote: 'q', confidence: 1 }] }, { read_at: '2026-10-05', facts: [{ field: 'town', value: 'Leeds', quote: 'q', confidence: 1 }] }]);
  ok(newer.town?.[0].value === 'Leeds', 'the newest answer per field wins');
  const tri = read('supabase/functions/conversation-triage/index.ts');
  ok(/isClient && p\.lead_id && !d\.suppress/.test(tri) && /aiCalls < AI_MAX_PER_RUN && aiBudget > 0/.test(tri), 'read by the existing AI conversation reader, paying clients only, inside its caps');
  const wf = read('supabase/functions/_shared/client-whatsapp-facts.ts');
  ok(!/from\("outreach_leads"\)\.update|from\("onboarding_responses"\)\.update/.test(wf), 'it never writes a client field — the intake merge decides');
  ok(!/client-whatsapp-facts|whatsappClientFacts/.test(read('supabase/functions/_shared/whatsapp-inbound.ts') + read('supabase/functions/whatsapp-status/index.ts')), 'the held inbound function (whatsapp-status / whatsapp-inbound) is untouched — facts are read from stored rows');
}

console.log('\n── MIGRATION ──');
{
  const mig = read('supabase/migrations/20261014120000_sales_close_onboarding.sql');
  for (const t of ['client_onboarding_links', 'client_whatsapp_reads', 'whatsapp_template_status']) {
    ok(new RegExp(`alter table public\\.${t} enable row level security;\\s*\\nrevoke all on public\\.${t} from anon, authenticated;`).test(mig), `${t}: RLS on, no grants (service role only)`);
  }
  ok(/create unique index if not exists client_onboarding_links_one_open\s*\n\s*on public\.client_onboarding_links \(lead_id\) where revoked_at is null and submitted_at is null;/.test(mig), 'one OPEN onboarding link per client');
  ok(/token text not null unique check \(token ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(mig), 'the token is 64 hex, unique');
  for (const k of ['payment_link_shared', 'client_fact_set', 'handoff_sent', 'lead_added']) ok(mig.includes(`'${k}'`), `lead_activity keeps existing kind ${k}`);
  for (const k of ['onboarding_link_sent', 'onboarding_form_submitted', 'whatsapp_facts_found', 'call_answers_saved', 'client_onboarding']) ok(mig.includes(`'${k}'`), `new kind ${k}`);
}

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
