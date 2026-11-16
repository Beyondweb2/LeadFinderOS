/* V1 leftovers, 2026-11-16: stored verdict counts → Opportunity score, skip reasons by cause, the Apify 80% alert,
   Copy link by report style, "area they cover" → towns, and the two Q2 questions on the details form. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { leadVerdictCounts, oppWinnableOf, parseVerdictCounts, verdictCountsOf, VERDICT_COUNTS_VERSION, type StoredVerdictCounts } from '../src/lib/auditVerdictCounts.ts';
import { opportunityForLead } from '../src/lib/opportunityForLead.ts';
import { AUDIT_RULES_V2_FROM, auditRulesFor } from '../src/lib/auditVerdict.ts';
import { apifyPctOf, apifyUsageAlert, APIFY_ALERT_PCT } from '../src/lib/apifyUsageAlert.ts';
import { APIFY_RESERVE_PCT } from '../src/lib/auditBudget.ts';
import { REASON_TEXT, startRefusalReason } from '../src/lib/salesCheck.ts';
import { rowCheckState, skippedWhy } from '../src/lib/outreachRowCheck.ts';
import { COVERAGE_TOWNS_MAX, coverageUserPrompt, mergeAreas, parseCoverageTowns } from '../src/lib/coverageTowns.ts';
import { columnsForAnswers, isGapQuestion, ONBOARDING_QUESTIONS, validateOnboarding } from '../src/lib/clientOnboardingForm.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/* ── 1. Stored verdict counts ── */
const counts = (o: Partial<StoredVerdictCounts> = {}): StoredVerdictCounts => ({ v: VERDICT_COUNTS_VERSION, rules: 4, at: '2026-11-16T12:00:00Z', incomplete: false, named: 2, winnable: 5, notWinnable: 10, noNames: 3, unmeasured: 1, searches: 21, ...o });
ok(parseVerdictCounts(counts()) !== null, 'a stored v1 value reads back');
ok(parseVerdictCounts({ v: 0, none: true, at: 'x' }) === null, 'the "none" mark reads as no counts');
ok(parseVerdictCounts({ ...counts(), winnable: -1 }) === null && parseVerdictCounts({ ...counts(), rules: 2 }) === null, 'malformed / older-rule values are refused, never guessed');
ok(JSON.stringify(oppWinnableOf(counts())) === JSON.stringify({ winnable: 5, judged: 20 }), 'winnable of every search given a verdict (Couldn\'t measure left out)');
ok(oppWinnableOf(counts({ incomplete: true })) === null, '"Audit incomplete" gives the score nothing');
ok(oppWinnableOf(null) === null, 'no counts = no input');

const lid = 'lead-1';
const disc = (created: string, vc: unknown) => ({ lead_id: lid, created_at: created, audit_purpose: 'discovery', verdict_counts: vc });
const m1 = leadVerdictCounts([disc('2026-11-16T11:00:00Z', counts({ winnable: 1 })), disc('2026-11-16T13:00:00Z', counts({ winnable: 4 }))]);
ok(m1.get(lid)?.winnable === 4, 'a lead reads its NEWEST Discovery\'s counts');
const m2 = leadVerdictCounts([disc('2026-11-16T11:00:00Z', counts()), disc('2026-11-16T13:00:00Z', counts({ incomplete: true }))]);
ok(!m2.has(lid), 'a newest Discovery that is "Audit incomplete" is not replaced by an older one');
const m3 = leadVerdictCounts([{ ...disc('2026-11-16T13:00:00Z', counts()), audit_purpose: 'outreach' }]);
ok(!m3.has(lid), 'only a Discovery carries verdict counts');

const notDisc = verdictCountsOf({ audit: { business_name: 'X', business_type: 'plumber', location_text: 'Leeds', website: null, audit_purpose: 'outreach', created_at: '2026-11-16T12:00:00Z' }, queue: [], runMeta: [], lead: null }, 'now');
ok(notDisc === null, 'a non-Discovery audit stores no counts');
const v2Disc = verdictCountsOf({ audit: { business_name: 'X', business_type: 'plumber', location_text: 'Leeds', website: null, audit_purpose: 'discovery', created_at: '2026-11-15T12:00:00Z' }, queue: [], runMeta: [], lead: null }, 'now');
ok(v2Disc === null, 'a Discovery on rules v2 stores no counts (its report keeps its own rule)');

