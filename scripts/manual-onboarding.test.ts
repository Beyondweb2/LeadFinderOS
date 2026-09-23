/* ============================================================
   MANUAL ONBOARDING = THE CUSTOMER'S ONBOARDING, TYPED BY THE OPERATOR (2026-09-23).

   Pins: the operator form asks the customer's questions word for word (checked against
   findable-site), writes the SAME onboarding_responses columns, keeps provenance, drives the same
   4/8-week rule, and feeds the same Website Build facts and baseline context. The baseline reads
   approved answers first; the crawl only suggests. The Paid Client hub exposes all of it.

   Run: npx tsx scripts/manual-onboarding.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  ONBOARDING_COPY, DOMAIN_OPTIONS, AGENCY_OPTIONS, ACCESS_OPTIONS, SELF_SITE_OPTIONS,
  siteAccessFromBranch, websiteManagerFromBranch, permissionAckText, accessConsequenceText, websiteRouteFor,
  answersFromRecords, buildOnboardingPatch, cleanAnswers, answerProblems, leadPatchFromAnswers, onboardingStatus,
  type OnboardingAnswers,
} from '../src/lib/manualOnboarding';
import { remeasureWeeksFor, REMEASURE_WEEKS_NEW_DOMAIN, REMEASURE_WEEKS_STANDARD } from '../src/lib/findableOffer';
import { candidateFacts } from '../src/lib/buildFacts';
import { mergeClientContext, verifiedBuildFacts, selectClientCrawlContext } from '../src/lib/clientContext';
import { buildAuditPreviewRequest } from '../src/lib/auditQuestionContext';
import { baselineReadiness } from '../src/lib/baselineReadiness';
import { questionnaireComplete } from '../src/lib/questionnaireComplete';
import { CRAWL_CHECK_VERSION } from '../src/lib/crawlCheck';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const hub = read('supabase/functions/paid-client-hub/index.ts');
const clientHub = read('src/pages/ClientHub.tsx');
const dialog = read('src/components/ManualOnboardingDialog.tsx');
const paidBaseline = read('supabase/functions/paid-baseline/index.ts');
const onboardingFn = read('supabase/functions/findable-onboarding/index.ts');
const auditBaseline = read('supabase/functions/_shared/audit-baseline.ts');

function actionBlock(src: string, action: string): string {
  const start = src.indexOf(`if (action === "${action}")`);
  if (start < 0) throw new Error(`action ${action} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced');
}

const blank: OnboardingAnswers = cleanAnswers({});
const NOW = '2026-09-23T12:00:00.000Z';
const OP = '9d5a7629-3171-4091-b3a4-43010a1d424d';

console.log('\n── SAME QUESTIONS: every string is the customer flow\'s own (findable-site) ──');
{
  const site = path.resolve(ROOT, '..', 'findable-site', 'src');
  const flowPath = path.join(site, 'components', 'OnboardingFlow.tsx');
  const accessPath = path.join(site, 'lib', 'siteAccess.ts');
  if (!fs.existsSync(flowPath)) {
    ok(false, 'findable-site is not checked out beside this repo — the question wording CANNOT be verified (this is not a pass)');
  } else {
    const norm = (s: string) => s.replace(/&rsquo;|&#39;|&apos;/g, "'").replace(/\{"\s*"\}/g, ' ').replace(/\s+/g, ' ');
    const customer = norm(fs.readFileSync(flowPath, 'utf8') + fs.readFileSync(accessPath, 'utf8'));
    const strings: string[] = [];
    const walk = (v: unknown) => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(ONBOARDING_COPY);
    for (const opts of [DOMAIN_OPTIONS, AGENCY_OPTIONS, ACCESS_OPTIONS, SELF_SITE_OPTIONS]) for (const o of opts) strings.push(o.label);
    strings.push(permissionAckText(null), permissionAckText('yes_access'), permissionAckText('want_new'), accessConsequenceText('yes_access'), accessConsequenceText('no_website'));
    const missing = strings.filter((s) => !customer.includes(norm(s)));
    ok(missing.length === 0, `all ${strings.length} question texts, helpers and option labels appear verbatim in the customer flow${missing.length ? ' — MISSING: ' + missing.join(' | ') : ''}`);
    const chipsSrc = fs.readFileSync(path.join(site, 'lib', 'onboardingChips.ts'), 'utf8').replace(/\r\n/g, '\n');
    const mine = read('src/lib/onboardingChips.ts');
    const body = (s: string) => s.slice(s.indexOf('export interface ChipSet'));
    ok(body(chipsSrc) === body(mine), 'the service chips are a byte copy of the customer flow\'s');
  }
  ok(siteAccessFromBranch('yes', 'yes', null) === 'yes_access' && siteAccessFromBranch('yes', 'no', null) === 'no_access'
    && siteAccessFromBranch('no', null, 'access') === 'yes_access' && siteAccessFromBranch('no', null, 'rebuild') === 'want_new'
    && siteAccessFromBranch('no', null, 'none') === 'no_website' && siteAccessFromBranch('yes', null, null) === null && siteAccessFromBranch(null, 'yes', 'access') === null,
    'the website branch folds exactly as the customer flow\'s siteAccessFromBranch');
  ok(websiteManagerFromBranch('yes') === 'web_company' && websiteManagerFromBranch('no') === 'direct_access' && websiteManagerFromBranch(null) === null, 'website_manager folds the same way');
  ok(/a\.agency_manages === 'yes' && <div>/.test(dialog) && /a\.agency_manages === 'no' && <div>/.test(dialog) && /a\.can_get_access === 'yes' && <div/.test(dialog) && /a\.domain_status === 'new' &&/.test(dialog),
    'the conditional questions keep the customer\'s show conditions');
  ok(/can_get_access: null, self_site: null/.test(dialog), 'changing the agency answer clears the sub-answers, as the customer flow does');
}

console.log('\n── 8. CUSTOMER-SUBMITTED ONBOARDING STILL WORKS ──');
{
  ok(!/manualOnboarding|operator_edited/.test(onboardingFn), '8. findable-onboarding (the customer path) is untouched by this change');
  const customerRow = { confirmed_location: 'Bath', services: 'EICRs, Rewiring', services_list: ['EICRs', 'Rewiring'], status: 'paid', client_source: null };
  const st = onboardingStatus(customerRow);
  ok(st.state === 'complete' && st.source === 'customer', '8. a customer row reads "Complete — submitted by the client"');
}

console.log('\n── 9. MANUAL ONBOARDING WRITES THE SAME CANONICAL COLUMNS ──');
const full: OnboardingAnswers = {
  ...blank, contact_name: 'Ben Smith', contact_email: 'info@bs4.example', confirmed_phone: '07950 399604', business_website: 'bs4.example',
  business_name: 'BS4 Electrical Services Ltd', trade: 'Electrician', confirmed_location: 'Bristol', domain_status: 'existing',
  agency_manages: 'no', self_site: 'access', gbp_consent: 'yes_all', services: ['EICRs', 'Consumer unit upgrades'], areas: ['Bath', 'Keynsham'],
};
const patch = buildOnboardingPatch(full, OP, NOW);
{
  const answerCols = ['contact_name', 'contact_email', 'confirmed_phone', 'business_website', 'business_name', 'confirmed_location', 'domain_status', 'website_manager', 'website_manager_email', 'gbp_consent', 'services', 'services_list', 'areas_list'];
  ok(answerCols.every((k) => k in patch), '9. the patch sets every answer column');
  const notCustomer = answerCols.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(onboardingFn));
  ok(notCustomer.length === 0, `9. every one of them is a column the customer path (findable-onboarding) also writes${notCustomer.length ? ' — not found: ' + notCustomer.join(', ') : ''}`);
  const extra = Object.keys(patch).filter((k) => !answerCols.includes(k));
  ok(extra.every((k) => ['website_route', 'incomplete', 'operator_edited_at', 'operator_edited_by', 'updated_at'].includes(k)), `9. the only other keys are route + provenance (${extra.join(', ')})`);
  ok(!('plan_tier' in patch) && !('website_addon' in patch) && !('status' in patch) && !Object.keys(patch).some((k) => k.startsWith('baseline_')), '9. never money (plan_tier / website_addon), never status, never the baseline');
  ok(patch.operator_edited_by === OP && patch.operator_edited_at === NOW, '9. provenance: who entered it, and when');
  ok(patch.services === 'EICRs, Consumer unit upgrades' && JSON.stringify(patch.services_list) === JSON.stringify(['EICRs', 'Consumer unit upgrades']) && JSON.stringify(patch.areas_list) === '["Bath","Keynsham"]', '9. services and areas in the customer\'s two shapes');
  ok(patch.business_website === 'https://bs4.example' && patch.website_manager === 'direct_access' && patch.website_manager_email === null, '9. website normalised; hidden manager email never sent');
  ok(patch.incomplete === false && questionnaireComplete(patch as never), '9. a complete answer set is complete by the SAME rule the baseline engine waits on');
  const save = actionBlock(hub, 'save_onboarding');
  ok(/buildOnboardingPatch\(answers, user\.id, now\)/.test(save) && /cleanAnswers\(body\.answers\)/.test(save), '9. the server builds the patch itself from cleaned answers (no arbitrary columns)');
  ok(/client_source: "manual"/.test(save) && /status: "paid"/.test(save), '9. a new row is a paid, operator-sourced row (the create_manual shape)');
  ok(!/create-ai-audit|paid-baseline|crawl-check|functions\.invoke|whatsapp|sendEmail|resend|stripe/i.test(save), '9. saving runs no audit, no crawl, sends nothing, charges nothing');
  ok(/isPaidClient\(lead as never\)/.test(save) && /eq\("user_id", user\.id\)/.test(save), '9. only for the operator\'s own paid client');
  ok(cleanAnswers({ domain_status: 'maybe', gbp_consent: 'yes', agency_manages: 'x', services: 'a, b, a' }).domain_status === null && cleanAnswers({ gbp_consent: 'yes' }).gbp_consent === null && cleanAnswers({ services: 'a, b, a' }).services.join('|') === 'a|b', '9. posted values are enumerated and deduped');
  ok(answerProblems({ ...full, contact_email: 'nope', confirmed_phone: '7950 399604', business_website: 'me@x.com' }).length === 3, '9. the customer\'s entry rules (email, dialable phone, web address) apply');
}

console.log('\n── 10/11. PARTIAL ONBOARDING CAN BE COMPLETED; ANSWERS PERSIST ──');
{
  const partialRow = { status: 'submitted', contact_email: 'info@bs4.example', confirmed_location: 'Bristol', services: null, services_list: null, website_manager: 'direct_access', website_route: null, website_addon: false };
  const st = onboardingStatus(partialRow);
  ok(st.state === 'incomplete' && st.missing.join() === 'services', '10. a partial customer row names what is missing');
  const pre = answersFromRecords(partialRow, { business_name: 'BS4 Electrical Services Ltd', category: 'Electrician', phone: '07950 399604' });
  ok(pre.contact_email === 'info@bs4.example' && pre.confirmed_location === 'Bristol' && pre.agency_manages === 'no' && pre.self_site === 'access' && pre.confirmed_phone === '07950 399604' && pre.trade === 'Electrician',
    '10. the form opens prefilled: stored answers, the recovered website branch, then the client record');
  const done = buildOnboardingPatch({ ...pre, services: ['EICRs'] }, OP, NOW);
  const after = { ...partialRow, ...done, status: 'paid' };
  ok(onboardingStatus(after).state === 'completed_manually' && onboardingStatus(after).source === 'customer_edited_by_operator', '10. completing it manually → "Complete — client answers, edited by operator"');
  const roundTrip = answersFromRecords({ ...patch, client_source: 'manual' }, {});
  ok(roundTrip.services.join('|') === full.services.join('|') && roundTrip.areas.join('|') === full.areas.join('|') && roundTrip.confirmed_location === 'Bristol'
    && roundTrip.agency_manages === 'no' && roundTrip.self_site === 'access' && roundTrip.domain_status === 'existing' && roundTrip.gbp_consent === 'yes_all' && roundTrip.contact_name === 'Ben Smith',
    '11. saved answers reopen exactly as entered');
  ok(onboardingStatus({ ...patch, client_source: 'manual' }).state === 'completed_manually', '11. an operator-created row reads "Completed manually"');
  const save = actionBlock(hub, 'save_onboarding');
  ok(/\.update\(\{ \.\.\.patch, \.\.\.promote \}\)\.eq\("id", existing\.id\)/.test(save) && /\.insert\(\{ \.\.\.patch, lead_id: leadId/.test(save), '11. an existing row is updated in place; a new one is inserted — one row per client');
  ok(/existing\.status !== "paid"/.test(save), '11. a customer row that never reached paid is adopted, not duplicated');
  const lp = leadPatchFromAnswers(full, { website: 'https://old.example', category: 'Electricians', email: 'keep@x.com' }, NOW);
  ok(lp.patch.search_location === 'Bristol' && lp.patch.category === 'Electrician' && !('email' in lp.patch) && lp.patch.website === 'https://bs4.example' && lp.notes.length === 1,
    '11. the lead gets the same updates the customer\'s submit makes (town, trade, fill-empty contacts, website with a note)');
}

console.log('\n── 12. DOMAIN / BUILD ANSWERS DRIVE THE SAME 4/8-WEEK RULE ──');
{
  const weeks = (a: Partial<OnboardingAnswers>) => remeasureWeeksFor(buildOnboardingPatch({ ...full, ...a }, OP, NOW) as never);
  ok(weeks({ agency_manages: 'no', self_site: 'rebuild', domain_status: 'new' }) === REMEASURE_WEEKS_NEW_DOMAIN, '12. a rebuild on a brand-new domain → 8 weeks');
  ok(weeks({ agency_manages: 'no', self_site: 'none', domain_status: 'new' }) === REMEASURE_WEEKS_NEW_DOMAIN, '12. no website + new domain → 8 weeks');
  ok(weeks({ agency_manages: 'yes', can_get_access: 'no', domain_status: 'new' }) === REMEASURE_WEEKS_NEW_DOMAIN, '12. cannot get access + new domain → 8 weeks');
  ok(weeks({ agency_manages: 'no', self_site: 'rebuild', domain_status: 'existing' }) === REMEASURE_WEEKS_STANDARD, '12. a rebuild on their existing domain → 4 weeks');
  ok(weeks({ agency_manages: 'no', self_site: 'access', domain_status: 'new' }) === REMEASURE_WEEKS_STANDARD, '12. optimising their own site → 4 weeks');
  ok(weeks({ agency_manages: null, domain_status: 'new' }) === REMEASURE_WEEKS_STANDARD, '12. an unanswered website question → the standard 4 weeks');
  ok(websiteRouteFor(null) === null && !('website_route' in buildOnboardingPatch({ ...full, agency_manages: null }, OP, NOW)), '12. an unanswered route is not written (the stored one stands)');
  ok(/remeasureWeeksFor\(obRow/.test(auditBaseline) && /\.select\("plan_tier, website_route, domain_status/.test(auditBaseline), '12. the engine reads the same columns this form writes');
}

console.log('\n── 13. WEBSITE BUILD SEES THE MANUALLY ENTERED ANSWERS ──');
{
  const onboarding = { ...patch, client_source: 'manual' };
  const facts = candidateFacts({ lead: { business_name: 'BS4 Electrical Services Ltd', website: 'https://bs4.example' }, onboarding, baseline_audit: null, discovery_audit: null,
    crawl: { mode: 'full', result: { siteInfo: { services: ['Gallery', 'EICRs'], towns: ['Weston'] } as never }, full_evidence: { business: { credentials: [{ value: 'NICEIC — "…"', url: 'u' }] } } as never } });
  const svc = facts.find((f) => f.key === 'services');
  ok(!!svc && svc.value.includes('EICRs') && svc.status === 'verified' && /entered by operator/.test(svc.source), '13. manual services are a verified onboarding fact, labelled as entered by the operator');
  const town = facts.find((f) => f.key === 'primary_town');
  ok(town?.value === 'Bristol' && town.status === 'verified', '13. the manual home town is the build\'s home town');
  ok(facts.find((f) => f.key === 'services_on_site')?.status === 'detected' && facts.find((f) => f.key === 'towns_on_site')?.status === 'detected', '13. the crawl\'s services and towns stay DETECTED beside them');
  ok(facts.find((f) => f.key === 'credentials_on_site')?.status === 'detected', '13. full-crawl credentials arrive as DETECTED, never verified');
  ok(/HUB_ONBOARDING_COLUMNS[\s\S]*operator_edited_at/.test(hub), '13. rebuild_context reads the provenance column');
}

console.log('\n── 14–16. THE BASELINE USES APPROVED ANSWERS; THE CRAWL ONLY SUGGESTS ──');
{
  const crawl = { services: ['Gallery', 'EICRs', 'Solar panels'], towns: ['Weston-super-Mare', 'Bath'] };
  const ctx = mergeClientContext({ onboarding: { confirmed_location: patch.confirmed_location, services: patch.services, services_list: patch.services_list, areas_list: patch.areas_list },
    lead: { business_name: 'BS4', derived_town: 'Brislington', category: 'Electrician' }, crawl });
  ok(ctx.services.join('|') === 'EICRs|Consumer unit upgrades' && ctx.service_areas.join('|') === 'Bath|Keynsham', '14. the context is the manually entered services and areas');
  const req = buildAuditPreviewRequest({ ...ctx, specialisms: [] }, { questionCount: 20, purpose: 'baseline' }) as Record<string, unknown>;
  ok(req.specialisms === 'EICRs, Consumer unit upgrades' && JSON.stringify(req.service_areas) === JSON.stringify(['Bath', 'Keynsham']) && req.location_text === 'Bristol',
    '14. …and that is exactly what the question generator is sent');
  ok(ctx.primary_location === 'Bristol', '15. the onboarding town beats the client record\'s derived town');
  ok(!ctx.services.includes('Gallery') && !ctx.services.includes('Solar panels') && !ctx.service_areas.includes('Weston-super-Mare'), '15/16. crawl text is never merged into what is measured');
  ok(ctx.detected_services.join('|') === 'Gallery|Solar panels' && ctx.detected_areas.join('|') === 'Weston-super-Mare', '16. it comes back as detected suggestions only');
  const bf = verifiedBuildFacts({ facts: [{ key: 'services', value: 'Fault finding', status: 'verified' }, { key: 'service_areas', value: 'Clevedon', status: 'detected' }, { key: 'primary_town', value: 'Bath', status: 'rejected' }] });
  ok(bf.services === 'Fault finding' && bf.service_areas === '' && bf.primary_town === '', '16. only VERIFIED build facts count');
  const ctx2 = mergeClientContext({ onboarding: { confirmed_location: null, services: null }, buildFacts: bf, lead: { derived_town: 'Bristol' }, crawl });
  ok(ctx2.services.join('|') === 'Fault finding' && ctx2.service_sources['Fault finding']?.includes('build_facts'), '16. a verified build fact fills a gap, with its source named (priority 2)');
  ok(/buildFacts: verifiedBuildFacts\(/.test(paidBaseline) && /detected: \{ services: merged\.detected_services, areas: merged\.detected_areas \}/.test(paidBaseline), '14–16. paid-baseline uses this order and returns the suggestions separately');
  const now = Date.parse('2026-09-23T12:00:00Z');
  const wwwOk = selectClientCrawlContext({ website: 'https://bs4.example/', now, leadCrawl: { mode: 'full', created_at: '2026-09-23T11:00:00Z', result: { version: CRAWL_CHECK_VERSION, url: 'https://www.bs4.example/', siteInfo: { towns: ['Bath'] } } } });
  ok(wwwOk?.source === 'lead', 'the www twin of the client\'s site is recognised as the same site');
}

console.log('\n── 17. THE FROZEN BASELINE IS UNCHANGED ──');
{
  ok(/if \(isFrozenBaselineStatus\(status\)\) return json\(\{ ok: false, error: "baseline_questions_locked" \}, 409\);/.test(paidBaseline), '17. frozen questions still cannot be regenerated');
  ok(/if \(next\.length !== BASELINE_QUESTIONS\) \{/.test(paidBaseline), '17. approval is still exactly BASELINE_QUESTIONS');
  ok(/if \(isStartedBaselineStatus\(status\)\) return json\(\{ ok: true, baseline: details, skipped: "already_started" \}\);/.test(paidBaseline), '17. a started baseline still refuses every mutation');
  ok(/approvedQuestions\.length === 0 \|\| \(baselineStatus !== "approved" && baselineStatus !== "starting"\)/.test(auditBaseline), '17. only an approved set can start — a manually created row (needs_questions) never starts itself');
  const save = actionBlock(hub, 'save_onboarding');
  ok(!/baseline_questions|baseline_approved|"approved"/.test(save), '17. saving onboarding never touches the question set or its approval');
}

console.log('\n── 18–20. THE PAID CLIENT HUB ──');
{
  ok(/<LeadCrawlPanel leadId=\{lead\.id\}[^\n]*from="paid_client"/.test(clientHub), '18. Paid Clients has the Crawl / Re-crawl panel');
  const panel = read('src/components/LeadCrawlPanel.tsx');
  ok(/summary\.status === 'none' \? 'Crawl site' : 'Re-crawl site'/.test(panel), '18. the button reads Crawl site, or Re-crawl site once a crawl exists');
  ok(/disabled=\{running \|\| !crawlable\}/.test(panel) && /Crawling the whole site/.test(panel), '18. it shows crawling, and is off when there is no website');
  ok(/summary\.label/.test(panel) && /summary\.warnings/.test(panel), '19. the latest crawl status and its warnings render');
  const none = onboardingStatus(null);
  ok(none.state === 'not_started' && none.missing.length === 2, '20. no onboarding → not started, both essentials missing');
  ok(/'Complete onboarding manually'/.test(clientHub) && /<OnboardingStage /.test(clientHub) && /<ManualOnboardingDialog /.test(clientHub), '20. the hub offers Complete onboarding manually');
  ok(/<ReadinessList lead=\{lead\} onboarding=\{onboarding\} onFix=/.test(clientHub), '20. baseline readiness names what is missing with a Fix button');
  const r = baselineReadiness({ business_name: 'BS4', category: 'Electrician', website: 'https://bs4.example' }, null);
  ok(!r.ready && r.attention.some((i) => i.key === 'services') && r.attention.some((i) => i.key === 'primary_location') && r.attention.some((i) => i.key === 'onboarding'), '20. BS4 today: not ready — onboarding, town, services');
  const r2 = baselineReadiness({ business_name: 'BS4', category: 'Electrician', website: 'https://bs4.example' }, { ...patch, client_source: 'manual' });
  ok(r2.ready && r2.attention.length === 0, '20. after manual onboarding: ready');
  const r3 = baselineReadiness({ business_name: 'BS4', category: 'Electrician' }, { ...patch, areas_list: null, client_source: 'manual' });
  ok(r3.ready && r3.attention.map((i) => i.key).join() === 'service_areas', '20. missing service areas is attention, not a blocker');
  ok(!/setInterval[\s\S]{0,80}crawl|runFullLeadCrawl\(/.test(clientHub), 'opening Paid Clients never starts a crawl');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
