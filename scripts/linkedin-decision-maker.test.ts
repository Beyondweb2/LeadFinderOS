/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LINKEDIN DECISION-MAKER DISCOVERY — driven end to end with fixtures (2026-09-30).

   Run: npx tsx scripts/linkedin-decision-maker.test.ts

   ⛔ EVERY BUSINESS AND PERSON BELOW IS INVENTED. No network: the page fetch, Companies House and the
   Apify actor are fakes, and the test asserts that the only "provider" ever called is one of the two
   named actors — nothing here, or in the code under test, can reach LinkedIn itself.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  companiesHouseName, extractPeopleFromJsonLd, extractPeopleFromText, jsonLdNodes, pageTextWithBlocks,
  rankDecisionMakers, roleFromText,
} from '../src/lib/decisionMaker.ts';
import {
  canonicalLinkedInUrl, companyMatches, companyNameKey, countryOfLocation, discoveryCountry, manualLinkedInSearchLinks,
  nameMatch, namesAPlace, resolveProfiles, scoreProfile, type MatchContext, type ProfileCandidate,
} from '../src/lib/linkedinMatch.ts';
import {
  buildSearchInput, buildSearchQuery, LINKEDIN_SEARCH_ACTOR, LINKEDIN_SEARCH_EST_USD, LINKEDIN_VERIFY_ACTOR,
  mapVerifiedProfile, parseLinkedInTitle, parseSearchItems,
} from '../src/lib/linkedinProviders.ts';
import {
  APIFY_ACCOUNT_REFUSE_PCT, DAILY_SPEND_CAP_USD, MAX_SEARCHES_PER_RUN, nameFromSlug, RUNNING_STALE_MS, SALES_RUNS_PER_DAY,
  spendGate, type HeldLinkedIn, type LinkedInDiscoveryResult, type PriorRun,
} from '../src/lib/linkedinDiscovery.ts';
import {
  discoverDecisionMaker, isFetchableWebsite, pickCompaniesHouseCompany, pickPeoplePages,
  type DiscoveryIO, type DiscoveryLead, type DiscoveryRequest, type DiscoveryStore, type FetchedPage, type SpendSnapshot,
} from '../src/lib/linkedinDiscoveryPipeline.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const NOW = Date.parse('2026-09-30T12:00:00Z');
const ADMIN = { id: 'admin-1', role: 'admin' as const };
const SALES = { id: 'sales-1', role: 'sales' as const };

/* ── Fakes ──────────────────────────────────────────────────────────────────────────────────────── */

interface Serp { title: string; url: string; description?: string }
const serp = (...results: Serp[]) => [{ organicResults: results }];

function makeWorld(opts: {
  pages?: Record<string, string>;
  serpFor?: (query: string) => unknown[];
  verifyItems?: unknown[];
  ch?: { companyUrl: string; officers: Array<{ name: string; officer_role: string; resigned_on?: string | null }> } | null;
  held?: HeldLinkedIn[];
  snapshot?: Partial<SpendSnapshot>;
  costUsd?: number | null;
  claimConflict?: boolean;
}) {
  const runs: Array<PriorRun & { lead_id: string; actor_id: string; cost_usd?: number }> = [];
  const costLog: Array<{ actor: string; costUsd: number; isEstimate: boolean; runId: string }> = [];
  const actorCalls: Array<{ actor: string; input: Record<string, unknown> }> = [];
  const fetched: string[] = [];
  let seq = 0;
  const store: DiscoveryStore = {
    async loadHeld() { return opts.held ?? []; },
    async latestRun(leadId) {
      const r = runs.filter((x) => x.lead_id === leadId).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      return r ?? null;
    },
    async claimRun({ leadId, fingerprint, actorId }) {
      if (opts.claimConflict || runs.some((r) => r.lead_id === leadId && r.status === 'running')) return { ok: false, reason: 'in_progress' };
      const id = `run-${++seq}`;
      runs.push({ id, lead_id: leadId, actor_id: actorId, status: 'running', input_fingerprint: fingerprint, created_at: new Date(NOW + seq).toISOString(), expires_at: null, result: null });
      return { ok: true, runId: id };
    },
    async finishRun(runId, patch) {
      const r = runs.find((x) => x.id === runId)!;
      Object.assign(r, { status: patch.status, result: patch.result, expires_at: patch.expires_at, cost_usd: patch.cost_usd });
    },
    async recordFreeRun({ leadId, fingerprint, actorId, status, result, expires_at }) {
      runs.push({ id: `run-${++seq}`, lead_id: leadId, actor_id: actorId, status, input_fingerprint: fingerprint, created_at: new Date(NOW + seq).toISOString(), expires_at, result });
    },
    async spendSnapshot() {
      return {
        apify: { captured_at: new Date(NOW - 10 * 60_000).toISOString(), monthly_usage_usd: 20, max_monthly_usage_usd: 40 },
        spentLast24hUsd: 0, userRunsLast24h: 0, ...opts.snapshot,
      };
    },
    async logCost(e) { costLog.push({ actor: e.actor, costUsd: e.costUsd, isEstimate: e.isEstimate, runId: e.runId }); },
  };
  const io: DiscoveryIO = {
    async fetchPage(url): Promise<FetchedPage> {
      fetched.push(url);
      const key = url.replace(/\/$/, '');
      const body = opts.pages?.[key] ?? opts.pages?.[`${key}/`];
      return body === undefined ? { ok: false, finalUrl: url, body: '', contentType: null } : { ok: true, finalUrl: url, body, contentType: 'text/html' };
    },
    companiesHouse: opts.ch === undefined ? undefined : async () => opts.ch ?? null,
    async runActor(actor, input) {
      actorCalls.push({ actor, input });
      if (actor === LINKEDIN_VERIFY_ACTOR) return { items: opts.verifyItems ?? [], costUsd: opts.costUsd === undefined ? 0.004 : opts.costUsd };
      return { items: opts.serpFor ? opts.serpFor(String(input.queries)) : [], costUsd: opts.costUsd === undefined ? 0.0052 : opts.costUsd };
    },
  };
  return { store, io, runs, costLog, actorCalls, fetched };
}