// The score reads them.
const leadFacts = { website: '', phone: '07700 900123', country: 'UK', status: 'not_contacted', hasGoogleListing: true, reviewCount: 0, rating: 0 };
const scored = { v: 1, complete: true, chatgpt: { named: 0, valid: 3 }, gemini: { named: 0, valid: 3 }, googleAi: { named: 0, shown: 0 }, scored: { named: 0, expected: 6, method: 1 }, share: null };
const base = { auditId: 'a', runId: 'r', score: scored as never, updating: false, dirty: false } as never;
const crawl = { result: null, created_at: '2026-11-16T00:00:00Z', siteScore: null } as never;
const withV = opportunityForLead(leadFacts as never, crawl, { ...(base as object), verdicts: counts({ winnable: 2 }) } as never);
const without = opportunityForLead(leadFacts as never, crawl, base);
ok(withV.kind === without.kind, 'the stored counts never change whether a lead is scored');
ok(withV.kind === 'scored' && without.kind === 'scored' && withV.score - without.score === 4, 'two winnable searches add 4 points (2 each)');
ok(read('src/lib/opportunityForLead.ts').includes('oppWinnableOf(audit.verdicts)') && !read('src/lib/opportunityForLead.ts').includes('v3: null'), 'the winnable input is switched on');
ok(read('src/hooks/useOpportunityInputs.ts').includes('verdict_counts') && !/OPP_AUDIT_SELECT[^\n]*results/.test(read('src/hooks/useOpportunityInputs.ts')), 'the lists read the small stored column, never results');

// The job: internal or admin only, sends nothing, cron migration exists, config entry in the same commit.
const watch = read('supabase/functions/audit-watch/index.ts');
ok(watch.includes('isInternalCall(req)') && watch.includes('requireAdmin(req, service)'), 'audit-watch: CRON_SECRET or admin only');
ok(!/send-whatsapp|sendWhatsApp|twilio|qaSendHold|create-ai-audit/i.test(watch), 'audit-watch never sends to anyone or starts an audit');
ok(watch.includes(`gte("created_at", AUDIT_RULES_V2_FROM)`) && AUDIT_RULES_V2_FROM === '2026-11-15T06:00:00Z', 'audit-watch looks at every Discovery since v2 (re-scored v3/v4 copies were made before v3 started)');
ok(auditRulesFor({ createdAt: '2026-11-16T09:21:01Z', runRules: [4, 4, 4] }) === 4, 'a copy made before v3 but stamped 4 is judged on v4 (6kjpm7 / db7nmj)');
const fix = read('supabase/migrations/20261218090100_audit_watch_rescored_copies.sql');
ok(fix.includes("timestamptz '2026-11-15 06:00:00+00'"), 'the cron gate uses the same v2 start time');
const mig = read('supabase/migrations/20261218090000_audit_watch.sql');
ok(mig.includes('add column if not exists verdict_counts jsonb'), 'the column is additive');
ok(!/generated\s+always|stored\s*;/i.test(mig) && !/drop\s+table|delete\s+from|truncate/i.test(mig), 'the migration rewrites and deletes nothing');
ok(/\[functions\.audit-watch\]\s*\nverify_jwt = false/.test(read('supabase/config.toml')) && /\[functions\.coverage-towns\]\s*\nverify_jwt = true/.test(read('supabase/config.toml')), 'both new functions have their config.toml entry');

/* ── 3a. Skip reasons by cause ── */
ok(REASON_TEXT.monthly_limit.includes('Monthly search limit') && REASON_TEXT.monthly_limit.includes('ask Paul to raise it'), 'monthly limit: says it is monthly and Paul raises it');
ok(REASON_TEXT.budget_used.startsWith('Daily budget used') && /tomorrow/.test(REASON_TEXT.budget_used), 'daily budget: says try tomorrow');
ok(Object.values(REASON_TEXT).every((t) => !/\$|£|apify|openai|cost|spend/i.test(t)), 'no reason a rep reads names a cost or a provider');
ok(startRefusalReason({ error: 'prospecting_budget_used', reason: 'apify_reserve' }).reason === 'monthly_limit', 'create-ai-audit refusing on the Apify reserve → monthly limit');
ok(startRefusalReason({ error: 'prospecting_budget_used', reason: 'pool_cap' }).reason === 'budget_used', '…on the day\'s pool → daily budget');
ok(startRefusalReason({ error: 'prospecting_budget_used' }).reason === 'budget_used', '…with no cause → daily budget (as before)');
ok(read('supabase/functions/_shared/sales-check.ts').includes('decision.reason === "apify_reserve" ? "monthly_limit" : "budget_used"'), 'the batch gate keeps the cause');
const st = rowCheckState(null, { lead_id: 'x', status: 'skipped', reason: 'monthly_limit', message: REASON_TEXT.monthly_limit });
ok(st.kind === 'skipped' && st.why === 'Monthly search limit reached, ask Paul to raise it', 'the row shows the cause itself');
ok(skippedWhy({ reason: 'budget_used', message: null }) === 'Daily budget used, try tomorrow', 'daily budget on the row');
ok(skippedWhy({ reason: 'something_new', message: 'Full sentence.' }) === 'Full sentence.', 'an unlisted reason shows its full sentence');
ok(read('src/components/OutreachAiCheck.tsx').includes('row-ai-skipped-why'), 'the Outreach row draws it');

