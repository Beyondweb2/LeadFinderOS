/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COVERAGE: FOUND vs ADDED, WITH / WITHOUT A WEBSITE (Paul, 2026-09-29). Found comes from what each
   search run RETURNED (recorded when it ran); Added from each successful CRM insert (recorded then).
   Never inferred from the CRM; a run from before the recording is "not recorded", never estimated.
   Plus the Quick Close Build consents (same day): required before a Build payment link.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { foundAddedByPair, coverageKey, COVERAGE_LABEL, type SearchRunRecord } from '../src/lib/coverageState.ts';
import { foundRecord, isWithoutWebsite, businessKey } from '../src/lib/websiteStatusClass.ts';
import { cleanAnswers, missingQuestions, mayGenerateLink, onboardingColumnsFor, quickCloseState, QUICK_CLOSE_QUESTIONS, BUILD_CONSENTS } from '../src/lib/quickClose.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('── 1. ONE WEBSITE VERDICT (the search\'s own) ──');
ok(isWithoutWebsite('NO_WEBSITE') && isWithoutWebsite('DIRECTORY_ONLY'), 'NO_WEBSITE and DIRECTORY_ONLY are "without a website"');
ok(!isWithoutWebsite('HAS_OWN_WEBSITE') && !isWithoutWebsite('UNCERTAIN') && !isWithoutWebsite(null) && !isWithoutWebsite('something new'), 'HAS_OWN_WEBSITE, UNCERTAIN and unknown are "with" (the no_website_count split, unchanged)');
ok(businessKey({ id: 'ChIJ1', googleMapsUrl: 'u', name: 'n' }) === 'ChIJ1' && businessKey({ googleMapsUrl: 'u', name: 'n' }) === 'u' && businessKey({ name: 'n' }) === 'n', 'a business is keyed by place id, else Maps URL, else name');
const rec = foundRecord([{ id: 'a', websiteStatus: 'HAS_OWN_WEBSITE' }, { id: 'b', websiteStatus: 'NO_WEBSITE' }, { id: 'c', websiteStatus: 'DIRECTORY_ONLY' }, { id: 'a', websiteStatus: 'HAS_OWN_WEBSITE' }]);
ok(rec.found_with_website === 1 && rec.found_without_website === 2 && Object.keys(rec.found_keys).length === 3, 'a run\'s record: duplicates in one result count once (1 with, 2 without)');

console.log('── 2. THE FOLD ──');
const run = (trade: string, town: string, found: Record<string, boolean> | null, added: Record<string, boolean> | null = null): SearchRunRecord => ({ trade, town, found, added });
const get = (runs: SearchRunRecord[], trade = 'plumbers', town = 'Wisbech') => foundAddedByPair(runs).get(coverageKey(trade, town));

const both = get([run('plumbers', 'wisbech', { a: false, b: false, c: true, d: true, e: true }, { a: false, c: true })]);
ok(both?.status === 'recorded' && both.foundWithWebsite === 2 && both.foundWithoutWebsite === 3 && both.addedWithWebsite === 1 && both.addedWithoutWebsite === 1, 'both website types found: Found 2 / 3, Added 1 / 1');

const zeroNo = get([run('plumbers', 'wisbech', { a: false, b: false }, { a: false })]);
ok(zeroNo?.foundWithoutWebsite === 0 && zeroNo.addedWithoutWebsite === 0 && zeroNo.foundWithWebsite === 2, 'zero no-website businesses: Found 2 / 0 (a real zero, not "not recorded")');

const noneAdded = get([run('plumbers', 'wisbech', { a: false, b: true, c: true }, { a: false })]);
ok(noneAdded?.foundWithoutWebsite === 2 && noneAdded.addedWithoutWebsite === 0, 'no-website businesses found but none added: Found … 2 without / Added … 0 without');