const lead = (o: Partial<DiscoveryLead>): DiscoveryLead => ({ id: 'lead-1', business_name: 'Test Business', website: null, town: null, country: 'UK', contact_name: null, ...o });
const run = (w: ReturnType<typeof makeWorld>, r: Partial<DiscoveryRequest> & { lead: DiscoveryLead }) =>
  discoverDecisionMaker({ actor: ADMIN, mode: 'run', now: NOW, ...r }, w.store, w.io);
const resultOf = (r: Awaited<ReturnType<typeof discoverDecisionMaker>>): LinkedInDiscoveryResult => {
  if (!r.ok || !('result' in r) || !r.result) throw new Error(`no result: ${JSON.stringify(r).slice(0, 300)}`);
  return r.result;
};
const html = (body: string, head = '') => `<html><head>${head}</head><body>${body}</body></html>`;

/* ── Units: URLs, names, companies ──────────────────────────────────────────────────────────────── */

console.log('── LINKEDIN URLS ──');
ok(canonicalLinkedInUrl('https://uk.linkedin.com/in/Dave-Hughes-4b2a1b9/?trk=abc')?.url === 'https://www.linkedin.com/in/dave-hughes-4b2a1b9', 'country subdomain, case, trailing slash and tracking all fold away');
ok(canonicalLinkedInUrl('linkedin.com/company/hughes-plumbing/about')?.kind === 'company', 'a company page is a company, sub-path ignored');
ok(canonicalLinkedInUrl('https://www.linkedin.com/posts/dave-hughes_activity-123') === null, 'a post is not a profile');
ok(canonicalLinkedInUrl('https://www.linkedin.com/search/results/people/?keywords=x') === null, 'a search page is not a profile');
ok(canonicalLinkedInUrl('https://notlinkedin.com/in/x') === null, 'a lookalike host is refused');
ok(nameFromSlug('sarah-jones-4b2a1b9') === 'sarah jones', 'the id tail is dropped from a slug');

console.log('── COMPANY NAMES: UK / US / AU SUFFIXES ──');
ok(companyNameKey('The Hughes Plumbing & Heating Co. Ltd') === 'hughes plumbing and heating', 'UK: The … & … Co. Ltd');
ok(companyNameKey('Smith Accountants LLP') === 'smith accountants', 'UK: LLP');
ok(companyNameKey('Rivera Landscaping, LLC') === 'rivera landscaping', 'US: , LLC');
ok(companyNameKey('Acme Roofing Inc.') === 'acme roofing' && companyNameKey('Acme Roofing Corp') === 'acme roofing', 'US: Inc / Corp');
ok(companyNameKey('Nguyen Electrical Pty Ltd') === 'nguyen electrical', 'AU: Pty Ltd');
ok(companyNameKey('Nguyen Electrical Proprietary Limited') === 'nguyen electrical', 'AU: Proprietary Limited');
ok(companyNameKey('RJW Electrical Ltd (Sutton Coldfield)') === 'rjw electrical', 'a Maps "(town)" qualifier goes');
ok(companyMatches('Hughes Plumbing and Heating Limited', 'Hughes Plumbing & Heating Ltd', null) === 'exact', '& vs and, Ltd vs Limited');
ok(companyMatches('Hughes Plumbing', 'Hughes Plumbing & Heating Ltd', null) === 'contains', 'two-word containment counts');
ok(companyMatches('Acme', 'Acme Roofing Ltd', null) === null, 'a single word never matches by containment');
ok(companyMatches('Hughesplumbing', 'Hughes P&H', 'hughesplumbing.co.uk') === 'domain', 'the domain label matches a squashed company name');

console.log('── PERSON NAMES ──');
ok(nameMatch('Sarah Jones', 'Sarah Jones') === 'exact', 'exact');
ok(nameMatch('David Hughes', 'Dave Hughes') === 'short_form', 'Dave / David is a known short form');
ok(nameMatch('Sarah Jones', 'S. Jones') === 'initial', 'initial only');
ok(nameMatch('Sarah Jones', 'Tom Jones') === 'none', 'same surname, different first name → not the person');
ok(nameMatch('Sarah Jones', 'Sarah Smith-Jones') === 'exact', 'a hyphenated surname matches on its part');
ok(nameMatch('Dave', 'Dave Hughes', true) === 'first_only', 'a first-name-only person can reach first_only, never more');
ok(nameMatch('Zoë Brontë', 'Zoe Bronte') === 'exact', 'accents fold');

console.log('── LOCATIONS AND COUNTRIES ──');
ok(discoveryCountry('UK') === 'UK' && discoveryCountry('USA') === 'US' && discoveryCountry('Australia') === 'AU', 'the lead table values map');
ok(discoveryCountry('Germany') === null && discoveryCountry(null) === null, 'unknown is null, never a default country');
ok(countryOfLocation('Austin, Texas, United States') === 'US', 'US location');
ok(countryOfLocation('Parramatta, New South Wales, Australia') === 'AU', 'AU location');
ok(countryOfLocation('Leeds, England, United Kingdom') === 'UK', 'UK location');
ok(!namesAPlace('United Kingdom') && namesAPlace('Bristol, England, United Kingdom'), 'a bare country is not a place');