/* ── 3b. Apify past 80% ── */
const row = (used: number, cap: number) => ({ monthly_usage_usd: used, max_monthly_usage_usd: cap, cycle_start: '2026-11-03T10:00:00.000Z', cycle_end: '2026-12-03T10:00:00.000Z', captured_at: '2026-11-16T12:00:00Z' });
ok(apifyUsageAlert(row(79.9, 100)) === null, 'under 80%: no alert');
const al = apifyUsageAlert(row(80, 100));
ok(!!al && al.dedupeKey === 'apify_usage_80:2026-11-03', 'at 80%: one alert, keyed to the billing cycle (once per cycle)');
ok(apifyPctOf({ monthly_usage_usd: 50, max_monthly_usage_usd: 0 }) === null && apifyUsageAlert({ ...row(1, 1), max_monthly_usage_usd: null }) === null, 'an unknown cap raises nothing');
ok(!!al && al.body.includes(`${APIFY_RESERVE_PCT.prospecting}%`), 'the alert names the prospecting stop line from the constant');
ok(APIFY_ALERT_PCT < APIFY_RESERVE_PCT.prospecting, 'the alert comes before prospecting stops');
ok(mig.includes("'apify_usage_80:' ||") && mig.includes('* 80'), 'the cron gate uses the same line and dedupe key');
ok(watch.includes('raiseOperatorAlert(service, "team_update", alert)'), 'bell + email through the one operator-alert door');

/* ── 4. Copy link by report style ── */
const card = read('src/components/HookVisibilityCard.tsx');
ok(card.includes('useLeadReportStyle(leadId)') && card.includes('reportLinkFor(l.shortCode, style)'), 'the lead panel\'s Copy link uses the lead\'s report style');
ok(read('src/components/HookVisibilityView.tsx').includes('navigator.clipboard?.writeText(url)'), 'Copy link copies the styled address');

/* ── 5. Area → towns, and the details form ── */
const p = parseCoverageTowns(JSON.stringify({ places: ['1. Croydon', 'croydon', 'Bromley', '', 42, '<b>x</b>'], note: '' }));
ok(JSON.stringify(p.places) === JSON.stringify(['Croydon', 'Bromley']), 'the AI list is cleaned: numbering off, one of each, junk dropped');
ok(parseCoverageTowns('not json').places.length === 0, 'a broken answer = no suggestion');
ok(parseCoverageTowns({ places: Array.from({ length: 99 }, (_, i) => `Town ${i}`) }).places.length === COVERAGE_TOWNS_MAX, 'capped');
ok(JSON.stringify(mergeAreas(['Croydon'], ['croydon', 'Sutton'])) === JSON.stringify(['Croydon', 'Sutton']), 'picked towns are added once, existing kept');
ok(coverageUserPrompt({ coverage: 'all London boroughs inside the M25', primaryTown: 'Croydon' }).includes('M25'), 'the prompt carries their words');
const cov = read('supabase/functions/coverage-towns/index.ts');
ok(cov.includes('requireAdmin(req, service)') && !/\.update\(|\.upsert\(|onboarding_responses/.test(cov), 'coverage-towns: admin only and writes nothing to the client record');
ok(read('src/pages/ClientHub.tsx').includes('<CoverageTownsSuggest'), 'Prepare baseline offers it, into the editable Service areas');

const keys = ONBOARDING_QUESTIONS.map((q) => q.key);
ok(keys.includes('services_not_wanted') && keys.includes('coverage_area'), 'the details form asks the two new questions');
ok(ONBOARDING_QUESTIONS.filter((q) => q.key === 'services_not_wanted' || q.key === 'coverage_area').every((q) => !q.required && !isGapQuestion(q as never)), 'both optional, never a "still missing" gap');
const qs = ONBOARDING_QUESTIONS.filter((q) => q.key === 'services_not_wanted' || q.key === 'coverage_area').map((q) => ({ key: q.key }) as never);
const v = validateOnboarding(qs, { services_not_wanted: 'emergency call-outs', coverage_area: 'all London boroughs inside the M25' }, null);
const cols = columnsForAnswers(v.answers);
ok(cols.services_not_wanted === 'emergency call-outs' && cols.coverage_area === 'all London boroughs inside the M25', 'answers land in their own columns as typed');
ok(read('supabase/functions/_shared/client-onboarding.ts').includes('services_not_wanted,coverage_area'), 'the form reads both columns, so a filled one is not asked again');

if (failures) { console.error(`\n${failures} failing`); process.exit(1); }
console.log('\nall passing');