const more = get([run('plumbers', 'wisbech', Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${i}`, i % 3 === 0])), { p0: true, p1: false })]);
ok(more && more.foundWithWebsite + more.foundWithoutWebsite === 30 && more.addedWithWebsite + more.addedWithoutWebsite === 2, 'discovery count greater than CRM-added count: 30 found, 2 added');

const hist = get([run('plumbers', 'wisbech', null), run('plumbers', 'wisbech', null)]);
ok(hist?.status === 'not_recorded' && hist.unrecordedRuns === 2 && hist.foundWithWebsite === 0, 'historical rows only: NOT RECORDED (no numbers invented)');
ok(get([]) === undefined, 'never searched: no entry (the row says "Not searched")');

const mixed = get([run('plumbers', 'wisbech', null), run('Plumber', 'WISBECH', { a: false, b: true })]);
ok(mixed?.status === 'recorded' && mixed.unrecordedRuns === 1 && mixed.foundWithWebsite === 1 && mixed.foundWithoutWebsite === 1, 'old + new runs: the recorded run\'s figures, the old one noted (folded across "Plumber" / "plumbers", "WISBECH" / "Wisbech")');

const twice = get([run('plumbers', 'wisbech', { a: false, b: true }, { a: false }), run('plumbers', 'wisbech', { a: false, b: false, c: true }, { c: true })]);
ok(twice?.foundWithWebsite === 2 && twice.foundWithoutWebsite === 1 && twice.addedWithWebsite === 1 && twice.addedWithoutWebsite === 1, 'searched twice: each business counted once, latest verdict wins (b got a website), adds unioned');
ok(!foundAddedByPair([run('plumbers', 'wisbech', { a: false })]).has(coverageKey('electricians', 'Wisbech')), 'another trade in the same town is not credited');

console.log('── 3. WHERE THE NUMBERS COME FROM ──');
const ctx = code('src/contexts/LeadSearchContext.tsx');
ok(/saveSearch\(filters, filteredLeads\.length, noWebsiteCount, data\.leads as SearchLeadLike\[\]\)/.test(ctx), 'Find Leads: Found is the search\'s RAW result (data.leads), not the post-exclusion list');
ok(/\.\.\.foundRecord\(found\)/.test(ctx) && /\.select\('id'\)\.single\(\)/.test(ctx), '…written on the run\'s own history row, whose id each result then carries');
const sl = code('supabase/functions/search-leads/index.ts');
ok(/\.\.\.foundRecord\(leads\),\s*\}\)\.select\('id'\)\.maybeSingle\(\)/.test(sl) && /searchRunId,\s*leads:/.test(sl), 'search-leads\' own history row (Niche panel) records Found too and returns the run id');
const out = code('src/hooks/useOutreach.ts');
ok((out.match(/recordSearchAddition\(lead\);/g) ?? []).length === 2, 'Added is recorded after BOTH successful insert paths (admin insert, Sales add)');
ok(out.indexOf('recordSearchAddition(lead);') > out.indexOf("('sales_add_lead'") && out.lastIndexOf('recordSearchAddition(lead);') > out.indexOf(".from('outreach_leads')\n      .insert("), '…and only after the insert returned');
const cov = code('supabase/functions/coverage/index.ts');
ok(/from\("search_history"\)\.select\("keyword, location, found_keys, added_keys"\)/.test(cov) && !/from\("search_history"\)\.select\("keyword, location, found_keys, added_keys"\)\s*\.eq\("user_id"/.test(cov), 'Coverage reads every run in the book (anyone who searched), keys only');
ok(!/outreach_leads[\s\S]{0,200}found_/.test(cov), 'Found is never computed from the CRM');
const mig = read('supabase/migrations/20260929190000_coverage_found_added.sql');
ok(!/update public\.search_history set (found|added)/i.test(mig.replace(/--.*$/gm, '').split('create or replace function')[0]), 'the migration back-fills nothing (history stays "not recorded")');
ok(/where id = _run_id and user_id = auth\.uid\(\) and found_keys is not null/.test(mig), 'an addition is credited only to the adder\'s own RECORDED run');
const page = read('src/pages/Coverage.tsx');
ok(/<CoverageFoundAdded fa=\{t\.foundAdded\}/.test(page) && !/\{t\.leadCount\} lead\{t\.leadCount === 1/.test(page), 'the row shows Found / Added and no longer the vague "N leads" badge');
ok(COVERAGE_LABEL.worked === 'Contacted' && COVERAGE_LABEL.leads === 'Added, not contacted', 'the rung labels no longer read as counts');
const cell = read('src/components/CoverageFoundAdded.tsx');
ok(/Breakdown not recorded/.test(cell) && /Not searched/.test(cell) && /with website/.test(cell) && /without/.test(cell), 'the cell: four numbers, or "Breakdown not recorded" / "Not searched"');

console.log('── 4. QUICK CLOSE: BUILD CONSENTS BEFORE THE LINK ──');
const base = { decision_maker: 'yes', domain: 'yes', manager: 'owner', access: 'yes' } as const;
ok(QUICK_CLOSE_QUESTIONS.some((q) => q.key === 'build_consents' && q.detail?.length === 3) && BUILD_CONSENTS.length === 3, 'one Build-only question listing the three consents');
ok(/own or control the domain, or have the authority/.test(BUILD_CONSENTS[0]) && /domain \/ DNS changes/.test(BUILD_CONSENTS[1]) && /right to provide and use the business content/.test(BUILD_CONSENTS[2]), 'domain authority · DNS permission · rights to content');
const build = cleanAnswers({ ...base, route: 'build' });
ok(missingQuestions(build).includes('build_consents') && !mayGenerateLink('answers_saved', { answers: build }), 'Build with the consents unanswered → no link');
ok(quickCloseState('answers_saved', { answers: { ...build, build_consents: 'not_yet' } }) === 'consents_needed' && !mayGenerateLink('answers_saved', { answers: { ...build, build_consents: 'not_yet' } }), '"Not yet" → Build consents needed, no link');
ok(quickCloseState('answers_saved', { answers: { ...build, build_consents: 'not_yet' }, review_approved_at: '2026-09-29T10:00:00Z' }) === 'consents_needed', 'Paul\'s review release does not stand in for the consents');
ok(mayGenerateLink('answers_saved', { answers: { ...build, build_consents: 'yes' } }), 'all three confirmed → the link may be generated');
const cols = onboardingColumnsFor(cleanAnswers({ ...build, build_consents: 'yes' }));
ok(cols.dns_permission === true && cols.materials_confirmed === true && cols.authority_confirmed === true, 'confirmed → the same consent columns the self-service pages write');
ok(onboardingColumnsFor(cleanAnswers({ ...build, manager: 'agency', authority: 'not_sure', build_consents: 'yes' })).authority_confirmed === undefined, 'an explicit "not sure" to authority is never turned into a yes');
ok(cleanAnswers({ ...base, route: 'optimise', build_consents: 'yes' }).build_consents === undefined && !missingQuestions(cleanAnswers({ ...base, route: 'optimise' })).includes('build_consents'), 'Optimise never asks or keeps the Build consents (existing checks only)');
ok(/if \(prev\.build_consents === "yes" && answers\.build_consents !== "yes"\) \{\s*patch\.dns_permission = null; patch\.materials_confirmed = null;/.test(code('supabase/functions/quick-close/index.ts')), 'withdrawing the consents clears the columns they set');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