/* ── Units: identifying the person ──────────────────────────────────────────────────────────────── */

console.log('── WHO RUNS IT: TEXT ──');
const t1 = extractPeopleFromText(pageTextWithBlocks('<p>Hughes Plumbing is a family business run by Dave Hughes since 2004.</p>'), 'https://x.test/about', 'Hughes Plumbing');
ok(t1.length === 1 && t1[0].name === 'Dave Hughes' && t1[0].role === 'owner', '"run by Dave Hughes" → owner');
const t2 = extractPeopleFromText(pageTextWithBlocks('<div class="card"><h3>Sarah Jones</h3><p>Managing Director</p></div>'), 'u', 'Jones Electrical');
ok(t2.length >= 1 && t2[0].name === 'Sarah Jones' && t2[0].role === 'managing_director', 'a team card: name block then role block → Managing Director');
const t3 = extractPeopleFromText(pageTextWithBlocks('<p>"Brilliant job, thanks to John Smith for recommending them!" – Mary Brown, Leeds</p>'), 'u', 'Hughes Plumbing');
ok(t3.length === 0, 'a testimonial names people with NO role → nobody invented');
const t4 = extractPeopleFromText(pageTextWithBlocks('<p>Our Art Director, Kim Lee, designed the logo.</p>'), 'u', 'X');
ok(t4.length === 0, 'an Art Director is not a decision maker by title');
const t5 = extractPeopleFromText(pageTextWithBlocks("<p>Hi, I'm Dave, the owner.</p>"), 'u', 'X');
ok(t5.length === 1 && t5[0].partial && t5[0].name === 'Dave', 'a first name alone is kept and flagged partial');
const t6 = extractPeopleFromText(pageTextWithBlocks('<p>Hughes Plumbing Ltd, Owner-operated.</p>'), 'u', 'Hughes Plumbing Ltd');
ok(t6.length === 0, 'the business name itself is never taken as the person');
ok(roleFromText('Founder & CEO')?.role === 'founder', 'founder outranks CEO in one title');

console.log('── WHO RUNS IT: SCHEMA + COMPANIES HOUSE + MERGE ──');
const ld = jsonLdNodes(html('', '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Shah Dental Care","founder":{"@type":"Person","name":"Priya Shah"}}</script>'));
const s1 = extractPeopleFromJsonLd(ld, 'https://shahdental.test/', 'Shah Dental Care');
ok(s1.length === 1 && s1[0].name === 'Priya Shah' && s1[0].role === 'founder', 'schema founder → Founder');
ok(companiesHouseName('JONES, Sarah Anne') === 'Sarah Anne Jones', 'Companies House "SURNAME, Given" → "Given Surname"');
ok(companiesHouseName("O'BRIEN, Liam") === "Liam O'Brien", 'Companies House apostrophe surname keeps its capitals');
ok(pickCompaniesHouseCompany([{ title: 'JONES ELECTRICAL LTD', company_number: '1', company_status: 'active' }, { title: 'JONES ELECTRICAL SERVICES LTD', company_number: '2', company_status: 'active' }], 'Jones Electrical Ltd') === '1', 'exactly one active exact name → that company');
ok(pickCompaniesHouseCompany([{ title: 'JONES ELECTRICAL LTD', company_number: '1', company_status: 'active' }, { title: 'Jones Electrical Limited', company_number: '3', company_status: 'active' }], 'Jones Electrical') === null, 'two exact matches → no answer, never a guess');
const merged = rankDecisionMakers([
  ...extractPeopleFromText('Run by Sarah Jones.', 'a', 'Jones Electrical'),
  { name: 'Sarah Anne Jones', partial: false, role: 'director', roleLabel: 'Director', evidence: [{ source: 'companies_house', url: 'ch', quote: 'q' }], rank: 0 },
]);
ok(merged.status === 'identified' && merged.people.length === 1 && merged.people[0].evidence.length === 2, 'the same person from the site and Companies House merges into one with both sources');
ok(rankDecisionMakers([]).status === 'none', 'nobody named → none, with a reason');

/* ── Units: provider parse + inputs ─────────────────────────────────────────────────────────────── */

console.log('── GOOGLE RESULT PARSING ──');
const pt = parseLinkedInTitle('Dave Hughes - Owner - Hughes Plumbing & Heating Ltd | LinkedIn');
ok(pt.name === 'Dave Hughes' && pt.headline === 'Owner' && pt.company === 'Hughes Plumbing & Heating Ltd', 'Name - Headline - Company | LinkedIn');
const ps = parseSearchItems(serp(
  { title: 'Dave Hughes - Owner - Hughes Plumbing | LinkedIn', url: 'https://uk.linkedin.com/in/dave-hughes-1', description: 'Experience: Hughes Plumbing & Heating Ltd · Location: Leeds · 120 connections' },
  { title: 'Hughes Plumbing | LinkedIn', url: 'https://www.linkedin.com/company/hughes-plumbing' },
  { title: 'Plumber jobs', url: 'https://www.linkedin.com/jobs/view/1' },
  { title: 'Hughes on Yell', url: 'https://www.yell.com/biz/hughes' },
));
ok(ps.profiles.length === 1 && ps.profiles[0].currentCompany === 'Hughes Plumbing & Heating Ltd' && ps.profiles[0].location === 'Leeds', 'snippet Experience / Location are read');
ok(ps.companyPages.length === 1 && ps.ignored === 2, 'company page kept separately; jobs + other sites ignored');
const inp = buildSearchInput(buildSearchQuery({ personName: 'Maria Rivera', businessName: 'Rivera Landscaping, LLC', town: 'Austin' }), 'US');
ok(inp.queries === 'site:linkedin.com/in "Maria Rivera" "rivera landscaping" Austin', 'query: site: + quoted person + quoted business (suffix off) + town');
ok(inp.countryCode === 'us' && inp.maxPagesPerQuery === 1, 'one page, US Google');
ok((inp.chatGptSearch as { enableChatGpt: boolean }).enableChatGpt === false && (inp.geminiSearch as { enableGemini: boolean }).enableGemini === false && inp.maximumLeadsEnrichmentRecords === 0, 'every paid add-on is OFF explicitly');
ok(!('countryCode' in buildSearchInput('q', null)), 'unknown country → no countryCode sent (never a guessed market)');
const vp = mapVerifiedProfile({ linkedinUrl: 'https://www.linkedin.com/in/dave-hughes-1', firstName: 'Dave', lastName: 'Hughes', headline: 'Owner', currentPosition: [{ companyName: 'Hughes Plumbing & Heating Ltd', companyLinkedinUrl: 'https://www.linkedin.com/company/hughes-plumbing' }], location: { linkedinText: 'Leeds, England, United Kingdom' }, websites: [{ url: 'https://www.hughesplumbing.test/' }] });
ok(!!vp && vp.currentCompany === 'Hughes Plumbing & Heating Ltd' && vp.websites[0] === 'https://www.hughesplumbing.test/', 'profile scraper item maps current job + website');

console.log('── SCORING ──');
const ctx = (o: Partial<MatchContext> = {}): MatchContext => ({ personName: 'Dave Hughes', personPartial: false, personRole: 'owner', businessName: 'Hughes Plumbing & Heating Ltd', domain: 'hughesplumbing.test', town: 'Leeds', country: 'UK', companyLinkedInUrl: null, siteLinkedProfiles: [], ...o });
const cand = (o: Partial<ProfileCandidate>): ProfileCandidate => ({ url: 'https://www.linkedin.com/in/dave-hughes-1', name: 'Dave Hughes', headline: 'Owner', currentCompany: 'Hughes Plumbing & Heating Ltd', pastCompanies: [], location: 'Leeds', websites: [], currentCompanyLinkedInUrl: null, text: '', origin: 'serp', ...o });
ok(scoreProfile(cand({}), ctx())?.confidence === 'likely', 'name + current company + town + title → LIKELY, not CONFIRMED (no hard link)');
ok(scoreProfile(cand({ origin: 'profile_scrape', websites: ['https://hughesplumbing.test'] }), ctx())?.confidence === 'confirmed', 'profile lists the business website → CONFIRMED');
ok(scoreProfile(cand({ headline: null, location: null }), ctx({ siteLinkedProfiles: ['https://www.linkedin.com/in/dave-hughes-1'] }))?.confidence === 'confirmed', 'linked from the business site → CONFIRMED');
ok(scoreProfile(cand({ name: 'D. Hughes' }), ctx())?.confidence === 'unverified', 'an initial never reaches LIKELY on soft evidence');
ok(scoreProfile(cand({ name: 'Tom Hughes' }), ctx()) === null, 'a different first name is dropped entirely');
ok(scoreProfile(cand({ location: 'Brisbane, Queensland, Australia' }), ctx())?.confidence === 'unverified', 'a profile in another country is capped at UNVERIFIED');

/* ── Pipeline scenarios ─────────────────────────────────────────────────────────────────────────── */

const main = async () => {
  console.log('── CLEAR OWNER MATCH (UK) ──');
  {
    const w = makeWorld({
      pages: {
        'https://hughesplumbing.test': html('<nav><a href="/about-us">About us</a><a href="/services">Services</a></nav>'),
        'https://hughesplumbing.test/about-us': html('<p>Hughes Plumbing &amp; Heating is run by Dave Hughes, Gas Safe registered.</p>'),
      },
      serpFor: () => serp({ title: 'Dave Hughes - Owner - Hughes Plumbing & Heating Ltd | LinkedIn', url: 'https://uk.linkedin.com/in/dave-hughes-1', description: 'Experience: Hughes Plumbing & Heating Ltd · Location: Leeds' }),
    });
    const r = resultOf(await run(w, { lead: lead({ business_name: 'Hughes Plumbing & Heating Ltd', website: 'hughesplumbing.test', town: 'Leeds' }) }));
    ok(r.status === 'found' && r.people[0].person_name === 'Dave Hughes' && r.people[0].role === 'owner', 'owner identified from the About page');
    ok(r.people[0].linkedin.confidence === 'likely' && r.people[0].linkedin.linkedin_url === 'https://www.linkedin.com/in/dave-hughes-1', 'LIKELY match with the canonical URL');
    ok(r.canonical_candidate?.confidence === 'likely', 'a single LIKELY is offered as the canonical candidate');
    ok(r.people[0].person_evidence[0].url === 'https://hughesplumbing.test/about-us', 'the evidence carries the page it was read on');
    ok(w.actorCalls.length === 1 && w.actorCalls[0].actor === LINKEDIN_SEARCH_ACTOR && w.actorCalls[0].input.countryCode === 'gb', 'ONE search, UK Google');
    ok(w.costLog.length === 1 && w.costLog[0].costUsd === 0.0052 && !w.costLog[0].isEstimate, 'the real Apify cost is logged, once');
    ok(r.provider_cost_usd === 0.0052 && r.provider_calls === 1, 'cost + call count on the result');
    ok(w.runs.length === 1 && w.runs[0].status === 'found' && w.runs[0].cost_usd === 0.0052, 'the run row is finished with its status and cost');
    ok(!w.fetched.some((u) => /linkedin\.com/i.test(u)), 'LinkedIn itself is never fetched');

    console.log('── CACHE + DUPLICATES ──');
    const again = resultOf(await run(w, { lead: lead({ business_name: 'Hughes Plumbing & Heating Ltd', website: 'hughesplumbing.test', town: 'Leeds' }) }));
    ok(again.served_from === 'cache' && w.actorCalls.length === 1 && w.costLog.length === 1, 'the second lookup is a cache hit: no search, no cost');
    const peek = resultOf(await run(w, { mode: 'peek', lead: lead({ business_name: 'Hughes Plumbing & Heating Ltd', website: 'hughesplumbing.test', town: 'Leeds' }) }));
    ok(peek.served_from === 'cache' && w.actorCalls.length === 1, 'peek returns the cached answer');
    const salesForce = resultOf(await run(w, { actor: SALES, force: true, lead: lead({ business_name: 'Hughes Plumbing & Heating Ltd', website: 'hughesplumbing.test', town: 'Leeds' }) }));
    ok(salesForce.served_from === 'cache' && w.actorCalls.length === 1, 'a salesperson cannot force a re-search');
    await run(w, { force: true, lead: lead({ business_name: 'Hughes Plumbing & Heating Ltd', website: 'hughesplumbing.test', town: 'Leeds' }) });
    ok(w.actorCalls.length === 2, 'the admin can force one');
    await run(w, { manualPerson: { name: 'Jo Hughes', role: 'Director' }, lead: lead({ business_name: 'Hughes Plumbing & Heating Ltd', website: 'hughesplumbing.test', town: 'Leeds' }) });
    ok(w.actorCalls.length > 2, 'a manually entered person changes the inputs → a new lookup is allowed');
  }

  {
    const w = makeWorld({ serpFor: () => serp() });
    const stale: PriorRun & { lead_id: string; actor_id: string } = { id: 'r0', lead_id: 'lead-1', actor_id: 'x', status: 'running', input_fingerprint: 'f', created_at: new Date(NOW - 60_000).toISOString(), expires_at: null, result: null };
    w.runs.push(stale);
    const r = await run(w, { manualPerson: { name: 'Sam Carter', role: 'Owner' }, lead: lead({ business_name: 'Carter Joinery' }) });
    ok(!r.ok && r.error === 'in_progress' && w.actorCalls.length === 0, 'a run started < RUNNING_STALE_MS ago → in progress, nothing spent');
    stale.created_at = new Date(NOW - RUNNING_STALE_MS - 1).toISOString();
    stale.status = 'error';
    const w2 = makeWorld({ serpFor: () => serp(), claimConflict: true });
    const r2 = await run(w2, { manualPerson: { name: 'Sam Carter', role: 'Owner' }, lead: lead({ business_name: 'Carter Joinery' }) });
    ok(!r2.ok && r2.error === 'in_progress' && w2.actorCalls.length === 0, 'losing the claim race (the DB unique index) → in progress, nothing spent');
  }

  console.log('── FOUNDER MATCH (schema) ──');
  {
    const w = makeWorld({
      pages: { 'https://shahdental.test': html('<p>Welcome</p>', '<script type="application/ld+json">{"@type":"Dentist","name":"Shah Dental Care","founder":{"@type":"Person","name":"Priya Shah"}}</script>') },
      serpFor: () => serp({ title: 'Priya Shah - Principal Dentist & Founder - Shah Dental Care | LinkedIn', url: 'https://www.linkedin.com/in/priya-shah-dds', description: 'Location: Harrow, England, United Kingdom' }),
    });
    const r = resultOf(await run(w, { lead: lead({ business_name: 'Shah Dental Care', website: 'https://shahdental.test', town: 'Harrow' }) }));
    ok(r.people[0].role === 'founder' && r.people[0].linkedin.confidence === 'likely', 'schema founder → LIKELY profile');
  }

  console.log('── DIRECTOR MATCH (Companies House, UK) ──');
  {
    const w = makeWorld({
      ch: { companyUrl: 'https://find-and-update.company-information.service.gov.uk/company/01234567', officers: [
        { name: 'JONES, Sarah Anne', officer_role: 'director' },
        { name: 'BLOGGS, Fred', officer_role: 'director', resigned_on: '2019-01-01' },
        { name: 'ACME SECRETARIES LTD', officer_role: 'corporate-secretary' },
      ] },
      serpFor: () => serp({ title: 'Sarah Jones - Director - Jones Electrical Ltd | LinkedIn', url: 'https://www.linkedin.com/in/sarahjones-electrical', description: 'Location: Derby, England, United Kingdom' }),
    });
    const r = resultOf(await run(w, { lead: lead({ business_name: 'Jones Electrical Ltd', town: 'Derby' }) }));
    ok(r.people.length === 1 && r.people[0].person_name === 'Sarah Anne Jones' && r.people[0].role === 'director', 'only the active natural-person director is taken');
    ok(r.people[0].person_evidence[0].source === 'companies_house', 'the evidence names Companies House');
    ok(r.people[0].linkedin.confidence === 'likely', 'director found on LinkedIn → LIKELY');
    ok(r.sources_checked.includes('Companies House'), 'Companies House is listed as checked');
  }

  console.log('── SAME NAME, WRONG PERSON ──');
  {
    const w = makeWorld({ serpFor: () => serp({ title: 'Mark Taylor - Senior Engineer - Rolls-Royce | LinkedIn', url: 'https://www.linkedin.com/in/mark-taylor-rr', description: 'Experience: Rolls-Royce · Location: Derby' }) });
    const r = resultOf(await run(w, { manualPerson: { name: 'Mark Taylor', role: 'Owner' }, lead: lead({ business_name: 'Taylor Roofing', town: 'Leeds' }) }));
    ok(r.status === 'review' && r.canonical_candidate === null, 'a same-name stranger is never a match — review only');
    ok(r.people[0].linkedin.candidates[0].confidence === 'unverified' && r.people[0].linkedin.candidates[0].cautions.some((c) => /Rolls-Royce/.test(c)), 'the caution says where they actually work');
  }

  console.log('── SAME NAME, DIFFERENT TOWN ──');
  {
    const w = makeWorld({ serpFor: () => serp({ title: 'Mark Taylor - Owner - Taylor Roofing | LinkedIn', url: 'https://www.linkedin.com/in/mark-taylor-roofing', description: 'Location: Bristol, England, United Kingdom' }) });
    const r = resultOf(await run(w, { manualPerson: { name: 'Mark Taylor', role: 'Owner' }, lead: lead({ business_name: 'Taylor Roofing', town: 'Leeds' }) }));
    ok(r.status === 'review' && r.people[0].linkedin.candidates[0].confidence === 'unverified', 'same name + same business name in ANOTHER town → review, not LIKELY');
  }

  console.log('── SAME COMPANY, DIFFERENT PERSON ──');
  {
    const w = makeWorld({ serpFor: () => serp({ title: 'Tom Jones - Electrician - Jones Electrical Ltd | LinkedIn', url: 'https://www.linkedin.com/in/tom-jones-sparky', description: 'Location: Derby' }) });
    const r = resultOf(await run(w, { manualPerson: { name: 'Sarah Jones', role: 'Director' }, lead: lead({ business_name: 'Jones Electrical Ltd', town: 'Derby' }) }));
    ok(r.status === 'not_found' && r.people[0].linkedin.status === 'none', 'a colleague at the same company is not the decision maker');
    ok(r.people[0].manual_search.google.includes(encodeURIComponent('"Sarah Jones"')), 'the manual Google search names the person');
  }

  console.log('── MULTIPLE PLAUSIBLE PROFILES ──');
  {
    const w = makeWorld({ serpFor: () => serp(
      { title: 'Priya Shah - Owner - Shah Dental Care | LinkedIn', url: 'https://www.linkedin.com/in/priya-shah-1', description: 'Location: Harrow' },
      { title: 'Priya Shah - Founder - Shah Dental Care | LinkedIn', url: 'https://www.linkedin.com/in/priya-shah-2', description: 'Location: Harrow' },
    ) });
    const r = resultOf(await run(w, { manualPerson: { name: 'Priya Shah', role: 'Owner' }, lead: lead({ business_name: 'Shah Dental Care', town: 'Harrow' }) }));
    ok(r.status === 'review' && r.people[0].linkedin.candidates.length === 2 && r.canonical_candidate === null, 'two LIKELY → both returned for review, neither picked');
  }

  console.log('── NO RESULT ──');
  {
    const w = makeWorld({ serpFor: () => serp() });
    const r = resultOf(await run(w, { manualPerson: { name: 'Sam Carter', role: 'Owner' }, lead: lead({ business_name: 'Carter Joinery', town: 'York' }) }));
    ok(r.status === 'not_found' && w.costLog.length === 1, 'nothing found → not_found, and the search is still billed + logged');
    ok(!!r.people[0].manual_search.linkedin && !!r.people[0].manual_search.google, 'the manual search links are offered');
  }

  console.log('── NO PERSON IDENTIFIED ──');
  {
    const w = makeWorld({ pages: { 'https://carter.test': html('<p>Quality joinery since 1990. Call us today.</p>') } });
    const r = resultOf(await run(w, { lead: lead({ business_name: 'Carter Joinery', website: 'carter.test', town: 'York' }) }));
    ok(r.status === 'no_person' && r.people.length === 0 && w.actorCalls.length === 0, 'nobody named → no_person, NOTHING searched (never "search the business and pick someone")');
    ok(w.runs.length === 1 && w.runs[0].status === 'no_person', 'the free answer is cached too');
    ok(r.manual_search.google.includes('owner'), 'the business-level manual search looks for owner/founder/director');
  }

  console.log('── KNOWN LINKEDIN URL ALREADY HELD ──');
  {
    const w = makeWorld({ held: [{ url: 'https://www.linkedin.com/in/dave-hughes-1', kind: 'person', humanConfirmed: true, rejected: false, personName: 'Dave Hughes' }] });
    const r = resultOf(await run(w, { lead: lead({ business_name: 'Hughes Plumbing', website: 'hughesplumbing.test' }) }));
    ok(r.status === 'held' && r.served_from === 'held' && w.actorCalls.length === 0 && w.fetched.length === 0, 'a person-confirmed profile → returned, no fetch, no search');
    const w2 = makeWorld({ held: [{ url: 'https://www.linkedin.com/in/x', kind: 'person', humanConfirmed: false, rejected: false }], serpFor: () => serp() });
    await run(w2, { manualPerson: { name: 'Sam Carter', role: 'Owner' }, lead: lead({ business_name: 'Carter Joinery' }) });
    ok(w2.actorCalls.length === 1, 'an UNCONFIRMED held profile does not stop discovery');
  }

  console.log('── COMPANY PROFILE ONLY ──');
  {
    const w = makeWorld({ serpFor: () => serp({ title: 'Carter Joinery Ltd | LinkedIn', url: 'https://www.linkedin.com/company/carter-joinery' }) });
    const r = resultOf(await run(w, { manualPerson: { name: 'Sam Carter', role: 'Owner' }, lead: lead({ business_name: 'Carter Joinery', town: 'York' }) }));
    ok(r.status === 'not_found' && r.company_linkedin_url === 'https://www.linkedin.com/company/carter-joinery' && r.company_linkedin_confidence === 'likely', 'no person profile, but the company page is returned as LIKELY');
  }

  console.log('── WEBSITE-LINKED PERSONAL LINKEDIN ──');
  {
    const w = makeWorld({
      pages: { 'https://hughesplumbing.test': html('<p>Hughes Plumbing is run by Dave Hughes.</p><a href="https://uk.linkedin.com/in/dave-hughes-4b2a1b9">LinkedIn</a>') },
      serpFor: () => { throw new Error('must not search'); },
    });
    const r = resultOf(await run(w, { lead: lead({ business_name: 'Hughes Plumbing', website: 'https://hughesplumbing.test', town: 'Leeds' }) }));
    ok(r.status === 'found' && r.people[0].linkedin.confidence === 'confirmed' && r.canonical_candidate?.confidence === 'confirmed', 'own-site link whose slug carries the name → CONFIRMED');
    ok(w.actorCalls.length === 0 && r.provider_cost_usd === 0, '…for free: no search was made');
  }

  console.log('── US COMPANY ──');
  {
    const w = makeWorld({
      pages: { 'https://riveralandscaping.test': html('<p>Rivera Landscaping was founded by Maria Rivera in 2011.</p>') },
      serpFor: () => serp({ title: 'Maria Rivera - Owner - Rivera Landscaping | LinkedIn', url: 'https://www.linkedin.com/in/maria-rivera-atx', description: 'Location: Austin, Texas, United States' }),
    });
    const r = resultOf(await run(w, { lead: lead({ business_name: 'Rivera Landscaping, LLC', website: 'riveralandscaping.test', town: 'Austin', country: 'USA' }) }));
    ok(r.location.country === 'US' && r.people[0].linkedin.confidence === 'likely', 'US: LLC folds away, Austin matches → LIKELY');
    ok(w.actorCalls[0].input.countryCode === 'us', 'US Google');
    ok(!w.fetched.some((u) => /company-information/.test(u)), 'no Companies House for a US company');
  }

  console.log('── AUSTRALIAN COMPANY ──');
  {
    const w = makeWorld({
      ch: { companyUrl: 'x', officers: [{ name: 'WRONG, Person', officer_role: 'director' }] },
      pages: { 'https://nguyenelectrical.test': html('<ul><li>Owner: Linh Nguyen</li></ul>') },
      serpFor: () => serp({ title: 'Linh Nguyen - Director - Nguyen Electrical | LinkedIn', url: 'https://au.linkedin.com/in/linh-nguyen-sparky', description: 'Location: Parramatta, New South Wales, Australia' }),
    });
    const r = resultOf(await run(w, { lead: lead({ business_name: 'Nguyen Electrical Pty Ltd', website: 'nguyenelectrical.test', town: 'Parramatta', country: 'Australia' }) }));
    ok(r.location.country === 'AU' && r.people.length === 1 && r.people[0].person_name === 'Linh Nguyen', 'AU: Companies House is NOT consulted outside the UK');
    ok(r.people[0].linkedin.confidence === 'likely' && w.actorCalls[0].input.countryCode === 'au', 'AU: Pty Ltd folds away → LIKELY, Australian Google');
  }

  console.log('── ADMIN VERIFY UPGRADES LIKELY → CONFIRMED ──');
  {
    const w = makeWorld({
      serpFor: () => serp({ title: 'Dave Hughes - Owner - Hughes Plumbing | LinkedIn', url: 'https://www.linkedin.com/in/dave-hughes-1', description: 'Location: Leeds' }),
      verifyItems: [{ linkedinUrl: 'https://www.linkedin.com/in/dave-hughes-1', firstName: 'Dave', lastName: 'Hughes', headline: 'Owner', currentPosition: [{ companyName: 'Hughes Plumbing' }], location: { linkedinText: 'Leeds, England, United Kingdom' }, websites: ['https://hughesplumbing.test'] }],
    });
    const r = resultOf(await run(w, { verify: true, manualPerson: { name: 'Dave Hughes', role: 'Owner' }, lead: lead({ business_name: 'Hughes Plumbing', website: 'hughesplumbing.test', town: 'Leeds' }) }));
    ok(r.people[0].linkedin.confidence === 'confirmed' && w.actorCalls.map((c) => c.actor).join(',') === `${LINKEDIN_SEARCH_ACTOR},${LINKEDIN_VERIFY_ACTOR}`, 'search then ONE profile check → CONFIRMED');
    ok(w.costLog.length === 2 && Math.abs(r.provider_cost_usd - (0.0052 + 0.004)) < 1e-9, 'both calls logged; the total is on the result');
    const w2 = makeWorld({ serpFor: () => serp({ title: 'Dave Hughes - Owner - Hughes Plumbing | LinkedIn', url: 'https://www.linkedin.com/in/dave-hughes-1', description: 'Location: Leeds' }) });
    await run(w2, { actor: SALES, verify: true, manualPerson: { name: 'Dave Hughes', role: 'Owner' }, lead: lead({ business_name: 'Hughes Plumbing', town: 'Leeds' }) });
    ok(w2.actorCalls.length === 1, 'a salesperson cannot trigger the verify call');
  }

  console.log('── COST: ESTIMATE WHEN APIFY DOES NOT REPORT ──');
  {
    const w = makeWorld({ costUsd: null, serpFor: () => serp() });
    const r = resultOf(await run(w, { manualPerson: { name: 'Sam Carter', role: 'Owner' }, lead: lead({ business_name: 'Carter Joinery' }) }));
    ok(w.costLog[0].isEstimate && w.costLog[0].costUsd === LINKEDIN_SEARCH_EST_USD && r.provider_cost_is_estimate, 'no reported cost → the estimate is logged AND flagged as an estimate');
  }

  console.log('── SPEND GATE (fails closed) ──');
  {
    const base = { now: NOW, role: 'admin' as const, apifySnapshot: { captured_at: new Date(NOW - 60_000).toISOString(), monthly_usage_usd: 20, max_monthly_usage_usd: 40 }, spentLast24hUsd: 0, userRunsLast24h: 0, estimateUsd: 0.01 };
    ok(spendGate(base).ok, 'a healthy account → allowed');
    ok(!spendGate({ ...base, apifySnapshot: { ...base.apifySnapshot, monthly_usage_usd: 40 * APIFY_ACCOUNT_REFUSE_PCT } }).ok, 'Apify at APIFY_ACCOUNT_REFUSE_PCT → refused (the audits share the cap)');
    ok(!spendGate({ ...base, apifySnapshot: { ...base.apifySnapshot, captured_at: new Date(NOW - 3 * 3_600_000).toISOString() } }).ok, 'a stale account snapshot → refused');
    ok(!spendGate({ ...base, apifySnapshot: null }).ok, 'no account snapshot → refused');
    ok(!spendGate({ ...base, spentLast24hUsd: null }).ok, 'an unreadable ledger → refused');
    ok(!spendGate({ ...base, spentLast24hUsd: DAILY_SPEND_CAP_USD }).ok, 'the daily LinkedIn budget → refused');
    ok(!spendGate({ ...base, role: 'sales', userRunsLast24h: SALES_RUNS_PER_DAY }).ok, 'a salesperson at SALES_RUNS_PER_DAY → refused');
    ok(spendGate({ ...base, userRunsLast24h: SALES_RUNS_PER_DAY * 5 }).ok, 'the admin is not run-counted');
    const w = makeWorld({ snapshot: { apify: { captured_at: new Date(NOW).toISOString(), monthly_usage_usd: 39, max_monthly_usage_usd: 40 } }, serpFor: () => serp() });
    const r = await run(w, { actor: SALES, manualPerson: { name: 'Sam Carter', role: 'Owner' }, lead: lead({ business_name: 'Carter Joinery' }) });
    ok(!r.ok && w.actorCalls.length === 0 && w.runs.length === 0, 'refused BEFORE claiming or spending');
    ok(!r.ok && !/\$|apify|cost/i.test(r.detail) && !!r.manual_search.google, 'a salesperson never sees a cost or a provider, and gets the manual search');
  }

  console.log('── LIMITS ──');
  {
    const w = makeWorld({
      ch: { companyUrl: 'ch', officers: ['A, Anna', 'B, Ben', 'C, Cara', 'D, Dan'].map((n) => ({ name: `${n.split(', ')[0]}LAST, ${n.split(', ')[1]}`, officer_role: 'director' })) },
      serpFor: () => serp(),
    });
    await run(w, { lead: lead({ business_name: 'Four Directors Ltd' }) });
    ok(w.actorCalls.length === MAX_SEARCHES_PER_RUN, 'at most MAX_SEARCHES_PER_RUN searches, however many directors');
    const w2 = makeWorld({ pages: { 'https://dave.test': html("<p>Hi, I'm Dave, the owner.</p>") }, serpFor: () => serp() });
    const r2 = resultOf(await run(w2, { lead: lead({ business_name: 'Dave Plumbing', website: 'dave.test' }) }));
    ok(w2.actorCalls.length === 0 && r2.people[0].linkedin.status === 'not_searched', 'a first name alone is never searched (no paid guess)');
    const pagesPicked = pickPeoplePages('<a href="/about">About</a><a href="https://other.test/team">x</a><a href="/meet-the-team">Team</a><a href="/brochure.pdf">About pdf</a>', 'https://x.test/');
    ok(pagesPicked.join(',') === 'https://x.test/about,https://x.test/meet-the-team', 'people pages: same site only, no PDFs');
    ok(!isFetchableWebsite('http://127.0.0.1/admin') && !isFetchableWebsite('localhost:3000') && isFetchableWebsite('hughes.co.uk'), 'private / local addresses are never fetched');
  }

  console.log('── NO LINKEDIN ACTIONS, ANYWHERE ──');
  {
    const links = manualLinkedInSearchLinks({ personName: 'Sarah Jones', businessName: 'Jones Electrical Ltd', town: 'Derby' });
    ok(links.linkedin.startsWith('https://www.linkedin.com/search/results/people/?keywords='), 'the manual LinkedIn link is a plain search page the salesperson opens');
    const { readFileSync } = await import('node:fs');
    const code = ['src/lib/decisionMaker.ts', 'src/lib/linkedinMatch.ts', 'src/lib/linkedinProviders.ts', 'src/lib/linkedinDiscovery.ts', 'src/lib/linkedinDiscoveryPipeline.ts', 'supabase/functions/_shared/linkedin-discovery.ts', 'supabase/functions/linkedin-discovery/index.ts']
      .map((f) => readFileSync(f, 'utf8')).join('\n');
    ok(!/li_at|JSESSIONID|cookie\s*[:=]|sessionCookie|linkedinCookie/i.test(code), 'no LinkedIn cookie / session handling in any file');
    ok(!/\/voyager\/|invitation|sendMessage|connect(?:ion)?Request|messaging\/conversations/i.test(code), 'no connect / message / Voyager endpoints in any file');
    const actors = new Set((code.match(/[a-z0-9_-]+~[a-z0-9_-]+/g) ?? []));
    ok([...actors].every((a) => a === LINKEDIN_SEARCH_ACTOR || a === LINKEDIN_VERIFY_ACTOR), `only the two named actors appear (${[...actors].join(', ')})`);
  }

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  if (fails) process.exit(1);
};
main().catch((e) => { console.error(e); process.exit(1); });
